// MoySklad tokeni (Konfiguratsiya bo'limi).
//
// Token hech qachon to'liq qaytarilmaydi — faqat niqoblangan ko'rinishi va
// qayerdan kelayotgani (`.env` yoki baza). O'qish huquqi bor odam tokenni
// ko'chirib olib ketmasin.
import express from "express";
import { config } from "../config.js";
import { msFetch } from "../moysklad/client.js";
import { moyskladTokenInfo, setMoyskladToken, clearMoyskladToken } from "../moysklad/token.js";

export function moyskladRouter() {
  const router = express.Router();

  router.get("/", (req, res) => res.json(moyskladTokenInfo()));

  router.put("/token", (req, res) => {
    try {
      res.json(setMoyskladToken(req.body?.token, req.user?.login));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // Bazadagini olib tashlaydi — `.env` dagi qiymat yana ishlay boshlaydi.
  router.delete("/token", (req, res) => res.json(clearMoyskladToken(req.user?.login)));

  // Token haqiqiyligini tekshirish: eng arzon so'rov — joriy xodim.
  router.post("/test", async (req, res) => {
    try {
      const r = await msFetch(`${config.moysklad.baseUrl}/context/employee`, { method: "GET" });
      if (!r.ok) return res.json({ ok: false, error: `MoySklad ${r.status}` });
      const me = await r.json();
      res.json({ ok: true, name: me.name || me.shortFio || "—", email: me.email || null });
    } catch (e) {
      res.json({ ok: false, error: e.message });
    }
  });

  return router;
}
