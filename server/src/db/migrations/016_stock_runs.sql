-- Qoldiq oqimlarining ishga tushishlari va jadval sozlamalari.
--
-- Nima uchun: shu paytgacha uchta oqim (qoldiq o'qish, Uzumga yuborish,
-- barcode → MoySklad) faqat qo'lda, SSH orqali ishga tushardi. Natija esa
-- terminalda qolib ketardi — kim ishga tushirdi, nima bo'ldi, xato bormi
-- degan savolga javob yo'q edi.
--
-- Endi har ishga tushish shu jadvalga yoziladi va "Integratsiyalar"
-- bo'limida ko'rinadi.
CREATE TABLE IF NOT EXISTS stock_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- sync — MoySklad'dan assortiment va qoldiq
  -- push — Uzumga qoldiq yuborish
  -- barcode — barcode → MoySklad
  kind TEXT NOT NULL,
  -- manual (interfeysdan) | schedule (jadval bo'yicha) | cli (skript)
  trigger TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  -- running | success | partial | error | blocked
  -- `blocked` — himoya to'xtatdi (masalan qoldiq keshi bo'sh). Bu XATO emas:
  -- tizim ataylab hech narsa yubormadi.
  status TEXT NOT NULL,
  summary TEXT,          -- JSON: sonlar va tafsilotlar
  error TEXT,
  started_by TEXT,
  dry_run INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_stock_runs_kind ON stock_runs(kind, started_at DESC);
