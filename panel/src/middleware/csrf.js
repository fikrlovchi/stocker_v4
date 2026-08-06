const crypto = require("crypto");

function ensureCsrfToken(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString("hex");
  }
  return req.session.csrfToken;
}

function verifyCsrf(req, res, next) {
  const token = req.body._csrf || req.header("X-CSRF-Token");
  if (!token || token !== req.session.csrfToken) {
    return res.status(403).send("CSRF token noto'g'ri yoki eskirgan. Sahifani yangilab qayta urinib ko'ring.");
  }
  next();
}

module.exports = { ensureCsrfToken, verifyCsrf };
