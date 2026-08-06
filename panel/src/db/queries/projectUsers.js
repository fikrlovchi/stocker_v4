const bcrypt = require("bcryptjs");
const db = require("../index");

// Panel admin paroli bilan bir xil kuch (scripts/hash-password.js ham 10 ishlatadi).
const BCRYPT_ROUNDS = 10;

// Login klaviaturadan tez yozilishi kerak (operator smena boshida telefonda
// kiritadi), shuning uchun faqat lotin kichik harf, raqam va `_ . -`.
const LOGIN_RE = /^[a-z0-9][a-z0-9_.-]{2,31}$/;

const stmts = {
  listForProject: db.prepare(
    "SELECT id, project_id, login, display_name, is_active, created_at FROM project_users WHERE project_id = ? ORDER BY login"
  ),
  listForApi: db.prepare(
    "SELECT login, display_name, password_hash, is_active FROM project_users WHERE project_id = ? ORDER BY login"
  ),
  get: db.prepare("SELECT * FROM project_users WHERE id = ?"),
  create: db.prepare(
    "INSERT INTO project_users (project_id, login, display_name, password_hash) VALUES (?, ?, ?, ?)"
  ),
  rename: db.prepare("UPDATE project_users SET display_name = ? WHERE id = ?"),
  setPassword: db.prepare("UPDATE project_users SET password_hash = ? WHERE id = ?"),
  setActive: db.prepare("UPDATE project_users SET is_active = ? WHERE id = ?"),
  remove: db.prepare("DELETE FROM project_users WHERE id = ?"),
};

function isValidLogin(login) {
  return LOGIN_RE.test(String(login || ""));
}

function hashPassword(password) {
  return bcrypt.hashSync(String(password), BCRYPT_ROUNDS);
}

function listForProject(projectId) {
  return stmts.listForProject.all(projectId);
}

// Loyihaning o'z servisi uchun — hash bilan, chunki tekshiruv mahalliy
// bajariladi (panel o'chsa ham operatorlar ishlayveradi).
function listForApi(projectId) {
  return stmts.listForApi.all(projectId).map((u) => ({ ...u, is_active: u.is_active === 1 }));
}

function get(id) {
  return stmts.get.get(id);
}

function create(projectId, login, displayName, password) {
  return stmts.create.run(projectId, login, displayName, hashPassword(password)).lastInsertRowid;
}

function rename(id, displayName) {
  stmts.rename.run(displayName, id);
}

function resetPassword(id, password) {
  stmts.setPassword.run(hashPassword(password), id);
}

function setActive(id, isActive) {
  stmts.setActive.run(isActive ? 1 : 0, id);
}

function remove(id) {
  stmts.remove.run(id);
}

module.exports = {
  MIN_PASSWORD_LENGTH: 4,
  isValidLogin,
  listForProject,
  listForApi,
  get,
  create,
  rename,
  resetPassword,
  setActive,
  remove,
};
