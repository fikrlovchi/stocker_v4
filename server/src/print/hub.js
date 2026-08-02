// WebSocket hub — desktop print client bilan aloqa.
//
// Nega WebSocket: telefon va PC bir tarmoqda bo'lishi shart emas. PC serverga
// o'zi ulanadi (chiquvchi ulanish), server esa print buyrug'ini shu ochiq
// kanal orqali yuboradi. Ish joyida port ochish yoki statik IP kerak emas.
//
// Protokol:
//   client → {type:"hello", stationId, name?, printers:{shk,big}}
//   server → {type:"welcome", stationId, pending:N}
//   server → {type:"print", job:{id, target, copies, orderId, itemId, url}}
//   client → {type:"ack", jobId, ok, error?}
//   ikkala tomon → {type:"ping"} / {type:"pong"}
//
// Idempotentlik: job.id o'zgarmas. ACK kelmasa server qayta yuboradi, client
// esa o'zi ko'rgan jobId'ni eslab qolib takror chop etmaydi.
import { WebSocketServer } from "ws";
import { config, env } from "../config.js";
import logger from "../logger.js";
import { claimJobsForStation, markSent, ackJob, upsertStation, touchStation } from "./jobs.js";

const PUBLIC_BASE = process.env.PUBLIC_BASE_URL || "";
const HEARTBEAT_MS = 30000;

// stationId -> WebSocket
const clients = new Map();

function jobUrl(job) {
  const path = `/job/${job.id}/pdf?t=${job.fetchToken}`;
  return PUBLIC_BASE ? `${PUBLIC_BASE.replace(/\/$/, "")}${path}` : path;
}

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

// Station uchun kutayotgan barcha joblarni yuboradi.
export function dispatchTo(stationId) {
  if (!stationId) return 0;
  const ws = clients.get(stationId);
  if (!ws) return 0;

  const jobs = claimJobsForStation(stationId);
  for (const job of jobs) {
    send(ws, {
      type: "print",
      job: {
        id: job.id,
        target: job.target,
        copies: job.copies,
        orderId: job.orderId,
        itemId: job.itemId,
        url: jobUrl(job),
      },
    });
    markSent(job.id);
  }
  return jobs.length;
}

// Barcha ulangan stationlarga (sweep'dan keyin).
export function dispatchAll() {
  let n = 0;
  for (const stationId of clients.keys()) n += dispatchTo(stationId);
  return n;
}

export function connectedStations() {
  return [...clients.keys()];
}

export function attachPrintHub(server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url, "http://localhost");
    // 6-fazagacha service token bilan; keyin har station o'z doimiy tokenini oladi.
    if (!env.serviceToken || url.searchParams.get("token") !== env.serviceToken) {
      send(ws, { type: "error", message: "token noto'g'ri" });
      ws.close(4001, "unauthorized");
      return;
    }

    let stationId = url.searchParams.get("stationId") || null;
    ws.isAlive = true;
    ws.on("pong", () => (ws.isAlive = true));

    const register = (id) => {
      if (!id) return;
      // Eski ulanish qolgan bo'lsa yopamiz (client qayta ulangan).
      const old = clients.get(id);
      if (old && old !== ws) old.close(4000, "replaced");
      clients.set(id, ws);
      stationId = id;
    };

    if (stationId) register(stationId);

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return send(ws, { type: "error", message: "JSON emas" });
      }

      if (msg.type === "hello") {
        if (!msg.stationId) return send(ws, { type: "error", message: "stationId kerak" });
        register(String(msg.stationId));
        upsertStation({
          id: stationId,
          name: msg.name,
          shkPrinter: msg.printers?.shk,
          bigPrinter: msg.printers?.big,
        });
        logger.info(
          `Ish joyi ulandi: ${stationId} (ShK: ${msg.printers?.shk || "—"}, BIG: ${msg.printers?.big || "—"})`
        );
        send(ws, { type: "welcome", stationId });
        dispatchTo(stationId);
        return;
      }

      if (msg.type === "ack") {
        if (!msg.jobId) return;
        const job = ackJob(String(msg.jobId), { ok: Boolean(msg.ok), error: msg.error });
        if (job && !msg.ok) send(ws, { type: "ack-received", jobId: msg.jobId, status: job.status });
        if (stationId) touchStation(stationId);
        return;
      }

      if (msg.type === "ping") return send(ws, { type: "pong" });
    });

    ws.on("close", () => {
      if (stationId && clients.get(stationId) === ws) {
        clients.delete(stationId);
        logger.info(`Ish joyi uzildi: ${stationId}`);
      }
    });

    ws.on("error", (e) => logger.error(`WS xato (${stationId || "?"}): ${e.message}`));
  });

  // O'lik ulanishlarni tozalash: TCP uzilishi darhol bilinmaydi.
  const timer = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_MS);
  timer.unref();

  logger.info(`Print hub tayyor: ws://${env.host}:${env.port}/ws`);
  return wss;
}
