const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

const failedAttempts = new Map(); // ip -> { count, lockUntil }

function isLockedOut(ip) {
  const entry = failedAttempts.get(ip);
  if (!entry || !entry.lockUntil) return false;
  if (Date.now() < entry.lockUntil) return true;
  failedAttempts.delete(ip);
  return false;
}

function recordFailure(ip) {
  const entry = failedAttempts.get(ip) || { count: 0 };
  entry.count += 1;
  if (entry.count >= LOCKOUT_THRESHOLD) entry.lockUntil = Date.now() + LOCKOUT_MS;
  failedAttempts.set(ip, entry);
}

function clearFailures(ip) {
  failedAttempts.delete(ip);
}

function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.redirect("/login");
}

module.exports = { requireAuth, isLockedOut, recordFailure, clearFailures };
