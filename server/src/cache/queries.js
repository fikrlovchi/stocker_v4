// Keshdan o'qish. 4-fazadagi skan mantiqi ham shu funksiyalardan foydalanadi.
import { db, getMeta } from "../db/index.js";
import { REASON_TEXT } from "./eligibility.js";
import { normalizeBarcode } from "../util/sheetValues.js";

export function getStats() {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS cached,
              SUM(CASE WHEN eligible = 1 THEN 1 ELSE 0 END) AS eligible,
              SUM(CASE WHEN eligible = 1 THEN unit_count ELSE 0 END) AS units
       FROM orders`
    )
    .get();

  const byReason = db
    .prepare("SELECT COALESCE(reason, 'ok') AS reason, COUNT(*) AS n FROM orders GROUP BY reason ORDER BY n DESC")
    .all();

  const bySource = db
    .prepare("SELECT source, COUNT(*) AS n FROM item_barcodes GROUP BY source")
    .all();

  return {
    lastRefreshAt: getMeta("last_refresh_at"),
    cachedOrders: row.cached || 0,
    eligibleOrders: row.eligible || 0,
    eligibleUnits: row.units || 0,
    items: db.prepare("SELECT COUNT(*) AS n FROM items").get().n,
    barcodes: db.prepare("SELECT COUNT(*) AS n FROM item_barcodes").get().n,
    barcodesBySource: Object.fromEntries(bySource.map((r) => [r.source, r.n])),
    // Tovarlarning nechtasida MoySklad barcode'i bor / yo'q
    itemsWithMcBarcode: db.prepare(
      `SELECT COUNT(DISTINCT item_id) AS n FROM item_barcodes WHERE source = 'moysklad'`
    ).get().n,
    itemsWithoutRef: db.prepare("SELECT COUNT(*) AS n FROM items WHERE product_ref IS NULL").get().n,
    mcProducts: db.prepare("SELECT COUNT(*) AS n FROM mc_products WHERE missing = 0").get().n,
    mcProductsMissing: db.prepare("SELECT COUNT(*) AS n FROM mc_products WHERE missing = 1").get().n,
    mcBarcodes: db.prepare("SELECT COUNT(*) AS n FROM mc_barcodes").get().n,
    lastFullSyncDate: getMeta("last_full_sync_date"),
    canceledKnown: db.prepare("SELECT COUNT(*) AS n FROM canceled_orders").get().n,
    packedKnown: db.prepare("SELECT COUNT(*) AS n FROM packed_orders").get().n,
    byReason: Object.fromEntries(byReason.map((r) => [r.reason, r.n])),
  };
}

// MoySklad tovari: nomi, turi, barcode'lari, kesh yoshi.
export function getProduct(uuid) {
  const key = String(uuid).trim().toLowerCase();
  const product = db.prepare("SELECT * FROM mc_products WHERE uuid = ?").get(key);
  if (!product) return null;
  return {
    uuid: product.uuid,
    entityType: product.entity_type,
    name: product.name,
    fetchedAt: product.fetched_at,
    missing: product.missing === 1,
    barcodes: db
      .prepare("SELECT barcode, type, raw FROM mc_barcodes WHERE uuid = ? ORDER BY type")
      .all(key),
  };
}

export function getOrder(orderId) {
  const order = db.prepare("SELECT * FROM orders WHERE order_id = ?").get(String(orderId).trim());
  if (!order) return null;

  // MoySklad nomi faqat ma'lumot uchun — ShK yorlig'ida hamon mc_product!E
  // ishlatiladi (PLAN.md, 2-qaror).
  const items = db
    .prepare(
      `SELECT i.*, p.name AS mc_name, p.missing AS mc_missing
       FROM items i LEFT JOIN mc_products p ON p.uuid = i.product_ref
       WHERE i.order_id = ? ORDER BY i.sheet_row`
    )
    .all(order.order_id);

  const barcodesByItem = db
    .prepare(
      `SELECT b.item_id, b.barcode, b.source, b.raw
       FROM item_barcodes b JOIN items i ON i.item_id = b.item_id
       WHERE i.order_id = ?`
    )
    .all(order.order_id);

  const grouped = new Map();
  for (const b of barcodesByItem) {
    if (!grouped.has(b.item_id)) grouped.set(b.item_id, []);
    grouped.get(b.item_id).push({ barcode: b.barcode, source: b.source, raw: b.raw });
  }

  return {
    orderId: order.order_id,
    shopId: order.shop_id,
    moyskladId: order.moysklad_id,
    arrivedAt: order.arrived_at_ms ? new Date(order.arrived_at_ms).toISOString() : null,
    sheet: { Q: order.status_q, T: order.confirmed_t, U: order.mc_state_u, V: order.cancel_handled_v },
    eligible: order.eligible === 1,
    reason: order.reason,
    reasonText: order.reason ? REASON_TEXT[order.reason] || order.reason : null,
    itemCount: order.item_count,
    unitCount: order.unit_count,
    items: items.map((i) => ({
      itemId: i.item_id,
      sheetRow: i.sheet_row,
      skuTitle: i.sku_title,
      quantity: i.quantity,
      productRef: i.product_ref,
      entityType: i.entity_type,
      mcName: i.mc_name ?? null,
      mcMissing: i.mc_missing === 1,
      barcodes: grouped.get(i.item_id) || [],
    })),
  };
}

// Barcode bo'yicha qidiruv. `eligibleOnly` — faqat yig'ishga tayyor
// buyurtmalar (skan mantiqi shuni ishlatadi); false bo'lsa nima uchun
// topilmayotganini ko'rish uchun hammasi qaytadi.
export function findByBarcode(rawBarcode, { eligibleOnly = true } = {}) {
  const barcode = normalizeBarcode(rawBarcode);
  if (!barcode) return { barcode: "", matches: [] };

  const matches = db
    .prepare(
      `SELECT b.source, i.item_id, i.sku_title, i.quantity, i.product_ref,
              o.order_id, o.eligible, o.reason, o.arrived_at_ms, o.item_count, o.unit_count
       FROM item_barcodes b
       JOIN items i  ON i.item_id  = b.item_id
       JOIN orders o ON o.order_id = i.order_id
       WHERE b.barcode = ?${eligibleOnly ? " AND o.eligible = 1" : ""}
       ORDER BY o.item_count ASC, o.arrived_at_ms ASC`
    )
    .all(barcode);

  return {
    barcode,
    matches: matches.map((m) => ({
      orderId: m.order_id,
      itemId: m.item_id,
      skuTitle: m.sku_title,
      quantity: m.quantity,
      source: m.source,
      eligible: m.eligible === 1,
      reason: m.reason,
      reasonText: m.reason ? REASON_TEXT[m.reason] || m.reason : null,
      orderItemCount: m.item_count,
      orderUnitCount: m.unit_count,
      arrivedAt: m.arrived_at_ms ? new Date(m.arrived_at_ms).toISOString() : null,
    })),
  };
}

// Bir xil barcode turli SKU'larga biriktirilgan holatlar — indeks ishonchliligi
// uchun startupda tekshiriladi va loglanadi.
export function findAmbiguousBarcodes(limit = 20) {
  return db
    .prepare(
      `SELECT b.barcode, COUNT(DISTINCT i.sku_title) AS titles, COUNT(DISTINCT i.product_ref) AS refs
       FROM item_barcodes b JOIN items i ON i.item_id = b.item_id
       GROUP BY b.barcode
       HAVING refs > 1
       ORDER BY refs DESC
       LIMIT ?`
    )
    .all(limit);
}
