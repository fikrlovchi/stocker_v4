// Chop etish navbati.
//
// Job hayoti:  pending → sent → done
//                 ↑        │
//                 └────────┘  ACK kelmasa qayta yuboriladi (maxAttempts)
//                          └→ error
//
// `id` (uuid) idempotentlik kaliti: client uni eslab qoladi, qayta ulanishda
// bir xil job ikki marta chop etilmaydi. Server ham `done` bo'lgan jobni
// qaytadan yubormaydi.
import { randomUUID, randomBytes } from "node:crypto";
import { config } from "../config.js";
import { db } from "../db/index.js";
import logger from "../logger.js";

const P = config.print;
const nowIso = () => new Date().toISOString();

export function createJob({ sessionId, orderId, itemId, target, copies, stationId }) {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO print_jobs (id, session_id, order_id, item_id, target, copies, station_id,
                             status, attempts, fetch_token, created_at)
     VALUES (?,?,?,?,?,?,?,'pending',0,?,?)`
  ).run(
    id,
    sessionId ?? null,
    orderId,
    itemId ?? null,
    target,
    copies,
    stationId ?? null,
    randomBytes(18).toString("hex"),
    nowIso()
  );
  return getJob(id);
}

export function getJob(id) {
  const r = db.prepare("SELECT * FROM print_jobs WHERE id = ?").get(id);
  return r ? shape(r) : null;
}

function shape(r) {
  return {
    id: r.id,
    sessionId: r.session_id,
    orderId: r.order_id,
    itemId: r.item_id,
    target: r.target,
    copies: r.copies,
    stationId: r.station_id,
    status: r.status,
    attempts: r.attempts,
    fetchToken: r.fetch_token,
    lastError: r.last_error,
    createdAt: r.created_at,
    sentAt: r.sent_at,
    finishedAt: r.finished_at,
  };
}

// Station ulanganda yoki yangi job paydo bo'lganda yuboriladiganlar.
// `sent` bo'lganlar ham qaytadi: ACK kelmasa qayta yuborish kerak, client esa
// jobId bo'yicha takrorni o'zi tashlab yuboradi.
export function claimJobsForStation(stationId) {
  const cutoff = new Date(Date.now() - P.ackTimeoutMs).toISOString();
  return db
    .prepare(
      `SELECT * FROM print_jobs
       WHERE station_id = ?
         AND (status = 'pending' OR (status = 'sent' AND sent_at < ?))
         AND attempts < ?
       ORDER BY created_at`
    )
    .all(stationId, cutoff, P.maxAttempts)
    .map(shape);
}

export function markSent(id) {
  db.prepare(
    "UPDATE print_jobs SET status = 'sent', sent_at = ?, attempts = attempts + 1 WHERE id = ?"
  ).run(nowIso(), id);
}

// Client ACK'i. Idempotent: allaqachon `done` bo'lgan job qayta yozilmaydi.
export function ackJob(id, { ok, error }) {
  const job = getJob(id);
  if (!job) return null;
  if (job.status === "done") return job;

  if (ok) {
    db.prepare("UPDATE print_jobs SET status = 'done', finished_at = ?, last_error = NULL WHERE id = ?").run(
      nowIso(),
      id
    );
  } else {
    const failed = job.attempts >= P.maxAttempts;
    db.prepare(
      `UPDATE print_jobs SET status = ?, last_error = ?, finished_at = ? WHERE id = ?`
    ).run(failed ? "error" : "pending", String(error || "noma'lum xato").slice(0, 300), failed ? nowIso() : null, id);
    logger.error(
      `Chop etish xatosi (${job.target} ${job.orderId}, urinish ${job.attempts}/${P.maxAttempts}): ${error}`
    );
  }
  return getJob(id);
}

// ACK kelmagan jobni qayta navbatga qo'yadi; urinishlar tugasa `error`.
// Har yangilanish tsiklida chaqiriladi.
export function sweepStaleJobs() {
  const cutoff = new Date(Date.now() - P.ackTimeoutMs).toISOString();
  const stale = db
    .prepare("SELECT * FROM print_jobs WHERE status = 'sent' AND sent_at < ?")
    .all(cutoff)
    .map(shape);

  let requeued = 0;
  let failed = 0;
  for (const job of stale) {
    if (job.attempts >= P.maxAttempts) {
      db.prepare("UPDATE print_jobs SET status = 'error', last_error = ?, finished_at = ? WHERE id = ?").run(
        `${P.maxAttempts} urinishdan keyin ham ACK kelmadi`,
        nowIso(),
        job.id
      );
      failed++;
    } else {
      db.prepare("UPDATE print_jobs SET status = 'pending' WHERE id = ?").run(job.id);
      requeued++;
    }
  }
  if (requeued || failed) {
    logger.warn(`Chop etish navbati: ${requeued} ta qayta navbatga, ${failed} ta xato deb belgilandi.`);
  }
  return { requeued, failed };
}

// Uzoq kutib qolgan jobler — Telegram ogohlantirishi uchun (9-faza).
export function stuckJobs() {
  const cutoff = new Date(Date.now() - P.alertAfterMs).toISOString();
  return db
    .prepare("SELECT * FROM print_jobs WHERE status IN ('pending','sent') AND created_at < ? ORDER BY created_at")
    .all(cutoff)
    .map(shape);
}

export function pruneOldJobs() {
  const cutoff = new Date(Date.now() - P.jobRetentionDays * 24 * 60 * 60 * 1000).toISOString();
  return db
    .prepare("DELETE FROM print_jobs WHERE status IN ('done','error','canceled') AND created_at < ?")
    .run(cutoff).changes;
}

export function listJobs({ stationId, sessionId, status, limit = 50 } = {}) {
  const where = [];
  if (stationId) where.push("station_id = @stationId");
  if (sessionId) where.push("session_id = @sessionId");
  if (status) where.push("status = @status");
  return db
    .prepare(
      `SELECT * FROM print_jobs ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY created_at DESC LIMIT @limit`
    )
    .all({ stationId, sessionId, status, limit })
    .map(shape);
}

export function queueStats() {
  const rows = db.prepare("SELECT status, COUNT(*) AS n FROM print_jobs GROUP BY status").all();
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

/* ==================== stationlar ==================== */

export function upsertStation({ id, name, shkPrinter, bigPrinter }) {
  db.prepare(
    `INSERT INTO stations (id, name, shk_printer, big_printer, last_seen_at)
     VALUES (@id, @name, @shk, @big, @at)
     ON CONFLICT(id) DO UPDATE SET
       name         = COALESCE(excluded.name, stations.name),
       shk_printer  = COALESCE(excluded.shk_printer, stations.shk_printer),
       big_printer  = COALESCE(excluded.big_printer, stations.big_printer),
       last_seen_at = excluded.last_seen_at`
  ).run({ id, name: name ?? null, shk: shkPrinter ?? null, big: bigPrinter ?? null, at: nowIso() });
  return getStation(id);
}

export function getStation(id) {
  const r = db.prepare("SELECT * FROM stations WHERE id = ?").get(id);
  return r
    ? {
        id: r.id,
        name: r.name,
        shkPrinter: r.shk_printer,
        bigPrinter: r.big_printer,
        lastSeenAt: r.last_seen_at,
        isActive: r.is_active === 1,
      }
    : null;
}

export function listStations() {
  return db.prepare("SELECT id FROM stations ORDER BY id").all().map((r) => getStation(r.id));
}

export function touchStation(id) {
  db.prepare("UPDATE stations SET last_seen_at = ? WHERE id = ?").run(nowIso(), id);
}
