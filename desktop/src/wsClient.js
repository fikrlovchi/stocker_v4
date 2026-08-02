// Serverga doimiy WebSocket ulanish.
//
// PC serverga O'ZI ulanadi (chiquvchi ulanish) — shuning uchun ish joyida
// port ochish, statik IP yoki telefon bilan bir tarmoqda bo'lish kerak emas.
//
// Uzilishda eksponensial kutish bilan qayta ulanadi. Server ACK olmagan
// joblarni qayta yuboradi; takroriy chop etishning oldini `wasPrinted`
// (config.js) oladi.
const WebSocket = require("ws");

const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 30000;
const PING_MS = 25000;

class PrintWsClient {
  constructor({ getConfig, onJob, onStatus, onLog }) {
    this.getConfig = getConfig;
    this.onJob = onJob;
    this.onStatus = onStatus;
    this.onLog = onLog;
    this.ws = null;
    this.retryMs = RECONNECT_MIN_MS;
    this.stopped = false;
    this.pingTimer = null;
    this.reconnectTimer = null;
  }

  wsUrl() {
    const { serverUrl, token, stationId } = this.getConfig();
    const base = String(serverUrl || "").replace(/\/$/, "");
    if (!base) throw new Error("Server manzili ko'rsatilmagan");
    const wsBase = base.replace(/^http/, "ws");
    return `${wsBase}/ws?stationId=${encodeURIComponent(stationId)}&token=${encodeURIComponent(token)}`;
  }

  connect() {
    this.stopped = false;
    const cfg = this.getConfig();
    if (!cfg.serverUrl || !cfg.token || !cfg.stationId) {
      this.onStatus({ state: "unconfigured" });
      return;
    }

    let url;
    try {
      url = this.wsUrl();
    } catch (e) {
      this.onStatus({ state: "error", message: e.message });
      return;
    }

    this.onStatus({ state: "connecting" });
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.on("open", () => {
      this.retryMs = RECONNECT_MIN_MS;
      this.onStatus({ state: "connected" });
      const c = this.getConfig();
      this.send({
        type: "hello",
        stationId: c.stationId,
        name: c.stationName,
        printers: { shk: c.shkPrinter, big: c.bigPrinter },
      });
      this.pingTimer = setInterval(() => this.send({ type: "ping" }), PING_MS);
    });

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg.type === "print" && msg.job) this.onJob(msg.job);
      else if (msg.type === "welcome") this.onLog(`Serverga ulandi: ${msg.stationId}`);
      else if (msg.type === "error") this.onLog(`Server xatosi: ${msg.message}`);
    });

    ws.on("close", (code, reason) => {
      clearInterval(this.pingTimer);
      this.ws = null;
      // 4001 = token noto'g'ri: qayta urinishdan foyda yo'q, sozlash kerak.
      if (code === 4001) {
        this.onStatus({ state: "error", message: "Token noto'g'ri — sozlamalarni tekshiring" });
        return;
      }
      if (this.stopped) return this.onStatus({ state: "stopped" });
      this.onStatus({ state: "disconnected", message: String(reason || "") });
      this.scheduleReconnect();
    });

    ws.on("error", (e) => this.onLog(`Ulanish xatosi: ${e.message}`));
  }

  scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), this.retryMs);
    this.retryMs = Math.min(this.retryMs * 2, RECONNECT_MAX_MS);
  }

  send(payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }

  ack(jobId, ok, error) {
    return this.send({ type: "ack", jobId, ok, error });
  }

  reconnectNow() {
    this.stop();
    this.retryMs = RECONNECT_MIN_MS;
    this.connect();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    clearInterval(this.pingTimer);
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ahamiyatsiz */
      }
      this.ws = null;
    }
  }
}

module.exports = { PrintWsClient };
