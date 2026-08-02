// Stocker Print — Windows tray ilovasi.
//
// Vazifasi: serverga WebSocket bilan ulanib turish, kelgan print job'larni
// PDF sifatida yuklab olib termo printerdan chiqarish va ACK qaytarish.
//   ShK -> 1-printer (Proton DTP-4207, 40×30 mm, noscale)
//   BIG -> 2-printer (Gainsha GS-2408, 4×4", fit)
const path = require("node:path");
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell } = require("electron");
const QRCode = require("qrcode");

const { getConfig, saveConfig, wasPrinted, markPrinted, DIR } = require("./config.js");
const { listPrinters, printPdf } = require("./printer.js");
const { PrintWsClient } = require("./wsClient.js");

let win = null;
let tray = null;
let quitting = false;
let status = { state: "starting" };
const logLines = [];
const jobHistory = [];

/* ==================== oyna va tray ==================== */

function pushLog(text, level = "info") {
  const line = { at: new Date().toISOString(), text, level };
  logLines.unshift(line);
  if (logLines.length > 200) logLines.pop();
  send("log", line);
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function setStatus(next) {
  status = next;
  send("status", status);
  updateTray();
}

function updateTray() {
  if (!tray) return;
  const cfg = getConfig();
  const labels = {
    connected: "ulangan",
    connecting: "ulanmoqda…",
    disconnected: "uzilgan",
    unconfigured: "sozlanmagan",
    error: "xato",
    stopped: "to'xtatilgan",
    starting: "ishga tushmoqda",
  };
  tray.setToolTip(`Stocker Print — ${cfg.stationId || "ish joyi tanlanmagan"} (${labels[status.state] || status.state})`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Holat: ${labels[status.state] || status.state}`, enabled: false },
      { type: "separator" },
      { label: "Oynani ochish", click: showWindow },
      { label: "Qayta ulanish", click: () => client.reconnectNow() },
      { label: "Sozlamalar papkasi", click: () => shell.openPath(DIR) },
      { type: "separator" },
      {
        label: "Chiqish",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ])
  );
}

function showWindow() {
  if (!win || win.isDestroyed()) return createWindow();
  win.show();
  win.focus();
}

function createWindow() {
  win = new BrowserWindow({
    width: 880,
    height: 680,
    minWidth: 720,
    minHeight: 560,
    title: "Stocker Print",
    icon: nativeImage.createFromPath(path.join(__dirname, "assets", "tray.png")),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "renderer", "index.html"));

  // Oynani yopish ilovani to'xtatmaydi — tray'da ishlab turadi.
  win.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });
}

/* ==================== job ishlov berish ==================== */

// Server yuborgan url nisbiy bo'lishi mumkin (PUBLIC_BASE_URL bo'sh bo'lsa) —
// uni o'z server manzilimizga nisbatan hal qilamiz.
function resolveUrl(url) {
  if (/^https?:\/\//i.test(url)) return url;
  return `${String(getConfig().serverUrl).replace(/\/$/, "")}${url}`;
}

// Node'ning "fetch failed" xabari sababni ko'rsatmaydi — serverga umuman
// yetib bo'lmagani, TLS muammosi yoki DNS bo'lishi mumkin. Foydalanuvchiga
// nima tekshirishni aytamiz.
function describeFetchError(err, url) {
  if (err?.message !== "fetch failed") return err.message;
  const cause = err.cause?.code || err.cause?.message || "";
  const hints = {
    ECONNREFUSED: "server javob bermayapti (port yopiq yoki servis to'xtagan)",
    ENOTFOUND: "manzil topilmadi (DNS yoki domen xato)",
    ETIMEDOUT: "vaqt tugadi (tarmoq yoki firewall)",
    ECONNRESET: "ulanish uzildi",
  };
  const reason = hints[cause] || cause || "tarmoq xatosi";
  return `Serverga ulanib bo'lmadi — ${reason}.\n${url}\n\nTekshiring: server manzili to'g'rimi, SSH tunnel ochiqmi, servis ishlayaptimi.`;
}

function printerFor(target) {
  const cfg = getConfig();
  return target === "big"
    ? { printer: cfg.bigPrinter, scale: cfg.bigScale }
    : { printer: cfg.shkPrinter, scale: cfg.shkScale };
}

function recordJob(entry) {
  jobHistory.unshift({ at: new Date().toISOString(), ...entry });
  if (jobHistory.length > 50) jobHistory.pop();
  send("jobs", jobHistory);
}

async function handleJob(job) {
  // Takrorga qarshi: server ACK olmagan jobni qayta yuboradi, biz esa
  // allaqachon chop etgan bo'lsak faqat ACK'ni takrorlaymiz.
  if (wasPrinted(job.id)) {
    client.ack(job.id, true);
    pushLog(`Takroriy job o'tkazib yuborildi: ${job.target} ${job.orderId}`);
    return;
  }

  const { printer, scale } = printerFor(job.target);
  if (!printer) {
    const msg = `${job.target.toUpperCase()} printeri tanlanmagan`;
    client.ack(job.id, false, msg);
    recordJob({ ...job, ok: false, error: msg });
    pushLog(msg, "error");
    return;
  }

  const url = resolveUrl(job.url);
  try {
    let resp;
    try {
      resp = await fetch(url);
    } catch (netErr) {
      throw new Error(describeFetchError(netErr, url));
    }
    if (!resp.ok) throw new Error(`PDF olinmadi: HTTP ${resp.status}`);
    const buffer = Buffer.from(await resp.arrayBuffer());

    await printPdf(buffer, { printer, scale, copies: 1, label: `${job.target}_${job.orderId}` });

    // Avval belgilaymiz, keyin ACK: ACK yo'lda yo'qolsa ham qayta chop
    // etilmasin (server qayta yuboradi, biz esa faqat ACK takrorlaymiz).
    markPrinted(job.id);
    client.ack(job.id, true);
    recordJob({ ...job, ok: true, printer });
    pushLog(`Chop etildi: ${job.target.toUpperCase()} ${job.orderId} → ${printer}`);
  } catch (e) {
    client.ack(job.id, false, e.message);
    recordJob({ ...job, ok: false, error: e.message });
    pushLog(`Chop etish xatosi (${job.target} ${job.orderId}): ${e.message}`, "error");
  }
}

/* ==================== WS client ==================== */

const client = new PrintWsClient({
  getConfig,
  onJob: handleJob,
  onStatus: setStatus,
  onLog: pushLog,
});

/* ==================== IPC ==================== */

ipcMain.handle("config:get", () => getConfig());

ipcMain.handle("config:save", (e, patch) => {
  const before = getConfig();
  const cfg = saveConfig(patch);
  // Ulanishga ta'sir qiladigan maydon o'zgarsa qayta ulanamiz.
  const keys = ["serverUrl", "token", "stationId"];
  if (keys.some((k) => before[k] !== cfg[k])) client.reconnectNow();
  else client.send({ type: "hello", stationId: cfg.stationId, name: cfg.stationName, printers: { shk: cfg.shkPrinter, big: cfg.bigPrinter } });
  updateTray();
  return cfg;
});

ipcMain.handle("printers:list", () => listPrinters());

ipcMain.handle("printers:test", async (e, target) => {
  const { printer, scale } = printerFor(target);
  if (!printer) return { ok: false, error: "Printer tanlanmagan" };

  // Sinov sahifasi serverdan olinadi — shunda bitta bosishda butun zanjir
  // tekshiriladi: ulanish, token, PDF yasash va chop etish.
  const cfg = getConfig();
  const url = `${String(cfg.serverUrl).replace(/\/$/, "")}/print/test-page?target=${target}`;
  try {
    let resp;
    try {
      resp = await fetch(url, { headers: { "X-Service-Token": cfg.token } });
    } catch (netErr) {
      throw new Error(describeFetchError(netErr, url));
    }
    if (resp.status === 401) throw new Error("Kalit (token) noto'g'ri — Sozlamalarni tekshiring");
    if (resp.status === 502) throw new Error("Server uzumPDFs'dan PDF ola olmadi (uzumpdfs ishlayaptimi?)");
    if (!resp.ok) throw new Error(`Server HTTP ${resp.status}`);

    const buffer = Buffer.from(await resp.arrayBuffer());
    await printPdf(buffer, { printer, scale, copies: 1, label: `test_${target}` });
    pushLog(`Sinov sahifasi yuborildi: ${target.toUpperCase()} → ${printer}`);
    return { ok: true };
  } catch (err) {
    pushLog(`Sinov chop etish xatosi: ${err.message}`, "error");
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("state:get", () => ({ status, logs: logLines, jobs: jobHistory }));

ipcMain.handle("client:reconnect", () => {
  client.reconnectNow();
  return true;
});

// Telefon shu QR'ni skanerlab ish joyiga bog'lanadi.
ipcMain.handle("pair:qr", async () => {
  const cfg = getConfig();
  if (!cfg.serverUrl || !cfg.stationId) return { error: "Server va ish joyi ko'rsatilmagan" };
  const payload = JSON.stringify({ srv: cfg.serverUrl, station: cfg.stationId });
  return { payload, dataUrl: await QRCode.toDataURL(payload, { margin: 1, width: 320 }) };
});

/* ==================== ishga tushirish ==================== */

// Bitta nusxa yetarli — ikkinchisi ishga tushirilsa mavjud oyna ochiladi.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", showWindow);

  app.whenReady().then(() => {
    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, "assets", "tray.png")));
    tray.on("click", showWindow);
    updateTray();

    createWindow();

    const cfg = getConfig();
    app.setLoginItemSettings({ openAtLogin: Boolean(cfg.autoStart), openAsHidden: true });

    client.connect();
    pushLog("Ilova ishga tushdi");
  });

  app.on("window-all-closed", () => {
    // Tray'da qolamiz — Windows'da oyna yopilishi bilan chiqib ketmasin.
  });

  app.on("before-quit", () => {
    quitting = true;
    client.stop();
  });
}
