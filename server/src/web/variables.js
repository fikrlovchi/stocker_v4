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

/**
 * Uzum'dan kelgan do'kon ro'yxatini kabinetga qo'llaydi.
 *
 * Uch xil holat, uchtasi ham boshqacha ma'noga ega:
 *   yangi    — do'kon hali bazada yo'q;
 *   ko'chgan — do'kon BOSHQA kabinetda edi. Kabinet = MoySklad'dagi yuridik
 *              shaxs, ya'ni bundan keyin buyurtma boshqa firma nomida
 *              yaratiladi. Qator ko'chiriladi va hodisa tarixga yoziladi;
 *   o'zgarmagan — faqat nomi yangilanadi.
 *
 * Eski kod ko'chishni ko'rmasdi: yagona indeks `(cabinet_id, shop_id)`
 * juftligida bo'lgani uchun do'kon eski kabinetda ham qolib ketardi va
 * `organization_href` ikkitasidan tasodifiy birini olardi.
 */
export function applyShops(cab, shops) {
  const moved = [];
  let added = 0;

  db.transaction(() => {
    for (const s of shops) {
      const shopId = String(s.shopId);
      const existing = db
        .prepare("SELECT id, cabinet_id, name FROM uzum_shops WHERE shop_id = ?")
        .get(shopId);

      if (!existing) {
        db.prepare("INSERT INTO uzum_shops (cabinet_id, name, shop_id) VALUES (?, ?, ?)")
          .run(cab.id, s.name, shopId);
        added++;
        continue;
      }

      if (existing.cabinet_id !== cab.id) {
        const from = db.prepare("SELECT name FROM uzum_cabinets WHERE id = ?").get(existing.cabinet_id);
        db.prepare(
          `INSERT INTO uzum_shop_moves
             (shop_id, from_cabinet_id, to_cabinet_id, from_cabinet_name, to_cabinet_name, source)
           VALUES (?, ?, ?, ?, ?, 'sync')`
        ).run(shopId, existing.cabinet_id, cab.id, from?.name || null, cab.name);
        // Sotuv kanali (`mc_saleschannel_href`) do'konning O'ZINIKI va
        // ko'chishda saqlanadi; yuridik shaxs kabinetniki, ya'ni o'zgaradi.
        db.prepare("UPDATE uzum_shops SET cabinet_id = ?, name = ? WHERE id = ?")
          .run(cab.id, s.name, existing.id);
        moved.push({ shopId, name: s.name, from: from?.name || null, to: cab.name });
        continue;
      }

      db.prepare("UPDATE uzum_shops SET name = ? WHERE id = ?").run(s.name, existing.id);
    }
  })();

  return { added, moved };
}

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
      // MoySklad havolalari (v3 dagi "MC href"): kabinetniki — yuridik
      // shaxs, do'konniki — sotuv kanali. Buyurtmani MoySklad'ga yozishda
      // ikkalasi ham kerak.
      cabinets: all("SELECT id, name, mc_organization_href FROM uzum_cabinets ORDER BY name").map((c) => ({
        ...c,
        shops: all(
          `SELECT id, name, shop_id, sku_code, mc_saleschannel_href, group_id
           FROM uzum_shops WHERE cabinet_id = ? ORDER BY name`,
          c.id
        ),
      })),
      // Do'kon guruhlari — bir necha do'kon bitta ombordan yig'ilsa.
      shopGroups: all("SELECT id, name FROM uzum_shop_groups ORDER BY id"),
      // Oxirgi ko'chishlar. Ko'rinib turishi kerak: kabinet o'zgarishi
      // buyurtma QAYSI FIRMA nomida yaratilishini o'zgartiradi.
      shopMoves: all(
        `SELECT m.shop_id AS shopId, s.name AS shopName,
                m.from_cabinet_name AS fromName, m.to_cabinet_name AS toName,
                m.detected_at AS detectedAt
         FROM uzum_shop_moves m LEFT JOIN uzum_shops s ON s.shop_id = m.shop_id
         ORDER BY m.detected_at DESC, m.id DESC LIMIT 10`
      ),
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
      // Yangi kabinetdagi do'kon eskisida ham bo'lishi mumkin — bu KO'CHISH,
      // shuning uchun "Yangilash" bilan bir xil mantiq ishlatiladi.
      const result = applyShops({ id, name: name.trim() }, shops);
      clearShopNameCache();
      res.json({ ok: true, shops: shops.length, ...result });
    } catch (e) {
      res.json({ ok: true, shops: 0, warning: e.message });
    }
  });

  // Do'konlarni Uzum'dan qayta o'qish (nom o'zgargan, yangi do'kon qo'shilgan
  // yoki do'kon BOSHQA KABINETGA ko'chgan).
  //
  // Ko'chish alohida ishlanadi: ilgari do'kon eski kabinetda ham qolib
  // ketardi (yagona indeks `(cabinet_id, shop_id)` juftligida edi), natijada
  // bitta shop_id ikki kabinetda turib, `organization_href` tasodifiy
  // tanlanardi. Endi qator KO'CHIRILADI va hodisa tarixga yoziladi —
  // kabinet = MoySklad'dagi yuridik shaxs, ya'ni bu buyurtma qaysi firma
  // nomida yaratilishini o'zgartiradi.
  router.post("/uzum/cabinets/:id/sync", async (req, res) => {
    const cab = db.prepare("SELECT * FROM uzum_cabinets WHERE id = ?").get(Number(req.params.id));
    if (!cab) return res.status(404).json({ error: "Kabinet topilmadi" });
    try {
      const shops = await fetchUzumShops(cab.token);
      const { added, moved } = applyShops(cab, shops);
      clearShopNameCache();

      logger.info(
        `Uzum do'konlari yangilandi: ${cab.name} — ${shops.length} ta` +
          (added ? `, ${added} yangi` : "") +
          (moved.length ? `, ${moved.length} ta ko'chdi` : "")
      );
      for (const m of moved) {
        logger.info(`Do'kon ko'chdi: ${m.name} (${m.shopId}) ${m.from || "?"} → ${m.to}`);
      }

      res.json({ ok: true, shops: shops.length, added, moved });
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  // Do'kon ko'chishlari tarixi — "nega bu buyurtma boshqa firma nomida?"
  // degan savolga javob shu yerda.
  router.get("/uzum/shop-moves", (req, res) => {
    res.json({
      moves: all(
        `SELECT shop_id AS shopId, from_cabinet_name AS fromName, to_cabinet_name AS toName,
                detected_at AS detectedAt, source
         FROM uzum_shop_moves ORDER BY detected_at DESC, id DESC LIMIT 50`
      ),
    });
  });

  // Do'kon nomini qo'lda tuzatish — mobil ilovada ham shu nom ko'rinadi.
  // Shu bilan birga MoySklad havolasi, SKU prefiksi va qoldiq bayrog'i.
  router.patch("/uzum/shops/:id", (req, res) => {
    const { name, mcSaleschannelHref, skuCode, groupId } = req.body || {};
    const id = Number(req.params.id);
    const shop = db.prepare("SELECT * FROM uzum_shops WHERE id = ?").get(id);
    if (!shop) return res.status(404).json({ error: "Do'kon topilmadi" });
    if (name !== undefined && !name?.trim()) return res.status(400).json({ error: "Nom kerak" });

    db.prepare(
      `UPDATE uzum_shops SET name = ?, mc_saleschannel_href = ?, sku_code = ?, group_id = ? WHERE id = ?`
    ).run(
      name?.trim() || shop.name,
      mcSaleschannelHref === undefined ? shop.mc_saleschannel_href : mcSaleschannelHref?.trim() || null,
      skuCode === undefined ? shop.sku_code : skuCode?.trim() || null,
      groupId === undefined ? shop.group_id : Number(groupId) || null,
      id
    );
    clearShopNameCache();
    res.json({ ok: true });
  });

  /* ---------- do'kon guruhlari ---------- */

  // ID QO'LDA beriladi va butun son bo'ladi: operator mobil ilovada shu
  // raqamni ko'radi va buyurtmalarni shu bo'yicha saralaydi.
  router.post("/uzum/groups", (req, res) => {
    const { id, name } = req.body || {};
    const num = Number(id);
    if (!Number.isInteger(num) || num < 1) return res.status(400).json({ error: "ID butun son bo'lishi kerak (1 dan)" });
    if (!name?.trim()) return res.status(400).json({ error: "Nom kerak" });
    if (db.prepare("SELECT 1 FROM uzum_shop_groups WHERE id = ?").get(num)) {
      return res.status(400).json({ error: `${num} ID li guruh allaqachon bor` });
    }
    db.prepare("INSERT INTO uzum_shop_groups (id, name) VALUES (?, ?)").run(num, name.trim());
    clearShopNameCache();
    res.json({ ok: true });
  });

  router.patch("/uzum/groups/:id", (req, res) => {
    const { name } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: "Nom kerak" });
    db.prepare("UPDATE uzum_shop_groups SET name = ? WHERE id = ?").run(name.trim(), Number(req.params.id));
    clearShopNameCache();
    res.json({ ok: true });
  });

  router.delete("/uzum/groups/:id", (req, res) => {
    // Do'konlar `ON DELETE SET NULL` bilan guruhsiz qoladi — o'chirish
    // ma'lumot yo'qotmaydi.
    db.prepare("DELETE FROM uzum_shop_groups WHERE id = ?").run(Number(req.params.id));
    clearShopNameCache();
    res.json({ ok: true });
  });

  // Kabinetning MoySklad yuridik shaxsi (v3: uzum_token!D).
  router.patch("/uzum/cabinets/:id", (req, res) => {
    const { mcOrganizationHref } = req.body || {};
    const id = Number(req.params.id);
    if (!db.prepare("SELECT 1 FROM uzum_cabinets WHERE id = ?").get(id)) {
      return res.status(404).json({ error: "Kabinet topilmadi" });
    }
    db.prepare("UPDATE uzum_cabinets SET mc_organization_href = ? WHERE id = ?").run(
      mcOrganizationHref?.trim() || null,
      id
    );
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
