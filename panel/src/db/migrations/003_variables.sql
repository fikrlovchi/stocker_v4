CREATE TABLE IF NOT EXISTS telegram_bots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  bot_token TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS telegram_chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bot_id INTEGER NOT NULL REFERENCES telegram_bots(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_telegram_chats_bot ON telegram_chats(bot_id);

CREATE TABLE IF NOT EXISTS telegram_topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL REFERENCES telegram_chats(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_telegram_topics_chat ON telegram_topics(chat_id);

CREATE TABLE IF NOT EXISTS google_sheets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sheet_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sheet_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sheet_id INTEGER NOT NULL REFERENCES google_sheets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  list_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sheet_lists_sheet ON sheet_lists(sheet_id);

-- Bitta loyiha bitta Telegram manziliga bog'lanadi (hozirgi .env kaliti bitta bot/chat/topic).
CREATE TABLE IF NOT EXISTS project_telegram_links (
  project_id INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  chat_id INTEGER NOT NULL REFERENCES telegram_chats(id) ON DELETE CASCADE,
  topic_id INTEGER REFERENCES telegram_topics(id) ON DELETE SET NULL
);

-- Loyiha bir nechta sheet/list bilan bog'lanishi mumkin (faqat ko'rinish uchun, .env yozilmaydi).
CREATE TABLE IF NOT EXISTS project_sheet_links (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sheet_id INTEGER NOT NULL REFERENCES google_sheets(id) ON DELETE CASCADE,
  list_id INTEGER REFERENCES sheet_lists(id) ON DELETE SET NULL,
  PRIMARY KEY (project_id, sheet_id, list_id)
);
