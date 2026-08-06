CREATE TABLE IF NOT EXISTS api_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  token TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS uzum_cabinets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  token TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS uzum_shops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cabinet_id INTEGER NOT NULL REFERENCES uzum_cabinets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  shop_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_uzum_shops_cabinet ON uzum_shops(cabinet_id);

-- Har bir qator: "shu loyihaning shu .env kaliti, shu katalog elementining
-- qiymatidan olinadi". Telegram Chat/Topic ham shu orqali bog'lanadi.
CREATE TABLE IF NOT EXISTS project_env_bindings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  env_key TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN
    ('telegram_bot','telegram_chat','telegram_topic','api_token','uzum_cabinet','uzum_shop')),
  source_id INTEGER NOT NULL,
  UNIQUE(project_id, env_key)
);

DROP TABLE IF EXISTS project_telegram_links;
