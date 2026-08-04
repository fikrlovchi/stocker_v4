// Sozlamalar va chop etilgan joblar ro'yxati — Electron userData papkasida.
//
// `printed.json` MUHIM: client qayta ishga tushganda server hali ACK
// olmagan joblarni qayta yuboradi. Shu ro'yxat bo'lmasa yorliq ikki marta
// chiqib ketardi.
const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");

const DIR = app.getPath("userData");
const CONFIG_FILE = path.join(DIR, "config.json");
const PRINTED_FILE = path.join(DIR, "printed.json");
const PRINTED_KEEP = 500;

const DEFAULTS = {
  serverUrl: "http://127.0.0.1:4044",
  token: "",
  stationId: "",
  stationName: "",
  shkPrinter: "",
  bigPrinter: "",
  // ShK aniq o'lchamda (40×30 mm) yasaladi -> masshtablanmasin.
  // BIG esa Uzum'ning katta labeli -> qog'ozga kichraytirib sig'diriladi.
  // "shrink" (kattasini kichraytiradi, kichigini kattalashtirmaydi) ba'zi
  // termo printer drayverlarida "fit" dan ko'ra ishonchliroq — SumatraPDF
  // "fit" bilan xato qaytarishi mumkin. UI'dan almashtirsa bo'ladi.
  shkScale: "noscale",
  bigScale: "shrink",
  // Qog'oz yo'nalishi. Bo'sh = drayver o'z sozlamasini ishlatadi (tavsiya).
  // "portrait" / "landscape" — drayver betni noto'g'ri burib chiqarganda.
  // Diqqat: server tomonidagi SHK_ROTATE bilan BIRGA ishlatilmasin, ikkisi
  // qo'shilib yorliq teskari chiqadi. Bittasini tanlang.
  shkOrientation: "",
  bigOrientation: "",
  autoStart: true,
};

function readJson(file, fallback) {
  try {
    return { ...fallback, ...JSON.parse(fs.readFileSync(file, "utf8")) };
  } catch {
    return { ...fallback };
  }
}

let config = readJson(CONFIG_FILE, DEFAULTS);

function getConfig() {
  return { ...config };
}

function saveConfig(patch) {
  config = { ...config, ...patch };
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  return getConfig();
}

/* ---------------- chop etilgan joblar (takrorga qarshi) ---------------- */

let printed = [];
try {
  printed = JSON.parse(fs.readFileSync(PRINTED_FILE, "utf8"));
  if (!Array.isArray(printed)) printed = [];
} catch {
  printed = [];
}
let printedSet = new Set(printed);

function wasPrinted(jobId) {
  return printedSet.has(jobId);
}

function markPrinted(jobId) {
  if (printedSet.has(jobId)) return;
  printed.push(jobId);
  printedSet.add(jobId);
  if (printed.length > PRINTED_KEEP) {
    printed = printed.slice(-PRINTED_KEEP);
    printedSet = new Set(printed);
  }
  try {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(PRINTED_FILE, JSON.stringify(printed));
  } catch {
    /* diskka yozib bo'lmasa ham chop etish davom etsin */
  }
}

module.exports = { getConfig, saveConfig, wasPrinted, markPrinted, CONFIG_FILE, DIR };
