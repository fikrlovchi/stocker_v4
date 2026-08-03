// Yig'ish sessiyasi va skan holat mashinasi (PLAN.md 4-bo'lim).
//
// Ishlash tartibi:
//   • Operatorda ochiq sessiya YO'Q  -> barcode bo'yicha buyurtma topiladi,
//     avtomatik tanlanadi va LOCK qilinadi.
//   • Ochiq sessiya BOR -> barcode faqat shu buyurtmaga tegishli bo'lishi
//     kerak; har muvaffaqiyatli skan bitta birlikni yopadi.
//   • Hamma birlik skanerlanganda sessiya yopiladi va BIG chop etishga
//     niyat yoziladi.
//
// LOCK: `sessions` jadvalidagi qisman UNIQUE indeks (status='active' bo'yicha).
// Ikki operator bir vaqtda bir buyurtmani ochmoqchi bo'lsa, ikkinchisining
// INSERT'i UNIQUE xatosi bilan tushadi — poyga shu bilan hal bo'ladi, alohida
// qulflash mexanizmi kerak emas.
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { db } from "../db/index.js";
import logger from "../logger.js";
import { normalizeBarcode } from "../util/sheetValues.js";
import { getOrderStateHref } from "../moysklad/client.js";
import { createJob, listJobs } from "../print/jobs.js";
import { dispatchTo } from "../print/hub.js";

const PK = config.packing;
const TTL_MS = PK.sessionTtlMinutes * 60 * 1000;

export const RESULT = {
  ORDER_OPENED: "order_opened",       // buyurtma topildi va ochildi
  OK: "ok",                            // joriy buyurtmaning navbatdagi birligi
  ORDER_COMPLETE: "order_complete",    // oxirgi birlik — buyurtma yig'ildi
  WRONG_ITEM: "wrong_item",            // boshqa buyurtmaga tegishli
  ALREADY_COMPLETE: "already_complete",// bu tovar to'liq skanerlangan
  UNKNOWN_BARCODE: "unknown_barcode",  // hech qayerda topilmadi
  NO_AVAILABLE_ORDER: "no_available_order", // topildi, lekin hammasi band/yig'ilgan
};

const nowIso = () => new Date().toISOString();
const expiryIso = () => new Date(Date.now() + TTL_MS).toISOString();

/* ==================== o'qish ==================== */

export function getSession(sessionId) {
  const s = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId);
  return s ? shapeSession(s) : null;
}

export function getActiveSession(operator) {
  const s = db
    .prepare("SELECT * FROM sessions WHERE operator = ? AND status = 'active'")
    .get(String(operator).trim());
  return s ? shapeSession(s) : null;
}

function shapeSession(s) {
  const items = db
    .prepare("SELECT * FROM session_items WHERE session_id = ? ORDER BY rowid")
    .all(s.id);
  const scanned = items.reduce((n, i) => n + i.scanned, 0);
  const total = items.reduce((n, i) => n + i.needed, 0);
  return {
    id: s.id,
    orderId: s.order_id,
    operator: s.operator,
    stationId: s.station_id,
    status: s.status,
    startedAt: s.started_at,
    lastScanAt: s.last_scan_at,
    expiresAt: s.expires_at,
    finishedAt: s.finished_at,
    note: s.note,
    progress: { scanned, total, remaining: total - scanned },
    items: items.map((i) => ({
      itemId: i.item_id,
      skuTitle: i.sku_title,
      mcName: i.mc_name,
      needed: i.needed,
      scanned: i.scanned,
      remaining: i.needed - i.scanned,
    })),
  };
}

// Operatorning oxirgi sessiyasi (holatidan qat'i nazar) — buyurtma yig'ilib
// bo'lgandan keyin ham mobil ilovada "qayta chiqarish" ishlashi uchun.
export function getLastSession(operator) {
  const s = db
    .prepare("SELECT id FROM sessions WHERE operator = ? ORDER BY started_at DESC LIMIT 1")
    .get(String(operator).trim());
  return s ? getSession(s.id) : null;
}

export function listActiveSessions() {
  return db
    .prepare("SELECT id FROM sessions WHERE status = 'active' ORDER BY started_at")
    .all()
    .map((r) => getSession(r.id));
}

/* ==================== yordamchilar ==================== */

function logScan({ sessionId, operator, itemId, barcode, source, result }) {
  db.prepare(
    "INSERT INTO scans (session_id, operator, item_id, barcode, source, result, scanned_at) VALUES (?,?,?,?,?,?,?)"
  ).run(sessionId ?? null, operator ?? null, itemId ?? null, barcode, source ?? null, result, nowIso());
}

function addPrintJob({ sessionId, orderId, itemId, target, copies, stationId }) {
  if (!stationId) {
    logger.warn(`Ish joyi ko'rsatilmagan (${target} ${orderId}) — job navbatda kutadi.`);
  }
  const job = createJob({ sessionId, orderId, itemId, target, copies, stationId });
  return { id: job.id, target: job.target, itemId: job.itemId, copies: job.copies };
}

export function sessionJobs(sessionId) {
  return listJobs({ sessionId, limit: 200 });
}

// Qayta chiqarish: mavjud jobni nusxalab yangi job yasaydi. Eski job
// o'zgarmaydi (tarix saqlanadi), yangisining id'si boshqa — shuning uchun
// client uni takror deb hisoblab tashlab yubormaydi.
export function reprintJob(jobId, { stationId } = {}) {
  const source = listJobs({ limit: 1000 }).find((j) => j.id === jobId);
  if (!source) return null;

  const job = createJob({
    sessionId: source.sessionId,
    orderId: source.orderId,
    itemId: source.itemId,
    target: source.target,
    copies: source.copies,
    stationId: stationId || source.stationId,
  });
  dispatchTo(job.stationId);
  logger.info(`Qayta chiqarish: ${job.target} ${job.orderId} (asl job ${jobId})`);
  return job;
}

// Muddati o'tgan sessiyalar lock'ni bo'shatadi. Har yangilanish tsiklida
// chaqiriladi (index.js).
export function expireStaleSessions() {
  const { changes } = db
    .prepare("UPDATE sessions SET status = 'expired', finished_at = ? WHERE status = 'active' AND expires_at < ?")
    .run(nowIso(), nowIso());
  if (changes) logger.warn(`${changes} ta sessiya muddati o'tgani uchun yopildi (lock bo'shadi).`);
  return changes;
}

/* ==================== buyurtma tanlash ==================== */

// Barcode bo'yicha ochish mumkin bo'lgan buyurtmalar. Tartib:
// (a) eng kam tovarli, (b) teng bo'lsa eng eski — PLAN.md 4-bo'lim.
// Ochiq yoki allaqachon yig'ilgan sessiyasi bor buyurtmalar chiqarib tashlanadi
// (uzum_packing varag'iga yozuv Sheets orqali kechikib boradi, shuning uchun
// mahalliy baza ham tekshiriladi).
function findCandidates(barcode) {
  return db
    .prepare(
      `SELECT DISTINCT o.order_id, o.moysklad_id, o.item_count, o.unit_count, o.arrived_at_ms
       FROM item_barcodes b
       JOIN items  i ON i.item_id  = b.item_id
       JOIN orders o ON o.order_id = i.order_id
       WHERE b.barcode = ? AND o.eligible = 1
         AND NOT EXISTS (
           SELECT 1 FROM sessions s
           WHERE s.order_id = o.order_id AND s.status IN ('active', 'done')
         )
       ORDER BY o.item_count ASC, o.arrived_at_ms ASC`
    )
    .all(barcode);
}

// MoySklad'da bekor qilinmaganini yakuniy tekshirish. Kesh 60 soniyada bir
// yangilanadi, bu esa oxirgi daqiqadagi bekor qilishni ham ushlaydi.
async function isCanceledInMoysklad(moyskladId) {
  if (!moyskladId) return false;
  try {
    const href = await getOrderStateHref(moyskladId);
    return href === config.moysklad.states.canceledHref;
  } catch (e) {
    logger.error(`MoySklad holatini tekshirib bo'lmadi (${moyskladId}): ${e.message}`);
    // Ombor to'xtab qolmasligi uchun standart holat — davom etish.
    return PK.blockOnMoyskladError;
  }
}

// Sessiyani ochadi. Buyurtma boshqa operator tomonidan olingan bo'lsa (poyga)
// UNIQUE xatosi tushadi va null qaytadi — chaqiruvchi keyingi nomzodga o'tadi.
function openSession(candidate, operator, stationId) {
  const items = db
    .prepare(
      `SELECT i.item_id, i.sku_title, i.quantity, p.name AS mc_name
       FROM items i LEFT JOIN mc_products p ON p.uuid = i.product_ref
       WHERE i.order_id = ?`
    )
    .all(candidate.order_id);
  if (!items.length) return null;

  const barcodes = db
    .prepare(
      `SELECT b.barcode, b.item_id, b.source
       FROM item_barcodes b JOIN items i ON i.item_id = b.item_id
       WHERE i.order_id = ?`
    )
    .all(candidate.order_id);

  const id = randomUUID();
  const at = nowIso();

  try {
    db.transaction(() => {
      db.prepare(
        `INSERT INTO sessions (id, order_id, operator, station_id, moysklad_id, item_count, unit_count,
                               status, started_at, last_scan_at, expires_at)
         VALUES (?,?,?,?,?,?,?,'active',?,?,?)`
      ).run(
        id,
        candidate.order_id,
        operator,
        stationId ?? null,
        candidate.moysklad_id ?? null,
        items.length,
        items.reduce((n, i) => n + i.quantity, 0),
        at,
        at,
        expiryIso()
      );

      const insItem = db.prepare(
        "INSERT INTO session_items (session_id, item_id, sku_title, mc_name, needed, scanned) VALUES (?,?,?,?,?,0)"
      );
      for (const i of items) insItem.run(id, i.item_id, i.sku_title, i.mc_name, i.quantity);

      const insBc = db.prepare(
        "INSERT INTO session_barcodes (session_id, barcode, item_id, source) VALUES (?,?,?,?) ON CONFLICT DO NOTHING"
      );
      for (const b of barcodes) insBc.run(id, b.barcode, b.item_id, b.source);
    })();
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) return null; // boshqa operator ulgurdi
    throw e;
  }

  return id;
}

/* ==================== asosiy: skan ==================== */

export async function scan({ barcode: rawBarcode, operator, stationId }) {
  const barcode = normalizeBarcode(rawBarcode);
  const op = String(operator || "").trim();
  if (!op) throw new Error("operator kerak");
  if (!barcode) {
    logScan({ operator: op, barcode: String(rawBarcode ?? ""), result: RESULT.UNKNOWN_BARCODE });
    return { result: RESULT.UNKNOWN_BARCODE, message: "Barcode bo'sh" };
  }

  const active = getActiveSession(op);
  return active
    ? scanInSession(active, barcode, op)
    : await openByBarcode(barcode, op, stationId);
}

/* ---- A. Ochiq sessiya yo'q: buyurtma topamiz ---- */

async function openByBarcode(barcode, operator, stationId) {
  const candidates = findCandidates(barcode);

  if (!candidates.length) {
    // Barcode umuman mavjudmi yoki band/yig'ilganmi — farqini ko'rsatamiz.
    const anywhere = db
      .prepare("SELECT COUNT(*) AS n FROM item_barcodes WHERE barcode = ?")
      .get(barcode).n;
    const result = anywhere ? RESULT.NO_AVAILABLE_ORDER : RESULT.UNKNOWN_BARCODE;
    logScan({ operator, barcode, result });
    return {
      result,
      message: anywhere
        ? "Bu tovar bor, lekin ochiq buyurtma qolmadi (band yoki allaqachon yig'ilgan)"
        : "Bu barcode ochiq buyurtmalarda topilmadi",
    };
  }

  let checked = 0;
  for (const candidate of candidates) {
    if (checked < PK.maxMoyskladChecks) {
      checked++;
      if (await isCanceledInMoysklad(candidate.moysklad_id)) {
        logger.warn(`Buyurtma ${candidate.order_id} MoySklad'da bekor qilingan — o'tkazib yuborildi.`);
        continue;
      }
    }

    const sessionId = openSession(candidate, operator, stationId);
    if (!sessionId) continue; // poyga: boshqa operator ulgurdi

    // Birinchi skanni ham darhol hisobga olamiz.
    const res = scanInSession(getSession(sessionId), barcode, operator, { justOpened: true });
    return res;
  }

  logScan({ operator, barcode, result: RESULT.NO_AVAILABLE_ORDER });
  return {
    result: RESULT.NO_AVAILABLE_ORDER,
    message: "Mos buyurtma topilmadi (band, bekor qilingan yoki yig'ilgan)",
  };
}

/* ---- B. Ochiq sessiya bor ---- */

function scanInSession(session, barcode, operator, { justOpened = false } = {}) {
  const matches = db
    .prepare(
      `SELECT sb.item_id, sb.source, si.needed, si.scanned, si.sku_title, si.mc_name
       FROM session_barcodes sb
       JOIN session_items si ON si.session_id = sb.session_id AND si.item_id = sb.item_id
       WHERE sb.session_id = ? AND sb.barcode = ?`
    )
    .all(session.id, barcode);

  if (!matches.length) {
    logScan({ sessionId: session.id, operator, barcode, result: RESULT.WRONG_ITEM });
    return {
      result: RESULT.WRONG_ITEM,
      message: `Bu tovar ${session.orderId} buyurtmasiga tegishli emas`,
      session: getSession(session.id),
    };
  }

  // Bir xil barcode bir nechta qatorda bo'lishi mumkin — hali to'lmaganini olamiz.
  const target = matches.find((m) => m.scanned < m.needed);
  if (!target) {
    const m = matches[0];
    logScan({ sessionId: session.id, operator, itemId: m.item_id, barcode, source: m.source, result: RESULT.ALREADY_COMPLETE });
    return {
      result: RESULT.ALREADY_COMPLETE,
      message: `Bu tovar to'liq skanerlangan (${m.needed}/${m.needed})`,
      session: getSession(session.id),
    };
  }

  const at = nowIso();
  const prints = [];

  db.transaction(() => {
    db.prepare(
      "UPDATE session_items SET scanned = scanned + 1 WHERE session_id = ? AND item_id = ?"
    ).run(session.id, target.item_id);
    db.prepare("UPDATE sessions SET last_scan_at = ?, expires_at = ? WHERE id = ?").run(
      at,
      expiryIso(),
      session.id
    );
    logScan({
      sessionId: session.id,
      operator,
      itemId: target.item_id,
      barcode,
      source: target.source,
      result: RESULT.OK,
    });
    prints.push(
      addPrintJob({
        sessionId: session.id,
        orderId: session.orderId,
        itemId: target.item_id,
        target: "shk",
        copies: PK.shkCopies,
        stationId: session.stationId,
      })
    );
  })();

  const updated = getSession(session.id);
  dispatchTo(session.stationId); // ulangan bo'lsa darhol chop etishga ketadi

  // Hamma birlik skanerlandi -> yakunlaymiz.
  if (updated.progress.remaining === 0) {
    db.transaction(() => {
      db.prepare("UPDATE sessions SET status = 'done', finished_at = ? WHERE id = ?").run(nowIso(), session.id);
      prints.push(
        addPrintJob({
          sessionId: session.id,
          orderId: session.orderId,
          target: "big",
          copies: 1,
          stationId: session.stationId,
        })
      );
    })();
    dispatchTo(session.stationId);
    logger.info(`Buyurtma ${session.orderId} yig'ildi (${operator}, ${updated.progress.total} birlik).`);
    return {
      result: RESULT.ORDER_COMPLETE,
      message: `${session.orderId} yig'ildi — BIG chop etishga yuborildi`,
      session: getSession(session.id),
      print: prints,
    };
  }

  return {
    result: justOpened ? RESULT.ORDER_OPENED : RESULT.OK,
    message: justOpened
      ? `${session.orderId} ochildi — ${updated.progress.scanned}/${updated.progress.total}`
      : `${updated.progress.scanned}/${updated.progress.total}`,
    session: updated,
    print: prints,
  };
}

/* ==================== bekor qilish ==================== */

export function cancelSession(operator, reason = "operator bekor qildi") {
  const active = getActiveSession(operator);
  if (!active) return null;
  db.prepare("UPDATE sessions SET status = 'aborted', finished_at = ?, note = ? WHERE id = ?").run(
    nowIso(),
    String(reason).slice(0, 200),
    active.id
  );
  logger.info(`Sessiya bekor qilindi: ${active.orderId} (${operator}) — ${reason}`);
  return getSession(active.id);
}
