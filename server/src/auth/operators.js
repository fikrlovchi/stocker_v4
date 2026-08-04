// Operator autentifikatsiyasi (8-faza).
//
// Manba fikrlovchi-panel'da (`project_users`), lekin tekshiruv MAHALLIY:
// panel'dan ro'yxat `auth.syncIntervalMs` da bir tortiladi va SQLite'ga
// yoziladi. Panel o'chsa ham operatorlar kirib ishlayveradi — uzumOrderToMC
// dagi "panel muammosi asosiy ishga ta'sir qilmaydi" tamoyili.
//
// Token: tasodifiy 32 bayt, mijozda ochiq holda, bazada faqat sha256 hash.
// Amal qilish muddati `auth.tokenTtlDays` — telefon har smenada qayta
// kiritmasligi uchun uzun.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { config, env } from "../config.js";
import { db } from "../db/index.js";
import logger from "../logger.js";

const AUTH = config.auth;

const nowIso = () => new Date().toISOString();
const sha256 = (value) => createHash("sha256").update(String(value)).digest("hex");

// Login topilmaganda ham bcrypt bir xil vaqt sarflashi uchun haqiqiy formatdagi
// hash kerak (yasama satr `compareSync` da xato beradi).
const DUMMY_HASH = bcrypt.hashSync(randomBytes(16).toString("hex"), 10);

/* ==================== panel'dan sinxronlash ==================== */

// PANEL_INGEST_URL `.../api/ingest/runs` ko'rinishida bo'ladi — operatorlar
// ro'yxati shu yerning yonida. Alohida o'zgaruvchi kerak bo'lsa
// PANEL_USERS_URL ustun turadi.
function usersUrl() {
  if (env.panel.usersUrl) return env.panel.usersUrl;
  if (!env.panel.ingestUrl) return "";
  return env.panel.ingestUrl.replace(/\/runs\/?$/, "/project-users");
}

function panelConfigured() {
  return Boolean(usersUrl() && env.panel.apiKey && env.panel.slug);
}

const upsertOperator = db.prepare(`
  INSERT INTO operators (login, display_name, password_hash, is_active, synced_at)
  VALUES (@login, @displayName, @passwordHash, @isActive, @syncedAt)
  ON CONFLICT(login) DO UPDATE SET
    display_name = excluded.display_name,
    password_hash = excluded.password_hash,
    is_active = excluded.is_active,
    synced_at = excluded.synced_at
`);

// Panel'dagi ro'yxatni keshga ko'chiradi. Panel'dan o'chirilgan yoki
// faolsizlantirilgan operatorning tokenlari darhol bekor qilinadi — shu bilan
// "faolsizlantirilganning ochiq sessiyasi uziladi" sharti bajariladi.
export const applyPanelUsers = db.transaction((users) => {
  const syncedAt = nowIso();
  for (const u of users) {
    upsertOperator.run({
      login: u.login,
      displayName: u.displayName || u.login,
      passwordHash: u.passwordHash,
      isActive: u.isActive ? 1 : 0,
      syncedAt,
    });
  }

  const keep = new Set(users.map((u) => u.login));
  let removed = 0;
  for (const row of db.prepare("SELECT login FROM operators").all()) {
    if (keep.has(row.login)) continue;
    db.prepare("DELETE FROM operators WHERE login = ?").run(row.login);
    removed += 1;
  }

  const revoked = db
    .prepare(
      "DELETE FROM operator_tokens WHERE login NOT IN (SELECT login FROM operators WHERE is_active = 1)"
    )
    .run().changes;

  return { total: users.length, removed, revoked };
});

export async function syncOperators() {
  if (!panelConfigured()) return { skipped: "panel sozlanmagan" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(usersUrl(), {
      headers: {
        Authorization: "Bearer " + env.panel.apiKey,
        "X-Project-Slug": env.panel.slug,
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`panel HTTP ${res.status}`);

    const body = await res.json();
    const users = Array.isArray(body?.users) ? body.users : [];
    if (users.some((u) => !u.login || !u.passwordHash)) {
      throw new Error("panel javobida login yoki hash yo'q");
    }

    const result = applyPanelUsers(users);
    if (result.removed || result.revoked) {
      logger.info(
        `Operatorlar sinxronlandi: ${result.total} ta` +
          (result.removed ? `, ${result.removed} ta o'chirildi` : "") +
          (result.revoked ? `, ${result.revoked} ta token bekor qilindi` : "")
      );
    }
    return result;
  } catch (e) {
    // Kesh saqlanib qoladi — panel yo'q bo'lgani login'ni to'xtatmaydi.
    logger.warn(`Operatorlarni panel'dan olish muvaffaqiyatsiz: ${e.message}`);
    return { error: e.message };
  } finally {
    clearTimeout(timeout);
  }
}

export function startOperatorSync() {
  if (!panelConfigured()) {
    logger.warn("PANEL_* sozlanmagan — operator ro'yxati keshdagidek qoladi.");
    return;
  }
  const timer = setInterval(() => {
    syncOperators().catch(() => {});
  }, AUTH.syncIntervalMs);
  timer.unref();
}

/* ==================== login ==================== */

const failures = new Map(); // ip -> { count, lockUntil }

function lockedUntil(ip) {
  const entry = failures.get(ip);
  if (!entry?.lockUntil) return 0;
  if (Date.now() >= entry.lockUntil) {
    failures.delete(ip);
    return 0;
  }
  return entry.lockUntil;
}

function recordFailure(ip) {
  const entry = failures.get(ip) || { count: 0 };
  entry.count += 1;
  if (entry.count >= AUTH.maxFailedAttempts) entry.lockUntil = Date.now() + AUTH.lockoutMs;
  failures.set(ip, entry);
}

export function getOperator(login) {
  return db.prepare("SELECT * FROM operators WHERE login = ?").get(String(login || "").trim().toLowerCase());
}

export function listOperators() {
  return db
    .prepare("SELECT login, display_name, is_active, synced_at FROM operators ORDER BY login")
    .all()
    .map((o) => ({ login: o.login, displayName: o.display_name, isActive: o.is_active === 1, syncedAt: o.synced_at }));
}

// Muvaffaqiyatda { token, login, displayName }, aks holda { error, retryAfterMs? }.
export function login({ login: rawLogin, password, device, ip }) {
  const lock = lockedUntil(ip || "?");
  if (lock) return { error: "Ko'p urinish — birozdan keyin qayta kiring", retryAfterMs: lock - Date.now() };

  const operator = getOperator(rawLogin);
  const hash = operator?.password_hash || "";
  // Login topilmasa ham bcrypt chaqiriladi: javob vaqti bo'yicha login bor-yo'qligi
  // bilinmasin.
  const ok = bcrypt.compareSync(String(password || ""), hash || DUMMY_HASH);

  if (!operator || !ok) {
    recordFailure(ip || "?");
    return { error: "Login yoki parol noto'g'ri" };
  }
  if (operator.is_active !== 1) {
    return { error: "Hisob faolsizlantirilgan" };
  }

  failures.delete(ip || "?");

  const token = randomBytes(32).toString("hex");
  db.prepare(
    "INSERT INTO operator_tokens (token_hash, login, device, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)"
  ).run(sha256(token), operator.login, device ? String(device).slice(0, 120) : null, nowIso(), nowIso());

  logger.info(`Operator kirdi: ${operator.login} (${operator.display_name})${device ? ` — ${device}` : ""}`);
  return { token, login: operator.login, displayName: operator.display_name };
}

export function logout(token) {
  return db.prepare("DELETE FROM operator_tokens WHERE token_hash = ?").run(sha256(token)).changes > 0;
}

// Token bo'yicha operatorni qaytaradi (yaroqsiz bo'lsa null).
export function resolveToken(token) {
  if (!token) return null;
  const row = db.prepare("SELECT * FROM operator_tokens WHERE token_hash = ?").get(sha256(token));
  if (!row) return null;

  const ageMs = Date.now() - Date.parse(row.created_at);
  if (Number.isFinite(ageMs) && ageMs > AUTH.tokenTtlDays * 86400000) {
    db.prepare("DELETE FROM operator_tokens WHERE token_hash = ?").run(row.token_hash);
    return null;
  }

  const operator = getOperator(row.login);
  if (!operator || operator.is_active !== 1) return null;

  db.prepare("UPDATE operator_tokens SET last_seen_at = ? WHERE token_hash = ?").run(nowIso(), row.token_hash);
  return { login: operator.login, displayName: operator.display_name };
}

function bearer(req) {
  const header = req.header("Authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function serviceTokenMatches(req) {
  const given = req.header("X-Service-Token") || "";
  if (!env.serviceToken || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(env.serviceToken);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Yig'ish API'si uchun: operator tokeni YOKI service token.
//
// Service token qoldirildi — desktop client, diagnostika va selfTest shu bilan
// ishlaydi. Operator tokeni bilan kelganda `req.operator` to'ldiriladi va
// so'rov tanasidagi `operator` maydoni e'tiborga olinmaydi (o'zgani nomidan
// yig'ib bo'lmasligi uchun).
export function requireOperatorOrService(req, res, next) {
  const token = bearer(req);
  if (token) {
    const operator = resolveToken(token);
    if (!operator) return res.status(401).json({ error: "Sessiya tugagan — qayta kiring", code: "token_invalid" });
    req.operator = operator;
    return next();
  }
  if (serviceTokenMatches(req)) return next();
  return res.status(401).json({ error: "Autentifikatsiya kerak", code: "auth_required" });
}

export function pruneExpiredTokens() {
  const cutoff = new Date(Date.now() - AUTH.tokenTtlDays * 86400000).toISOString();
  return db.prepare("DELETE FROM operator_tokens WHERE created_at < ?").run(cutoff).changes;
}

export function authRouter(express) {
  const router = express.Router();

  router.post("/login", (req, res) => {
    const { login: rawLogin, password, device } = req.body || {};
    if (!rawLogin || !password) return res.status(400).json({ error: "login va parol kerak" });

    const result = login({ login: rawLogin, password, device, ip: req.ip });
    if (result.error) return res.status(401).json(result);
    res.json(result);
  });

  router.post("/logout", (req, res) => {
    const token = bearer(req);
    if (!token) return res.status(400).json({ error: "token kerak" });
    res.json({ ok: logout(token) });
  });

  // Ilova ochilganda tokenning hali yaroqliligini tekshiradi.
  router.get("/me", (req, res) => {
    const operator = resolveToken(bearer(req));
    if (!operator) return res.status(401).json({ error: "Sessiya tugagan", code: "token_invalid" });
    res.json(operator);
  });

  return router;
}
