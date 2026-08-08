// Operatorning yig'ish tarixi — mobil ilovadagi "men nima yig'dim" ro'yxati.
//
// Manba `sessions` jadvali (partiya emas): operator partiyasiz ishlagan kunlar
// ham ko'rinsin. Tarkib `session_items` dan olinadi — o'sha paytdagi holat
// saqlanadi, keyin buyurtma o'zgarsa ham tarix o'zgarmaydi.
import { db } from "../db/index.js";

export function packedHistory(operator, limit = 50) {
  const sessions = db
    .prepare(
      `SELECT s.id, s.order_id AS orderId, s.station_id AS stationId,
              s.started_at AS startedAt, s.finished_at AS finishedAt
       FROM sessions s
       WHERE s.operator = ? AND s.status = 'done'
       ORDER BY s.finished_at DESC
       LIMIT ?`
    )
    .all(operator, limit);

  if (!sessions.length) return [];

  const itemsOf = db.prepare(
    `SELECT si.item_id AS itemId, si.needed, si.scanned, si.sku_title AS skuTitle,
            p.name AS mcName
     FROM session_items si
     LEFT JOIN items i ON i.item_id = si.item_id
     LEFT JOIN mc_products p ON p.uuid = i.product_ref
     WHERE si.session_id = ?
     ORDER BY si.rowid`
  );

  // Partiya nomi bo'lsa qo'shamiz — operator qaysi ro'yxatdan yig'ganini
  // ko'rsatadi.
  const batchOf = db.prepare(
    `SELECT b.name FROM batch_orders bo JOIN batches b ON b.id = bo.batch_id
     WHERE bo.order_id = ? ORDER BY bo.batch_id DESC LIMIT 1`
  );

  return sessions.map((s) => ({
    // Qayta chiqarish shu ID bo'yicha ishlaydi.
    sessionId: s.id,
    orderId: s.orderId,
    stationId: s.stationId,
    startedAt: s.startedAt,
    finishedAt: s.finishedAt,
    batch: batchOf.get(s.orderId)?.name || null,
    items: itemsOf.all(s.id).map((i) => ({
      itemId: i.itemId,
      title: i.mcName || i.skuTitle || i.itemId,
      needed: i.needed,
      scanned: i.scanned,
    })),
  }));
}
