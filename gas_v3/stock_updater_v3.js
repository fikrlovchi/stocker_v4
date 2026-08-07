/**
 * Claude!!!
 * link_product listidan stokni o'qib, Uzum Market FBS'ga yuboruvchi skript.
 *
 * Ustunlar (link_product):
 *   A: skuId | B: skuTitle | C: productTitle | D: barcode
 *   E: image (ishlatilmaydi) | F: amount (qoldiq) | G: token
 *   J: TRUE/FALSE  ->  FALSE bo'lsa qator Uzumga YUBORILMAYDI
 *
 * fbsLinked=true, dbsLinked=false  -> kodda default (varaqda ustun yo'q).
 *
 * Xususiyatlar:
 *   - 6000+ qatorni bitta o'qishda (getValues) keshga oladi.
 *   - 3-5 batch parallel yuboradi (fetchAll to'lqinlari).
 *   - 429 / 5xx da avtomatik exponential backoff bilan qayta uriniladi.
 *   - Dublikat skuId tozalanadi (oxirgi qator g'olib).
 *   - GAS 6-daqiqa limitiga yetmaslik uchun vaqt qorovuli bor.
 */
function pushToUzumFast() {
  const startMs = Date.now();
  const SHEET_ID = '18j8NDVJl9ZD-wuwlP3T1A1-sVoJlW_doFrwQrf-AvsE';

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const lpSheet = ss.getSheetByName('link_product');
  if (!lpSheet) {
    console.error("Xato: 'link_product' varag'i topilmadi.");
    return;
  }

  // Ustun indekslari (0-based)
  const COL = { skuId: 0, skuTitle: 1, productTitle: 2, barcode: 3,
                /* image: 4, */ amount: 5, token: 6, active: 9 };
  const MAX_AMOUNT = 100000;

  // 1-BOSQICH: butun varaqni bitta so'rovda keshga o'qish (A..J = 10 ustun)
  const lastRow = Math.max(1, lpSheet.getLastRow() - 1);
  const data = lpSheet.getRange(2, 1, lastRow, 10).getValues();

  // 2-BOSQICH: saralash + token bo'yicha guruhlash + dedup (oxirgi g'olib)
  const tokenMap = new Map();   // token -> Map(skuId -> payloadObj)
  let skippedInactive = 0, skippedDup = 0, skippedInvalid = 0;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];

    // J ustuni FALSE bo'lsa — tashlab yuboramiz (bo'sh yoki TRUE -> yuboriladi)
    const activeVal = row[COL.active];
    if (activeVal === false || String(activeVal).trim().toUpperCase() === 'FALSE') {
      skippedInactive++;
      continue;
    }

    const skuId = Number(row[COL.skuId]);
    const token = String(row[COL.token] || '').trim();
    if (isNaN(skuId) || skuId === 0 || !token) {
      skippedInvalid++;
      continue;
    }

    let amount = Math.floor(Number(row[COL.amount]) || 0);
    if (amount < 0) amount = 0;
    if (amount > MAX_AMOUNT) amount = MAX_AMOUNT;

    const payloadObj = {
      skuId: skuId,
      skuTitle: String(row[COL.skuTitle] || '').trim(),
      productTitle: String(row[COL.productTitle] || '').trim(),
      barcode: String(row[COL.barcode] || '').trim(),
      amount: amount,
      fbsLinked: true,
      dbsLinked: false
    };

    if (!tokenMap.has(token)) tokenMap.set(token, new Map());
    const skuMap = tokenMap.get(token);
    if (skuMap.has(skuId)) skippedDup++;   // dublikat -> oxirgisi ustiga yoziladi
    skuMap.set(skuId, payloadObj);
  }

  // Map'larni massivlarga aylantirish + jami sonni hisoblash
  const tokenPayloadMap = new Map();
  let totalPrepared = 0;
  for (const [token, skuMap] of tokenMap.entries()) {
    const arr = Array.from(skuMap.values());
    tokenPayloadMap.set(token, arr);
    totalPrepared += arr.length;
  }

  console.log(
    `📋 O'qildi: ${data.length} qator | Yuboriladi: ${totalPrepared} | ` +
    `FALSE: ${skippedInactive} | Dublikat: ${skippedDup} | Yaroqsiz: ${skippedInvalid}`
  );

  if (totalPrepared === 0) {
    console.log("Jo'natish uchun yaroqli mahsulot topilmadi.");
    return;
  }

  // 3-BOSQICH: parallel + backoff bilan yuborish
  const result = sendBatchesConcurrent_(tokenPayloadMap, startMs);

  const secs = ((Date.now() - startMs) / 1000).toFixed(1);
  console.log(
    `✅ Yakunlandi (${secs}s): ${result.success}/${totalPrepared} yuborildi. ` +
    `Xato: ${result.failedSkus.length} | Yuborilmay qolgan: ${result.pending}`
  );
  if (result.failedSkus.length > 0) {
    console.error("❌ Xato bergan SKU ID lar (namuna):\n" +
      result.failedSkus.slice(0, 50).join(', ') +
      (result.failedSkus.length > 50 ? ` ... va yana ${result.failedSkus.length - 50} ta` : ''));
  }
}

// ==========================================
// PARALLEL YUBORISH + 429/5xx BACKOFF-RETRY
// ==========================================
function sendBatchesConcurrent_(tokenPayloadMap, startMs) {
  const URL = 'https://api-seller.uzum.uz/api/seller-openapi/v2/fbs/sku/stocks';
  const BATCH_SIZE   = 100;    // Har so'rovdagi SKU soni
  const CONCURRENCY  = 4;      // Bir to'lqinda parallel so'rovlar (3-5 xavfsiz)
  const WAVE_GAP_MS  = 500;    // To'lqinlar orasidagi kichik pauza
  const MAX_RETRIES  = 4;      // 429/5xx uchun urinishlar soni
  const TIME_LIMIT_MS = 4.5 * 60 * 1000; // GAS 6 daq. limitidan xavfsiz chekinish

  // Barcha batch'larni vazifa (task) sifatida tayyorlash
  let queue = [];
  for (const [token, arr] of tokenPayloadMap.entries()) {
    for (let i = 0; i < arr.length; i += BATCH_SIZE) {
      queue.push({ token: token, batch: arr.slice(i, i + BATCH_SIZE) });
    }
  }

  let success = 0;
  const failedSkus = [];
  let pass = 0;

  while (queue.length > 0 && pass <= MAX_RETRIES) {
    // Vaqt qorovuli — limitga yaqinlashsak, to'xtaymiz
    if (Date.now() - startMs > TIME_LIMIT_MS) {
      const pendingSkus = queue.reduce((n, t) => n + t.batch.length, 0);
      console.warn(`⏱️ Vaqt limiti. ${pendingSkus} ta SKU yuborilmay qoldi (keyingi run'da davom eting).`);
      return { success: success, failedSkus: failedSkus, pending: pendingSkus };
    }

    // Retry passlarida exponential backoff
    if (pass > 0) {
      const backoff = Math.min(30000, 1000 * Math.pow(2, pass)); // 2s,4s,8s,16s...
      console.warn(`♻️ ${queue.length} batch qayta yuborilmoqda (urinish ${pass}), ${backoff}ms kutish...`);
      Utilities.sleep(backoff);
    }

    const retry = [];

    for (let i = 0; i < queue.length; i += CONCURRENCY) {
      const wave = queue.slice(i, i + CONCURRENCY);
      let responses;
      try {
        responses = UrlFetchApp.fetchAll(wave.map(t => buildRequest_(URL, t.token, t.batch)));
      } catch (err) {
        // Tarmoq xatosi — butun to'lqinni retry'ga qo'yamiz
        console.error("🛑 fetchAll xatosi: " + err.message);
        wave.forEach(t => retry.push(t));
        Utilities.sleep(WAVE_GAP_MS);
        continue;
      }

      responses.forEach((res, idx) => {
        const code = res.getResponseCode();
        const task = wave[idx];

        if (code >= 200 && code < 300) {
          success += task.batch.length;
        } else if (code === 429 || code >= 500) {
          retry.push(task); // vaqtinchalik xato -> qayta uriniladi
        } else {
          // 400 va boshqa doimiy xatolar — log qilamiz, retry qilmaymiz
          const tokenShort = task.token.substring(0, 12) + "...";
          const skus = task.batch.map(it => it.skuId);
          console.error(
            `❌ UZUM API XATOSI (${code}) — Token: ${tokenShort}\n` +
            `   SKU (${skus.length} ta): ${skus.slice(0, 10).join(', ')}` +
            (skus.length > 10 ? ' ...' : '') + `\n` +
            `   Javob: ${res.getContentText()}`
          );
          skus.forEach(s => failedSkus.push(s));
        }
      });

      if (i + CONCURRENCY < queue.length) Utilities.sleep(WAVE_GAP_MS);
    }

    queue = retry;
    pass++;
  }

  // Retry tugagach hali qolgan bo'lsa — yakuniy xato
  if (queue.length > 0) {
    queue.forEach(t => t.batch.forEach(it => failedSkus.push(it.skuId)));
    console.error(`❌ ${queue.length} batch ${MAX_RETRIES} urinishdan keyin ham yuborilmadi (429/5xx).`);
  }

  return { success: success, failedSkus: failedSkus, pending: 0 };
}

// So'rov obyektini yasash
function buildRequest_(url, token, batch) {
  return {
    url: url,
    method: 'POST',
    contentType: 'application/json',
    headers: { 'accept': '*/*', 'Authorization': token },
    payload: JSON.stringify({ skuAmountList: batch }),
    muteHttpExceptions: true
  };
}