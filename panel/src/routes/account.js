const path = require("path");
const express = require("express");
const bcrypt = require("bcryptjs");
const envFileEditor = require("../services/envFileEditor");
const { recordAdminAction } = require("../services/auditLog");
const { ensureCsrfToken, verifyCsrf } = require("../middleware/csrf");

const router = express.Router();
const ENV_PATH = path.join(__dirname, "..", "..", ".env");

router.get("/account", (req, res) => {
  res.render("account", {
    csrfToken: ensureCsrfToken(req),
    actionMessage: req.query.ok,
    errorMessage: req.query.error,
  });
});

router.post("/account/password", verifyCsrf, (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (!bcrypt.compareSync(currentPassword || "", process.env.ADMIN_PASSWORD_HASH || "")) {
    return res.redirect(`/account?error=${encodeURIComponent("Joriy parol noto'g'ri")}`);
  }
  if (!newPassword || newPassword.length < 8) {
    return res.redirect(`/account?error=${encodeURIComponent("Yangi parol kamida 8 belgidan iborat bo'lishi kerak")}`);
  }
  if (newPassword !== confirmPassword) {
    return res.redirect(`/account?error=${encodeURIComponent("Yangi parol va tasdiqlash mos kelmadi")}`);
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  envFileEditor.updateEnvValues(ENV_PATH, { ADMIN_PASSWORD_HASH: newHash });
  process.env.ADMIN_PASSWORD_HASH = newHash;

  recordAdminAction("password_change", "admin", null);
  res.redirect("/account?ok=password_change");
});

module.exports = router;
