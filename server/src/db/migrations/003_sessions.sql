-- Yig'ish sessiyalari.
--
-- MUHIM: `orders` / `items` / `item_barcodes` har yangilanish tsiklida
-- DELETE + INSERT qilinadi (refresh.js). Shuning uchun bu jadvallar ularga
-- FOREIGN KEY QO'YMAYDI va sessiya ochilganda kerakli hamma narsa
-- NUSXALANADI. Aks holda kesh yangilanishi ochiq sessiyani buzib qo'yardi.
CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  order_id      TEXT NOT NULL,
  operator      TEXT NOT NULL,
  station_id    TEXT,
  moysklad_id   TEXT,
  item_count    INTEGER NOT NULL DEFAULT 0,
  unit_count    INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL,          -- active | done | aborted | expired
  started_at    TEXT NOT NULL,
  last_scan_at  TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  finished_at   TEXT,
  note          TEXT
);

-- LOCK shu yerda: bitta buyurtmani bir vaqtda faqat bitta sessiya ochib
-- turishi mumkin. Tranzaksiya ichida INSERT urinishi ikkinchi operatorda
-- UNIQUE xatosi bilan tushadi — poyga (race) shu bilan hal bo'ladi.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_active_order
  ON sessions(order_id) WHERE status = 'active';

-- Bitta operatorda bir vaqtda bitta ochiq sessiya.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_active_operator
  ON sessions(operator) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_sessions_order ON sessions(order_id, status);

-- Sessiya ochilganda keshdan nusxalangan tovarlar.
CREATE TABLE IF NOT EXISTS session_items (
  session_id  TEXT NOT NULL,
  item_id     TEXT NOT NULL,
  sku_title   TEXT,
  mc_name     TEXT,
  needed      INTEGER NOT NULL,
  scanned     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, item_id)
);

-- Sessiya ochilganda keshdan nusxalangan barcode'lar — skan qidiruvi
-- yangilanish tsikliga bog'liq bo'lmasligi uchun.
CREATE TABLE IF NOT EXISTS session_barcodes (
  session_id  TEXT NOT NULL,
  barcode     TEXT NOT NULL,
  item_id     TEXT NOT NULL,
  source      TEXT,
  PRIMARY KEY (session_id, barcode, item_id)
);

-- Har bir skan hodisasi (tarix, diagnostika, qayta chop etish).
CREATE TABLE IF NOT EXISTS scans (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT,
  operator    TEXT,
  item_id     TEXT,
  barcode     TEXT NOT NULL,
  source      TEXT,
  result      TEXT NOT NULL,
  scanned_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scans_session ON scans(session_id, id);

-- Chop etish niyatlari. 5-fazada bular WebSocket orqali desktop client'ga
-- yuboriladigan haqiqiy navbatga aylanadi; hozircha faqat qayd etiladi.
CREATE TABLE IF NOT EXISTS print_intents (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL,
  order_id    TEXT NOT NULL,
  item_id     TEXT,
  target      TEXT NOT NULL,          -- shk | big
  copies      INTEGER NOT NULL DEFAULT 1,
  station_id  TEXT,
  status      TEXT NOT NULL,          -- pending | sent | done | error
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_print_intents_status ON print_intents(status, created_at);
CREATE INDEX IF NOT EXISTS idx_print_intents_session ON print_intents(session_id);
