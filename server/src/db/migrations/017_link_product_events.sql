-- Tovar bog'lamasi qo'shilganda bajariladigan amallar jurnali.
--
-- v3 da bu ikki amal AppSheet automation'i orqali, yangi qator qo'shilganda
-- ishlardi (`runAll`: fetchUzumProducts + addBarcodesToMoySklad). Ular jadval
-- bo'yicha takrorlanadigan ish EMAS — bir marta, qator yaratilganda.
--
-- Shu bois natija `stock_runs` ga emas, shu jadvalga yoziladi: u yerda
-- "ishga tushish" hisoblanadi, bu yerda esa "qaysi qatorga nima bo'ldi".
CREATE TABLE IF NOT EXISTS link_product_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  link_product_id INTEGER,
  sku_title TEXT NOT NULL,
  -- uzum_fetch — Uzum'dan skuId/nom/barcode/rasm olish
  -- mc_barcode — barcode'ni MoySklad tovariga qo'shish
  kind TEXT NOT NULL,
  -- success | skipped | error
  -- `skipped` — amal kerak bo'lmadi (masalan barcode allaqachon bor).
  status TEXT NOT NULL,
  message TEXT,
  detail TEXT,            -- JSON
  at TEXT NOT NULL DEFAULT (datetime('now')),
  by_login TEXT
);
CREATE INDEX IF NOT EXISTS idx_lp_events_at ON link_product_events(at DESC);
CREATE INDEX IF NOT EXISTS idx_lp_events_row ON link_product_events(link_product_id);

-- Do'kon kesimidagi "Qoldiq" bayrog'i olib tashlanadi: qoldiq yuborishni
-- faqat `link_product.stock_update` boshqaradi, ikkinchi bayroq faqat
-- chalkashtiradi.
ALTER TABLE uzum_shops DROP COLUMN stock_update;
