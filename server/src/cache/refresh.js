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
import { db, setMeta, getMeta } from "../db/index.js";
import logger from "../logger.js";
import { readSheets } from "./readSheets.js";
import { evaluateOrder, REASONS } from "./eligibility.js";
import { fetchCanceledOrderIds } from "../moysklad/canceledOrders.js";
import {
  syncProductBarcodes,
  fullAssortmentSync,
  barcodeCountsByRef,
} from "../moysklad/productBarcodes.js";
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
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

// `uzum_order_detail!J` da MoySklad entity turi kutiladi, lekin unda boshqa
// qiymat ham bo'lishi mumkin — faqat haqiqiy turlarni qabul qilamiz, aks
// holda href'dan ajratib olamiz.
const MC_ENTITY_TYPES = new Set(["product", "variant", "bundle", "service", "consignment"]);

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

    const sheetType = cellText(r[DET.entityType]).toLowerCase();
    const item = {
      itemId,
      orderId,
      sheetRow: i + 1, // 1-asosli sheet qator raqami
      rawBarcode,
      uzumBarcode: normalizeBarcode(rawBarcode),
      skuTitle: cellText(r[DET.skuTitle]),
      productRef: extractProductRef(r[DET.product]),
      entityType: MC_ENTITY_TYPES.has(sheetType) ? sheetType : extractEntityType(r[DET.product]),
      quantity: Number.isFinite(quantity) ? quantity : NaN,
    };

    if (!byOrder.has(orderId)) byOrder.set(orderId, []);
    byOrder.get(orderId).push(item);
  }
  return byOrder;
}

// Barcode sinxronizatsiyasi uchun: qaysi MoySklad tovarlari kerak.
// Map<uuid, entityType|null>
export function extractProductRefs(detailRows) {
  const refs = new Map();
  for (const items of parseDetailRows(detailRows).values()) {
    for (const it of items) {
      if (!it.productRef) continue;
      // Turi ma'lum bo'lgan yozuvni afzal ko'ramiz.
      if (!refs.has(it.productRef) || (!refs.get(it.productRef) && it.entityType)) {
        refs.set(it.productRef, it.entityType || null);
      }
    }
  }
  return refs;
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

  // MoySklad barcode'lari alohida, uzoq muddatli keshda turadi (mc_barcodes) —
  // eligibility hisobiga ularni ham qo'shamiz.
  const mcCounts = barcodeCountsByRef();

  const toStore = [];
  const reasonCounts = new Map();
  const problems = [];

  for (const order of orders) {
    const items = itemsByOrder.get(order.orderId) || [];

    // Tovarni skanerlash mumkinmi — Uzum barcode'i YOKI MoySklad barcode'lari.
    const withCounts = items.map((i) => ({
      ...i,
      barcodeCount: (i.uzumBarcode ? 1 : 0) + (i.productRef ? mcCounts.get(i.productRef) || 0 : 0),
    }));

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

  // MoySklad barcode'lari mc_barcodes'dan item_barcodes'ga ko'chiriladi —
  // shunda skan qidiruvi ikkala manbani bitta oddiy so'rov bilan ko'radi.
  const stmtMcBarcodes = db.prepare(`
    INSERT INTO item_barcodes (barcode, item_id, source, raw)
    SELECT m.barcode, i.item_id, 'moysklad', m.raw
    FROM items i JOIN mc_barcodes m ON m.uuid = i.product_ref
    WHERE i.product_ref IS NOT NULL
    ON CONFLICT(barcode, item_id, source) DO NOTHING
  `);

  db.transaction(() => {
    db.prepare("DELETE FROM item_barcodes").run();
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

    stmtMcBarcodes.run();
  })();

  const bySource = Object.fromEntries(
    db
      .prepare("SELECT source, COUNT(*) AS n FROM item_barcodes GROUP BY source")
      .all()
      .map((r) => [r.source, r.n])
  );

  return {
    eligible: reasonCounts.get("ok") || 0,
    cached: toStore.length,
    packedCount: packedMap.size,
    barcodesBySource: bySource,
    reasonCounts,
    problems,
  };
}

/* ---------------- tunda bir marta to'liq assortiment ---------------- */

// MoySklad'da barcode qo'shilgan/o'chirilgan bo'lsa 7 kunlik TTL kutmasdan
// tushishi uchun — Toshkent vaqti bilan belgilangan soatda, kuniga bir marta.
async function maybeFullAssortmentSync() {
  const tashkentNow = new Date(Date.now() + TASHKENT_OFFSET_MS).toISOString();
  const hour = Number(tashkentNow.slice(11, 13));
  const today = tashkentNow.slice(0, 10);

  if (hour !== config.moysklad.fullSyncHourTashkent) return false;
  if (getMeta("last_full_sync_date") === today) return false;

  try {
    await fullAssortmentSync();
    setMeta("last_full_sync_date", today);
    return true;
  } catch (e) {
    logger.error(`To'liq assortiment sinxronizatsiyasi xato: ${e.message}`);
    return false;
  }
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

  // Tovar barcode'lari — keshdan tashqarida, uzun TTL bilan. Har tsiklda
  // faqat yangi/eskirgan UUID'lar so'raladi, byudjet bilan cheklangan, ya'ni
  // birinchi ishga tushirish ham yangilanish tsiklini bloklab qo'ymaydi.
  let barcodeSync = { requested: 0, fetched: 0, missing: 0, barcodes: 0, remaining: 0 };
  try {
    const refs = extractProductRefs(detailRows);
    barcodeSync = await syncProductBarcodes(refs);
  } catch (e) {
    logger.error(`Tovar barcode'larini sinxronlashda xato: ${e.message}`);
  }

  const result = applyRefresh({ orderRows, detailRows, packingRows, canceled, nowMs: startedMs });
  pruneCanceled();
  await maybeFullAssortmentSync();

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
    barcodesBySource: result.barcodesBySource,
    barcodeSync,
    problems: result.problems.length,
    durationMs,
  };
}
