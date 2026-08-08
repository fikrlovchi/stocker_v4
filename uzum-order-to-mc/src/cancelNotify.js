// Bekor qilingan buyurtma haqida boy (buyurtma IDsi + shop nomi + tarkibi)
// teglangan Telegram xabari. cancelSync (24h monitoring) va orderStatusSync
// (tasdiqlashdan oldin bekor bo'lgan holat) shu moduldan foydalanadi.
const config = require("../config.json");
const { colLetterToIndex } = require("./sheetsUtil");
const { sendTelegramMessage } = require("./telegram");
const { loadShopNames, loadProductNames, escapeHtml } = require("./sheetLookups");

const DET = Object.fromEntries(
  Object.entries(config.columns.details).map(([k, v]) => [k, colLetterToIndex(v)])
);

// CANCEL_NOTIFY_CONTACTS="Ismi:chatId,Ismi2:chatId2" — bir nechta odamni belgilash.
function buildTags() {
  return (process.env.CANCEL_NOTIFY_CONTACTS || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
    .map((e) => {
      const [name, chatId] = e.split(":").map((s) => s.trim());
      return name && chatId ? `<a href="tg://user?id=${chatId}">${escapeHtml(name)}</a>` : null;
    })
    .filter(Boolean)
    .join(" ");
}

function buildItemLines(details, orderId, prodMap) {
  const lines = [];
  const target = String(orderId).trim();
  for (let j = 1; j < details.length; j++) {
    const row = details[j];
    if (String(row[DET.orderId] ?? "").trim() !== target) continue;
    const ref = String(row[DET.product] ?? "").trim();
    const name = prodMap.get(ref) || String(row[DET.skuTitle] ?? "").trim() || ref || "(nomsiz)";
    const qty = row[DET.quantity];
    lines.push(` • ${escapeHtml(name)}${qty !== undefined && qty !== "" ? ` × ${escapeHtml(qty)}` : ""}`);
  }
  return lines;
}

// header — xabar sarlavhasi (masalan "❌ Buyurtma bekor qilindi" yoki
// "⚠️ Buyurtma tasdiqlashdan oldin bekor bo'ldi"). details — uzum_order_detail
// qatorlari (index.js batchGet'dan). tag=false bo'lsa foydalanuvchilar
// belgilanmaydi. topicId berilsa — o'sha topic'ka yuboriladi (bo'lmasa .env
// dagi standart topic). Muvaffaqiyatni (true/false) qaytaradi.
async function notifyCancellation({ orderId, shopId, details, header, tag = true, topicId }) {
  const [shopMap, prodMap] = [await loadShopNames(), await loadProductNames()];
  const shopName = shopMap.get(String(shopId ?? "")) || String(shopId ?? "");
  const items = buildItemLines(details || [], orderId, prodMap);
  const tags = tag ? buildTags() : "";

  const text =
    `${header}\n` +
    `🆔 Buyurtma: <b>${escapeHtml(orderId)}</b>\n` +
    `🏪 Do'kon: ${escapeHtml(shopName || "-")}\n` +
    (items.length ? `📦 Tarkibi:\n${items.join("\n")}\n` : "") +
    (tags ? `\n${tags}` : "");

  return sendTelegramMessage({ text, parseMode: "HTML", topicId });
}

module.exports = { notifyCancellation };
