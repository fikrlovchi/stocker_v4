// Partiyalar — skan doirasi (konsolidatsiya 2/3-bosqich).
//
// Admin buyurtma ID ro'yxatini joylab partiya yasaydi. OCHIQ partiya bo'lsa,
// telefon faqat shu ro'yxatdagi buyurtmalarni yig'a oladi: omborda bir kunda
// aniq bir ro'yxat yig'iladi, boshqasi emas.
//
// Ochiq partiya YO'Q bo'lsa — eski xatti-harakat saqlanadi (keshdagi barcha
// mos buyurtmalar). Shu bilan partiyaga o'tish bosqichma-bosqich bo'ladi va
// ro'yxat kiritilmagan kuni ish to'xtab qolmaydi.
import { db } from "../db/index.js";
import logger from "../logger.js";
import { shopName } from "./shops.js";

const nowIso = () => new Date().toISOString();

// "116649323, 118799194\n10-0118293012-1" → ["116649323", ...]
// uzumPDFs dagi kiritish maydoni bilan bir xil qabul qilinadi: vergul,
// bo'shliq, yangi qator — hammasi ajratuvchi.
export function parseOrderIds(text) {
  return [
    ...new Set(
      String(text || "")
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  ];
}

/* ==================== o'qish ==================== */

const progressSql = `
  SELECT COUNT(*) AS total,
         SUM(CASE WHEN status = 'packed' THEN 1 ELSE 0 END) AS packed
  FROM batch_orders WHERE batch_id = ?
`;

function shapeBatch(row) {
  if (!row) return null;
  const p = db.prepare(progressSql).get(row.id);
  return {
    id: row.id,
    name: row.name,
    createdBy: row.created_by,
    createdAt: row.created_at,
    closedAt: row.closed_at,
    isOpen: !row.closed_at,
    total: p.total || 0,
    packed: p.packed || 0,
  };
}

export function listBatches({ limit = 50 } = {}) {
  return db
    .prepare("SELECT * FROM batches ORDER BY closed_at IS NOT NULL, id DESC LIMIT ?")
    .all(limit)
    .map(shapeBatch);
}

export function getBatch(id) {
  return shapeBatch(db.prepare("SELECT * FROM batches WHERE id = ?").get(id));
}

export function openBatch() {
  return shapeBatch(db.prepare("SELECT * FROM batches WHERE closed_at IS NULL ORDER BY id DESC").get());
}

// Buyurtmalar do'kon bo'yicha guruhlanadi — mobil ilovadagi do'kon tanlash
// va "2/22" hisobi shu ma'lumotdan.
export function batchShops(batchId) {
  return db
    .prepare(
      `SELECT COALESCE(shop_id, '—') AS shopId,
              COUNT(*) AS total,
              SUM(CASE WHEN status = 'packed' THEN 1 ELSE 0 END) AS packed
       FROM batch_orders WHERE batch_id = ?
       GROUP BY COALESCE(shop_id, '—')
       ORDER BY total DESC`
    )
    .all(batchId)
    // Ekranda ID emas, do'kon NOMI ko'rinadi (uzum_shops jadvalidan).
    .map((r) => ({
      shopId: r.shopId,
      name: shopName(r.shopId),
      total: r.total,
      packed: r.packed || 0,
      pending: r.total - (r.packed || 0),
    }));
}

export function batchOrders(batchId, { shopId = null, status = null } = {}) {
  const where = ["bo.batch_id = @batchId"];
  const params = { batchId };
  if (shopId) {
    where.push("COALESCE(bo.shop_id, '—') = @shopId");
    params.shopId = shopId;
  }
  if (status) {
    where.push("bo.status = @status");
    params.status = status;
  }

  return db
    .prepare(
      `SELECT bo.order_id AS orderId, bo.shop_id AS shopId, bo.status, bo.packed_at AS packedAt,
              bo.packed_by AS packedBy,
              o.item_count AS itemCount, o.unit_count AS unitCount, o.eligible
       FROM batch_orders bo
       LEFT JOIN orders o ON o.order_id = bo.order_id
       WHERE ${where.join(" AND ")}
       ORDER BY bo.status, bo.order_id`
    )
    .all(params)
    .map((r) => ({
      ...r,
      shopName: shopName(r.shopId),
      eligible: r.eligible === 1,
      inCache: r.itemCount !== null,
    }));
}

/* ==================== yozish ==================== */

// Bir buyurtma faqat bitta OCHIQ partiyada bo'lishi kerak — aks holda ikki
// operator uni turli ro'yxatdan ko'rib, ikki marta yig'ib yuborardi.
function alreadyOpen(orderId) {
  return db
    .prepare(
      `SELECT b.name FROM batch_orders bo
       JOIN batches b ON b.id = bo.batch_id
       WHERE bo.order_id = ? AND b.closed_at IS NULL`
    )
    .get(orderId);
}

export const createBatch = db.transaction(({ name, orderIds, createdBy }) => {
  const clean = String(name || "").trim();
  if (!clean) throw new Error("Partiya nomi kerak");
  if (!orderIds.length) throw new Error("Kamida bitta buyurtma ID kerak");

  const batchId = db
    .prepare("INSERT INTO batches (name, created_by) VALUES (?, ?)")
    .run(clean, createdBy || null).lastInsertRowid;

  const insert = db.prepare(
    "INSERT INTO batch_orders (batch_id, order_id, shop_id) VALUES (?, ?, ?)"
  );
  const shopOf = db.prepare("SELECT shop_id, eligible FROM orders WHERE order_id = ?");

  const added = [];
  const skipped = [];   // boshqa ochiq partiyada
  const unknown = [];   // keshda yo'q — ID xato yoki buyurtma eski
  const notEligible = []; // keshda bor, lekin yig'ishga chiqmaydi

  for (const orderId of orderIds) {
    const busy = alreadyOpen(orderId);
    if (busy) {
      skipped.push({ orderId, batch: busy.name });
      continue;
    }
    const row = shopOf.get(orderId);
    if (!row) unknown.push(orderId);
    else if (row.eligible !== 1) notEligible.push(orderId);

    insert.run(batchId, orderId, row?.shop_id || null);
    added.push(orderId);
  }

  logger.info(
    `Partiya yaratildi: "${clean}" — ${added.length} ta buyurtma` +
      (skipped.length ? `, ${skipped.length} ta o'tkazib yuborildi (boshqa partiyada)` : "") +
      (unknown.length ? `, ${unknown.length} tasi keshda yo'q` : "")
  );

  return { batch: getBatch(batchId), added, skipped, unknown, notEligible };
});

export function closeBatch(id) {
  db.prepare("UPDATE batches SET closed_at = ? WHERE id = ? AND closed_at IS NULL").run(nowIso(), id);
  return getBatch(id);
}

export function reopenBatch(id) {
  // Ochishdan oldin to'qnashuvni tekshiramiz: shu buyurtmalar boshqa ochiq
  // partiyada bo'lsa, ikki joydan yig'ilib ketishi mumkin.
  const clash = db
    .prepare(
      `SELECT bo.order_id FROM batch_orders bo
       JOIN batches b ON b.id = bo.batch_id
       WHERE b.closed_at IS NULL AND bo.order_id IN (SELECT order_id FROM batch_orders WHERE batch_id = ?)
       LIMIT 1`
    )
    .get(id);
  if (clash) throw new Error(`${clash.order_id} boshqa ochiq partiyada — avval o'shani yoping`);

  db.prepare("UPDATE batches SET closed_at = NULL WHERE id = ?").run(id);
  return getBatch(id);
}

export function removeBatch(id) {
  db.prepare("DELETE FROM batches WHERE id = ?").run(id); // batch_orders CASCADE
}

export function removeOrderFromBatch(batchId, orderId) {
  db.prepare("DELETE FROM batch_orders WHERE batch_id = ? AND order_id = ?").run(batchId, orderId);
}

/* ==================== yig'ish bilan bog'lanish ==================== */

// Ochiq partiyadagi buyurtmami? Skan doirasini shu funksiya toraytiradi.
export function isInOpenBatch(orderId) {
  return Boolean(
    db
      .prepare(
        `SELECT 1 FROM batch_orders bo JOIN batches b ON b.id = bo.batch_id
         WHERE bo.order_id = ? AND b.closed_at IS NULL`
      )
      .get(orderId)
  );
}

export function hasOpenBatch() {
  return Boolean(db.prepare("SELECT 1 FROM batches WHERE closed_at IS NULL LIMIT 1").get());
}

// Buyurtma yig'ilgach chaqiriladi (sessions.js). Partiyada bo'lmasa — hech
// nima qilmaydi.
export function markPacked(orderId, operator) {
  const changes = db
    .prepare(
      `UPDATE batch_orders SET status = 'packed', packed_at = ?, packed_by = ?
       WHERE order_id = ? AND status <> 'packed'
         AND batch_id IN (SELECT id FROM batches WHERE closed_at IS NULL)`
    )
    .run(nowIso(), operator || null, orderId).changes;
  return changes > 0;
}

// Operatorning yig'ganlari — mobil ilovadagi "mening ishim" ro'yxati uchun.
export function packedByOperator(operator, { limit = 100 } = {}) {
  return db
    .prepare(
      `SELECT bo.order_id AS orderId, bo.shop_id AS shopId, bo.packed_at AS packedAt, b.name AS batch
       FROM batch_orders bo JOIN batches b ON b.id = bo.batch_id
       WHERE bo.packed_by = ? AND bo.status = 'packed'
       ORDER BY bo.packed_at DESC LIMIT ?`
    )
    .all(operator, limit)
    .map((r) => ({ ...r, shopName: shopName(r.shopId) }));
}
