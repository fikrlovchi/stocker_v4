// Jadvaldan o'qiladigan kichik spravochniklar (do'kon nomi, MoySklad tovar
// nomi) va HTML qochirish. Ular Telegram xabarlarini boyitish uchun kerak —
// cancelNotify ham, skuAlerts ham shu yerdan oladi, ikkita nusxa bo'lmasin.
//
// Xarita FAQAT xabar yuborilayotganda (kamdan-kam) bir marta o'qiladi va
// process davomida keshlanadi: har tsiklda qayta o'qish Sheets kvotasini
// behuda yeydi.
const config = require("../config.json");
const logger = require("./logger");
const { colLetterToIndex } = require("./sheetsUtil");
const { getSheetsClient } = require("./oauthSheets");

const SHOP = {
  shopId: colLetterToIndex(config.columns.shops.shopId),
  name: colLetterToIndex(config.columns.shops.name),
};
const PROD = {
  ref: colLetterToIndex(config.columns.products.ref),
  name: colLetterToIndex(config.columns.products.name),
};

let shopNames = null;
let productNames = null;

async function readSheet(range) {
  const sheets = getSheetsClient();
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  return data.values || [];
}

// uzum_shop: shopId -> do'kon nomi
async function loadShopNames() {
  if (shopNames) return shopNames;
  shopNames = new Map();
  try {
    const rows = await readSheet(config.sheets.shops);
    for (let i = 1; i < rows.length; i++) {
      const id = rows[i][SHOP.shopId];
      if (id !== undefined && id !== null && id !== "") {
        shopNames.set(String(id), String(rows[i][SHOP.name] ?? ""));
      }
    }
  } catch (e) {
    logger.error(`uzum_shop nomlarini o'qishda xato: ${e.message}`);
  }
  return shopNames;
}

// mc_product: MoySklad href/uuid -> tovar nomi
async function loadProductNames() {
  if (productNames) return productNames;
  productNames = new Map();
  try {
    const rows = await readSheet(config.sheets.products);
    for (let i = 1; i < rows.length; i++) {
      const ref = rows[i][PROD.ref];
      if (ref !== undefined && ref !== null && ref !== "") {
        productNames.set(String(ref).trim(), String(rows[i][PROD.name] ?? ""));
      }
    }
  } catch (e) {
    logger.error(`mc_product nomlarini o'qishda xato: ${e.message}`);
  }
  return productNames;
}

// Do'kon nomi (topilmasa ID ning o'zi) — xabarda "-" ko'rinmasligi uchun.
async function shopLabel(shopId) {
  const id = String(shopId ?? "").trim();
  if (!id) return "";
  const map = await loadShopNames();
  return map.get(id) || id;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch]));
}

module.exports = { loadShopNames, loadProductNames, shopLabel, escapeHtml };
