const crypto = require("crypto");
const express = require("express");
const projects = require("../db/queries/projects");
const runs = require("../db/queries/runs");
const logEvents = require("../db/queries/logEvents");
const projectUsers = require("../db/queries/projectUsers");

const router = express.Router();

const MAX_LOGS = 500;
const MAX_MESSAGE_LEN = 4000;
const VALID_STATUS = new Set(["success", "partial", "error"]);
const VALID_LEVEL = new Set(["INFO", "ERROR"]);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function authenticateProject(req, res, next) {
  const slug = req.header("X-Project-Slug");
  const authHeader = req.header("Authorization") || "";
  const apiKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!slug || !apiKey) return res.status(401).json({ error: "Autentifikatsiya sarlavhalari yo'q" });

  const project = projects.getBySlug(slug);
  if (!project) return res.status(401).json({ error: "Noma'lum loyiha" });

  if (!safeEqual(sha256(apiKey), project.api_key_hash)) {
    return res.status(401).json({ error: "API kalit noto'g'ri" });
  }

  req.project = project;
  next();
}

function isIsoDate(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

router.post("/runs", authenticateProject, (req, res) => {
  const body = req.body || {};
  const { startedAt, finishedAt, status, successCount, errorCount, summary, logs } = body;

  if (!isIsoDate(startedAt) || !isIsoDate(finishedAt)) {
    return res.status(400).json({ error: "startedAt/finishedAt yaroqli ISO sana bo'lishi kerak" });
  }
  if (Date.parse(finishedAt) < Date.parse(startedAt)) {
    return res.status(400).json({ error: "finishedAt startedAt'dan oldin bo'lishi mumkin emas" });
  }
  if (!VALID_STATUS.has(status)) {
    return res.status(400).json({ error: "status noto'g'ri (success|partial|error kutilgan)" });
  }
  if (!Number.isInteger(successCount) || successCount < 0 || !Number.isInteger(errorCount) || errorCount < 0) {
    return res.status(400).json({ error: "successCount/errorCount manfiy bo'lmagan butun son bo'lishi kerak" });
  }
  if (!Array.isArray(logs) || logs.length > MAX_LOGS) {
    return res.status(400).json({ error: `logs massiv bo'lishi va ${MAX_LOGS} tadan oshmasligi kerak` });
  }
  for (const entry of logs) {
    if (!entry || !VALID_LEVEL.has(entry.level) || typeof entry.message !== "string" || !isIsoDate(entry.loggedAt)) {
      return res.status(400).json({ error: "logs ichidagi har bir yozuv {level, message, loggedAt} bo'lishi kerak" });
    }
  }

  const runId = runs.insert({
    projectId: req.project.id,
    startedAt,
    finishedAt,
    status,
    successCount,
    errorCount,
    summary: typeof summary === "string" ? summary.slice(0, 500) : null,
  });

  logEvents.insertMany(
    runId,
    req.project.id,
    logs.map((e) => ({ level: e.level, message: e.message.slice(0, MAX_MESSAGE_LEN), loggedAt: e.loggedAt }))
  );

  res.status(201).json({ runId });
});

router.get("/ping", authenticateProject, (req, res) => {
  res.json({ ok: true });
});

// Loyihaning operatorlari — servis o'zida keshlab, login'ni mahalliy tekshiradi.
// Hash uzatiladi (ochiq parol emas): panel o'chib qolsa ham operatorlar
// ishlayveradi, lekin panel'dan tashqarida parol tiklash imkoni yo'q.
// Faolsizlantirilganlar ham ro'yxatda qoladi — servis ularning tokenini
// bekor qilishi uchun `isActive: false` ni bilishi kerak.
router.get("/project-users", authenticateProject, (req, res) => {
  res.json({
    users: projectUsers.listForApi(req.project.id).map((u) => ({
      login: u.login,
      displayName: u.display_name,
      passwordHash: u.password_hash,
      isActive: u.is_active,
    })),
  });
});

module.exports = router;
