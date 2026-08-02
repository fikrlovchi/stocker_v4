// Yig'ish API'si (mobil ilova uchun).
//
// 4-fazada autentifikatsiya hali yo'q: `operator` va `stationId` so'rov
// tanasidan olinadi, butun router esa X-Service-Token bilan yopilgan.
// 8-fazada operator JWT bilan almashadi (panel'dagi project_users),
// station esa QR juftlash orqali beriladigan doimiy token bilan.
import express from "express";
import {
  scan,
  getActiveSession,
  getSession,
  listActiveSessions,
  cancelSession,
  pendingPrintIntents,
  RESULT,
} from "./sessions.js";

export function scanRouter() {
  const router = express.Router();

  // Skan. Javob mobil ilova to'g'ridan-to'g'ri ko'rsata oladigan shaklda.
  router.post("/scan", async (req, res) => {
    const { barcode, operator, stationId } = req.body || {};
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
  router.get("/session", (req, res) => {
    const { operator, id } = req.query;
    if (id) {
      const s = getSession(String(id));
      return s ? res.json(s) : res.status(404).json({ error: "Sessiya topilmadi" });
    }
    if (!operator) return res.status(400).json({ error: "operator yoki id kerak" });
    const s = getActiveSession(String(operator));
    return s ? res.json(s) : res.status(404).json({ error: "Ochiq sessiya yo'q" });
  });

  router.post("/session/cancel", (req, res) => {
    const { operator, reason } = req.body || {};
    if (!operator) return res.status(400).json({ error: "operator kerak" });
    const s = cancelSession(String(operator), reason);
    return s ? res.json(s) : res.status(404).json({ error: "Ochiq sessiya yo'q" });
  });

  // Nazorat: hozir kim nimani yig'yapti.
  router.get("/sessions", (req, res) => res.json({ sessions: listActiveSessions() }));

  // 5-fazagacha: chop etish niyatlari shu yerda ko'rinadi.
  router.get("/print-intents", (req, res) => {
    res.json({ intents: pendingPrintIntents(req.query.sessionId ? String(req.query.sessionId) : null) });
  });

  router.get("/result-codes", (req, res) => res.json(RESULT));

  return router;
}
