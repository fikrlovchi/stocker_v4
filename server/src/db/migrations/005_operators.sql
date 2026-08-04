-- Operatorlar keshi va ularning sessiya tokenlari (8-faza).
--
-- Manba — fikrlovchi-panel'dagi `project_users`. Bu yerda faqat NUSXA turadi:
-- panel'dan har `auth.syncIntervalMs` da tortiladi. Login tekshiruvi mahalliy
-- bajariladi, shuning uchun panel o'chib qolsa ham operatorlar ishlayveradi.
CREATE TABLE IF NOT EXISTS operators (
  login TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  synced_at TEXT NOT NULL
);

-- Token faqat sha256 hash bilan saqlanadi: baza nusxasi chiqib ketsa ham
-- undagi qiymat bilan kirib bo'lmaydi.
CREATE TABLE IF NOT EXISTS operator_tokens (
  token_hash TEXT PRIMARY KEY,
  login TEXT NOT NULL,
  device TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_operator_tokens_login ON operator_tokens(login);
