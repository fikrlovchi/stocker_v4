// "Yorliqlar" bo'limi — uzumPDFs servisiga proxy (konsolidatsiya 3-bosqichi).
//
// Nega to'g'ridan-to'g'ri emas: SPA `Authorization: Bearer` bilan ishlaydi,
// `stocker.uz/pdf/` esa nginx `auth_request` orqali PANEL sessiyasini
// (cookie) so'raydi. Ikkalasi bir-birini tanimaydi. Shuning uchun so'rovlar
// shu serverdan o'tadi:
//
//   SPA ──Bearer──> stocker-server /web/labels/* ──> 127.0.0.1:4040 (uzumPDFs)
//
// Yon foydasi: ruxsat bizning `labels` bo'limi bo'yicha tekshiriladi va
// 4-bosqichda (jarayonlarni birlashtirish) shu qatlam o'z joyida qoladi.
//
// SHART: uzumPDFs `PANEL_AUTH=1` bilan ishlashi kerak — o'shanda u loopback'dan
// kelgan so'rovda o'z parolini so'ramaydi.
import express from "express";
import { config } from "../config.js";
import logger from "../logger.js";

const BASE = config.print.uzumPdfsBaseUrl.replace(/\/$/, "");

// PDF yasash sekin (Uzum API + merge) — ArrayBuffer'ni kutish uchun uzunroq.
const TIMEOUT_MS = 120000;

async function forward(path, { method = "GET", body = null } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      redirect: "manual",
    });

    // 302 → uzumPDFs o'z kirish sahifasiga yubormoqchi: PANEL_AUTH qo'yilmagan.
    if (res.status === 302 || res.status === 401) {
      throw new Error(
        "uzumPDFs kirish so'rayapti — uning .env fayliga PANEL_AUTH=1 qo'ying va pm2 restart qiling"
      );
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// Ikkilik javob (PDF) — baytlarni shundoq uzatamiz.
async function pipeBinary(res, upstream) {
  const buf = Buffer.from(await upstream.arrayBuffer());
  res.status(upstream.status);
  res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/pdf");
  res.send(buf);
}

export function labelsRouter() {
  const router = express.Router();

  // Yorliq yasash: {orderIds, pdfConfig} → {batchId}
  router.post("/process", async (req, res) => {
    try {
      const upstream = await forward("/process", { method: "POST", body: req.body });
      res.status(upstream.status).json(await upstream.json());
    } catch (e) {
      logger.error(`Yorliq yasashda xato: ${e.message}`);
      res.status(502).json({ error: e.message });
    }
  });

  // Holat: {shk: {...}, big: {...}} — SPA buni har 1.5 s da so'raydi.
  router.get("/batch/:id", async (req, res) => {
    try {
      const upstream = await forward(`/batch/${encodeURIComponent(req.params.id)}`);
      res.status(upstream.status).json(await upstream.json());
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  router.get("/history", async (req, res) => {
    try {
      const upstream = await forward("/history");
      res.status(upstream.status).json(await upstream.json());
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  // Konstruktor namunasi — PDF baytlari.
  router.post("/preview", async (req, res) => {
    try {
      await pipeBinary(res, await forward("/preview", { method: "POST", body: req.body }));
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  // Yasalgan fayllar. SPA ularni `fetch` bilan oladi va blob sifatida
  // ko'rsatadi — `<iframe src>` sarlavha yubora olmaydi, shuning uchun
  // to'g'ridan-to'g'ri havola qilib bo'lmaydi.
  router.get("/files/:name", async (req, res) => {
    // Faqat fayl nomi: `../` bilan boshqa yo'lga chiqib ketilmasin.
    const name = req.params.name.replace(/[^\w.\-]/g, "");
    try {
      await pipeBinary(res, await forward(`/files/${name}`));
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });

  return router;
}
