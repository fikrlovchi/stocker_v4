// Uzum Market FBS'ga qoldiq yuborish — v3 dagi `gas_v3/stock_updater_v3.js`
// ning o'rni (docs/V3-MIGRATION.md, 4-bosqich).
//
// GAS bilan farqi:
//   • qoldiq jadvaldagi formuladan emas, `stock/rules.js` dan hisoblanadi;
//   • token har qatorda takrorlanmaydi — do'kon orqali kabinetdan olinadi;
//   • GAS'ning 6 daqiqalik chegarasi yo'q, lekin tezlik cheklovi bor
//     (to'lqin va backoff saqlab qolindi — Uzum 429 beradi).
//
// Payload shakli GAS bilan AYNAN bir xil: solishtirish ma'noli bo'lishi va
// Uzum tomonida hech narsa o'zgarmasligi kerak.
import logger from "../logger.js";
import { computeRow } from "./rules.js";

const URL = "https://api-seller.uzum.uz/api/seller-openapi/v2/fbs/sku/stocks";

const MAX_AMOUNT = 100000;
const BATCH_SIZE = 100; // bitta so'rovdagi SKU soni
const CONCURRENCY = 4; // bir to'lqinda parallel so'rov
const WAVE_GAP_MS = 500;
const MAX_RETRIES = 4;
const TIMEOUT_MS = 30000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Yuboriladigan payloadlarni yasaydi.
 *
 * Toza funksiya — tarmoq va bazani bilmaydi, shuning uchun testda to'liq
 * tekshiriladi va `--dry-run` da aynan shu natija ko'rsatiladi.
 *
 * @returns {{ byToken: Map<string, object[]>, skipped: object, tokens: object[] }}
 */
export function buildPayloads(rows, { mods, defaults, stock, shops }) {
  // token → Map(skuId → payload). Map, chunki dublikat skuId'da oxirgi qator
  // g'olib bo'lishi kerak (GAS'da ham shunday).
  const byToken = new Map();
  const tokenLabel = new Map();

  const skipped = {
    stockUpdateOff: [], // link_product!J = FALSE
    shopStockOff: [], // do'kon bo'yicha qoldiq yangilash o'chirilgan
    noSkuId: [],
    unknownShop: [],
    noToken: [],
    noAmount: [], // amount hisoblanmadi (skuTitle bo'sh)
    duplicates: [],
  };

  for (const row of rows) {
    if (!row.stockUpdate) {
      skipped.stockUpdateOff.push(row.skuTitle);
      continue;
    }

    const skuId = Number(row.skuId);
    if (!Number.isFinite(skuId) || skuId === 0) {
      skipped.noSkuId.push(row.skuTitle);
      continue;
    }

    const shop = shops.get(String(row.shopId));
    if (!shop) {
      skipped.unknownShop.push({ skuTitle: row.skuTitle, shopId: row.shopId });
      continue;
    }
    // Do'kon darajasidagi bayroq (v3 `uzum_shop!E`). GAS bundan
    // foydalanmagan — shuning uchun hisobotda alohida ko'rsatiladi.
    if (!shop.stockUpdate) {
      skipped.shopStockOff.push({ skuTitle: row.skuTitle, shop: shop.name });
      continue;
    }
    if (!shop.token) {
      skipped.noToken.push({ skuTitle: row.skuTitle, shop: shop.name });
      continue;
    }

    const { amount } = computeRow(row, {
      stock: stock.has(row.mcExternalId) ? stock.get(row.mcExternalId) : null,
      mod: mods.get(row.skuTitle) || null,
      defaults,
    });
    if (amount === null || amount === undefined) {
      skipped.noAmount.push(row.skuTitle);
      continue;
    }

    const clamped = Math.min(Math.max(Math.floor(amount), 0), MAX_AMOUNT);

    if (!byToken.has(shop.token)) {
      byToken.set(shop.token, new Map());
      tokenLabel.set(shop.token, shop.cabinetName || shop.name);
    }
    const skuMap = byToken.get(shop.token);
    if (skuMap.has(skuId)) skipped.duplicates.push({ skuId, skuTitle: row.skuTitle });

    skuMap.set(skuId, {
      skuId,
      skuTitle: row.skuTitle || "",
      productTitle: row.productTitle || "",
      barcode: row.barcode || "",
      amount: clamped,
      // Varaqda ustun yo'q edi — GAS'da ham kodga yozilgan.
      fbsLinked: true,
      dbsLinked: false,
    });
  }

  const result = new Map();
  const tokens = [];
  for (const [token, skuMap] of byToken) {
    result.set(token, [...skuMap.values()]);
    tokens.push({ label: tokenLabel.get(token), count: skuMap.size });
  }

  return { byToken: result, skipped, tokens };
}

async function postBatch(token, batch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: {
        // Uzum seller-openapi: "Bearer" prefiksisiz, xom token.
        Authorization: token,
        "Content-Type": "application/json",
        accept: "*/*",
      },
      body: JSON.stringify({ skuAmountList: batch }),
      signal: controller.signal,
    });
    return { status: res.status, text: res.ok ? "" : (await res.text()).slice(0, 300) };
  } catch (e) {
    // Tarmoq xatosi — 5xx kabi qayta uriniladigan holat.
    return { status: 0, text: e.name === "AbortError" ? "timeout" : e.message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Payloadlarni Uzumga yuboradi: 100 talik batch, 4 parallel, 429/5xx da
 * eksponensial backoff. 400 va boshqa doimiy xatolar qayta urinilmaydi —
 * ular ma'lumotdagi muammo, takrorlash yordam bermaydi.
 */
export async function sendPayloads(byToken) {
  let queue = [];
  for (const [token, list] of byToken) {
    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      queue.push({ token, batch: list.slice(i, i + BATCH_SIZE) });
    }
  }

  const total = queue.reduce((n, t) => n + t.batch.length, 0);
  let success = 0;
  const failed = [];
  let pass = 0;

  while (queue.length && pass <= MAX_RETRIES) {
    if (pass > 0) {
      const backoff = Math.min(30000, 1000 * 2 ** pass);
      logger.warn(`Uzum: ${queue.length} batch qayta yuborilmoqda (urinish ${pass}), ${backoff}ms kutish`);
      await sleep(backoff);
    }

    const retry = [];
    for (let i = 0; i < queue.length; i += CONCURRENCY) {
      const wave = queue.slice(i, i + CONCURRENCY);
      const results = await Promise.all(wave.map((t) => postBatch(t.token, t.batch)));

      results.forEach((r, idx) => {
        const task = wave[idx];
        if (r.status >= 200 && r.status < 300) {
          success += task.batch.length;
        } else if (r.status === 429 || r.status === 0 || r.status >= 500) {
          retry.push(task);
        } else {
          // Doimiy xato — SKU'larni ro'yxatga olamiz, tokenni EMAS.
          logger.error(
            `Uzum ${r.status}: ${task.batch.length} ta SKU yuborilmadi ` +
              `(${task.batch.slice(0, 5).map((b) => b.skuId).join(", ")}…) — ${r.text}`
          );
          for (const b of task.batch) failed.push({ skuId: b.skuId, status: r.status });
        }
      });

      if (i + CONCURRENCY < queue.length) await sleep(WAVE_GAP_MS);
    }

    queue = retry;
    pass++;
  }

  // Urinishlar tugagach qolganlar — vaqtinchalik xato doimiyga aylandi.
  const pending = queue.reduce((n, t) => n + t.batch.length, 0);
  for (const t of queue) for (const b of t.batch) failed.push({ skuId: b.skuId, status: 429 });

  return { total, success, failed, pending };
}
