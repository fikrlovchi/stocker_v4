/**
 * addBarcodeToMC.gs
 * ------------------------------------------------------------------
 * link_product!D ustunidagi (H flagi belgilangan) barcode'ni MoySklad tovariga qo'shadi.
 *
 * Eski barcode'lar o'chib ketmasligi uchun: PUT'dan OLDIN tovarning hozirgi
 * barcode'lari MoySklad'dan JONLI GET qilinadi, yangisi ustiga qo'shib PUT qilinadi.
 * Shu bois natija sheet holatiga bog'liq emas (ma'lumot yo'qolmaydi).
 *
 * Listlar:
 *   link_product : A=skuId, C=title, D=barcode, E=image, G=token,
 *                  H=yuborish flagi, I=shopId, M=MoySklad UUID
 *   mc_product   : B=Tovar UUID, C=Entity type (product/variant/bundle/service/consignment)
 *   mc_token     : A2 = MoySklad Bearer token
 *   mc_barcode   : (ixtiyoriy audit log) A=Barcode, B=UUID, C=turi
 * ------------------------------------------------------------------
 */

var SHEET_ID = '18j8NDVJl9ZD-wuwlP3T1A1-sVoJlW_doFrwQrf-AvsE';

// link_product ustun indekslari (0 dan)
var LP_COL_BARCODE = 3;   // D ustun
var LP_COL_FLAG    = 7;   // H ustun (yuborish flagi)
var LP_COL_UUID    = 12;  // M ustun

// mc_barcode ustun indekslari (0 dan)
var MB_COL_BARCODE = 0;   // A
var MB_COL_UUID    = 1;   // B
var MB_COL_TYPE    = 2;   // C

// mc_product ustun indekslari (0 dan)
var MP_COL_UUID   = 1;    // B
var MP_COL_ENTITY = 2;    // C (entity type)

var MC_BASE = 'https://api.moysklad.ru/api/remap/1.2/entity';

// MoySklad qabul qiladigan barcode turlari
var MC_TYPES = ['ean13', 'ean8', 'code128', 'gtin', 'upc'];

// MoySklad'da barcode saqlanadigan obyekt turlari
var MC_ENTITIES = ['product', 'variant', 'bundle', 'service', 'consignment'];


/* ============================================================
 *  ASOSIY: link_product!D dagi barcode'larni MoySklad'ga qo'shish
 * ============================================================ */
function addBarcodesToMoySklad() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var lp = ss.getSheetByName('link_product');
  var mb = ss.getSheetByName('mc_barcode');

  if (!lp) { Logger.log("Xato: 'link_product' listi topilmadi!"); return; }

  var token = getMcToken_(ss);
  if (!token) { Logger.log("Xato: mc_token!A2 bo'sh (MoySklad token yo'q)!"); return; }

  var entityMap = loadEntityMap_(ss); // UUID -> entity type (mc_product'dan)

  var lpData = lp.getDataRange().getValues();
  var addedCount = 0;

  for (var i = 1; i < lpData.length; i++) {
    var rowNum = i + 1; // Google Sheets qatori (1 dan)

    // Faqat H ustuni belgilangan (flagli) qatorlarni ishlaymiz
    if (!isFlagged_(lpData[i][LP_COL_FLAG])) continue;

    var barcode = normalizeCode_(lpData[i][LP_COL_BARCODE]);
    var uuid    = String(lpData[i][LP_COL_UUID] || '').trim();

    // Flagli, lekin barcode/UUID yo'q -> flagni qoldiramiz (e'tibor uchun) va logga yozamiz
    if (!barcode || !uuid) {
      Logger.log(rowNum + '-qator: flagli, lekin barcode/UUID bo\'sh -> o\'tkazildi');
      continue;
    }

    // 1) MUHIM: hozirgi barcode'larni MoySklad'dan JONLI olamiz (sheet'ga tayanmaymiz).
    //    Shunda eski barcode'lar hech qachon yo'qolmaydi.
    var getRes = mcGetBarcodes_(uuid, token, entityMap[uuid]);
    if (!getRes.ok) {
      Logger.log(rowNum + '-qator: GET XATO (' + getRes.status + ') ' + uuid + ' -> ' + getRes.body);
      continue; // flag qoladi -> keyin qayta urinadi
    }

    var current = getRes.barcodes || []; // MoySklad formatidagi massiv: [{ean13:"..."}, ...]

    // 2) Bu barcode allaqachon MoySklad'da bor bo'lsa -> PUT qilmaymiz, flag tozalanadi
    if (barcodeExists_(current, barcode)) {
      clearFlag_(lp, rowNum);
      Logger.log(rowNum + '-qator: allaqachon bor -> ' + barcode + ' (' + getRes.entity + ')');
      continue;
    }

    // 3) Yangi barcode'ni mavjudlar ustiga qo'shamiz
    var type = detectBarcodeType_(barcode);
    var newObj = {};
    newObj[type] = barcode;
    var payload = current.concat([newObj]);

    // GET muvaffaqiyatli bo'lgan aynan o'sha entity turiga PUT qilamiz
    var res = mcPutBarcodes_(uuid, payload, token, getRes.entity);

    if (res.ok) {
      if (mb) mb.appendRow([barcode, uuid, type]); // audit log (ixtiyoriy)
      clearFlag_(lp, rowNum);
      addedCount++;
      Logger.log(rowNum + '-qator: OK -> ' + barcode + ' (' + type + ') -> ' +
                 res.entity + '/' + uuid + ' [jami ' + payload.length + ' barcode]');
    } else {
      // Xato -> flag qoladi, keyingi ishga tushishda qayta urinadi
      Logger.log(rowNum + '-qator: PUT XATO (' + res.status + ') ' + uuid + ' -> ' + res.body);
    }

    Utilities.sleep(200); // MoySklad rate-limit uchun pauza
  }

  Logger.log('Tugadi. Qo\'shilgan barcode: ' + addedCount);
}

/** MoySklad barcode massivida shu qiymat (har qanday turda) bormi? */
function barcodeExists_(current, value) {
  for (var k = 0; k < current.length; k++) {
    var obj = current[k];
    for (var key in obj) {
      if (String(obj[key]).trim() === String(value).trim()) return true;
    }
  }
  return false;
}


/* ============================================================
 *  AppSheet automation uchun: Uzum import + barcode qo'shish
 * ============================================================ */
function runAll() {
  fetchUzumProducts();      // mavjud funksiya (Uzum'dan SKU/barcode import)
  addBarcodesToMoySklad();  // yangi: barcode'ni MoySklad'ga qo'shish
}


/* ============================================================
 *  MoySklad API yordamchilari
 * ============================================================ */

/**
 * Tovarga barcode ro'yxatini PUT qiladi.
 * entityType berilgan bo'lsa (mc_product'dan) o'shanga yuboradi;
 * berilmasa product->variant fallback ishlaydi.
 */
function mcPutBarcodes_(uuid, barcodesPayload, token, entityType) {
  var payload = JSON.stringify({ barcodes: barcodesPayload });
  var order = entityOrder_(entityType);

  var last = null;
  for (var k = 0; k < order.length; k++) {
    var r = mcRequest_('put', order[k], uuid, token, payload);
    if (r.code === 200) return { ok: true, entity: order[k], status: 200, body: '' };
    last = { ok: false, entity: order[k], status: r.code, body: r.text };
    if (r.code !== 404) break; // 404 dan boshqa xato bo'lsa fallback qilmaymiz
  }
  return last;
}

/**
 * Tovardagi mavjud barcode massivini oladi.
 * entityType berilgan bo'lsa o'shanga; bo'lmasa product->variant fallback.
 */
function mcGetBarcodes_(uuid, token, entityType) {
  var order = entityOrder_(entityType);

  var last = null;
  for (var k = 0; k < order.length; k++) {
    var r = mcRequest_('get', order[k], uuid, token, null);
    if (r.code === 200) {
      var j = JSON.parse(r.text);
      return { ok: true, entity: order[k], status: 200, barcodes: j.barcodes || [], body: '' };
    }
    last = { ok: false, entity: order[k], status: r.code, barcodes: [], body: r.text };
    if (r.code !== 404) break;
  }
  return last;
}

/** Qaysi entity turlarini sinashni belgilaydi. Ma'lum bo'lsa faqat o'sha, aks holda fallback. */
function entityOrder_(entityType) {
  var e = String(entityType || '').trim().toLowerCase();
  if (MC_ENTITIES.indexOf(e) >= 0) return [e];
  return ['product', 'variant']; // noma'lum -> eski xatti-harakat
}

/** MoySklad'ga umumiy so'rov. entity = 'product' | 'variant' */
function mcRequest_(method, entity, uuid, token, payload) {
  var url = MC_BASE + '/' + entity + '/' + uuid;
  var options = {
    'method': method,
    'contentType': 'application/json',
    'headers': {
      'Authorization': mcAuthHeader_(token),
      'Accept': 'application/json;charset=utf-8'
    },
    'muteHttpExceptions': true
  };
  if (payload) options.payload = payload;

  var resp = UrlFetchApp.fetch(url, options);
  return { code: resp.getResponseCode(), text: resp.getContentText() };
}

/** Token oldiga "Bearer " qo'shadi (agar bo'lmasa). */
function mcAuthHeader_(token) {
  var t = String(token).trim();
  return /^bearer\s/i.test(t) ? t : ('Bearer ' + t);
}

/** H ustuni belgilanganmi? TRUE / "yes" / "ha" / "1" / "x" / "yubor" -> true */
function isFlagged_(v) {
  if (v === true) return true;
  if (typeof v === 'number') return v !== 0;
  var s = String(v || '').trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === 'ha' || s === '1' ||
         s === 'x' || s === '✓' || s === 'yubor';
}

/** H ustunidagi flagni tozalaydi (qayta yuborilmasligi uchun). */
function clearFlag_(lp, rowNum) {
  lp.getRange(rowNum, LP_COL_FLAG + 1).setValue(false); // +1: 1 dan indeks
}

/** mc_token!A2 dan token o'qiydi. */
function getMcToken_(ss) {
  var sh = ss.getSheetByName('mc_token');
  if (!sh) return '';
  return String(sh.getRange('A2').getValue() || '').trim();
}

/** mc_product listidan {UUID: entity type} xaritasini tuzadi. List yo'q bo'lsa bo'sh {}. */
function loadEntityMap_(ss) {
  var map = {};
  var sh = ss.getSheetByName('mc_product');
  if (!sh) return map;
  var data = sh.getDataRange().getValues();
  for (var r = 1; r < data.length; r++) {
    var uuid = String(data[r][MP_COL_UUID] || '').trim();
    var ent  = String(data[r][MP_COL_ENTITY] || '').trim().toLowerCase();
    if (uuid && ent) map[uuid] = ent;
  }
  return map;
}


/* ============================================================
 *  Barcode turini aniqlash (uzunlik + GTIN checksum)
 * ============================================================ */

/** Barcode qiymatidan MoySklad turini aniqlaydi. */
function detectBarcodeType_(raw) {
  var code = normalizeCode_(raw);
  if (/^\d{13}$/.test(code) && isValidGtin_(code)) return 'ean13';
  if (/^\d{8}$/.test(code)  && isValidGtin_(code)) return 'ean8';
  if (/^\d{12}$/.test(code) && isValidGtin_(code)) return 'upc';
  if (/^\d{14}$/.test(code) && isValidGtin_(code)) return 'gtin';
  return 'code128'; // raqamli bo'lmagan yoki checksum mos kelmagan holatlar
}

/** GTIN/EAN/UPC checksum tekshiruvi (8/12/13/14 raqamli). */
function isValidGtin_(code) {
  if (!/^\d+$/.test(code)) return false;
  var digits = code.split('').map(Number);
  var check = digits.pop();
  var sum = 0;
  var w = 3; // eng o'ngdagi ma'lumot raqamidan boshlab 3,1,3,1...
  for (var i = digits.length - 1; i >= 0; i--) {
    sum += digits[i] * w;
    w = (w === 3) ? 1 : 3;
  }
  var calc = (10 - (sum % 10)) % 10;
  return calc === check;
}

/** Katakdagi barcode qiymatini toza matnga aylantiradi (raqam/eksponentadan himoya). */
function normalizeCode_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') {
    // eksponensial ko'rinishsiz butun songa
    return (Math.round(v)).toFixed(0);
  }
  return String(v).trim();
}

function fetchUzumProducts() {
  // O'zingizning Google Sheet ID raqamingizni shu yerga kiriting
  var SHEET_ID = '18j8NDVJl9ZD-wuwlP3T1A1-sVoJlW_doFrwQrf-AvsE'; 
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('link_product');
  
  if (!sheet) {
    Logger.log("Xato: 'link_product' nomli list topilmadi!");
    return;
  }

  // Ma'lumotlarni faqat o'qish uchun olamiz (jadvalga hech narsa yozilmaydi)
  var data = sheet.getDataRange().getValues();
  
  // O'qish uchun ustun indekslari (0 dan boshlanadi)
  var COL_SKU_ID = 0;       // A ustun
  var COL_SEARCH = 1;       // B ustun
  var COL_TOKEN = 6;        // G ustun (Token)
  var COL_SHOP_ID = 8;      // I ustun (Shop ID)

  var updated = false;

  for (var i = 1; i < data.length; i++) {
    var row = data[i];

    // Agar A ustun bo'sh bo'lmasa, o'tkazib yuboramiz
    if (row[COL_SKU_ID] !== "" && row[COL_SKU_ID] !== null) {
      continue;
    }

    var searchQuery = row[COL_SEARCH];
    var token = data[i].length > COL_TOKEN ? row[COL_TOKEN] : "";
    var shopId = data[i].length > COL_SHOP_ID ? row[COL_SHOP_ID] : "";

    if (!searchQuery || !token || !shopId) {
      continue;
    }

    var encodedQuery = encodeURIComponent(searchQuery);
    var url = "https://api-seller.uzum.uz/api/seller-openapi/v1/product/shop/" + shopId + 
              "?searchQuery=" + encodedQuery + "&sortBy=DEFAULT&order=ASC&size=1&page=0&filter=ALL";

    var options = {
      'method': 'get',
      'headers': {
        'accept': '*/*',
        'Authorization': token
      },
      'muteHttpExceptions': true
    };

    try {
      var response = UrlFetchApp.fetch(url, options);
      
      if (response.getResponseCode() === 200) {
        var json = JSON.parse(response.getContentText());
        
        if (json.productList && json.productList.length > 0) {
          var product = json.productList[0];
          var skuList = product.skuList;
          var imageUrl = product.image; 
          
          if (skuList && skuList.length > 0) {
            var targetSku = null;
            for (var j = 0; j < skuList.length; j++) {
              if (skuList[j].skuFullTitle === searchQuery) {
                targetSku = skuList[j];
                break;
              }
            }

            // Agar ma'lumot topilsa, FAQAT kerakli ustunlarga yozamiz
            if (targetSku) {
              var rowNum = i + 1; // Google Sheets qatorlari 1 dan boshlanadi (masalan: 2-qator)
              
              // Faqat A, C, D, E ustunlarigagina qiymat yozamiz (qolganlarga umuman tegmaymiz)
              sheet.getRange(rowNum, 1).setValue(targetSku.skuId);       // 1 = A ustun
              sheet.getRange(rowNum, 3).setValue(targetSku.productTitle); // 3 = C ustun
              sheet.getRange(rowNum, 4).setValue(targetSku.barcode);      // 4 = D ustun
              sheet.getRange(rowNum, 5).setValue(imageUrl);               // 5 = E ustun
              
              updated = true;
            }
          }
        }
      } else {
        Logger.log((i + 1) + "-qator uchun API xatosi. Status: " + response.getResponseCode());
      }
    } catch (e) {
      Logger.log((i + 1) + "-qatorda so'rov yuborishda xatolik: " + e.message);
    }
    
    // API ni bloklab qo'ymaslik uchun pauza
    Utilities.sleep(300);
  }

  if (updated) {
    Logger.log("Barcha yangilanishlar muvaffaqiyatli bajarildi. Boshqa ustunlarga tegilmadi.");
  } else {
    Logger.log("Yangilanadigan yangi qatorlar topilmadi.");
  }
}