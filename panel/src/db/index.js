const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

// Konsolidatsiya 2-bosqichi: panel va yig'ish serveri BITTA bazani ishlatadi —
// monorepo ildizidagi `data/stocker.db`. Fayl hali yasalmagan bo'lsa (eski
// o'rnatish yoki birlashtirish qilinmagan), avvalgi `panel/data/panel.db`
// ishlatiladi — shu bilan yangilanish paytida panel to'xtab qolmaydi.
const SHARED_DB = path.join(__dirname, "..", "..", "..", "data", "stocker.db");
const LEGACY_DB = path.join(__dirname, "..", "..", "data", "panel.db");
const DB_PATH = process.env.DB_FILE || (fs.existsSync(SHARED_DB) ? SHARED_DB : LEGACY_DB);

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Migratsiya hisobi PANEL uchun alohida jadvalda: umumiy bazada yig'ish
// serverining o'z `schema_migrations` i bor va uning ustunlari boshqacha
// (`name`, bu yerda `filename`) — bir jadvalni bo'lishib bo'lmaydi.
db.exec(`
  CREATE TABLE IF NOT EXISTS panel_schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const migrationsDir = path.join(__dirname, "migrations");
const applied = new Set(
  db.prepare("SELECT filename FROM panel_schema_migrations").all().map((r) => r.filename)
);

for (const filename of fs.readdirSync(migrationsDir).sort()) {
  if (applied.has(filename)) continue;
  const sql = fs.readFileSync(path.join(migrationsDir, filename), "utf8");
  db.exec(sql);
  db.prepare("INSERT INTO panel_schema_migrations (filename) VALUES (?)").run(filename);
}

module.exports = db;
