const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DB_PATH = path.join(__dirname, "..", "..", "data", "panel.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const migrationsDir = path.join(__dirname, "migrations");
const applied = new Set(db.prepare("SELECT filename FROM schema_migrations").all().map((r) => r.filename));

for (const filename of fs.readdirSync(migrationsDir).sort()) {
  if (applied.has(filename)) continue;
  const sql = fs.readFileSync(path.join(migrationsDir, filename), "utf8");
  db.exec(sql);
  db.prepare("INSERT INTO schema_migrations (filename) VALUES (?)").run(filename);
}

module.exports = db;
