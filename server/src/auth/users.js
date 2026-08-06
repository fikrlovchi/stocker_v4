// Foydalanuvchilar, ruxsatlar va bayroqlar (konsolidatsiya 2-bosqichi).
//
// Bitta jadval hamma uchun: superadmin ham, ombor operatori ham. Farq —
// `is_superadmin` va biriktirilgan bo'limlarda. Mobil ilovaga faqat
// `mobile` bayrog'i borlar kira oladi.
//
// Nega panel'dan sinxron emas: endi panel va yig'ish serveri BITTA SQLite
// faylini ishlatadi (config.dbFile → repo ildizidagi data/stocker.db),
// shuning uchun ro'yxatni tarmoq orqali tortish kerak emas.
import bcrypt from "bcryptjs";
import { db } from "../db/index.js";
import { isValidFlag, isValidSection, SECTION_KEYS } from "./sections.js";

const BCRYPT_ROUNDS = 10;
const LOGIN_RE = /^[a-z0-9][a-z0-9_.-]{2,31}$/;

export const MIN_PASSWORD_LENGTH = 4;

export function isValidLogin(login) {
  return LOGIN_RE.test(String(login || ""));
}

export function hashPassword(password) {
  return bcrypt.hashSync(String(password), BCRYPT_ROUNDS);
}

const norm = (login) => String(login || "").trim().toLowerCase();

/* ==================== o'qish ==================== */

function shape(row) {
  if (!row) return null;
  const sections = db
    .prepare("SELECT section FROM user_permissions WHERE user_id = ? ORDER BY section")
    .all(row.id)
    .map((r) => r.section);
  const flags = db
    .prepare("SELECT flag FROM user_flags WHERE user_id = ? ORDER BY flag")
    .all(row.id)
    .map((r) => r.flag);

  return {
    id: row.id,
    login: row.login,
    displayName: row.display_name,
    isActive: row.is_active === 1,
    isSuperadmin: row.is_superadmin === 1,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    // Superadmin uchun ro'yxat to'liq — jadvalga qaralmaydi.
    sections: row.is_superadmin === 1 ? [...SECTION_KEYS] : sections,
    flags: row.is_superadmin === 1 ? [...new Set([...flags, "mobile"])] : flags,
  };
}

export function getUserById(id) {
  return shape(db.prepare("SELECT * FROM users WHERE id = ?").get(id));
}

export function getUserByLogin(login) {
  return shape(db.prepare("SELECT * FROM users WHERE login = ?").get(norm(login)));
}

// Parolni tekshirish uchun hash kerak — u shape() dan ataylab chiqarilmaydi.
export function getPasswordHash(login) {
  const row = db.prepare("SELECT password_hash FROM users WHERE login = ?").get(norm(login));
  return row ? row.password_hash : null;
}

export function listUsers() {
  return db.prepare("SELECT * FROM users ORDER BY is_superadmin DESC, login").all().map(shape);
}

export function hasUsers() {
  return db.prepare("SELECT COUNT(*) AS n FROM users").get().n > 0;
}

export function can(user, section) {
  if (!user || !user.isActive) return false;
  if (user.isSuperadmin) return true;
  return user.sections.includes(section);
}

export function hasFlag(user, flag) {
  if (!user || !user.isActive) return false;
  if (user.isSuperadmin) return true;
  return user.flags.includes(flag);
}

/* ==================== yozish ==================== */

export function createUser({ login, displayName, password, isSuperadmin = false, sections = [], flags = [] }) {
  const l = norm(login);
  if (!isValidLogin(l)) throw new Error("Login 3–32 belgi: lotin kichik harf, raqam, _ . -");
  if (!displayName || !String(displayName).trim()) throw new Error("To'liq ism kerak");
  if (String(password || "").length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Parol kamida ${MIN_PASSWORD_LENGTH} belgi bo'lishi kerak`);
  }

  const id = db
    .prepare(
      "INSERT INTO users (login, display_name, password_hash, is_superadmin) VALUES (?, ?, ?, ?)"
    )
    .run(l, String(displayName).trim(), hashPassword(password), isSuperadmin ? 1 : 0).lastInsertRowid;

  setSections(id, sections);
  setFlags(id, flags);
  return getUserById(id);
}

// Ruxsatlar to'liq almashtiriladi (yo'q qilingani o'chadi) — qisman
// yangilash chalkashlik keltiradi: UI ham butun ro'yxatni yuboradi.
export const setSections = db.transaction((userId, sections) => {
  db.prepare("DELETE FROM user_permissions WHERE user_id = ?").run(userId);
  const ins = db.prepare("INSERT OR IGNORE INTO user_permissions (user_id, section) VALUES (?, ?)");
  for (const s of sections || []) {
    if (!isValidSection(s)) throw new Error(`Noma'lum bo'lim: ${s}`);
    ins.run(userId, s);
  }
});

export const setFlags = db.transaction((userId, flags) => {
  db.prepare("DELETE FROM user_flags WHERE user_id = ?").run(userId);
  const ins = db.prepare("INSERT OR IGNORE INTO user_flags (user_id, flag) VALUES (?, ?)");
  for (const f of flags || []) {
    if (!isValidFlag(f)) throw new Error(`Noma'lum bayroq: ${f}`);
    ins.run(userId, f);
  }
});

export function rename(userId, displayName) {
  if (!displayName || !String(displayName).trim()) throw new Error("Ism bo'sh bo'lishi mumkin emas");
  db.prepare("UPDATE users SET display_name = ? WHERE id = ?").run(String(displayName).trim(), userId);
}

export function setPassword(userId, password) {
  if (String(password || "").length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Parol kamida ${MIN_PASSWORD_LENGTH} belgi bo'lishi kerak`);
  }
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(password), userId);
}

// Superadminni faolsizlantirib bo'lmaydi: aks holda tizimga kirish yo'li
// yopilib qolishi mumkin.
export function setActive(userId, isActive) {
  const user = getUserById(userId);
  if (!user) throw new Error("Foydalanuvchi topilmadi");
  if (user.isSuperadmin && !isActive) throw new Error("Superadminni faolsizlantirib bo'lmaydi");
  db.prepare("UPDATE users SET is_active = ? WHERE id = ?").run(isActive ? 1 : 0, userId);
}

export function removeUser(userId) {
  const user = getUserById(userId);
  if (!user) return;
  if (user.isSuperadmin) throw new Error("Superadminni o'chirib bo'lmaydi");
  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
}

export function touchLogin(login) {
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE login = ?").run(norm(login));
}

/* ==================== ko'chirish (bir martalik) ==================== */

// Panel'dagi `project_users` (operatorlar) va `.env` dagi superadmin —
// ikkalasi ham shu jadvalga ko'chadi. Bir necha marta chaqirilsa ham
// xavfsiz: mavjud login qayta yaratilmaydi.
export function importLegacyUsers({ adminLogin, adminPasswordHash } = {}) {
  const result = { operators: 0, admin: 0, skipped: 0 };

  const tableExists = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'project_users'")
    .get();

  if (tableExists) {
    const rows = db.prepare("SELECT login, display_name, password_hash, is_active FROM project_users").all();
    const insert = db.prepare(
      "INSERT INTO users (login, display_name, password_hash, is_active) VALUES (?, ?, ?, ?)"
    );
    for (const r of rows) {
      if (getUserByLogin(r.login)) {
        result.skipped += 1;
        continue;
      }
      const id = insert.run(r.login, r.display_name, r.password_hash, r.is_active).lastInsertRowid;
      // Operator = yig'ish bo'limi + mobil ilova.
      setSections(id, ["packing"]);
      setFlags(id, ["mobile"]);
      result.operators += 1;
    }
  }

  // Panel admini: `.env` da faqat hash bor, ochiq parol yo'q — shuning uchun
  // hash shundoq ko'chiriladi va eski parol ishlayveradi.
  if (adminLogin && adminPasswordHash && !getUserByLogin(adminLogin)) {
    db.prepare(
      "INSERT INTO users (login, display_name, password_hash, is_superadmin) VALUES (?, ?, ?, 1)"
    ).run(norm(adminLogin), "Administrator", adminPasswordHash);
    result.admin = 1;
  }

  return result;
}
