-- MoySklad qoldiq hisobotining ishonchsizligiga qarshi himoya.
--
-- MUAMMO: `report/stock/all/current` ketma-ket chaqirilganda har xil son
-- qaytaradi (3000 → 2997 → 2998 → 3000). Yo'qolgan tovarlar aslida boshqa
-- omborga o'tmagan va qoldig'i 0 bo'lmagan — bu API tomonidagi nomuvofiqlik.
--
-- NEGA XAVFLI: tovar bitta javobda ko'rinmasa, biz uni "qoldiq yo'q" deb
-- hisoblab Uzumga 0 yuborardik — sotuvdagi tovar do'kondan yo'qolardi.
--
-- YECHIM (API'ga qo'shimcha yuklamasiz, hamon bitta so'rov):
--   1. Javob oldingisidan keskin kichik bo'lsa — BUTUNLAY qo'llanmaydi;
--   2. Bitta javobda ko'rinmagan tovarning oxirgi ma'lum qoldig'i saqlanadi
--      va `missing_count` oshadi; u ketma-ket bir necha marta kelmagandagina
--      haqiqatan yo'q deb hisoblanadi.
--
-- `mc_stock` — hosila kesh (MoySklad'dan qayta olinadi), shuning uchun
-- ustun qo'shish o'rniga qaytadan yaratilgani xavfsiz va toza.
DROP TABLE IF EXISTS mc_stock;

CREATE TABLE mc_stock (
  uuid TEXT PRIMARY KEY,
  stock REAL NOT NULL,
  external_id TEXT,
  -- Ketma-ket nechta javobda ko'rinmadi. 0 — hozirgi javobda bor.
  missing_count INTEGER NOT NULL DEFAULT 0,
  -- Oxirgi marta haqiqatan hisobotda ko'ringan vaqt (saqlangan qiymat
  -- qanchalik eskiligini shundan bilinadi).
  last_seen_at TEXT,
  synced_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mc_stock_external ON mc_stock(external_id);
