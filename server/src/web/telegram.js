// Telegram spravochnigi va integratsiyaga biriktirish (Konfiguratsiya bo'limi).
//
// Butun bo'lim `settings` ruxsati bilan yopilgan (routes.js) — bu yerda bot
// tokenlari bor.
import express from "express";
import * as tg from "../telegram/index.js";

// Biriktirish mumkin bo'lgan integratsiyalar — ATAYLAB qattiq kodlangan
// ro'yxat: ixtiyoriy kalit ostiga yozib qo'yilsa, u hech qachon o'qilmaydi
// va "sozladim" degan yolg'on tuyg'u qoladi.
export const INTEGRATIONS = [
  { key: "uzum_orders", label: "Uzum buyurtmalari" },
  { key: "uzum_stock", label: "Uzumga qoldiq yuborish" },
  { key: "mc_barcode", label: "Barcode → MoySklad" },
  { key: "packing", label: "Yig'ish" },
];

const INTEGRATION_KEYS = INTEGRATIONS.map((i) => i.key);

export function telegramRouter() {
  const router = express.Router();

  // Xato matni foydalanuvchiga ko'rinishi kerak (masalan "Bot ishlatilmoqda:
  // uzum_stock"), shuning uchun har route try/catch bilan o'ralmasin —
  // bitta yordamchi.
  const run = (fn) => (req, res) => {
    try {
      res.json(fn(req));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  };

  router.get("/", (req, res) => {
    res.json({
      bots: tg.listBots(),
      chats: tg.listChats(),
      chatTypes: tg.CHAT_TYPES,
      integrations: INTEGRATIONS.map((i) => ({ ...i, ...tg.getBinding(i.key) })),
    });
  });

  /* ---------- botlar ---------- */

  router.post("/bots", run((req) => {
    const { name, token, isActive } = req.body || {};
    if (!name?.trim() || !token?.trim()) throw new Error("Nom va token kerak");
    return { bot: tg.createBot({ name, token, isActive }, req.user?.login) };
  }));

  router.patch("/bots/:id", run((req) => ({
    bot: tg.updateBot(req.params.id, req.body || {}, req.user?.login),
  })));

  router.delete("/bots/:id", run((req) => {
    tg.removeBot(req.params.id);
    return { ok: true };
  }));

  // Token haqiqiyligini tekshirish — saqlashdan oldin bilib olish uchun.
  router.post("/bots/:id/test", async (req, res) => {
    try {
      res.json({ ok: true, ...(await tg.testBot(req.params.id)) });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  /* ---------- chatlar ---------- */

  router.post("/chats", run((req) => {
    const { name, chatId } = req.body || {};
    if (!name?.trim() || !String(chatId || "").trim()) throw new Error("Nom va chat ID kerak");
    return { chat: tg.createChat(req.body, req.user?.login) };
  }));

  router.patch("/chats/:id", run((req) => ({
    chat: tg.updateChat(req.params.id, req.body || {}, req.user?.login),
  })));

  router.delete("/chats/:id", run((req) => {
    tg.removeChat(req.params.id);
    return { ok: true };
  }));

  /* ---------- integratsiyaga biriktirish ---------- */

  router.put("/integrations/:key", run((req) => {
    if (!INTEGRATION_KEYS.includes(req.params.key)) throw new Error("Noma'lum integratsiya");
    const { botId, chatId } = req.body || {};
    return { binding: tg.setBinding(req.params.key, { botId, chatId }, req.user?.login) };
  }));

  // Sinov xabari — biriktirish to'g'ri ekaniga ishonch hosil qilish uchun.
  router.post("/integrations/:key/test", async (req, res) => {
    if (!INTEGRATION_KEYS.includes(req.params.key)) return res.status(400).json({ error: "Noma'lum integratsiya" });
    const label = INTEGRATIONS.find((i) => i.key === req.params.key).label;
    res.json(await tg.notify(req.params.key, `✅ Stocker sinov xabari — <b>${label}</b>`));
  });

  return router;
}
