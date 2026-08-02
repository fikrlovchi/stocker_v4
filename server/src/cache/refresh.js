// Kesh yangilash tsikli. Har ishga tushishda sheetlarni to'liq o'qib, keshni
// qayta quradi (buyurtmalar soni bir necha yuz — bir necha millisekund).
//
// I/O (`refreshCache`) mantiqdan (`applyRefresh`) ajratilgan: applyRefresh xom
// qatorlarni oladi, shuning uchun uni Google/MoySklad'siz, fixture bilan test
// qilish mumkin (src/scripts/selfTest.js).
//
// MUHIM: `orders` / `items` / `item_barcodes` jadvallari HAR TSIKLDA qayta
// quriladi. Keyingi fazalardagi sessiya/lock jadvallari bu jadvallarga FOREIGN
// KEY qo'ymasligi kerak — kerakli maydonlarni sessiya ochilganda nusxalab
// olsin, aks holda yangilanish ochiq sessiyani o'chirib yuboradi.
import { config } from "../config.js";
import { db, setMeta } from "../db/index.js";
import logger from "../logger.js";
import { readSheets } from "./readSheets.js";
import { evaluateOrder, REASONS } from "./eligibility.js";
import { fetchCanceledOrderIds } from "../moysklad/canceledOrders.js";
import {
  columnIndexMap,
  cellText,
  normalizeBarcode,
  extractProductRef,
  extractEntityType,
  parseSheetTimeToEpochMs,
} from "../util/sheetValues.js";

const ORD = columnIndexMap(config.columns.orders);
const DET = columnIndexMap(config.columns.details);
const PACK = columnIndexMap(config.columns.packing);

const RETENTION_MS = config.cache.retentionDays * 24 * 60 * 60 * 1000;

/* ---------------- xom qatorlarni tuzilmaga aylantirish ---------------- */

function parseOrderRows(rows) {
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const orderId = cellText(r[ORD.orderId]);
    if (!orderId) continue;
    out.push({
      orderId,
      shopId: cellText(r[ORD.shopId]),
      moySkladId: cellText(r[ORD.moySkladId]),
      statusQ: cellText(r[ORD.status]),
      confirmedT: cellText(r[ORD.uzumConfirmed]),
      mcStateU: cellText(r[ORD.mcState]),
      cancelHandledV: cellText(r[ORD.cancelHandled]),
      // W bo'sh bo'lsa C (dateCreated) ga tayanamiz — cancelSync ham shunday qiladi.
      arrivedAtMs:
        parseSheetTimeToEpochMs(r[ORD.arrivedAt]) ?? parseSheetTimeToEpochMs(r[ORD.dateCreated]),
    });
  }
  return out;
}

function parseDetailRows(rows) {
  const byOrder = new Map();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const itemId = cellText(r[DET.itemId]);
    const orderId = cellText(r[DET.orderId]);
    if (!itemId || !orderId) continue;

    const rawBarcode = cellText(r[DET.barcode]);
    const quantity = Number.parseInt(cellText(r[DET.quantity]), 10);

    const item = {
      itemId,
      orderId,
      sheetRow: i + 1, // 1-asosli sheet qator raqami
      rawBarcode,
      uzumBarcode: normalizeBarcode(rawBarcode),
      skuTitle: cellText(r[DET.skuTitle]),
      productRef: extractProductRef(r[DET.product]),
      entityType: cellText(r[DET.entityType]) || extractEntityType(r[DET.product]),
      quantity: Number.isFinite(quantity) ? quantity : NaN,
    };

    if (!byOrder.has(orderId)) byOrder.set(orderId, []);
    byOrder.get(orderId).push(item);
  }
  return byOrder;
}

function parsePackingRows(rows) {
  const packed = new Map();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const orderId = cellText(r[PACK.orderId]);
    if (!orderId) continue;
    const status = cellText(r[PACK.status]).toLowerCase();
    // Bekor qilingan yig'ish sessiyasi buyurtmani "yig'ilgan" qilmaydi.
    if (status && status !== "done") continue;
    packed.set(orderId, {
      packedAt: cellText(r[PACK.finishedAt]),
      operator: cellText(r[PACK.operator]),
      status: status || "done",
    });
  }
  return packed;
}

/* ---------------- bekor qilinganlar ro'yxati ---------------- */

function loadStoredCanceled() {
  return new Set(db.prepare("SELECT order_id FROM canceled_orders").all().map((r) => r.order_id));
}

function storeCanceled(ids) {
  const seenAt = new Date().toISOString();
  const insert = db.prepare(
    "INSERT INTO canceled_orders (order_id, seen_at) VALUES (?, ?) ON CONFLICT(order_id) DO NOTHING"
  );
  db.transaction(() => {
    for (const id of ids) insert.run(id, seenAt);
  })();
}

// Ro'yxat MoySklad lookback oynasidan uzoqroq saqlanmaydi — undan chiqqan
// buyurtma baribir keshdan ham tushib ketgan bo'ladi.
function pruneCanceled() {
  const cutoff = new Date(
    Date.now() -
      (config.moysklad.canceledLookbackDays + config.cache.retentionDays) * 24 * 60 * 60 * 1000
  ).toISOString();
  return db.prepare("DELETE FROM canceled_orders WHERE seen_at < ?").run(cutoff).changes;
}

/* ---------------- mantiq: xom qatorlar -> baza ---------------- */

const insertOrder = () =>
  db.prepare(`
    INSERT INTO orders (order_id, shop_id, moysklad_id, arrived_at_ms, status_q, confirmed_t,
                        mc_state_u, cancel_handled_v, item_count, unit_count, eligible, reason, refreshed_at)
    VALUES (@order_id, @shop_id, @moysklad_id, @arrived_at_ms, @status_q, @confirmed_t,
            @mc_state_u, @cancel_handled_v, @item_count, @unit_count, @eligible, @reason, @refreshed_at)
  `);

export function applyRefresh({ orderRows, detailRows, packingRows, canceled, nowMs = Date.now() }) {
  const orders = parseOrderRows(orderRows);
  const itemsByOrder = parseDetailRows(detailRows);
  const packedMap = parsePackingRows(packingRows);

  const ctx = {
    nowMs,
    retentionMs: RETENTION_MS,
    canceled,
    packed: new Set(packedMap.keys()),
  };
  const refreshedAt = new Date().toISOString();

  const toStore = [];
  const reasonCounts = new Map();
  const problems = [];

  for (const order of orders) {
    const items = itemsByOrder.get(order.orderId) || [];

    // Barcode sonini oldindan hisoblaymiz — eligibility shunga qaraydi.
    // 1-fazada faqat Uzum barcode'i; 2-fazada MoySklad barcode'lari qo'shiladi.
    const withCounts = items.map((i) => ({ ...i, barcodeCount: i.uzumBarcode ? 1 : 0 }));

    const reason = evaluateOrder(order, withCounts, ctx);
    if (reason === REASONS.TOO_OLD) continue; // oynadan tashqari — umuman saqlanmaydi

    reasonCounts.set(reason ?? "ok", (reasonCounts.get(reason ?? "ok") || 0) + 1);

    // Ma'lumot buzilishiga ishora qiluvchi sabablar alohida chiqariladi.
    if (reason === REASONS.BAD_QUANTITY || reason === REASONS.UNSCANNABLE_ITEM || reason === REASONS.NO_DATE) {
      problems.push(`${order.orderId}: ${reason}`);
    }

    toStore.push({ order, items: withCounts, reason });
  }

  const stmtOrder = insertOrder();
  const stmtItem = db.prepare(`
    INSERT INTO items (item_id, order_id, sheet_row, uzum_barcode, sku_title, product_ref,
                       entity_type, quantity, refreshed_at)
    VALUES (@item_id, @order_id, @sheet_row, @uzum_barcode, @sku_title, @product_ref,
            @entity_type, @quantity, @refreshed_at)
  `);
  const stmtBarcode = db.prepare(`
    INSERT INTO item_barcodes (barcode, item_id, source, raw) VALUES (?, ?, 'uzum', ?)
    ON CONFLICT(barcode, item_id, source) DO NOTHING
  `);
  const stmtPacked = db.prepare(
    "INSERT INTO packed_orders (order_id, packed_at, operator, status) VALUES (?, ?, ?, ?)"
  );

  db.transaction(() => {
    db.prepare("DELETE FROM item_barcodes WHERE source = 'uzum'").run();
    db.prepare("DELETE FROM items").run();
    db.prepare("DELETE FROM orders").run();
    db.prepare("DELETE FROM packed_orders").run();

    for (const [orderId, info] of packedMap) {
      stmtPacked.run(orderId, info.packedAt || null, info.operator || null, info.status);
    }

    for (const { order, items, reason } of toStore) {
      stmtOrder.run({
        order_id: order.orderId,
        shop_id: order.shopId || null,
        moysklad_id: order.moySkladId || null,
        arrived_at_ms: order.arrivedAtMs,
        status_q: order.statusQ || null,
        confirmed_t: order.confirmedT || null,
        mc_state_u: order.mcStateU || null,
        cancel_handled_v: order.cancelHandledV || null,
        item_count: items.length,
        unit_count: items.reduce((s, i) => s + (Number.isFinite(i.quantity) ? i.quantity : 0), 0),
        eligible: reason === REASONS.OK ? 1 : 0,
        reason: reason ?? null,
        refreshed_at: refreshedAt,
      });

      for (const item of items) {
        stmtItem.run({
          item_id: item.itemId,
          order_id: order.orderId,
          sheet_row: item.sheetRow,
          uzum_barcode: item.uzumBarcode || null,
          sku_title: item.skuTitle || null,
          product_ref: item.productRef,
          entity_type: item.entityType || null,
          quantity: Number.isFinite(item.quantity) ? item.quantity : 0,
          refreshed_at: refreshedAt,
        });
        if (item.uzumBarcode) stmtBarcode.run(item.uzumBarcode, item.itemId, item.rawBarcode);
      }
    }
  })();

  return {
    eligible: reasonCounts.get("ok") || 0,
    cached: toStore.length,
    packedCount: packedMap.size,
    reasonCounts,
    problems,
  };
}

/* ---------------- I/O bilan to'liq tsikl ---------------- */

export async function refreshCache() {
  const startedMs = Date.now();
  const { orderRows, detailRows, packingRows } = await readSheets();

  // MoySklad tushib qolsa eski ro'yxatni saqlab qolamiz: bekor qilingan
  // buyurtmani yig'ishga chiqarib yuborgandan ko'ra shu xavfsizroq.
  let canceled;
  let canceledFresh = true;
  try {
    canceled = await fetchCanceledOrderIds();
    storeCanceled(canceled);
    // Saqlangan ro'yxat bilan birlashtiramiz: MoySklad lookback oynasidan
    // chiqqan, lekin hali keshda turgan buyurtma ham chiqarib tashlanishi kerak.
    for (const id of loadStoredCanceled()) canceled.add(id);
  } catch (e) {
    canceledFresh = false;
    canceled = loadStoredCanceled();
    logger.error(
      `MoySklad bekor ro'yxati olinmadi, eski ro'yxat ishlatilyapti (${canceled.size} ta): ${e.message}`
    );
  }

  const result = applyRefresh({ orderRows, detailRows, packingRows, canceled, nowMs: startedMs });
  pruneCanceled();

  const durationMs = Date.now() - startedMs;
  setMeta("last_refresh_at", new Date().toISOString());
  setMeta("last_refresh_eligible", result.eligible);

  const breakdown = [...result.reasonCounts.entries()]
    .filter(([k]) => k !== "ok")
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");

  logger.info(
    `Kesh yangilandi: ${result.eligible} ta yig'ishga tayyor / ${result.cached} ta oynada` +
      (breakdown ? ` (${breakdown})` : "") +
      ` — ${durationMs} ms`
  );

  for (const p of result.problems.slice(0, 20)) logger.error(`Buyurtma o'tkazib yuborildi — ${p}`);
  if (result.problems.length > 20) {
    logger.error(`...yana ${result.problems.length - 20} ta shunday buyurtma`);
  }

  return {
    eligible: result.eligible,
    cached: result.cached,
    canceledFresh,
    canceledCount: canceled.size,
    packedCount: result.packedCount,
    problems: result.problems.length,
    durationMs,
  };
}
