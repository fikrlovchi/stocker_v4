-- Umumiy sozlamalar (kalit → JSON).
--
-- Birinchi ishlatilishi: ShK yorlig'ining standart o'lchamlari. Ilgari ular
-- HAR BRAUZERNING localStorage'ida turardi — bir odam moslab qo'ysa, boshqa
-- kompyuterda ochilganda yo'q edi. Endi qiymat serverda: kim ochsa ham
-- bir xil yorliq chiqadi.
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,          -- JSON
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT
);
