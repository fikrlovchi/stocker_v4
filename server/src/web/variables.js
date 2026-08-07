// O'zgaruvchilar katalogi — panel'dan ko'chirilgan (konsolidatsiya 3-bosqichi).
//
// Bu yerda loyihalarning `.env` fayllariga bog'lanadigan qiymatlar turadi:
// Google Sheets havolalari, Telegram bot/chat/mavzu, Uzum kabinet va do'konlar.
// Jadvallar panel'niki — bazalar birlashtirilgani uchun shundoq o'qiladi.
//
// Do'kon nomlari mobil ilovada ham ishlatiladi (`packing/shops.js`), shuning
// uchun bu bo'lim endi faqat "sozlama" emas: nom o'zgarsa operator ekranida
// ham o'zgaradi.
import express from "express";
import { db } from "../db/index.js";
import logger from "../logger.js";
import { clearShopNameCache } from "../packing/shops.js";

const UZUM_SHOPS_URL = "https://api-seller.uzum.uz/api/seller-openapi/v1/shops";

// Uzum seller-openapi: Authorization sarlavhasi "Bearer" prefiksisiz, xom token.
async function fetchUzumShops(token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(UZUM_SHOPS_URL, {
      headers: { Authorization: token, Accept: "*/*" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Uzum API xatosi (${res.status})`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Uzum API kutilmagan javob qaytardi");
    return data.map((s) => ({ shopId: String(s.id), name: s.name }));
  } catch (e) {
    if (e.name === "AbortError") throw new Error("Uzum API javob bermadi (timeout)");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// Qaysi manba turi qayerdan o'qiladi va `.env` ga nima yoziladi.
// panel/src/services/envSourceResolver.js dagi ro'yxat bilan bir xil.
const SOURCES = {
  telegram_bot: { label: "Telegram bot", table: "telegram_bots", valueColumn: "bot_token" },
  telegram_chat: { label: "Telegram chat", table: "telegram_chats", valueColumn: "chat_id" },
  telegram_topic: { label: "Telegram mavzu", table: "telegram_topics", valueColumn: "topic_id" },
  uzum_cabinet: { label: "Uzum kabinet", table: "uzum_cabinets", valueColumn: "token" },
  uzum_shop: { label: "Uzum do'kon", table: "uzum_shops", valueColumn: "shop_id" },
  api_token: { label: "Token", table: "api_tokens", valueColumn: "token" },
};

const all = (sql, ...params) => db.prepare(sql).all(...params);

export function variablesRouter() {
  const router = express.Router();

  /* ---------- ko'rish ---------- */

  // Ustunlar panel migratsiyalaridagi nomlar bilan bir xil bo'lishi shart:
  // jadvallar shu yerda emas, `panel/src/db/migrations` da yaratilgan.
  // Masalan `google_sheets` da `url` ustuni YO'Q — mavjud bo'lmagan ustun
  // so'ralsa better-sqlite3 so'rov paytida xato beradi va butun bo'lim
  // ochilmay qoladi.
  router.get("/", (req, res) => {
    res.json({
      sheets: all("SELECT id, name, sheet_id FROM google_sheets ORDER BY name").map((s) => ({
        ...s,
        lists: all("SELECT id, name FROM sheet_lists WHERE sheet_id = ? ORDER BY name", s.id),
      })),
      telegramBots: all("SELECT id, name FROM telegram_bots ORDER BY name").map((b) => ({
        ...b,
        chats: all("SELECT id, name, chat_id FROM telegram_chats WHERE bot_id = ? ORDER BY name", b.id).map((c) => ({
          ...c,
          topics: all("SELECT id, name, topic_id FROM telegram_topics WHERE chat_id = ? ORDER BY name", c.id),
        })),
      })),
      cabinets: all("SELECT id, name FROM uzum_cabinets ORDER BY name").map((c) => ({
        ...c,
        shops: all("SELECT id, name, shop_id FROM uzum_shops WHERE cabinet_id = ? ORDER BY name", c.id),
      })),
      // Manbalar ro'yxati — `.env` bog'lash oynasi shundan to'ladi.
      sources: Object.entries(SOURCES).map(([key, s]) => ({ key, label: s.label })),
    });
  });

  /* ---------- Google Sheets ---------- */

  router.post("/sheets", (req, res) => {
    const { name, sheetId } = req.body || {};
    if (!name?.trim() || !sheetId?.trim()) return res.status(400).json({ error: "Nom va sheet ID kerak" });
    db.prepare("INSERT INTO google_sheets (name, sheet_id) VALUES (?, ?)").run(name.trim(), sheetId.trim());
    res.json({ ok: true });
  });

  router.post("/sheets/:id/lists", (req, res) => {
    const { name } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: "List nomi kerak" });
    db.prepare("INSERT INTO sheet_lists (sheet_id, name) VALUES (?, ?)").run(Number(req.params.id), name.trim());
    res.json({ ok: true });
  });

  /* ---------- Telegram ---------- */

  router.post("/telegram/bots", (req, res) => {
    const { name, token } = req.body || {};
    if (!name?.trim() || !token?.trim()) return res.status(400).json({ error: "Nom va token kerak" });
    db.prepare("INSERT INTO telegram_bots (name, bot_token) VALUES (?, ?)").run(name.trim(), token.trim());
    res.json({ ok: true });
  });

  router.post("/telegram/bots/:id/chats", (req, res) => {
    const { name, chatId } = req.body || {};
    if (!name?.trim() || !chatId?.trim()) return res.status(400).json({ error: "Nom va chat ID kerak" });
    db.prepare("INSERT INTO telegram_chats (bot_id, name, chat_id) VALUES (?, ?, ?)")
      .run(Number(req.params.id), name.trim(), chatId.trim());
    res.json({ ok: true });
  });

  router.post("/telegram/chats/:id/topics", (req, res) => {
    const { name, topicId } = req.body || {};
    if (!name?.trim() || !topicId?.trim()) return res.status(400).json({ error: "Nom va mavzu ID kerak" });
    db.prepare("INSERT INTO telegram_topics (chat_id, name, topic_id) VALUES (?, ?, ?)")
      .run(Number(req.params.id), name.trim(), topicId.trim());
    res.json({ ok: true });
  });

  /* ---------- Uzum ---------- */

  router.post("/uzum/cabinets", async (req, res) => {
    const { name, token } = req.body || {};
    if (!name?.trim() || !token?.trim()) return res.status(400).json({ error: "Nom va token kerak" });

    const id = db
      .prepare("INSERT INTO uzum_cabinets (name, token) VALUES (?, ?)")
      .run(name.trim(), token.trim()).lastInsertRowid;

    // Do'konlar Uzum API'dan avtomatik tortiladi. API javob bermasa kabinet
    // baribir saqlanadi — do'konlarni keyin "Yangilash" bilan olish mumkin.
    try {
      const shops = await fetchUzumShops(token.trim());
      const insert = db.prepare(
        "INSERT OR IGNORE INTO uzum_shops (cabinet_id, name, shop_id) VALUES (?, ?, ?)"
      );
      for (const s of shops) insert.run(id, s.name, s.shopId);
      clearShopNameCache();
      res.json({ ok: true, shops: shops.length });
    } catch (e) {
      res.json({ ok: true, shops: 0, warning: e.message });
    }
  });

  // Do'konlarni Uzum'dan qayta o'qish (nom o'zgargan yoki yangi do'kon qo'shilgan).
  router.post("/uzum/cabinets/:id/sync", async (req, res) => {
    const cab = db.prepare("SELECT * FROM uzum_cabinets WHERE id = ?").get(Number(req.params.id));
    if (!cab) return res.status(404).json({ error: "Kabinet topilmadi" });
    try {
      const shops = await fetchUzumShops(cab.token);
      const upsert = db.transaction(() => {
        for (const s of shops) {
          const existing = db
            .prepare("SELECT id FROM uzum_shops WHERE cabinet_id = ? AND shop_id = ?")
            .get(cab.id, s.shopId);
          if (existing) db.prepare("UPDATE uzum_shops SET name = ? WHERE id = ?").run(s.name, existing.id);
          else db.prepare("INSERT INTO uzum_shops (cabinet_id, name, shop_id) VALUES (?, ?, ?)")
            .run(cab.id, s.name, s.shopId);
        }
      });
      upsert();
      clearShopNameCache();
      logger.info(`Uzum do'konlari yangilandi: ${cab.name} — ${shops.length} ta`);
      res.json({ ok: true, shops: shops.length });
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  // Do'kon nomini qo'lda tuzatish — mobil ilovada ham shu nom ko'rinadi.
  router.patch("/uzum/shops/:id", (req, res) => {
    const { name } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: "Nom kerak" });
    db.prepare("UPDATE uzum_shops SET name = ? WHERE id = ?").run(name.trim(), Number(req.params.id));
    clearShopNameCache();
    res.json({ ok: true });
  });

  /* ---------- loyihaning .env bog'lamalari ---------- */

  // DIQQAT: bu blok pastdagi `DELETE /:kind/:id` dan OLDIN turishi kerak —
  // aks holda `DELETE /bindings/5` o'sha umumiy route'ga tushib "Noma'lum
  // tur" qaytaradi.

  router.post("/bindings", (req, res) => {
    const { projectSlug, envKey, sourceType, sourceId } = req.body || {};
    if (!projectSlug || !envKey?.trim() || !SOURCES[sourceType] || !sourceId) {
      return res.status(400).json({ error: "projectSlug, envKey, sourceType va sourceId kerak" });
    }
    const project = db.prepare("SELECT id FROM projects WHERE slug = ?").get(projectSlug);
    if (!project) return res.status(404).json({ error: "Loyiha topilmadi" });

    db.prepare(
      `INSERT INTO project_env_bindings (project_id, env_key, source_type, source_id)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(project_id, env_key) DO UPDATE SET
         source_type = excluded.source_type, source_id = excluded.source_id`
    ).run(project.id, envKey.trim(), sourceType, Number(sourceId));
    logger.info(`ENV bog'lama: ${projectSlug}.${envKey.trim()} → ${sourceType}#${sourceId}`);
    res.json({ ok: true });
  });

  router.delete("/bindings/:id", (req, res) => {
    db.prepare("DELETE FROM project_env_bindings WHERE id = ?").run(Number(req.params.id));
    res.json({ ok: true });
  });

  /* ---------- o'chirish ---------- */

  // Har jadval uchun alohida route yozish o'rniga bitta — lekin jadval nomi
  // ATAYLAB ro'yxatdan olinadi, aks holda ixtiyoriy jadvalni o'chirish
  // mumkin bo'lardi.
  const DELETABLE = {
    sheet: "google_sheets",
    list: "sheet_lists",
    bot: "telegram_bots",
    chat: "telegram_chats",
    topic: "telegram_topics",
    cabinet: "uzum_cabinets",
    shop: "uzum_shops",
  };

  router.delete("/:kind/:id", (req, res) => {
    const table = DELETABLE[req.params.kind];
    if (!table) return res.status(400).json({ error: "Noma'lum tur" });
    db.prepare(`DELETE FROM "${table}" WHERE id = ?`).run(Number(req.params.id));
    if (table === "uzum_shops" || table === "uzum_cabinets") clearShopNameCache();
    res.json({ ok: true });
  });

  return router;
}
