-- Qoldiq sinxronizatsiyasining tarixi.
--
-- NEGA KERAK: MoySklad hisobotining nomuvofiqligi HAR DOIM takrorlanmaydi —
-- `stockProbe.js` 4 marta ketma-ket so'rab hech qanday farq topmadi, lekin
-- muammo kuzatilgan. Bir martalik sinov "yo'q" deb xulosa chiqarish uchun
-- asos bo'lmaydi, shuning uchun har sinxronizatsiya yozib boriladi va naqsh
-- kunlar bo'yicha ko'rinadi.
--
-- Nima yoziladi: hisobotda nechta tovar kelgani, nechtasi tushib qolgani,
-- maqsadli so'rov nechtasini tiklagani va oxir-oqibat nechtasi 0 deb
-- belgilangani. Shu ustunlar bo'yicha `stockMissingConfirmations` ni
-- pasaytirish xavfsizmi degan savolga dalil bilan javob beriladi.
CREATE TABLE IF NOT EXISTS mc_stock_sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  -- 0 — hisobot shubhali bo'lgani uchun umuman qo'llanmadi.
  applied INTEGER NOT NULL,
  reason TEXT,
  report_count INTEGER,
  previous_count INTEGER,
  stored_count INTEGER,
  -- Hisobotda ko'rinmagan tovarlar soni (maqsadli so'rovdan OLDIN).
  missing INTEGER NOT NULL DEFAULT 0,
  -- Maqsadli so'rov topib bergani.
  restored INTEGER NOT NULL DEFAULT 0,
  -- Maqsadli so'rov ham topmagani.
  still_missing INTEGER NOT NULL DEFAULT 0,
  -- Oxir-oqibat 0 deb belgilangani (Uzumga 0 ketadigan tovarlar).
  zeroed INTEGER NOT NULL DEFAULT 0,
  recheck_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_mc_stock_sync_log_at ON mc_stock_sync_log(at DESC);
