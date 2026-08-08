// Qoldiq oqimlarini bitta joydan ishga tushirish: yozib borish, himoya va
// jadval bo'yicha takrorlash.
//
// Nega alohida modul: uchta oqimni ham skript (`pushStock.js`), ham veb
// interfeys, ham ichki jadval ishga tushiradi. Mantiq bir joyda bo'lmasa
// himoya faqat bittasida qolib ketardi — aynan shu 2026-08-07 da 20 ta SKU
// nolga tushishiga olib keldi.
import { db } from "../db/index.js";
import logger from "../logger.js";
import { getSetting, setSetting } from "../settings.js";
import { syncProducts, syncStock } from "../moysklad/assortment.js";
import { loadMods, loadDefaults, loadStockByExternalId, loadLinkProducts, loadShopTokens } from "./catalog.js";
import { buildPayloads, sendPayloads, checkBeforeSend } from "./pushToUzum.js";
import { pendingBarcodeRows, addBarcodesToMoySklad, clearFlag } from "./barcodeToMc.js";
import { clearBarcodeFlags } from "./sheetWriteback.js";
import { getSheetsClient } from "../google/sheetsClient.js";
import { notify } from "../telegram/index.js";

export const KINDS = ["sync", "push", "barcode", "cycle"];

/**
 * Jadval bo'yicha takrorlanadigan oqim — FAQAT `cycle`.
 *
 * Ilgari `sync` va `push` alohida jadval bilan ishlardi va oralarida oyna
 * qolardi: qoldiq o'qilgandan keyin yuborishgacha o'tgan vaqtda MoySklad'da
 * hamma narsa o'zgarishi mumkin. Bundan ham yomoni — hisobot RAD ETILGAN
 * bo'lsa (`assortment.js` qatorlar 5% dan ko'p kamayganda butun javobni
 * qo'llamaydi) `push` buni bilmasdan eski qoldiqni yuborardi.
 *
 * Endi ikkalasi bitta runda: o'qish → (qo'llandimi?) → yuborish.
 *
 * `sync` va `push` KINDS da qoladi — ular qo'lda ishga tushiriladi
 * (sinov, bitta do'konda tekshirish), lekin jadval bilan emas.
 *
 * `barcode` ham jadvalda yo'q: u yangi tovar bog'lamasi qo'shilganda
 * bajariladi (v3 dagi AppSheet automation'i kabi), takrorlanadigan ish emas.
 */
export const SCHEDULABLE = ["cycle"];

export const SCHEDULE_KEY = "stock.schedule";

// STANDART HOLAT — O'CHIRILGAN. Yangilanishdan keyin server o'z-o'zidan
// Uzumga yozib yubormasligi kerak: yoqish ataylab, interfeysdan qilinadi.
export const DEFAULT_SCHEDULE = {
  cycle: { enabled: false, intervalMinutes: 30 },
};

export function getSchedule() {
  const saved = getSetting(SCHEDULE_KEY)?.value || {};
  const out = {};
  for (const kind of SCHEDULABLE) {
    out[kind] = { ...DEFAULT_SCHEDULE[kind], ...(saved[kind] || {}) };
  }
  return out;
}

export function setSchedule(patch, login) {
  const current = getSchedule();
  for (const kind of SCHEDULABLE) {
    if (!patch[kind]) continue;
    const { enabled, intervalMinutes } = patch[kind];
    if (enabled !== undefined) current[kind].enabled = Boolean(enabled);
    if (intervalMinutes !== undefined) {
      const n = Number(intervalMinutes);
      // Pastki chegara: MoySklad va Uzum tezlik cheklovi bor, har daqiqada
      // butun katalogni yuborish ma'nosiz va xavfli.
      if (!Number.isFinite(n) || n < 5 || n > 1440) throw new Error("Interval 5–1440 daqiqa orasida bo'lishi kerak");
      current[kind].intervalMinutes = Math.round(n);
    }
  }
  setSetting(SCHEDULE_KEY, current, login);
  logger.info(`Qoldiq jadvali o'zgartirildi (${login}): ${JSON.stringify(current)}`);
  return current;
}

/* ==================== Ishga tushishlar ==================== */

function startRun({ kind, trigger, startedBy, dryRun }) {
  return db
    .prepare(
      `INSERT INTO stock_runs (kind, trigger, started_at, status, started_by, dry_run)
       VALUES (?, ?, datetime('now'), 'running', ?, ?)`
    )
    .run(kind, trigger, startedBy || null, dryRun ? 1 : 0).lastInsertRowid;
}

function finishRun(id, { status, summary, error }) {
  db.prepare(
    `UPDATE stock_runs SET finished_at = datetime('now'), status = ?, summary = ?, error = ? WHERE id = ?`
  ).run(status, summary ? JSON.stringify(summary) : null, error || null, id);
}

export function recentRuns({ kind, limit = 20 } = {}) {
  const rows = kind
    ? db.prepare("SELECT * FROM stock_runs WHERE kind = ? ORDER BY started_at DESC, id DESC LIMIT ?").all(kind, limit)
    : db.prepare("SELECT * FROM stock_runs ORDER BY started_at DESC, id DESC LIMIT ?").all(limit);
  return rows.map((r) => ({
    ...r,
    dry_run: r.dry_run === 1,
    summary: r.summary ? JSON.parse(r.summary) : null,
  }));
}

export const lastRun = (kind) => recentRuns({ kind, limit: 1 })[0] || null;

/** Qoldiq keshining holati — interfeysda ham, himoyada ham shu ishlatiladi. */
export function stockCacheStatus() {
  const cache = db.prepare("SELECT COUNT(*) n, MAX(synced_at) at FROM mc_stock").get();
  const products = db.prepare("SELECT COUNT(*) n, MAX(synced_at) at FROM mc_product").get();
  const links = db.prepare("SELECT COUNT(*) n FROM link_product").get();
  return {
    stockRows: cache.n,
    stockSyncedAt: cache.at,
    productRows: products.n,
    productSyncedAt: products.at,
    linkRows: links.n,
  };
}

/* ==================== Oqimlar ==================== */

async function runSync() {
  const products = await syncProducts();
  const stock = await syncStock();
  return {
    status: stock.applied ? "success" : "partial",
    summary: { products, stock },
  };
}

/**
 * Uzumga qoldiq yuborish. Himoya SHU YERDA — skriptda ham, interfeysda ham,
 * jadval bo'yicha ham bir xil ishlaydi.
 */
async function runPush({ dryRun, force, shopId, limit }) {
  let rows = loadLinkProducts();
  if (shopId) rows = rows.filter((r) => String(r.shopId) === String(shopId));
  if (limit) rows = rows.slice(0, limit);

  const { byToken, skipped, tokens } = buildPayloads(rows, {
    mods: loadMods(),
    defaults: loadDefaults(),
    stock: loadStockByExternalId(),
    shops: loadShopTokens(),
  });

  const payloads = [...byToken.values()].flat();
  const zeros = payloads.filter((p) => p.amount === 0).length;
  const cache = stockCacheStatus();

  const safety = checkBeforeSend({
    stockRows: cache.stockRows,
    stockSyncedAt: cache.stockSyncedAt,
    zeroCount: zeros,
    totalCount: payloads.length,
  });

  const base = {
    rows: rows.length,
    toSend: payloads.length,
    zeros,
    tokens,
    skipped: Object.fromEntries(Object.entries(skipped).map(([k, v]) => [k, v.length])),
    cache,
    safety,
  };

  if (dryRun) return { status: "success", summary: { ...base, dryRun: true } };

  if (!safety.ok && !force) {
    logger.error(`Uzumga yuborish TO'XTATILDI: ${safety.problems.join("; ")}`);
    await notify(
      "uzum_stock",
      `⛔️ <b>Qoldiq yuborish to'xtatildi</b>\n${safety.problems.map((p) => `• ${p}`).join("\n")}`
    );
    return { status: "blocked", summary: base };
  }

  const result = await sendPayloads(byToken);
  if (result.failed.length) {
    await notify(
      "uzum_stock",
      `⚠️ <b>Uzumga qoldiq yuborishda xato</b>\nYuborildi: ${result.success}/${result.total}\n` +
        `Xato: ${result.failed.length} SKU`
    );
  }
  return {
    status: result.failed.length ? "partial" : "success",
    summary: { ...base, sent: result.success, total: result.total, failed: result.failed.length },
  };
}

/**
 * To'liq tsikl: MoySklad'dan o'qish → Uzumga yuborish, BITTA runda.
 *
 * Eng muhim qoida: yuborish faqat sinxronizatsiya HAQIQATAN QO'LLANGANDA
 * bajariladi. "Ishga tushdi" yetarli emas — hisobot rad etilgan bo'lsa
 * `mc_stock` da eski qiymatlar qoladi va ular "yangi" deb yuborilardi.
 * Bu birlashtirishning butun ma'nosini yo'qqa chiqarardi.
 *
 * `runPush` ichidagi himoya (bo'sh kesh · eskirgan · 50% nol) o'z joyida
 * qoladi — u ikkinchi qavat.
 */
export function syncApplied(sync) {
  return sync?.summary?.stock?.applied === true;
}

async function runCycle(opts) {
  // `runSync` xato bersa u yuqoriga chiqadi va tsikl "error" bo'ladi —
  // yuborish baribir bajarilmaydi. Ya'ni qoida ikki yo'l bilan ham ishlaydi.
  const sync = await runSync();

  if (!syncApplied(sync) && !opts.force) {
    const reason = "MoySklad qoldiq hisoboti qo'llanmadi — eski qoldiq yuborilmaydi";
    logger.error(`Qoldiq tsikli TO'XTATILDI: ${reason}`);
    await notify("uzum_stock", `⛔️ <b>Qoldiq tsikli to'xtatildi</b>\n• ${reason}`);
    return { status: "blocked", summary: { sync: sync.summary, push: null, reason } };
  }

  const push = await runPush(opts);
  return {
    // Ikkala bosqichning eng "yomon" natijasi butun tsiklniki bo'ladi:
    // yuborish qisman bo'lsa tsikl ham qisman.
    status: push.status === "success" ? sync.status : push.status,
    summary: { sync: sync.summary, push: push.summary },
  };
}

async function runBarcode({ dryRun, keepSheetFlag }) {
  const rows = pendingBarcodeRows();
  if (!rows.length) return { status: "success", summary: { pending: 0 } };

  const done = [];
  const report = await addBarcodesToMoySklad(rows, {
    dryRun,
    onDone: async (row) => {
      clearFlag(row.id);
      done.push(row.skuTitle);
    },
  });

  let sheet = null;
  if (!dryRun && done.length && !keepSheetFlag) {
    sheet = await clearBarcodeFlags(getSheetsClient(), done);
  }

  if (!dryRun && (report.failed.length || report.skipped.length)) {
    await notify(
      "mc_barcode",
      `⚠️ <b>Barcode → MoySklad</b>\nQo'shildi: ${report.added.length}\n` +
        `Xato: ${report.failed.length}\nMa'lumot yetarsiz: ${report.skipped.length}`
    );
  }

  return {
    status: report.failed.length ? "partial" : "success",
    summary: {
      pending: rows.length,
      added: report.added.length,
      already: report.already.length,
      skipped: report.skipped.length,
      failed: report.failed.length,
      failures: report.failed.slice(0, 10).map((f) => ({ skuTitle: f.skuTitle, reason: f.reason })),
      sheet,
      dryRun,
    },
  };
}

/** Bir vaqtda bitta oqim — ikkita `push` parallel ketmasin. */
const running = new Set();

// `cycle` ichida `sync` va `push` bajariladi, shuning uchun u ularning
// qulfini ham oladi: jadval bo'yicha tsikl ketayotganda qo'lda "push"
// bosilsa ikkalasi bir vaqtda Uzumga yozardi.
const LOCKS = { sync: ["sync"], push: ["push"], barcode: ["barcode"], cycle: ["cycle", "sync", "push"] };

/**
 * Oqimni ishga tushiradi va natijani `stock_runs` ga yozadi.
 *
 * @param {"sync"|"push"|"barcode"|"cycle"} kind
 * @param {object} opts trigger · startedBy · dryRun · force · shopId · limit · keepSheetFlag
 */
export async function runStockJob(kind, opts = {}) {
  if (!KINDS.includes(kind)) throw new Error(`Noma'lum oqim: ${kind}`);
  const locks = LOCKS[kind];
  const busy = locks.find((l) => running.has(l));
  if (busy) throw new Error(`"${busy}" allaqachon ishlab turibdi`);

  for (const l of locks) running.add(l);
  const id = startRun({ kind, trigger: opts.trigger || "manual", startedBy: opts.startedBy, dryRun: opts.dryRun });

  try {
    const runners = { sync: runSync, push: runPush, barcode: runBarcode, cycle: runCycle };
    const result = await runners[kind](opts);
    finishRun(id, result);
    return { id, ...result };
  } catch (e) {
    logger.error(`Qoldiq oqimi xatosi (${kind}): ${e.message}`);
    finishRun(id, { status: "error", error: e.message });
    return { id, status: "error", error: e.message };
  } finally {
    for (const l of locks) running.delete(l);
  }
}

/* ==================== Jadval ==================== */

const timers = new Map();

/**
 * Jadval bo'yicha takrorlashni yoqadi. Sozlama o'zgarganda qayta chaqiriladi
 * — eski taymerlar to'xtatiladi.
 */
export function startStockSchedule() {
  for (const t of timers.values()) clearInterval(t);
  timers.clear();

  const schedule = getSchedule();
  for (const kind of SCHEDULABLE) {
    const { enabled, intervalMinutes } = schedule[kind];
    if (!enabled) continue;

    const ms = intervalMinutes * 60000;
    timers.set(
      kind,
      setInterval(() => {
        runStockJob(kind, { trigger: "schedule", startedBy: "schedule" }).catch((e) =>
          logger.error(`Jadval bo'yicha "${kind}" xatosi: ${e.message}`)
        );
      }, ms)
    );
    logger.info(`Jadval yoqildi: ${kind} — har ${intervalMinutes} daqiqada`);
  }

  if (!timers.size) logger.info("Qoldiq jadvali: hamma oqim o'chirilgan");
  return schedule;
}
