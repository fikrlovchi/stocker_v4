-- Uzum kabinet/do'konining MoySklad havolalari — v3 dagi "MC href" ustunlari.
--
-- Ular buyurtmani MoySklad'ga yozishda kerak (v3 dagi formulalar):
--   uzum_order!O  organization_href  = shop → uzum_token → MC href
--                 ya'ni YURIDIK SHAXS (firma). Kabinetga tegishli.
--   uzum_order!P  saleschannel_href  = shop → MC href
--                 ya'ni SOTUV KANALI. Har do'konning o'ziniki.
--
-- `uzum_cabinets` va `uzum_shops` panel migratsiyalarida yaratilgan. Toza
-- bazada (test, yangi o'rnatish) ular yo'q va `ALTER TABLE` yiqilardi —
-- shuning uchun avval panel'dagi AYNAN o'sha sxema bilan yaratiladi.
-- Mavjud bazada bu ikki buyruq hech narsa qilmaydi.
CREATE TABLE IF NOT EXISTS uzum_cabinets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  token TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS uzum_shops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cabinet_id INTEGER NOT NULL REFERENCES uzum_cabinets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  shop_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_uzum_shops_cabinet ON uzum_shops(cabinet_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_uzum_shops_unique ON uzum_shops(cabinet_id, shop_id);

ALTER TABLE uzum_cabinets ADD COLUMN mc_organization_href TEXT;

ALTER TABLE uzum_shops ADD COLUMN mc_saleschannel_href TEXT;
-- v3 `uzum_shop!F` — skuTitle prefiksi (UZON, BUYO…). Do'konni SKU nomidan
-- aniqlash uchun asqotadi.
ALTER TABLE uzum_shops ADD COLUMN sku_code TEXT;
-- v3 `uzum_shop!E` — do'kon bo'yicha qoldiq yangilashni o'chirib qo'yish.
ALTER TABLE uzum_shops ADD COLUMN stock_update INTEGER NOT NULL DEFAULT 1;
