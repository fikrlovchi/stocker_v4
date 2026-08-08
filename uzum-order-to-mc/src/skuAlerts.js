const fs = require("fs");
const path = require("path");
const logger = require("./logger");
const { sendTelegramMessage } = require("./telegram");
const { shopLabel, escapeHtml } = require("./sheetLookups");

const DATA_DIR = path.join(__dirname, "..", "data");
const STATE_FILE = path.join(DATA_DIR, "notified-skus.json");
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveState(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// Xabar matni. Ilgari topic'ka SKU ning O'ZI yalang'och yuborilardi va
// Uzum SKU nomi ko'pincha ma'nosiz kod bo'ladi ("mNZBQ66Qg7N3I6V-dDeim0") —
// buni o'qigan odam qaysi tovar haqida ekanini bilmasdi. Shuning uchun endi
// tovar nomi, barcode, buyurtma va do'kon ham qo'shiladi: SKU kodi tushunarsiz
// bo'lsa ham xabarni o'qib tovarni topib bo'ladi.
async function buildText({ sku, skuTitle, productTitle, barcode, quantity, orderId, shopId, detailRow }) {
  const lines = ["🔗 <b>Bog'lanmagan SKU</b> — buyurtma MoySklad'ga o'tmadi", ""];

  lines.push(`🏷 SKU: <code>${escapeHtml(sku)}</code>`);
  // skuTitle odatda sku bilan bir xil (XLOOKUP kaliti shu) — takrorlamaymiz.
  if (skuTitle && String(skuTitle).trim() !== String(sku).trim()) {
    lines.push(`🔤 skuTitle: <code>${escapeHtml(skuTitle)}</code>`);
  }
  if (productTitle) lines.push(`📦 Tovar: ${escapeHtml(productTitle)}`);
  if (barcode) lines.push(`🔢 Barcode: <code>${escapeHtml(barcode)}</code>`);

  const shop = await shopLabel(shopId);
  if (orderId) {
    lines.push(`🆔 Buyurtma: <b>${escapeHtml(orderId)}</b>${shop ? ` · 🏪 ${escapeHtml(shop)}` : ""}`);
  } else if (shop) {
    lines.push(`🏪 Do'kon: ${escapeHtml(shop)}`);
  }
  if (quantity) lines.push(`🔁 Miqdor: ${escapeHtml(quantity)}`);
  if (detailRow) lines.push(`📄 uzum_order_detail qatori: ${detailRow}`);

  lines.push("", "➡️ Tovar bog'lamalari bo'limida shu SKU ni MoySklad tovariga ulang.");
  return lines.join("\n");
}

// MoySklad'da mosi topilmagan SKU haqida bir marta (24 soatlik sovish davri bilan)
// Telegram'ga xabar beradi, toki xato har 2 daqiqada takrorlanavermasin.
// Argument: {sku, skuTitle, productTitle, barcode, quantity, orderId, shopId,
// detailRow}. Eski chaqiruv uslubi (faqat SKU matni) ham qabul qilinadi.
async function notifyIfNew(input) {
  const info = typeof input === "string" ? { sku: input } : input || {};
  const sku = info.sku;
  if (!sku) return;
  try {
    const state = loadState();
    const lastNotifiedAt = state[sku];
    if (lastNotifiedAt && Date.now() - lastNotifiedAt < COOLDOWN_MS) return;

    // SKU ogohlantirishlari ALOHIDA bot + alohida guruh/topic'ka boradi (bekor
    // qilingan buyurtmalar boti/guruhiga emas) — .env: SKU_ALERT_BOT_TOKEN /
    // SKU_ALERT_CHAT_ID / SKU_ALERT_TOPIC_ID.
    const sent = await sendTelegramMessage({
      text: await buildText(info),
      parseMode: "HTML",
      botToken: process.env.SKU_ALERT_BOT_TOKEN,
      chatId: process.env.SKU_ALERT_CHAT_ID,
      topicId: process.env.SKU_ALERT_TOPIC_ID,
    });
    if (!sent) return; // muvaffaqiyatsiz bo'lsa, keyingi tsiklda qayta sinaladi

    state[sku] = Date.now();
    saveState(state);
  } catch (e) {
    logger.error(`SKU ogohlantirish xatosi (${sku}): ${e.message}`);
  }
}

module.exports = { notifyIfNew, buildText };
