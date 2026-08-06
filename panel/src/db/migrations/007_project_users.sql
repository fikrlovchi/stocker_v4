-- Loyihaga bog'langan foydalanuvchilar (operatorlar).
--
-- Panel'ning admin sessiyasidan butunlay alohida: bu jadvaldagi hisoblar
-- panel'ga kirmaydi, ularni loyihaning o'z servisi (masalan stocker-server)
-- API orqali tortib olib, o'zida tekshiradi. Shuning uchun jadval umumiy —
-- keyin boshqa loyihalarga ham asqotadi.
CREATE TABLE IF NOT EXISTS project_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  login TEXT NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, login)
);

CREATE INDEX IF NOT EXISTS idx_project_users_project ON project_users(project_id, login);
