// Chop etish bilan bog'liq HTTP endpointlar.
import express from "express";
import logger from "../logger.js";
import { getJob, listJobs, queueStats, listStations, ackJob } from "./jobs.js";
import { fetchJobPdf, fetchTestPage } from "./pdf.js";
import { connectedStations, dispatchTo } from "./hub.js";

// PDF yuklab olish — AUTHENTIFIKATSIYA job'ning bir martalik `fetch_token`i
// orqali. Desktop client service token'ni umuman ko'rmaydi.
export function jobPdfRouter() {
  const router = express.Router();

  router.get("/:id/pdf", async (req, res) => {
    const job = getJob(req.params.id);
    if (!job) return res.status(404).json({ error: "Job topilmadi" });
    if (req.query.t !== job.fetchToken) return res.status(401).json({ error: "Token noto'g'ri" });

    try {
      const pdf = await fetchJobPdf(job);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${job.target}_${job.orderId}.pdf"`);
      res.setHeader("Cache-Control", "no-store");
      return res.send(pdf);
    } catch (e) {
      logger.error(`PDF olinmadi (${job.target} ${job.orderId}): ${e.message}`);
      return res.status(502).json({ error: e.message });
    }
  });

  return router;
}

// Diagnostika / nazorat (service token bilan).
export function printAdminRouter() {
  const router = express.Router();

  router.get("/queue", (req, res) => {
    res.json({
      stats: queueStats(),
      connected: connectedStations(),
      jobs: listJobs({
        stationId: req.query.stationId ? String(req.query.stationId) : undefined,
        sessionId: req.query.sessionId ? String(req.query.sessionId) : undefined,
        status: req.query.status ? String(req.query.status) : undefined,
        limit: Math.min(Number(req.query.limit) || 50, 200),
      }),
    });
  });

  router.get("/stations", (req, res) => {
    const connected = new Set(connectedStations());
    res.json({ stations: listStations().map((s) => ({ ...s, online: connected.has(s.id) })) });
  });

  // Ulangan station'ga kutayotgan joblarni darhol yuborish.
  router.post("/dispatch", (req, res) => {
    const stationId = req.body?.stationId;
    if (!stationId) return res.status(400).json({ error: "stationId kerak" });
    res.json({ sent: dispatchTo(String(stationId)) });
  });

  // Sinov sahifasi — desktop client printerni sozlashda ishlatadi.
  router.get("/test-page", async (req, res) => {
    const target = req.query.target === "big" ? "big" : "shk";
    try {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Cache-Control", "no-store");
      return res.send(await fetchTestPage(target));
    } catch (e) {
      return res.status(502).json({ error: e.message });
    }
  });

  // Client'siz sinash: ACK'ni qo'lda yuborish.
  router.post("/ack", (req, res) => {
    const { jobId, ok = true, error } = req.body || {};
    if (!jobId) return res.status(400).json({ error: "jobId kerak" });
    const job = ackJob(String(jobId), { ok, error });
    return job ? res.json(job) : res.status(404).json({ error: "Job topilmadi" });
  });

  return router;
}
