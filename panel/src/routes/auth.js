const express = require("express");
const bcrypt = require("bcryptjs");
const { isLockedOut, recordFailure, clearFailures } = require("../middleware/auth");

const router = express.Router();

router.get("/login", (req, res) => {
  if (req.session.isAdmin) return res.redirect("/");
  res.render("login", { error: null });
});

router.post("/login", (req, res) => {
  const ip = req.ip;
  if (isLockedOut(ip)) {
    return res
      .status(429)
      .render("login", { error: "Juda ko'p urinish. 5 daqiqadan so'ng qayta urinib ko'ring." });
  }

  const { username, password } = req.body;
  const validUser = username === process.env.ADMIN_USERNAME;
  const validPass = validUser && bcrypt.compareSync(password || "", process.env.ADMIN_PASSWORD_HASH || "");

  if (!validUser || !validPass) {
    recordFailure(ip);
    return res.status(401).render("login", { error: "Login yoki parol noto'g'ri." });
  }

  clearFailures(ip);
  req.session.isAdmin = true;
  req.session.save(() => res.redirect("/"));
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

module.exports = router;
