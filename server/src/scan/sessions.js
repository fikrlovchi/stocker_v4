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
import { hasOpenBatch, isInOpenBatch, markPacked } from "../packing/batches.js";
import { shopName, shopGroup } from "../packing/shops.js";
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
  OTHER_SHOP: "other_shop",            // tovar bor, lekin BOSHQA do'konda
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
  // Buyurtmaning do'koni va GURUHI. Operator ekranda guruh raqamini
  // ko'radi va yig'ilgan buyurtmalarni shu bo'yicha saralaydi — shuning
  // uchun do'kon tanlash endi kerak emas.
  const shopId = db.prepare("SELECT shop_id FROM orders WHERE order_id = ?").get(s.order_id)?.shop_id || null;
  const group = shopGroup(shopId);

  return {
    id: s.id,
    orderId: s.order_id,
    operator: s.operator,
    stationId: s.station_id,
    shopId,
    shopName: shopId ? shopName(shopId) : null,
    groupId: group?.groupId ?? null,
    groupName: group?.groupName ?? null,
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
  // TO'LIQ shakl qaytadi. Ilgari bu yerda `{id, target, itemId, copies}`
  // qisqartmasi qaytardi va mobil ilova javobni o'qiy olmasdi:
  // "Field 'orderId' is required ... at path: $.jobs[0]". Chop etish
  // ishlagani uchun xato faqat ekranda ko'rinardi — takror bosilganda esa
  // mavjud joblar to'liq shaklda qaytib, xato yo'qolardi ("ba'zan").
  return createJob({ sessionId, orderId, itemId, target, copies, stationId });
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
function findCandidates(barcode, shopId = null) {
  // Ochiq partiya bo'lsa — skan doirasi shu ro'yxat bilan cheklanadi.
  // Partiya yo'q bo'lsa eski xatti-harakat: keshdagi barcha mos buyurtmalar.
  const scoped = hasOpenBatch();

  // Do'kon bo'yicha cheklov ATAYLAB olib tashlandi: bir necha do'kon amalda
  // bitta ombordan yig'iladi (do'kon guruhi), shuning uchun operator do'kon
  // tanlamaydi va skan hamma do'kondan qidiradi. Buyurtma ochilgach uning
  // guruh raqami va do'koni ekranda ko'rinadi — operator shu bo'yicha
  // saralaydi.
  //
  // `shopId` parametri saqlanib qoldi: kelajakda guruh bo'yicha cheklash
  // kerak bo'lsa shu joy tayyor, va eski client'lar uzatsa ham buziladigan
  // narsa yo'q.
  const where = shopId ? " AND o.shop_id = @shopId" : "";
  const rows = db
    .prepare(
      `SELECT DISTINCT o.order_id, o.moysklad_id, o.item_count, o.unit_count, o.arrived_at_ms
       FROM item_barcodes b
       JOIN items  i ON i.item_id  = b.item_id
       JOIN orders o ON o.order_id = i.order_id
       WHERE b.barcode = @barcode AND o.eligible = 1${where}
         AND NOT EXISTS (
           SELECT 1 FROM sessions s
           WHERE s.order_id = o.order_id AND s.status IN ('active', 'done')
         )
       ORDER BY o.item_count ASC, o.arrived_at_ms ASC`
    )
    .all(shopId ? { barcode, shopId: String(shopId) } : { barcode });

  return scoped ? rows.filter((r) => isInOpenBatch(r.order_id)) : rows;
}

/**
 * Shu barcode boshqa do'konning ochiq buyurtmasida bormi?
 *
 * Xabar aniq bo'lishi uchun: "topilmadi" bilan "boshqa do'konda" — butunlay
 * boshqa vaziyat va operator nima qilishini bilishi kerak.
 */
function shopsWithBarcode(barcode, exceptShopId) {
  return db
    .prepare(
      `SELECT DISTINCT o.shop_id AS shopId
       FROM item_barcodes b
       JOIN items  i ON i.item_id  = b.item_id
       JOIN orders o ON o.order_id = i.order_id
       WHERE b.barcode = ? AND o.eligible = 1 AND o.shop_id IS NOT NULL
         AND o.shop_id <> ?
         AND NOT EXISTS (
           SELECT 1 FROM sessions s
           WHERE s.order_id = o.order_id AND s.status IN ('active', 'done')
         )`
    )
    .all(barcode, String(exceptShopId))
    .map((r) => r.shopId);
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

export async function scan({ barcode: rawBarcode, operator, stationId, shopId = null }) {
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
    : await openByBarcode(barcode, op, stationId, shopId);
}

/* ---- A. Ochiq sessiya yo'q: buyurtma topamiz ---- */

async function openByBarcode(barcode, operator, stationId, shopId = null) {
  const candidates = findCandidates(barcode, shopId);

  if (!candidates.length) {
    // Do'kon tanlangan bo'lsa: tovar BOSHQA do'konda bormi? Bu eng ko'p
    // uchraydigan holat va uni "topilmadi" dan ajratish kerak.
    if (shopId) {
      const others = shopsWithBarcode(barcode, shopId);
      if (others.length) {
        logScan({ operator, barcode, result: RESULT.OTHER_SHOP });
        return {
          result: RESULT.OTHER_SHOP,
          message: `Bu tovar boshqa do'konda: ${others.map(shopName).join(", ")}`,
          shops: others.map((id) => ({ shopId: id, name: shopName(id) })),
        };
      }
    }

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
    // ShK endi skan paytida AVTOMATIK chiqmaydi: operator "ShK chiqarish"
    // tugmasini bosganda ketadi (BIG yorlig'i bilan bir xil tartib).
    // Sabab: skanerlash bilan chop etish bir vaqtda ketsa, xato skanerlangan
    // tovarning yorlig'i ham printerdan chiqib ketardi.
    // Eski xatti-harakat kerak bo'lsa — config.packing.autoShkPrint = true.
    if (PK.autoShkPrint) {
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
    }
  })();

  const updated = getSession(session.id);
  dispatchTo(session.stationId); // ulangan bo'lsa darhol chop etishga ketadi

  // Hamma birlik skanerlandi -> yakunlaymiz.
  if (updated.progress.remaining === 0) {
    db.transaction(() => {
      db.prepare("UPDATE sessions SET status = 'done', finished_at = ? WHERE id = ?").run(nowIso(), session.id);
      // BIG yorlig'i endi OPERATOR bosganda chiqadi (mobil ilovadagi "Print"
      // tugmasi): yig'ilgan buyurtma darhol printerga ketmasin, operator
      // qopni tayyorlab bo'lgach o'zi yuborsin. Eski xatti-harakat kerak
      // bo'lsa — config.packing.autoBigPrint = true.
      if (PK.autoBigPrint) {
        prints.push(
          addPrintJob({
            sessionId: session.id,
            orderId: session.orderId,
            target: "big",
            copies: 1,
            stationId: session.stationId,
          })
        );
      }
    })();
    dispatchTo(session.stationId);
    // Partiyada bo'lsa "yig'ildi" deb belgilanadi — do'kon progressi
    // (mobil ilovadagi 2/22) shu yerdan hisoblanadi.
    markPacked(session.orderId, operator);
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

/* ==================== BIG yorlig'ini chiqarish ==================== */

// Mobil ilovadagi "Print" tugmasi. Faqat hamma tovar skanerlangan (status
// 'done') sessiya uchun ishlaydi.
//
// Idempotent: bir sessiya uchun BIG job allaqachon bo'lsa, YANGISI
// yaratilmaydi — mavjudi qayta yuboriladi. Tugma ikki marta bosilsa ham
// ikkita yorliq chiqmaydi.
export function printBig(sessionId, operator) {
  const session = getSession(sessionId);
  if (!session) return { error: "Sessiya topilmadi" };
  if (session.operator !== operator) return { error: "Bu sessiya boshqa operatorniki" };
  if (session.status !== "done") {
    return { error: "Avval buyurtmadagi barcha tovarlar skanerlanishi kerak", code: "not_complete" };
  }

  const existing = listJobs({ sessionId }).filter((j) => j.target === "big");
  if (existing.length) {
    dispatchTo(session.stationId);
    return { ok: true, reused: true, jobs: existing };
  }

  const job = addPrintJob({
    sessionId: session.id,
    orderId: session.orderId,
    target: "big",
    copies: 1,
    stationId: session.stationId,
  });
  dispatchTo(session.stationId);
  logger.info(`BIG yorlig'i so'raldi: ${session.orderId} (${operator})`);
  return { ok: true, reused: false, jobs: [job] };
}

/**
 * Skanerlangan, lekin hali yorlig'i chiqarilmagan tovarlar uchun ShK.
 *
 * Nega "oxirgi skan" emas: operator bir necha tovarni ketma-ket skanerlab,
 * so'ng tugmani bosishi mumkin. Oxirgisini chiqarsak qolganlari yorliqsiz
 * qolardi. Shuning uchun hisob: har tovarda `skanerlangan − chiqarilgan`.
 *
 * Shu sababdan takror bosish ham zararsiz: qarz qolmagan bo'lsa 0 job.
 */
export function printShk(sessionId, operator) {
  const session = getSession(sessionId);
  if (!session) return { error: "Sessiya topilmadi" };
  if (session.operator !== operator) return { error: "Bu sessiya boshqa operatorniki" };

  // Shu sessiyada har tovar uchun nechta ShK jobi bor.
  const printed = new Map();
  for (const job of listJobs({ sessionId }).filter((j) => j.target === "shk" && j.itemId)) {
    printed.set(job.itemId, (printed.get(job.itemId) || 0) + 1);
  }

  const rows = db
    .prepare("SELECT item_id, scanned FROM session_items WHERE session_id = ?")
    .all(session.id);

  const jobs = [];
  db.transaction(() => {
    for (const row of rows) {
      const owed = (row.scanned || 0) - (printed.get(row.item_id) || 0);
      for (let i = 0; i < owed; i++) {
        jobs.push(
          addPrintJob({
            sessionId: session.id,
            orderId: session.orderId,
            itemId: row.item_id,
            target: "shk",
            copies: PK.shkCopies,
            stationId: session.stationId,
          })
        );
      }
    }
  })();

  if (jobs.length) {
    dispatchTo(session.stationId);
    logger.info(`ShK so'raldi: ${session.orderId} — ${jobs.length} ta (${operator})`);
  }
  return { ok: true, jobs, printed: jobs.length };
}

/**
 * Tarixdan qayta chiqarish: ShK, BIG yoki ikkalasi.
 *
 * Mavjud joblar QAYTA NAVBATGA qo'yilmaydi — yangi job yasaladi. Sabab:
 * eski job allaqachon "bajarilgan" holatida va uni qayta ishlatish tarixni
 * buzardi; qachon, kim va nechanchi marta chiqargani ko'rinib turishi kerak.
 */
export function reprintSession(sessionId, operator, target = "both") {
  const session = getSession(sessionId);
  if (!session) return { error: "Sessiya topilmadi" };
  if (session.operator !== operator) return { error: "Bu sessiya boshqa operatorniki" };
  if (!["shk", "big", "both"].includes(target)) return { error: "Noma'lum yorliq turi" };

  const jobs = [];
  db.transaction(() => {
    if (target === "shk" || target === "both") {
      // Har tovar uchun SKANERLANGAN soncha — asl chiqarish bilan bir xil.
      for (const row of db
        .prepare("SELECT item_id, scanned FROM session_items WHERE session_id = ?")
        .all(session.id)) {
        for (let i = 0; i < (row.scanned || 0); i++) {
          jobs.push(
            addPrintJob({
              sessionId: session.id,
              orderId: session.orderId,
              itemId: row.item_id,
              target: "shk",
              copies: PK.shkCopies,
              stationId: session.stationId,
            })
          );
        }
      }
    }
    if (target === "big" || target === "both") {
      jobs.push(
        addPrintJob({
          sessionId: session.id,
          orderId: session.orderId,
          target: "big",
          copies: 1,
          stationId: session.stationId,
        })
      );
    }
  })();

  dispatchTo(session.stationId);
  logger.info(`Qayta chiqarish (${target}): ${session.orderId} — ${jobs.length} ta (${operator})`);
  return { ok: true, target, jobs, printed: jobs.length };
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
