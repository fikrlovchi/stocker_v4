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
import { getUserByLogin, getPasswordHash, hasFlag, hasUsers, touchLogin } from "./users.js";

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

// Oxirgi sinxron natijasi — `/debug/operators` shuni ko'rsatadi. Ro'yxat bo'sh
// bo'lsa sababini shu yerdan bilish kerak: PANEL_* sozlanmaganmi, panel
// javob bermadimi, yoki panel'da haqiqatan operator yo'qmi.
let lastSync = { at: null, ok: false, error: "hali urinilmagan", count: null };

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
  // 2-bosqichdan keyin foydalanuvchilar shu bazaning `users` jadvalida —
  // panel'dan tortish kerak emas (panel ham shu faylni ishlatadi).
  if (hasUsers()) {
    lastSync = { at: nowIso(), ok: true, error: null, count: null, source: "users" };
    return { skipped: "users jadvali ishlatilyapti" };
  }

  if (!panelConfigured()) {
    const missing = [
      env.panel.ingestUrl || env.panel.usersUrl ? null : "PANEL_INGEST_URL",
      env.panel.apiKey ? null : "PANEL_API_KEY",
      env.panel.slug ? null : "PANEL_PROJECT_SLUG",
    ].filter(Boolean);
    lastSync = { at: nowIso(), ok: false, error: `sozlanmagan: ${missing.join(", ")}`, count: null };
    return { skipped: lastSync.error };
  }

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
    // 401 — kalit yoki slug noto'g'ri; 404 — manzil xato (nginx'ga tushib
    // ketgan bo'lishi mumkin). Xabarga javob boshini ham qo'shamiz.
    if (!res.ok) {
      const hint = (await res.text().catch(() => "")).slice(0, 120);
      throw new Error(`panel HTTP ${res.status}${hint ? ` — ${hint}` : ""}`);
    }

    const body = await res.json();
    const users = Array.isArray(body?.users) ? body.users : [];
    if (users.some((u) => !u.login || !u.passwordHash)) {
      throw new Error("panel javobida login yoki hash yo'q");
    }

    const result = applyPanelUsers(users);
    lastSync = { at: nowIso(), ok: true, error: null, count: result.total };
    if (result.removed || result.revoked) {
      logger.info(
        `Operatorlar sinxronlandi: ${result.total} ta` +
          (result.removed ? `, ${result.removed} ta o'chirildi` : "") +
          (result.revoked ? `, ${result.revoked} ta token bekor qilindi` : "")
      );
    }
    // Panel javob berdi, lekin ro'yxat bo'sh — eng ko'p uchraydigan sabab:
    // operator boshqa loyiha sahifasida qo'shilgan (API kalit loyihaga bog'liq).
    if (result.total === 0) {
      logger.warn(
        `Panel "${env.panel.slug}" loyihasi uchun bitta ham operator qaytarmadi — ` +
          "operatorlar aynan shu loyiha sahifasida qo'shilganini tekshiring."
      );
    }
    return result;
  } catch (e) {
    // Kesh saqlanib qoladi — panel yo'q bo'lgani login'ni to'xtatmaydi.
    lastSync = { at: nowIso(), ok: false, error: e.message, count: null };
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

// Kirishga haqli hisobni topadi. Ustuvorlik `users` jadvalida (yagona model,
// 2-bosqich); u bo'sh bo'lsa — panel'dan sinxronlangan eski `operators`
// keshi. Shu bilan ko'chirish paytida ham login uzilmaydi.
//
// `users` dagi hisob mobil ilovaga faqat `mobile` bayrog'i bilan kira oladi.
function lookupAccount(login, scope = "mobile") {
  const user = getUserByLogin(login);
  if (user) {
    return {
      login: user.login,
      displayName: user.displayName,
      passwordHash: getPasswordHash(user.login),
      // Bayroqsiz hisob (masalan faqat veb-panel uchun) telefondan kira olmaydi.
      isActive: user.isActive && (scope === "web" || hasFlag(user, "mobile")),
      source: "users",
      user,
    };
  }

  // Veb interfeys faqat `users` bilan ishlaydi: eski keshdagi operatorda
  // bo'lim ruxsatlari yo'q, ya'ni unga nima ko'rsatishni bilib bo'lmaydi.
  if (scope === "web") return null;

  const legacy = getOperator(login);
  if (!legacy) return null;
  return {
    login: legacy.login,
    displayName: legacy.display_name,
    passwordHash: legacy.password_hash,
    isActive: legacy.is_active === 1,
    source: "operators",
  };
}

export function listOperators() {
  return db
    .prepare("SELECT login, display_name, is_active, synced_at FROM operators ORDER BY login")
    .all()
    .map((o) => ({ login: o.login, displayName: o.display_name, isActive: o.is_active === 1, syncedAt: o.synced_at }));
}

// Diagnostika: ro'yxat bo'sh bo'lsa nima aynan yetishmayotgani ko'rinsin.
// Kalit qaytarilmaydi, faqat bor-yo'qligi.
export function operatorSyncStatus() {
  return {
    lastSync,
    panelConfigured: panelConfigured(),
    usersUrl: usersUrl() || null,
    projectSlug: env.panel.slug || null,
    apiKeySet: Boolean(env.panel.apiKey),
    tokenCount: db.prepare("SELECT COUNT(*) AS n FROM operator_tokens").get().n,
  };
}

// Muvaffaqiyatda { token, login, displayName }, aks holda { error, retryAfterMs? }.
//
// `scope`:
//   "mobile" (standart) — telefon ilovasi; `mobile` bayrog'i talab qilinadi
//   "web"              — veb interfeys; bayroq shart emas, lekin hisob
//                        `users` jadvalida bo'lishi kerak (eski `operators`
//                        keshidagilar veb'ga kira olmaydi — ularda ruxsat
//                        tushunchasi yo'q)
export function login({ login: rawLogin, password, device, ip, scope = "mobile" }) {
  const lock = lockedUntil(ip || "?");
  if (lock) return { error: "Ko'p urinish — birozdan keyin qayta kiring", retryAfterMs: lock - Date.now() };

  const account = lookupAccount(rawLogin, scope);
  const hash = account?.passwordHash || "";
  // Login topilmasa ham bcrypt chaqiriladi: javob vaqti bo'yicha login bor-yo'qligi
  // bilinmasin.
  const ok = bcrypt.compareSync(String(password || ""), hash || DUMMY_HASH);

  if (!account || !ok) {
    recordFailure(ip || "?");
    return { error: "Login yoki parol noto'g'ri" };
  }
  if (!account.isActive) {
    return { error: "Hisob faolsizlantirilgan" };
  }
  const operator = { login: account.login, display_name: account.displayName };

  failures.delete(ip || "?");

  const token = randomBytes(32).toString("hex");
  db.prepare(
    "INSERT INTO operator_tokens (token_hash, login, device, created_at, last_seen_at, scope) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(sha256(token), operator.login, device ? String(device).slice(0, 120) : null, nowIso(), nowIso(), scope);

  if (account.source === "users") touchLogin(account.login);
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

  const account = lookupAccount(row.login, row.scope || "mobile");
  if (!account || !account.isActive) return null;

  db.prepare("UPDATE operator_tokens SET last_seen_at = ? WHERE token_hash = ?").run(nowIso(), row.token_hash);
  return {
    login: account.login,
    displayName: account.displayName,
    scope: row.scope || "mobile",
    // Veb interfeys menyuni shu ro'yxatga qarab quradi; server esa har
    // so'rovda alohida tekshiradi (faqat menyuni yashirish yetarli emas).
    isSuperadmin: account.user?.isSuperadmin === true,
    sections: account.user?.sections || [],
    flags: account.user?.flags || [],
  };
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

    const result = login({ login: rawLogin, password, device, ip: req.ip, scope: "mobile" });
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
