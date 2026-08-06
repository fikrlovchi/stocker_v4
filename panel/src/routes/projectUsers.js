// Loyiha operatorlarini boshqarish (loyiha sahifasidagi "Operatorlar" kartasi).
//
// Parollar faqat bcrypt hash sifatida saqlanadi — panel'da ham ochiq matnda
// ko'rinmaydi. Admin parolni unutgan operator uchun yangisini o'rnatadi.
const express = require("express");
const projects = require("../db/queries/projects");
const projectUsers = require("../db/queries/projectUsers");
const { recordAdminAction } = require("../services/auditLog");
const { verifyCsrf } = require("../middleware/csrf");

const router = express.Router();

function back(res, slug, ok, error) {
  const qs = ok ? `ok=${encodeURIComponent(ok)}` : `error=${encodeURIComponent(error)}`;
  res.redirect(`/projects/${slug}?${qs}`);
}

// URL'dagi loyiha va operator id'sini juftlaydi: boshqa loyihaning operatorini
// id bilan tahrirlab yubormaslik uchun.
function resolve(req, res) {
  const project = projects.getBySlug(req.params.slug);
  if (!project) {
    back(res, req.params.slug, null, "Loyiha topilmadi");
    return null;
  }
  if (req.params.id === undefined) return { project, user: null };

  const user = projectUsers.get(req.params.id);
  if (!user || user.project_id !== project.id) {
    back(res, project.slug, null, "Operator topilmadi");
    return null;
  }
  return { project, user };
}

router.post("/projects/:slug/users", verifyCsrf, (req, res) => {
  const found = resolve(req, res);
  if (!found) return;
  const { project } = found;

  const login = (req.body.login || "").trim().toLowerCase();
  const displayName = (req.body.displayName || "").trim();
  const password = String(req.body.password || "");

  if (!projectUsers.isValidLogin(login)) {
    return back(res, project.slug, null, "Login 3–32 belgi: lotin kichik harf, raqam, _ . -");
  }
  if (!displayName) return back(res, project.slug, null, "To'liq ism to'ldirilishi shart");
  if (password.length < projectUsers.MIN_PASSWORD_LENGTH) {
    return back(res, project.slug, null, `Parol kamida ${projectUsers.MIN_PASSWORD_LENGTH} belgi bo'lishi kerak`);
  }

  try {
    projectUsers.create(project.id, login, displayName, password);
  } catch (e) {
    // UNIQUE (project_id, login)
    if (String(e.message).includes("UNIQUE")) {
      return back(res, project.slug, null, `"${login}" logini bu loyihada allaqachon bor`);
    }
    throw e;
  }

  recordAdminAction("project_user_create", project.slug, `${login} (${displayName})`);
  back(res, project.slug, "Operator qo'shildi");
});

router.post("/projects/:slug/users/:id/rename", verifyCsrf, (req, res) => {
  const found = resolve(req, res);
  if (!found) return;
  const { project, user } = found;

  const displayName = (req.body.displayName || "").trim();
  if (!displayName) return back(res, project.slug, null, "Ism bo'sh bo'lishi mumkin emas");

  projectUsers.rename(user.id, displayName);
  recordAdminAction("project_user_rename", project.slug, `${user.login} → ${displayName}`);
  back(res, project.slug, "Ism o'zgartirildi");
});

router.post("/projects/:slug/users/:id/password", verifyCsrf, (req, res) => {
  const found = resolve(req, res);
  if (!found) return;
  const { project, user } = found;

  const password = String(req.body.password || "");
  if (password.length < projectUsers.MIN_PASSWORD_LENGTH) {
    return back(res, project.slug, null, `Parol kamida ${projectUsers.MIN_PASSWORD_LENGTH} belgi bo'lishi kerak`);
  }

  projectUsers.resetPassword(user.id, password);
  recordAdminAction("project_user_password", project.slug, user.login);
  back(res, project.slug, `${user.login} paroli yangilandi`);
});

// Faolsizlantirish. Loyihaning servisi ro'yxatni qayta tortganda (stocker'da
// 60 s) shu operatorning ochiq sessiyasi uziladi — darhol emas, lekin
// panel bilan aloqa uzilganda ham ishlaydigan yechim shu.
router.post("/projects/:slug/users/:id/toggle", verifyCsrf, (req, res) => {
  const found = resolve(req, res);
  if (!found) return;
  const { project, user } = found;

  const next = user.is_active === 1 ? 0 : 1;
  projectUsers.setActive(user.id, next);
  recordAdminAction(next ? "project_user_enable" : "project_user_disable", project.slug, user.login);
  back(res, project.slug, next ? `${user.login} faollashtirildi` : `${user.login} faolsizlantirildi`);
});

router.post("/projects/:slug/users/:id/delete", verifyCsrf, (req, res) => {
  const found = resolve(req, res);
  if (!found) return;
  const { project, user } = found;

  projectUsers.remove(user.id);
  recordAdminAction("project_user_delete", project.slug, user.login);
  back(res, project.slug, "Operator o'chirildi");
});

module.exports = router;
