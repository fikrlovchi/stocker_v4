// Yig'ish API'si (mobil ilova uchun).
//
// Autentifikatsiya (8-faza): operator tokeni bilan kelinsa `req.operator`
// to'ladi va `operator` maydoni so'rov tanasidan OLINMAYDI — aks holda bir
// telefon boshqa operator nomidan yig'a olardi. Service token bilan kelgan
// so'rovlar (desktop client, diagnostika, selfTest) uchun eski tartib qoladi.
// Station tokeni 6.5 bandda qo'shiladi.
import express from "express";
import {
  scan,
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
    const { barcode, stationId } = req.body || {};
    const operator = who(req, req.body?.operator);
    if (!operator) return res.status(400).json({ error: "operator kerak" });
    if (barcode === undefined || barcode === null) {
      return res.status(400).json({ error: "barcode kerak" });
    }
    try {
      const result = await scan({ barcode, operator, stationId });
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

  router.get("/result-codes", (req, res) => res.json(RESULT));

  return router;
}
