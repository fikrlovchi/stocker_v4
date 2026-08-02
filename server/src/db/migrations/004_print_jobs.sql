-- Chop etish navbati va ish joylari (stationlar).
--
-- 4-fazadagi `print_intents` faqat qayd etib qo'yardi; endi to'liq navbat:
-- ACK, qayta urinish, idempotentlik. Eski jadval tashlanadi (undagi
-- yozuvlar faqat sinov edi).
DROP TABLE IF EXISTS print_intents;

CREATE TABLE IF NOT EXISTS stations (
  id            TEXT PRIMARY KEY,     -- "Ombor-1"
  name          TEXT,
  token_hash    TEXT,                 -- 6-fazada QR juftlash bilan to'ladi
  shk_printer   TEXT,                 -- Windows printer nomi (ShK, 40×30)
  big_printer   TEXT,                 -- Windows printer nomi (BIG, 4×4")
  last_seen_at  TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS print_jobs (
  id           TEXT PRIMARY KEY,      -- uuid; client shu bo'yicha takrorni tanidi
  session_id   TEXT,
  order_id     TEXT NOT NULL,
  item_id      TEXT,                  -- BIG uchun NULL
  target       TEXT NOT NULL,         -- shk | big
  copies       INTEGER NOT NULL DEFAULT 1,
  station_id   TEXT,
  status       TEXT NOT NULL,         -- pending | sent | done | error | canceled
  attempts     INTEGER NOT NULL DEFAULT 0,
  -- PDF'ni yuklab olish uchun bir martalik kalit (client service token'ni
  -- ko'rmaydi — u faqat serverda qoladi).
  fetch_token  TEXT NOT NULL,
  last_error   TEXT,
  created_at   TEXT NOT NULL,
  sent_at      TEXT,
  finished_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_print_jobs_queue ON print_jobs(station_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_print_jobs_session ON print_jobs(session_id);
