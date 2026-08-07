// v3 jadvalidan bazaga bir martalik ko'chirish: `link_product` va qoldiq
// modifikatsiyasi qoidalari.
//
// `mc_product` va `mc_stock` bu yerda YO'Q — ular MoySklad'dan to'g'ridan-
// to'g'ri o'qiladi (`moysklad/assortment.js`), jadval orqali emas.
//
// Ko'chirish jadvalga hech narsa yozmaydi. Takroriy ishga tushirilsa
// jadvaldagi holat bazaga qayta yoziladi (kalit bo'yicha upsert), ya'ni
// tekshirib-tekshirib qayta yugurtirsa bo'ladi.
import { config } from "../config.js";
import { db } from "../db/index.js";
import logger from "../logger.js";
import { getSheetsClient } from "../google/sheetsClient.js";

// Manbadagi list nomlari.
const SHEETS = {
  linkProduct: "link_product",
  stockMod: "uzum_stock_mod",
  stockModDetail: "uzum_stock_mod_detail",
  modDefault: "uzum_mod_default",
  mcStock: "mc_stock",
};

// K ustunidagi eski qo'shimcha: `...@3`, `...#2`, `...%5`, `...&4` yoki `...$`.
// Yangi ma'lumotda bo'lmaydi, lekin ko'chirilayotgan qatorlarda uchraydi.
const SUFFIX = /([@#%&$]\d+|\$)$/;

/** "true"/"TRUE"/true/1 → 1, qolgani 0. Bo'sh katak `defaultValue` ni oladi. */
function bool(v, defaultValue = 1) {
  if (v === "" || v === null || v === undefined) return defaultValue;
  if (v === true) return 1;
  if (v === false) return 0;
  const s = String(v).trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes") return 1;
  if (s === "false" || s === "0" || s === "no") return 0;
  return defaultValue;
}

const num = (v) => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const str = (v) => (v === "" || v === null || v === undefined ? null : String(v).trim());

async function readSheet(sheets, name) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: name,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const rows = res.data.values || [];
  return rows.slice(1); // sarlavha
}

/**
 * link_product: A skuId · B skuTitle · C productTitle · D barcode · E image
 * · H status · I shop · J stock update · K MC external id · M mc uuid
 * · N card quantity · O order import
 *
 * F (amount) va L (mc_stock fact) KO'CHIRILMAYDI — ular hisoblanadigan
 * qiymat, manba emas. Server ularni o'zi hisoblaydi (`stock/rules.js`).
 */
export async function importLinkProducts(sheets) {
  const rows = await readSheet(sheets, SHEETS.linkProduct);

  const insert = db.prepare(
    `INSERT INTO link_product
       (sku_id, sku_title, product_title, barcode, image, shop_id, status,
        stock_update, order_import, mc_external_id, mc_uuid, card_quantity,
        legacy_divisor, updated_at)
     VALUES (@skuId, @skuTitle, @productTitle, @barcode, @image, @shopId, @status,
             @stockUpdate, @orderImport, @mcExternalId, @mcUuid, @cardQuantity,
             @legacyDivisor, datetime('now'))`
  );

  const report = { total: rows.length, imported: 0, skipped: 0, withSuffix: [], noCardQty: [], duplicates: [] };
  const seen = new Set();

  db.transaction(() => {
    db.exec("DELETE FROM link_product");

    rows.forEach((r, i) => {
      const line = i + 2; // jadvaldagi qator raqami
      const skuTitle = str(r[1]);
      if (!skuTitle) {
        report.skipped++;
        return;
      }
      if (seen.has(skuTitle)) report.duplicates.push({ line, skuTitle });
      seen.add(skuTitle);

      // Eski qo'shimcha: bo'luvchini ajratib olamiz, External ID ni tozalaymiz.
      const rawExternal = str(r[10]) || "";
      const suffix = rawExternal.match(SUFFIX);
      let legacyDivisor = 1;
      if (suffix) {
        report.withSuffix.push({ line, skuTitle, value: rawExternal });
        const digits = rawExternal.match(/[@#%&](\d+)$/);
        if (digits) legacyDivisor = Number(digits[1]) || 1;
      }

      const cardQuantity = num(r[13]);
      if (!cardQuantity) report.noCardQty.push({ line, skuTitle });

      insert.run({
        skuId: num(r[0]),
        skuTitle,
        productTitle: str(r[2]),
        barcode: str(r[3]),
        image: str(r[4]),
        shopId: str(r[8]),
        status: str(r[7]),
        stockUpdate: bool(r[9]),
        orderImport: bool(r[14]),
        mcExternalId: rawExternal.replace(SUFFIX, "") || null,
        mcUuid: str(r[12]),
        cardQuantity: cardQuantity || 0,
        legacyDivisor,
      });
      report.imported++;
    });
  })();

  return report;
}

/**
 * uzum_stock_mod: A id · D uzum_product · E default quantity
 * uzum_stock_mod_detail: A id · D mod id · E quantity from · F comparison
 *   · H priority · I default quantity (bayroq) · J quantity to · K comment
 *
 * Detail'ning G ustuni (Final Quantity to) ko'chirilmaydi — u formula edi,
 * server uni `use_default` va otaning qiymatidan chiqaradi.
 */
export async function importStockMods(sheets) {
  const [mods, details, defaults] = await Promise.all([
    readSheet(sheets, SHEETS.stockMod),
    readSheet(sheets, SHEETS.stockModDetail),
    readSheet(sheets, SHEETS.modDefault),
  ]);

  const report = { mods: 0, details: 0, defaults: 0, orphanDetails: [], badComparison: [] };
  const validComparison = new Set(["greater than", "less than", "equal"]);

  db.transaction(() => {
    db.exec("DELETE FROM uzum_stock_mod_detail; DELETE FROM uzum_stock_mod; DELETE FROM uzum_mod_default");

    const modIds = new Set();
    const insertMod = db.prepare(
      `INSERT INTO uzum_stock_mod (id, sku_title, default_quantity, created_at, created_by, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const r of mods) {
      const id = str(r[0]);
      const skuTitle = str(r[3]);
      if (!id || !skuTitle) continue;
      insertMod.run(id, skuTitle, num(r[4]), str(r[1]), str(r[2]), str(r[5]), str(r[6]));
      modIds.add(id);
      report.mods++;
    }

    const insertDetail = db.prepare(
      `INSERT INTO uzum_stock_mod_detail
         (id, mod_id, quantity_from, comparison, priority, use_default, quantity_to, comment,
          created_at, created_by, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    details.forEach((r, i) => {
      const id = str(r[0]);
      const modId = str(r[3]);
      if (!id || !modId) return;
      if (!modIds.has(modId)) {
        // Otasi yo'q qoida hech qachon ishlamaydi — yozmaymiz, lekin
        // hisobotda ko'rinsin.
        report.orphanDetails.push({ line: i + 2, id, modId });
        return;
      }
      const comparison = str(r[5]) || "";
      if (!validComparison.has(comparison)) report.badComparison.push({ line: i + 2, id, comparison });

      insertDetail.run(
        id,
        modId,
        num(r[4]) ?? 0,
        comparison,
        num(r[7]) ?? 1,
        bool(r[8], 0),
        num(r[9]),
        str(r[10]),
        str(r[1]),
        str(r[2]),
        str(r[11]),
        str(r[12])
      );
      report.details++;
    });

    const insertDefault = db.prepare(
      `INSERT INTO uzum_mod_default (id, quantity_from, comparison, quantity_to, priority, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const r of defaults) {
      const id = str(r[0]);
      if (!id) continue;
      const comparison = str(r[4]) || "";
      if (!validComparison.has(comparison)) report.badComparison.push({ id, comparison });
      insertDefault.run(id, num(r[3]) ?? 0, comparison, num(r[5]), num(r[6]) ?? 1, str(r[1]), str(r[2]));
      report.defaults++;
    }
  })();

  return report;
}

/**
 * `mc_stock` listini bazaga ko'chiradi — MoySklad o'rniga.
 *
 * Faqat SOLISHTIRISH uchun. Server MoySklad'dan yangi qoldiqni oladi,
 * jadvaldagi qiymat esa oxirgi `MSStockSync` dan qolgan — shu sababdan
 * chiqadigan farq mantiq xatosi emas, vaqt farqi. Ikkovini ajratish uchun
 * jadvalning O'Z qoldig'i bilan hisoblanadi: shunda qolgan har qanday farq
 * haqiqiy xato bo'ladi.
 *
 * Ustunlar: A ID · B Vaqt · C Product (UUID) · D Stock · E External ID
 */
export async function importMcStockFromSheet(sheets) {
  const rows = await readSheet(sheets, SHEETS.mcStock);
  const now = new Date().toISOString();
  const insert = db.prepare("INSERT OR REPLACE INTO mc_stock (uuid, stock, external_id, synced_at) VALUES (?, ?, ?, ?)");

  let imported = 0;
  db.transaction(() => {
    db.exec("DELETE FROM mc_stock");
    for (const r of rows) {
      const uuid = str(r[2]);
      if (!uuid) continue;
      insert.run(uuid, num(r[3]) ?? 0, str(r[4]), now);
      imported++;
    }
  })();

  logger.info(`mc_stock jadvaldan ko'chirildi: ${imported} ta (solishtirish uchun)`);
  return { imported, total: rows.length };
}

export async function importAll() {
  const sheets = getSheetsClient();
  const mods = await importStockMods(sheets);
  const links = await importLinkProducts(sheets);
  logger.info(
    `v3 ko'chirildi: link_product ${links.imported}/${links.total}, ` +
      `qoidalar ${mods.mods}+${mods.details}, standart ${mods.defaults}`
  );
  return { links, mods };
}
