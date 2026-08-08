// Yig'ilishi kerak buyurtmalar — 5-bosqich.
//
// Ilgari operator qaysi buyurtmalarni yig'ishini ADMIN belgilardi: partiyaga
// ID ro'yxati joylanardi. Bu ortiqcha qadam edi — "yig'ilishi kerak" degan
// holat allaqachon ma'lum: buyurtma yig'ishga tayyor (`eligible`), hali
// yig'ilmagan va bekor qilinmagan.
//
// Shu bois ro'yxat endi O'ZI chiqadi. "Buyurtma ID'lari" maydoni esa
// SOLISHTIRISH uchun qoladi: qo'lda tuzilgan ro'yxat bilan haqiqiy holat
// mos keladimi degan savolga javob beradi.
import { db } from "../db/index.js";
import { shopName, shopGroup } from "./shops.js";

/**
 * Yig'ilishi kerak buyurtmalar.
 *
 * Chiqarib tashlanadi:
 *   • yig'ishga tayyor bo'lmaganlar (`eligible = 0` — sabab `reason` da);
 *   • allaqachon yig'ilgani yoki hozir yig'ilayotgani (`sessions`);
 *   • MoySklad'da bekor qilinganlari (`canceled_orders`).
 */
export function pendingOrders({ groupId = null, shopId = null } = {}) {
  const where = ["o.eligible = 1"];
  const params = {};
  if (shopId) {
    where.push("o.shop_id = @shopId");
    params.shopId = String(shopId);
  }

  const rows = db
    .prepare(
      `SELECT o.order_id AS orderId, o.shop_id AS shopId, o.item_count AS itemCount,
              o.unit_count AS unitCount, o.arrived_at_ms AS arrivedAtMs
       FROM orders o
       WHERE ${where.join(" AND ")}
         AND NOT EXISTS (
           SELECT 1 FROM sessions s
           WHERE s.order_id = o.order_id AND s.status IN ('active', 'done')
         )
         AND NOT EXISTS (SELECT 1 FROM canceled_orders c WHERE c.order_id = o.order_id)
         AND NOT EXISTS (SELECT 1 FROM packed_orders p WHERE p.order_id = o.order_id)
       ORDER BY o.arrived_at_ms ASC`
    )
    .all(params);

  const list = rows.map((r) => {
    const group = shopGroup(r.shopId);
    return {
      ...r,
      shopName: shopName(r.shopId),
      groupId: group?.groupId ?? null,
      groupName: group?.groupName ?? null,
    };
  });

  // Guruh bo'yicha filtr kodda: `shopGroup` keshdan o'qiladi va uni SQL'ga
  // qo'shish uchun jadval JOIN qilish kerak bo'lardi — bu esa guruh
  // jadvali yo'q bazada (test) buzilardi.
  return groupId ? list.filter((o) => String(o.groupId) === String(groupId)) : list;
}

/** Guruh → do'kon → soni. Ekranda yig'ma ko'rinish uchun. */
export function pendingSummary(orders) {
  const groups = new Map();
  for (const o of orders) {
    const key = o.groupId ?? "—";
    if (!groups.has(key)) {
      groups.set(key, { groupId: o.groupId, groupName: o.groupName, total: 0, shops: new Map() });
    }
    const g = groups.get(key);
    g.total++;
    const shopKey = o.shopId ?? "—";
    if (!g.shops.has(shopKey)) g.shops.set(shopKey, { shopId: o.shopId, shopName: o.shopName, total: 0 });
    g.shops.get(shopKey).total++;
  }

  return [...groups.values()]
    .map((g) => ({ ...g, shops: [...g.shops.values()].sort((a, b) => b.total - a.total) }))
    // Guruhsizlar oxirida: ular sozlash kerak bo'lgan holat.
    .sort((a, b) => (a.groupId ?? 1e9) - (b.groupId ?? 1e9));
}

/**
 * Qo'lda joylangan ID ro'yxatini haqiqiy holat bilan solishtiradi.
 *
 * Uch xil natija beradi — har biri boshqa harakatni talab qiladi:
 *   matched   — ro'yxatda ham bor, yig'ilishi ham kerak (kutilgan holat);
 *   extra     — ro'yxatda bor, lekin yig'ish kerak emas (sababi bilan);
 *   missing   — yig'ilishi kerak, lekin ro'yxatga kirmagan.
 */
export function comparePending(orderIds, pending) {
  const pendingSet = new Map(pending.map((o) => [String(o.orderId), o]));
  const pasted = new Set(orderIds.map(String));

  const matched = [];
  const extra = [];
  for (const id of pasted) {
    const found = pendingSet.get(id);
    if (found) matched.push(found);
    else extra.push({ orderId: id, reason: pastedReason(id) });
  }

  const missing = pending.filter((o) => !pasted.has(String(o.orderId)));
  return { matched, extra, missing };
}

/** Nega bu ID yig'ilishi kerak emas — aniq sabab. */
function pastedReason(orderId) {
  const order = db
    .prepare("SELECT eligible, reason FROM orders WHERE order_id = ?")
    .get(orderId);
  if (!order) return "keshda yo'q";
  if (db.prepare("SELECT 1 FROM canceled_orders WHERE order_id = ?").get(orderId)) return "bekor qilingan";
  if (db.prepare("SELECT 1 FROM packed_orders WHERE order_id = ?").get(orderId)) return "yig'ilgan";
  const session = db
    .prepare("SELECT status FROM sessions WHERE order_id = ? AND status IN ('active','done') LIMIT 1")
    .get(orderId);
  if (session) return session.status === "active" ? "hozir yig'ilmoqda" : "yig'ilgan";
  if (!order.eligible) return order.reason || "yig'ishga chiqmaydi";
  return "noma'lum";
}
