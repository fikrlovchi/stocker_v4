CREATE TABLE IF NOT EXISTS admin_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  project_slug TEXT NOT NULL,
  detail TEXT,
  performed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
