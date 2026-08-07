// Telegram spravochnigi: botlar, chatlar va ularni integratsiyaga biriktirish.
//
// Tuzilma DMS v8 dan olingan (`Server/DMS/v8/server/src/services/telegram.js`):
// bot va chat alohida katalog, modul esa "qaysi bot, qaysi chat" ni tanlab
// oladi. Shu bois xabar yuboruvchi kod chat_id/topic_id ni bilishi shart emas
// — integratsiya kalitini beradi, qolganini shu modul hal qiladi.
import { db } from "../db/index.js";
import logger from "../logger.js";

const API = "https://api.telegram.org";
const TIMEOUT_MS = 10000;

export const CHAT_TYPES = ["personal", "group", "supergroup", "topic_group", "channel"];

/* ==================== Telegram Bot API ==================== */

async function tg(token, method, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    if (!data) throw new Error(`Telegram javobi o'qilmadi (${res.status})`);
    if (!data.ok) throw new Error(data.description || `Telegram xatosi (${res.status})`);
    return data.result;
  } catch (e) {
    if (e.name === "AbortError") throw new Error("Telegram javob bermadi (timeout)");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Token haqiqiyligini tekshiradi — interfeysdagi "Test" tugmasi shuni chaqiradi. */
export async function testBot(id) {
  const bot = getBot(id);
  if (!bot) throw new Error("Bot topilmadi");
  const me = await tg(bot.token, "getMe");
  return { username: me.username, name: me.first_name };
}

/* ==================== Katalog ==================== */

export const listBots = () =>
  db.prepare("SELECT id, name, token, is_active FROM telegram_bot ORDER BY name").all();

export const getBot = (id) => db.prepare("SELECT * FROM telegram_bot WHERE id = ?").get(Number(id));

export function createBot({ name, token, isActive = true }, login) {
  const id = db
    .prepare("INSERT INTO telegram_bot (name, token, is_active, created_by) VALUES (?, ?, ?, ?)")
    .run(name.trim(), token.trim(), isActive ? 1 : 0, login || null).lastInsertRowid;
  logger.info(`Telegram bot qo'shildi: ${name} (${login})`);
  return getBot(id);
}

export function updateBot(id, { name, token, isActive }, login) {
  const bot = getBot(id);
  if (!bot) throw new Error("Bot topilmadi");
  db.prepare("UPDATE telegram_bot SET name = ?, token = ?, is_active = ? WHERE id = ?").run(
    name?.trim() || bot.name,
    token?.trim() || bot.token,
    isActive === undefined ? bot.is_active : isActive ? 1 : 0,
    bot.id
  );
  logger.info(`Telegram bot o'zgartirildi: ${bot.name} (${login})`);
  return getBot(bot.id);
}

/** Biriktirilgan bot o'chirilmaydi — aks holda integratsiya jim qolib ketadi. */
export function removeBot(id) {
  const used = db.prepare("SELECT integration_key FROM integration_telegram WHERE bot_id = ?").all(Number(id));
  if (used.length) throw new Error(`Bot ishlatilmoqda: ${used.map((u) => u.integration_key).join(", ")}`);
  db.prepare("DELETE FROM telegram_bot WHERE id = ?").run(Number(id));
}

export const listChats = () =>
  db.prepare("SELECT id, name, chat_id, type, topic_id, is_active FROM telegram_chat ORDER BY name").all();

export const getChat = (id) => db.prepare("SELECT * FROM telegram_chat WHERE id = ?").get(Number(id));

function normalizeChat({ type, topicId }) {
  const t = CHAT_TYPES.includes(type) ? type : "group";
  // Mavzu faqat topic_group uchun ma'noli — boshqa turda tasodifan
  // saqlanib qolsa xabar noto'g'ri joyga ketadi.
  return { type: t, topicId: t === "topic_group" ? String(topicId || "").trim() || null : null };
}

export function createChat({ name, chatId, type, topicId, isActive = true }, login) {
  const n = normalizeChat({ type, topicId });
  if (n.type === "topic_group" && !n.topicId) throw new Error("Mavzuli guruh uchun mavzu ID kerak");
  const id = db
    .prepare(
      "INSERT INTO telegram_chat (name, chat_id, type, topic_id, is_active, created_by) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(name.trim(), String(chatId).trim(), n.type, n.topicId, isActive ? 1 : 0, login || null).lastInsertRowid;
  logger.info(`Telegram chat qo'shildi: ${name} (${login})`);
  return getChat(id);
}

export function updateChat(id, { name, chatId, type, topicId, isActive }, login) {
  const chat = getChat(id);
  if (!chat) throw new Error("Chat topilmadi");
  const n = normalizeChat({ type: type ?? chat.type, topicId: topicId ?? chat.topic_id });
  if (n.type === "topic_group" && !n.topicId) throw new Error("Mavzuli guruh uchun mavzu ID kerak");
  db.prepare("UPDATE telegram_chat SET name = ?, chat_id = ?, type = ?, topic_id = ?, is_active = ? WHERE id = ?").run(
    name?.trim() || chat.name,
    String(chatId ?? chat.chat_id).trim(),
    n.type,
    n.topicId,
    isActive === undefined ? chat.is_active : isActive ? 1 : 0,
    chat.id
  );
  logger.info(`Telegram chat o'zgartirildi: ${chat.name} (${login})`);
  return getChat(chat.id);
}

export function removeChat(id) {
  const used = db.prepare("SELECT integration_key FROM integration_telegram WHERE chat_id = ?").all(Number(id));
  if (used.length) throw new Error(`Chat ishlatilmoqda: ${used.map((u) => u.integration_key).join(", ")}`);
  db.prepare("DELETE FROM telegram_chat WHERE id = ?").run(Number(id));
}

/* ==================== Integratsiyaga biriktirish ==================== */

export const getBinding = (key) =>
  db.prepare("SELECT integration_key, bot_id, chat_id, updated_at, updated_by FROM integration_telegram WHERE integration_key = ?").get(key) || {
    integration_key: key,
    bot_id: null,
    chat_id: null,
    updated_at: null,
    updated_by: null,
  };

export function setBinding(key, { botId, chatId }, login) {
  db.prepare(
    `INSERT INTO integration_telegram (integration_key, bot_id, chat_id, updated_at, updated_by)
     VALUES (?, ?, ?, datetime('now'), ?)
     ON CONFLICT(integration_key) DO UPDATE SET
       bot_id = excluded.bot_id, chat_id = excluded.chat_id,
       updated_at = excluded.updated_at, updated_by = excluded.updated_by`
  ).run(key, botId ? Number(botId) : null, chatId ? Number(chatId) : null, login || null);
  logger.info(`Telegram biriktirildi: ${key} → bot#${botId || "—"} chat#${chatId || "—"} (${login})`);
  return getBinding(key);
}

/**
 * Integratsiya nomidan xabar yuboradi. Biriktirilmagan yoki nofaol bo'lsa
 * xato EMAS, `{ sent: false, reason }` qaytadi: Telegram sozlanmagani uchun
 * asosiy ish (qoldiq yuborish, buyurtma tortish) to'xtab qolmasligi kerak.
 */
export async function notify(integrationKey, text, options = {}) {
  const b = getBinding(integrationKey);
  if (!b.bot_id || !b.chat_id) return { sent: false, reason: "biriktirilmagan" };

  const bot = getBot(b.bot_id);
  const chat = getChat(b.chat_id);
  if (!bot?.is_active) return { sent: false, reason: "bot nofaol" };
  if (!chat?.is_active) return { sent: false, reason: "chat nofaol" };

  const payload = {
    chat_id: chat.chat_id,
    text,
    parse_mode: options.parseMode || "HTML",
    disable_web_page_preview: true,
  };
  if (chat.type === "topic_group" && chat.topic_id) payload.message_thread_id = Number(chat.topic_id);
  if (options.replyTo) payload.reply_to_message_id = Number(options.replyTo);

  try {
    const msg = await tg(bot.token, "sendMessage", payload);
    return { sent: true, messageId: msg.message_id, chatId: chat.chat_id };
  } catch (e) {
    logger.error(`Telegram xabar yuborilmadi (${integrationKey}): ${e.message}`);
    return { sent: false, reason: e.message };
  }
}

/* ==================== Eski katalogdan ko'chirish ==================== */

const tableExists = (name) =>
  Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));

/**
 * Panel'dan kelgan `telegram_bots/chats/topics` yozuvlarini yangi sxemaga
 * ko'chiradi. Takror chaqirilsa yangi yozuv yasamaydi (noyob indeks va
 * token/nom bo'yicha tekshiruv). Eski jadvallarga tegilmaydi.
 */
export function importLegacyTelegram() {
  if (!tableExists("telegram_bots")) return { bots: 0, chats: 0 };

  let bots = 0;
  let chats = 0;

  const insertChat = db.prepare(
    `INSERT OR IGNORE INTO telegram_chat (name, chat_id, type, topic_id, created_by)
     VALUES (?, ?, ?, ?, 'import')`
  );

  db.transaction(() => {
    for (const old of db.prepare("SELECT id, name, bot_token FROM telegram_bots").all()) {
      const exists = db.prepare("SELECT id FROM telegram_bot WHERE token = ?").get(old.bot_token);
      if (!exists) {
        db.prepare("INSERT INTO telegram_bot (name, token, created_by) VALUES (?, ?, 'import')").run(
          old.name,
          old.bot_token
        );
        bots++;
      }

      if (!tableExists("telegram_chats")) continue;
      for (const chat of db.prepare("SELECT id, name, chat_id FROM telegram_chats WHERE bot_id = ?").all(old.id)) {
        // Chat'ning o'zi — mavzusiz guruh sifatida.
        chats += insertChat.run(chat.name, String(chat.chat_id), "group", null).changes;

        if (!tableExists("telegram_topics")) continue;
        // Har mavzu — alohida manzil. Nomi "chat / mavzu" ko'rinishida,
        // aks holda ro'yxatda qaysi guruhniki ekani bilinmaydi.
        for (const topic of db
          .prepare("SELECT name, topic_id FROM telegram_topics WHERE chat_id = ?")
          .all(chat.id)) {
          chats += insertChat.run(
            `${chat.name} / ${topic.name}`,
            String(chat.chat_id),
            "topic_group",
            String(topic.topic_id)
          ).changes;
        }
      }
    }
  })();

  if (bots || chats) logger.info(`Telegram katalogi ko'chirildi: ${bots} bot, ${chats} chat`);
  return { bots, chats };
}
