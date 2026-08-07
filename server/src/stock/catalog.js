// Qoldiq hisobi uchun bazadan o'qish.
//
// Hisoblashning o'zi `rules.js` da — u toza funksiya va bazani bilmaydi,
// shuning uchun testda ham, solishtirishda ham bir xil ishlaydi.
import { db } from "../db/index.js";

/** SKU nomi → { defaultQuantity, details[] }. Qoidalar kam (16 ta), hammasi birdan o'qiladi. */
export function loadMods() {
  const mods = new Map();
  for (const m of db.prepare("SELECT id, sku_title, default_quantity FROM uzum_stock_mod").all()) {
    mods.set(m.sku_title, { id: m.id, defaultQuantity: m.default_quantity, details: [] });
  }

  const byId = new Map([...mods.values()].map((m) => [m.id, m]));
  for (const d of db
    .prepare("SELECT mod_id, quantity_from, comparison, priority, use_default, quantity_to FROM uzum_stock_mod_detail")
    .all()) {
    byId.get(d.mod_id)?.details.push({
      quantityFrom: d.quantity_from,
      comparison: d.comparison,
      priority: d.priority,
      useDefault: Boolean(d.use_default),
      quantityTo: d.quantity_to,
    });
  }
  return mods;
}

export function loadDefaults() {
  return db
    .prepare("SELECT quantity_from, comparison, quantity_to, priority FROM uzum_mod_default")
    .all()
    .map((r) => ({
      quantityFrom: r.quantity_from,
      comparison: r.comparison,
      quantityTo: r.quantity_to,
      priority: r.priority,
    }));
}

/** External ID → qoldiq. `mc_stock` 2000 ga yaqin qator — xotiraga sig'adi. */
export function loadStockByExternalId() {
  const map = new Map();
  for (const r of db.prepare("SELECT external_id, stock FROM mc_stock WHERE external_id IS NOT NULL AND external_id <> ''").all()) {
    // Bir xil External ID bir necha tovarda bo'lsa manbadagi XLOOKUP
    // birinchisini oladi — shu xatti-harakat saqlanadi.
    if (!map.has(r.external_id)) map.set(r.external_id, r.stock);
  }
  return map;
}

/**
 * shop_id → { name, cabinetId, token }.
 *
 * v3 da token har `link_product` qatorida takrorlanardi (`link_product!G`) —
 * bu yerda esa do'kon orqali kabinetdan olinadi, ya'ni token bitta joyda
 * turadi (Konfiguratsiya → Uzum).
 */
export function loadShopTokens() {
  const map = new Map();
  const rows = db
    .prepare(
      `SELECT s.shop_id, s.name, s.cabinet_id, c.token, c.name AS cabinet_name
       FROM uzum_shops s JOIN uzum_cabinets c ON c.id = s.cabinet_id`
    )
    .all();
  for (const r of rows) {
    map.set(String(r.shop_id), {
      name: r.name,
      cabinetId: r.cabinet_id,
      cabinetName: r.cabinet_name,
      token: r.token,
    });
  }
  return map;
}

export function loadLinkProducts() {
  return db
    .prepare(
      `SELECT id, sku_id, sku_title, product_title, barcode, shop_id, stock_update,
              mc_external_id, mc_uuid, card_quantity, legacy_divisor
       FROM link_product ORDER BY id`
    )
    .all()
    .map((r) => ({
      id: r.id,
      skuId: r.sku_id,
      skuTitle: r.sku_title,
      productTitle: r.product_title,
      barcode: r.barcode,
      shopId: r.shop_id,
      stockUpdate: Boolean(r.stock_update),
      mcExternalId: r.mc_external_id,
      mcUuid: r.mc_uuid,
      cardQuantity: r.card_quantity,
      legacyDivisor: r.legacy_divisor,
    }));
}
