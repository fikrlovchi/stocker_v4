const express = require("express");
const projects = require("../db/queries/projects");
const systemdControl = require("../services/systemdControl");
const envFileEditor = require("../services/envFileEditor");
const manageableUnits = require("../config/manageable-units");
const sheetsCatalog = require("../db/queries/sheetsCatalog");
const variableLinks = require("../db/queries/variableLinks");
const envBindings = require("../db/queries/envBindings");
const { resolveValue, sourceLabel } = require("../services/envSourceResolver");
const { recordAdminAction } = require("../services/auditLog");
const { verifyCsrf } = require("../middleware/csrf");

const router = express.Router();

const UNIT_SECONDS = { s: 1, min: 60, h: 3600 };

function redirectWithResult(res, slug, promise, okTag, detail) {
  promise
    .then(() => {
      recordAdminAction(okTag, slug, detail);
      res.redirect(`/projects/${slug}?ok=${okTag}`);
    })
    .catch((e) => {
      res.redirect(`/projects/${slug}?error=${encodeURIComponent(e.message)}`);
    });
}

router.post("/projects/:slug/interval", verifyCsrf, (req, res) => {
  const { slug } = req.params;
  const amount = parseFloat(req.body.amount);
  const unit = req.body.unit;

  if (!Number.isFinite(amount) || !UNIT_SECONDS[unit]) {
    return res.redirect(`/projects/${slug}?error=${encodeURIComponent("Interval qiymati yoki birligi noto'g'ri")}`);
  }
  const totalSeconds = Math.round(amount * UNIT_SECONDS[unit]);
  redirectWithResult(
    res,
    slug,
    systemdControl.setTimerInterval(slug, totalSeconds),
    "interval_change",
    `${amount} ${unit} (${totalSeconds}s)`
  );
});

router.post("/projects/:slug/env-bindings", verifyCsrf, (req, res) => {
  const { slug } = req.params;
  const unit = manageableUnits[slug];
  if (!unit || !unit.envPath) {
    return res.redirect(`/projects/${slug}?error=${encodeURIComponent("Bu loyiha uchun muhit sozlamalari mavjud emas")}`);
  }

  const project = projects.getBySlug(slug);
  const envKey = (req.body.envKey || "").trim().toUpperCase();
  const [sourceType, sourceIdRaw] = (req.body.source || "").split(":");
  const sourceId = parseInt(sourceIdRaw, 10);

  if (!envKey || !/^[A-Z_][A-Z0-9_]*$/.test(envKey)) {
    return res.redirect(`/projects/${slug}?error=${encodeURIComponent("ENV kaliti noto'g'ri (faqat harf/raqam/pastki chiziq)")}`);
  }
  const value = sourceId ? resolveValue(sourceType, sourceId) : null;
  if (value == null) {
    return res.redirect(`/projects/${slug}?error=${encodeURIComponent("Manba tanlanmadi yoki topilmadi")}`);
  }

  redirectWithResult(
    res,
    slug,
    Promise.resolve().then(() => {
      envFileEditor.updateEnvValues(unit.envPath, { [envKey]: value });
      envBindings.upsert(project.id, envKey, sourceType, sourceId);
    }),
    "env_binding_update",
    `${envKey} ← ${sourceLabel(sourceType, sourceId)}`
  );
});

router.post("/projects/:slug/env-bindings/:id/delete", verifyCsrf, (req, res) => {
  const { slug } = req.params;
  const unit = manageableUnits[slug];
  const binding = envBindings.getById(req.params.id);
  if (!unit || !unit.envPath || !binding) {
    return res.redirect(`/projects/${slug}?error=${encodeURIComponent("Bog'lanish topilmadi")}`);
  }

  redirectWithResult(
    res,
    slug,
    Promise.resolve().then(() => {
      envFileEditor.removeEnvKeys(unit.envPath, [binding.env_key]);
      envBindings.remove(binding.id);
    }),
    "env_binding_delete",
    binding.env_key
  );
});

router.post("/projects/:slug/sheets", verifyCsrf, (req, res) => {
  const { slug } = req.params;
  const project = projects.getBySlug(slug);
  if (!project) return res.redirect(`/projects/${slug}?error=${encodeURIComponent("Loyiha topilmadi")}`);

  const listIds = [].concat(req.body.listIds || []).map((v) => parseInt(v, 10)).filter(Boolean);
  const links = listIds.map((listId) => {
    const list = sheetsCatalog.getList(listId);
    return { sheetId: list.sheet_id, listId: list.id };
  });

  redirectWithResult(
    res,
    slug,
    Promise.resolve().then(() => variableLinks.setSheetLinks(project.id, links)),
    "sheets_update",
    `${links.length} ta list bog'landi`
  );
});

router.post("/projects/:slug/rename", verifyCsrf, (req, res) => {
  const { slug } = req.params;
  const displayName = (req.body.displayName || "").trim();
  if (!displayName) {
    return res.redirect(`/projects/${slug}?error=${encodeURIComponent("Nom bo'sh bo'lishi mumkin emas")}`);
  }

  redirectWithResult(
    res,
    slug,
    Promise.resolve().then(() => projects.updateDisplayName(slug, displayName)),
    "rename",
    displayName
  );
});

// To'xtatish/davom ettirish: timer bilan ishlaydigan loyihada timer, doimiy
// daemon'da (stocker) esa servisning o'zi to'xtatiladi — aks holda "to'xtatish"
// tugmasi hech nima qilmagan bo'lardi.
router.post("/projects/:slug/pause", verifyCsrf, (req, res) => {
  const { slug } = req.params;
  const stop = systemdControl.hasTimer(slug)
    ? systemdControl.pauseTimer(slug)
    : systemdControl.stopService(slug);
  redirectWithResult(res, slug, stop.then(() => projects.setPaused(slug, true)), "pause", null);
});

router.post("/projects/:slug/resume", verifyCsrf, (req, res) => {
  const { slug } = req.params;
  const start = systemdControl.hasTimer(slug)
    ? systemdControl.resumeTimer(slug)
    : systemdControl.startService(slug);
  redirectWithResult(res, slug, start.then(() => projects.setPaused(slug, false)), "resume", null);
});

router.post("/projects/:slug/run-now", verifyCsrf, (req, res) => {
  const { slug } = req.params;
  redirectWithResult(res, slug, systemdControl.runNow(slug), "run_now", null);
});

// Doimiy daemon uchun: kod yangilangandan keyin qayta ishga tushirish.
router.post("/projects/:slug/restart", verifyCsrf, (req, res) => {
  const { slug } = req.params;
  redirectWithResult(res, slug, systemdControl.restartService(slug), "restart", null);
});

router.get("/projects/:slug/status.json", async (req, res) => {
  try {
    const status = await systemdControl.getStatus(req.params.slug);
    res.json(status);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
