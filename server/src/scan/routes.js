// Yig'ish API'si (mobil ilova uchun).
//
// Autentifikatsiya (8-faza): operator tokeni bilan kelinsa `req.operator`
// to'ladi va `operator` maydoni so'rov tanasidan OLINMAYDI — aks holda bir
// telefon boshqa operator nomidan yig'a olardi. Service token bilan kelgan
// so'rovlar (desktop client, diagnostika, selfTest) uchun eski tartib qoladi.
// Station tokeni 6.5 bandda qo'shiladi.
import express from "express";
import { openBatch, batchShops } from "../packing/batches.js";
import { packedHistory } from "../packing/history.js";
import {
  scan,
  printBig,
  printShk,
  reprintSession,
  getActiveSession,
  getLastSession,
  getSession,
  listActiveSessions,
  cancelSession,
  sessionJobs,
  reprintJob,
  RESULT,
} from "./sessions.js";

export function scanRouter() {
  const router = express.Router();

  // Operator tokeni bo'lsa — u; bo'lmasa (service token) so'rov tanasidagi nom.
  const who = (req, fromBody) => req.operator?.login || fromBody;

  // Skan. Javob mobil ilova to'g'ridan-to'g'ri ko'rsata oladigan shaklda.
  router.post("/scan", async (req, res) => {
    // `shopId` — operator ekranda tanlagan do'kon. Berilsa skan doirasi
    // shu do'kon bilan cheklanadi: tanlanmagan do'konning buyurtmasi
    // ochilib, uning yorlig'i chop etilib ketmasin.
    const { barcode, stationId, shopId } = req.body || {};
    const operator = who(req, req.body?.operator);
    if (!operator) return res.status(400).json({ error: "operator kerak" });
    if (barcode === undefined || barcode === null) {
      return res.status(400).json({ error: "barcode kerak" });
    }
    try {
      const result = await scan({ barcode, operator, stationId, shopId: shopId || null });
      // Xato natijalar ham 200 bilan qaytadi — ilova `result` maydoniga
      // qarab ovoz/vibratsiya beradi, HTTP xatosi emas.
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Joriy sessiya — telefon qayta ulanganda holatni tiklaydi.
  // ?last=1 — ochiq sessiya bo'lmasa oxirgi yopilganini qaytaradi (qayta
  // chiqarish uchun kerak: buyurtma yig'ilgach ham yorliqni qayta bosish mumkin).
  router.get("/session", (req, res) => {
    const { id, last } = req.query;
    const operator = who(req, req.query.operator);
    if (id) {
      const s = getSession(String(id));
      return s ? res.json(s) : res.status(404).json({ error: "Sessiya topilmadi" });
    }
    if (!operator) return res.status(400).json({ error: "operator yoki id kerak" });

    const active = getActiveSession(String(operator));
    if (active) return res.json(active);
    if (last === "1") {
      const prev = getLastSession(String(operator));
      if (prev) return res.json(prev);
    }
    return res.status(404).json({ error: "Ochiq sessiya yo'q" });
  });

  // Qayta chiqarish — yorliq buzuq chiqqanda yoki yo'qolganda.
  router.post("/reprint", (req, res) => {
    const { jobId, stationId } = req.body || {};
    if (!jobId) return res.status(400).json({ error: "jobId kerak" });
    const job = reprintJob(String(jobId), { stationId });
    return job ? res.json(job) : res.status(404).json({ error: "Job topilmadi" });
  });

  router.post("/session/cancel", (req, res) => {
    const { reason } = req.body || {};
    const operator = who(req, req.body?.operator);
    if (!operator) return res.status(400).json({ error: "operator kerak" });
    const s = cancelSession(String(operator), reason);
    return s ? res.json(s) : res.status(404).json({ error: "Ochiq sessiya yo'q" });
  });

  // Nazorat: hozir kim nimani yig'yapti.
  router.get("/sessions", (req, res) => res.json({ sessions: listActiveSessions() }));

  // Sessiyaning chop etish joblari (holati, urinishlari bilan).
  router.get("/jobs", (req, res) => {
    if (!req.query.sessionId) return res.status(400).json({ error: "sessionId kerak" });
    res.json({ jobs: sessionJobs(String(req.query.sessionId)) });
  });

  /* ---------- mobil ilova: do'konlar, Print, tarix ---------- */

  // Ochiq partiyadagi do'konlar va ularda nechta buyurtma qolgani.
  // Telefon ekranining yuqori chap burchagi shu ro'yxatdan to'ladi.
  router.get("/shops", (req, res) => {
    const batch = openBatch();
    if (!batch) return res.json({ batch: null, shops: [] });
    res.json({ batch: { id: batch.id, name: batch.name, total: batch.total, packed: batch.packed },
               shops: batchShops(batch.id) });
  });

  // "Print" tugmasi: BIG yorlig'ini chiqarish. Sessiya to'liq skanerlangan
  // bo'lishi shart; ikki marta bosilsa ikkinchi yorliq yasalmaydi.
  router.post("/session/print", (req, res) => {
    const operator = who(req, req.body?.operator);
    const sessionId = req.body?.sessionId || getActiveSession(String(operator))?.id
      || getLastSession(String(operator))?.id;
    if (!sessionId) return res.status(404).json({ error: "Sessiya topilmadi" });

    const result = printBig(String(sessionId), String(operator));
    if (result.error) return res.status(result.code === "not_complete" ? 409 : 400).json(result);
    res.json(result);
  });

  // ShK — operator bosganda. Skan paytida avtomatik chiqmaydi
  // (config.packing.autoShkPrint = false), shuning uchun shu tugma kerak.
  router.post("/session/print-shk", (req, res) => {
    const operator = who(req, req.body?.operator);
    const sessionId = req.body?.sessionId || getActiveSession(String(operator))?.id
      || getLastSession(String(operator))?.id;
    if (!sessionId) return res.status(404).json({ error: "Sessiya topilmadi" });

    const result = printShk(String(sessionId), String(operator));
    if (result.error) return res.status(400).json(result);
    res.json(result);
  });

  // Tarixdan qayta chiqarish: ShK, BIG yoki ikkalasi.
  router.post("/session/reprint", (req, res) => {
    const operator = who(req, req.body?.operator);
    const { sessionId, target } = req.body || {};
    if (!sessionId) return res.status(400).json({ error: "sessionId kerak" });

    const result = reprintSession(String(sessionId), String(operator), String(target || "both"));
    if (result.error) return res.status(400).json(result);
    res.json(result);
  });

  // "Men nima yig'dim" — sana, buyurtma va tarkibi bilan.
  router.get("/my-packed", (req, res) => {
    const operator = who(req, req.query.operator);
    if (!operator) return res.status(400).json({ error: "operator kerak" });
    res.json({ orders: packedHistory(String(operator), Math.min(Number(req.query.limit) || 50, 200)) });
  });

  router.get("/result-codes", (req, res) => res.json(RESULT));

  return router;
}
