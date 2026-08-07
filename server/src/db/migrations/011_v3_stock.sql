-- Stocker v3 (AppSheet + Google Sheets) bazasi — docs/V3-MIGRATION.md, 2-3 bosqich.
--
-- Jadval nomlari manbadagi listlar bilan bir xil: solishtirish oson bo'lsin.
-- `uzum_shop` va `uzum_token` ko'chirilmadi — ularning o'rni allaqachon bor
-- (`uzum_shops`, `uzum_cabinets`, Konfiguratsiya → Uzum).

-- MoySklad assortimenti. v3 da bu list boshqa jadvaldan `IMPORTRANGE` bilan
-- kelardi; endi server MoySklad'dan o'zi o'qiydi (gas_v3/volume_product.js).
CREATE TABLE IF NOT EXISTS mc_product (
  uuid TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,        -- product | variant | service | bundle
  group_path TEXT,
  code TEXT,
  name TEXT,
  external_id TEXT,
  article TEXT,
  synced_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mc_product_external ON mc_product(external_id);

-- Ombordagi qoldiq (gas_v3/get_mcstock_v3.js).
CREATE TABLE IF NOT EXISTS mc_stock (
  uuid TEXT PRIMARY KEY,
  stock REAL NOT NULL,
  external_id TEXT,
  synced_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mc_stock_external ON mc_stock(external_id);

-- Uzum SKU ↔ MoySklad tovari. v3 dagi `link_product` listi.
--
-- Ustun nomlari manbadagi sarlavhalardan: sku_title = B ("skuTitle"), u
-- qoldiq qoidalarida ham kalit; card_quantity = N ("Card quantity") — bitta
-- Uzum kartochkasidagi tovar soni.
CREATE TABLE IF NOT EXISTS link_product (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku_id INTEGER,
  sku_title TEXT NOT NULL,
  product_title TEXT,
  barcode TEXT,
  image TEXT,
  shop_id TEXT,
  status TEXT,
  stock_update INTEGER NOT NULL DEFAULT 1,   -- J: FALSE bo'lsa Uzumga yuborilmaydi
  order_import INTEGER NOT NULL DEFAULT 1,   -- O
  mc_external_id TEXT,                       -- K
  mc_uuid TEXT,                              -- M
  card_quantity INTEGER NOT NULL DEFAULT 1,  -- N
  -- K ustunidagi eski `@3` / `#2` / `$` qo'shimchasi. Yangi tizimda
  -- ISHLATILMAYDI (bo'luvchi faqat card_quantity), lekin ko'chirilgan
  -- qatorlarda saqlanadi: shundagina server bugungi son bilan bir xil
  -- natija beradi va solishtirish ma'noli bo'ladi.
  legacy_divisor INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_link_product_sku_title ON link_product(sku_title);
CREATE INDEX IF NOT EXISTS idx_link_product_shop ON link_product(shop_id);

-- Qoldiq modifikatsiyasi: ota qator (v3 `uzum_stock_mod`).
-- ID matn — manbadagi qiymat saqlanadi, `detail` unga bog'langan.
CREATE TABLE IF NOT EXISTS uzum_stock_mod (
  id TEXT PRIMARY KEY,
  sku_title TEXT NOT NULL,          -- D: uzum_product
  default_quantity INTEGER,         -- E: bo'sh bo'lishi MUMKIN va bu ma'noli
  created_at TEXT,
  created_by TEXT,
  updated_at TEXT,
  updated_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_uzum_stock_mod_sku ON uzum_stock_mod(sku_title);

-- Qoida qatorlari (v3 `uzum_stock_mod_detail`).
--
-- "Final Quantity to" (G) manbada formula edi: `use_default` bo'lsa otaning
-- `default_quantity` si, aks holda `quantity_to`. Bu yerda saqlanmaydi —
-- hisoblash paytida chiqariladi, aks holda ota o'zgarganda eskirib qolardi.
CREATE TABLE IF NOT EXISTS uzum_stock_mod_detail (
  id TEXT PRIMARY KEY,
  mod_id TEXT NOT NULL REFERENCES uzum_stock_mod(id) ON DELETE CASCADE,
  quantity_from REAL NOT NULL,      -- E
  comparison TEXT NOT NULL,         -- F: greater than | less than | equal
  priority INTEGER NOT NULL DEFAULT 1,  -- H: kichigi ustun
  use_default INTEGER NOT NULL DEFAULT 0,  -- I
  quantity_to INTEGER,              -- J
  comment TEXT,
  created_at TEXT,
  created_by TEXT,
  updated_at TEXT,
  updated_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_stock_mod_detail_mod ON uzum_stock_mod_detail(mod_id);

-- Umumiy standart qoidalar (v3 `uzum_mod_default`). Hozir bitta qator:
-- "10 dan kam → 0".
CREATE TABLE IF NOT EXISTS uzum_mod_default (
  id TEXT PRIMARY KEY,
  quantity_from REAL NOT NULL,
  comparison TEXT NOT NULL,
  quantity_to INTEGER,
  priority INTEGER NOT NULL DEFAULT 1,
  created_at TEXT,
  created_by TEXT
);
