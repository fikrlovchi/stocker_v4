// Qoldiq sinxronizatsiyasi tarixi va nosozlik haqida xabar.
//
// Nima uchun alohida modul: `assortment.js` MoySklad bilan gaplashadi,
// bu yerda esa kuzatuv — yozib borish, tozalash va Telegram'ga xabar.
import { db } from "../db/index.js";
import logger from "../logger.js";
import { notify } from "../telegram/index.js";

const RETENTION_DAYS = 90;

/**
 * Sinxronizatsiya natijasini yozadi. Xato bo'lsa ham ish to'xtamaydi:
 * kuzatuv asosiy vazifadan muhimroq bo'lib qolmasligi kerak.
 */
export function recordStockSync(entry) {
  try {
    db.prepare(
      `INSERT INTO mc_stock_sync_log
         (applied, reason, report_count, previous_count, stored_count,
          missing, restored, still_missing, zeroed, recheck_error)
       VALUES (@applied, @reason, @reportCount, @previousCount, @storedCount,
               @missing, @restored, @stillMissing, @zeroed, @recheckError)`
    ).run({
      applied: entry.applied ? 1 : 0,
      reason: entry.reason || null,
      reportCount: entry.reportCount ?? null,
      previousCount: entry.previousCount ?? null,
      storedCount: entry.storedCount ?? null,
      missing: entry.missing || 0,
      restored: entry.restored || 0,
      stillMissing: entry.stillMissing || 0,
      zeroed: entry.zeroed || 0,
      recheckError: entry.recheckError || null,
    });

    db.prepare(`DELETE FROM mc_stock_sync_log WHERE at < datetime('now', ?)`).run(`-${RETENTION_DAYS} days`);
  } catch (e) {
    logger.error(`Qoldiq tarixiga yozib bo'lmadi: ${e.message}`);
  }
}

/**
 * Oxirgi yozuvlar — `stockLog.js` skripti va kelajakdagi ekran uchun.
 *
 * `id DESC` ham kerak: `at` soniya aniqligida yoziladi, shuning uchun bir
 * soniyada ikki yozuv bo'lsa faqat vaqt bo'yicha saralash tartibni
 * aniqlamaydi.
 */
export function recentStockSyncs(limit = 30) {
  return db.prepare("SELECT * FROM mc_stock_sync_log ORDER BY at DESC, id DESC LIMIT ?").all(limit);
}

/**
 * Kuzatuv xulosasi: oxirgi N yozuv bo'yicha nomuvofiqlik qanchalik
 * uchraganini ko'rsatadi. `stockMissingConfirmations` ni pasaytirish
 * xavfsizmi degan savolga dalil shu.
 */
export function stockSyncSummary(limit = 100) {
  const rows = recentStockSyncs(limit);
  if (!rows.length) return { runs: 0 };

  const withMissing = rows.filter((r) => r.missing > 0);
  return {
    runs: rows.length,
    from: rows[rows.length - 1].at,
    to: rows[0].at,
    rejected: rows.filter((r) => !r.applied).length,
    runsWithMissing: withMissing.length,
    maxMissing: Math.max(0, ...rows.map((r) => r.missing)),
    // Maqsadli so'rov qanchalik ish beradi: tushib qolganlarning necha
    // foizini o'zi hal qildi.
    restoredTotal: rows.reduce((n, r) => n + r.restored, 0),
    stillMissingTotal: rows.reduce((n, r) => n + r.still_missing, 0),
    zeroedTotal: rows.reduce((n, r) => n + r.zeroed, 0),
    recheckErrors: rows.filter((r) => r.recheck_error).length,
  };
}

/**
 * Diqqat talab qiladigan holatda Telegram'ga xabar.
 *
 * Xabar HAR sinxronizatsiyada emas: hisobot rad etilganda, tovar 0 deb
 * belgilanganda yoki maqsadli so'rov xato berganda. Aks holda xabar shovqinga
 * aylanib, hech kim o'qimay qo'yadi.
 */
export async function alertIfNeeded(entry) {
  const lines = [];

  if (!entry.applied) {
    lines.push(`⛔️ <b>Qoldiq yangilanmadi</b> — hisobot shubhali`);
    lines.push(`Sabab: ${entry.reason}`);
    lines.push(`Eski qoldiq saqlanib qoldi, Uzumga nol yuborilmadi.`);
  } else if (entry.zeroed) {
    lines.push(`⚠️ <b>${entry.zeroed} ta tovar qoldig'i 0 deb belgilandi</b>`);
    lines.push(`Ular ketma-ket bir necha hisobotda ko'rinmadi va maqsadli so'rovda ham topilmadi.`);
  }

  if (entry.recheckError) lines.push(`Maqsadli qayta so'rov xatosi: ${entry.recheckError}`);

  if (!lines.length) return { sent: false, reason: "xabar kerak emas" };
  return notify("uzum_stock", lines.join("\n"));
}
