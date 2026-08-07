// `app_settings` (kalit → JSON) ustidagi umumiy o'qish/yozish.
//
// Nega alohida modul: qiymatlarni ham veb qatlami (`web/settings.js`), ham
// domen modullari (`moysklad/token.js`) o'qiydi. Agar mantiq `web/` ichida
// qolsa, MoySklad klienti veb qatlamiga bog'lanib qolardi.
import { db } from "./db/index.js";
import logger from "./logger.js";

/** Saqlangan qiymat yo'q yoki buzuq bo'lsa `null` — chaqiruvchi standartni oladi. */
export function getSetting(key) {
  const row = db.prepare("SELECT value, updated_at, updated_by FROM app_settings WHERE key = ?").get(key);
  if (!row) return null;
  try {
    return { value: JSON.parse(row.value), updatedAt: row.updated_at, updatedBy: row.updated_by };
  } catch {
    logger.warn(`app_settings.${key} JSON emas — standart ishlatiladi`);
    return null;
  }
}

export function setSetting(key, value, login) {
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at, updated_by)
     VALUES (?, ?, datetime('now'), ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value,
       updated_at = excluded.updated_at, updated_by = excluded.updated_by`
  ).run(key, JSON.stringify(value), login || null);
  return getSetting(key);
}

export function deleteSetting(key) {
  db.prepare("DELETE FROM app_settings WHERE key = ?").run(key);
}
