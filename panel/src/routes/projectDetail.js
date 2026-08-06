const express = require("express");
const projects = require("../db/queries/projects");
const runs = require("../db/queries/runs");
const logEvents = require("../db/queries/logEvents");
const manageableUnits = require("../config/manageable-units");
const systemdControl = require("../services/systemdControl");
const telegramCatalog = require("../db/queries/telegramCatalog");
const sheetsCatalog = require("../db/queries/sheetsCatalog");
const apiTokens = require("../db/queries/apiTokens");
const projectUsers = require("../db/queries/projectUsers");
const uzumCatalog = require("../db/queries/uzumCatalog");
const variableLinks = require("../db/queries/variableLinks");
const envBindingsQuery = require("../db/queries/envBindings");
const { sourceLabel } = require("../services/envSourceResolver");
const { ensureCsrfToken } = require("../middleware/csrf");
const { formatTashkent } = require("../utils/formatDate");

// Katalog elementi nomidan yaroqli ENV kalit bo'lagini hosil qiladi:
// katta harf, harf/raqamdan boshqasi "_" ga, chetdagi "_" olib tashlanadi.
// Kirill yoki bo'sh nomdan hech nima qolmasa, chaqiruvchi zaxira (id) beradi.
function slugForEnv(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Uzum kabineti uchun ENV yorlig'i — cancelUzumOrder/packingUzumOrder
// servislari `UZUM_TOKEN_<YORLIQ>` va `UZUM_SHOP_<YORLIQ>_<...>` ni bir xil
// <YORLIQ> bo'yicha juftlashtiradi, shuning uchun kabinet tokeni va uning
// do'konlari hamisha shu yagona funksiyadan hosil qilinadi.
function cabinetEnvLabel(cabinet) {
  return slugForEnv(cabinet.name) || `CAB${cabinet.id}`;
}

// Loyiha sahifasidagi "Muhit sozlamalari" kartasida bitta select ichida barcha
// katalog turlarini optgroup qilib ko'rsatish uchun. Har bir option'ga tavsiya
// etilgan ENV kaliti (envKey) qo'shiladi — UI uni avtomatik to'ldiradi, admin
// istasa tahrirlaydi.
function buildEnvSourceGroups() {
  return [
    { label: "Telegram botlar", options: telegramCatalog.listBots().map((b) => ({ value: `telegram_bot:${b.id}`, text: b.name, envKey: "TELEGRAM_BOT_TOKEN" })) },
    {
      label: "Telegram chatlar",
      options: telegramCatalog.listFlatChatsWithBot().map((c) => ({ value: `telegram_chat:${c.id}`, text: `${c.name} (bot: ${c.bot.name})`, envKey: "TELEGRAM_CHAT_ID" })),
    },
    {
      label: "Telegram topiclar",
      options: telegramCatalog.listFlatTopicsWithChat().map((t) => ({ value: `telegram_topic:${t.id}`, text: `${t.chat.name} / ${t.name}`, envKey: "TELEGRAM_TOPIC_ID" })),
    },
    { label: "Tokenlar", options: apiTokens.list().map((t) => ({ value: `api_token:${t.id}`, text: t.name, envKey: `${slugForEnv(t.name) || `TOKEN${t.id}`}_TOKEN` })) },
    { label: "Uzum kabinetlar", options: uzumCatalog.listCabinets().map((c) => ({ value: `uzum_cabinet:${c.id}`, text: c.name, envKey: `UZUM_TOKEN_${cabinetEnvLabel(c)}` })) },
    {
      label: "Uzum do'konlar",
      options: uzumCatalog.listFlatShopsWithCabinet().map((s) => ({
        value: `uzum_shop:${s.id}`,
        text: `${s.cabinet.name} / ${s.name}`,
        envKey: `UZUM_SHOP_${cabinetEnvLabel(s.cabinet)}_${slugForEnv(s.name) || `SHOP${s.id}`}`,
      })),
    },
  ].filter((group) => group.options.length > 0);
}

const router = express.Router();
const PAGE_SIZE = 20;

// Soniyani eng o'qilishi qulay birlikka aylantiradi (forma uchun boshlang'ich qiymat).
function secondsToAmountUnit(totalSeconds) {
  if (totalSeconds == null) return { amount: "", unit: "min" };
  if (totalSeconds % 3600 === 0) return { amount: totalSeconds / 3600, unit: "h" };
  if (totalSeconds % 60 === 0) return { amount: totalSeconds / 60, unit: "min" };
  return { amount: totalSeconds, unit: "s" };
}

router.get("/projects/:slug", async (req, res) => {
  const project = projects.getBySlug(req.params.slug);
  if (!project) return res.status(404).send("Loyiha topilmadi");

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const totalRuns = runs.countForProject(project.id);
  const runList = runs.listForProject(project.id, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });

  const logsByRun = {};
  for (const r of runList) logsByRun[r.id] = logEvents.listForRun(r.id);

  const unit = manageableUnits[project.slug];
  const isManaged = Boolean(unit);
  // Timer bilan ishlaydigan loyiha (davriy) yoki doimiy daemon (stocker) —
  // "Boshqaruv" kartasi shu bo'yicha boshqa tugmalar ko'rsatadi.
  const hasTimer = Boolean(unit?.timerUnit);
  const intervalSeconds = systemdControl.getConfiguredIntervalSeconds(project.slug);
  const intervalInput = secondsToAmountUnit(intervalSeconds);

  let liveStatus = null;
  if (isManaged) {
    try {
      liveStatus = await systemdControl.getStatus(project.slug);
    } catch (e) {
      liveStatus = { error: e.message };
    }
  }

  const canManageEnv = Boolean(unit && unit.envPath);
  const envSourceGroups = canManageEnv ? buildEnvSourceGroups() : [];
  const envBindingRows = canManageEnv
    ? envBindingsQuery.listForProject(project.id).map((b) => ({ ...b, label: sourceLabel(b.source_type, b.source_id) }))
    : [];

  const sheets = sheetsCatalog.listSheets();
  const sheetLists = sheetsCatalog.listFlatListsWithSheet();
  const currentSheetLinks = variableLinks.listSheetLinksForProject(project.id);

  const operators = projectUsers.listForProject(project.id);

  res.render("project-detail", {
    project,
    runs: runList,
    logsByRun,
    totalRuns,
    page,
    pageSize: PAGE_SIZE,
    isManaged,
    hasTimer,
    intervalInput,
    liveStatus,
    canManageEnv,
    envSourceGroups,
    envBindingRows,
    sheets,
    sheetLists,
    currentSheetLinks,
    operators,
    minPasswordLength: projectUsers.MIN_PASSWORD_LENGTH,
    csrfToken: ensureCsrfToken(req),
    actionMessage: req.query.ok,
    errorMessage: req.query.error,
    formatTashkent,
  });
});

module.exports = router;
