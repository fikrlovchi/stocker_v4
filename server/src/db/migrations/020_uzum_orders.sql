-- Buyurtmalarning DOIMIY nusxasi (docs/V3-MIGRATION.md, 6-bosqich).
--
-- `orders` jadvalidan farqi: u KESH — faqat `retentionDays` (3 kun) ichidagi
-- buyurtmalarni saqlaydi va har yangilanishda qaytadan quriladi. Bu yerda esa
-- `uzum_order` ning HAMMASI turadi (~8200 qator) va o'chirilmaydi: Sheets
-- bilan aloqa uzilgach yagona manba shu bo'ladi.
--
-- Ustunlar manbadagi harflar bilan izohlangan — solishtirish oson bo'lsin.
CREATE TABLE IF NOT EXISTS uzum_orders (
  order_id      TEXT PRIMARY KEY,   -- A
  uzum_status   TEXT,               -- B  (Uzum holati: CREATED, CANCELED…)
  date_created  TEXT,               -- C
  accept_until  TEXT,               -- D
  deliver_until TEXT,               -- E
  price         REAL,               -- F
  shop_id       TEXT,               -- G
  stock_title   TEXT,               -- H
  stock_address TEXT,               -- I
  place         TEXT,               -- J
  invoice_number TEXT,              -- K
  dropoff_address TEXT,             -- L
  scheme        TEXT,               -- M

  -- O va P MUZLATILADI: kabinet = MoySklad'dagi yuridik shaxs va do'kon
  -- boshqa kabinetga ko'chishi mumkin. Buyurtma O'SHA PAYTDAGI firmada
  -- qolishi kerak, shuning uchun bu qiymatlar jadvaldan ko'chiriladi va
  -- qayta HISOBLANMAYDI.
  mc_organization_href TEXT,        -- O
  mc_saleschannel_href TEXT,        -- P

  sent_to_mc    INTEGER,            -- Q
  tracking_number TEXT,             -- R
  moysklad_id   TEXT,               -- S
  uzum_confirmed INTEGER,           -- T
  mc_state      TEXT,               -- U
  cancel_handled INTEGER,           -- V
  arrived_at    TEXT,               -- W
  arrived_at_ms INTEGER,            -- W dan hisoblangan, saralash uchun

  sheet_row     INTEGER,            -- jadvaldagi qator (solishtirish uchun)
  source        TEXT NOT NULL,      -- 'sheet' | 'uzum'
  imported_at   TEXT NOT NULL,
  updated_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_uzum_orders_shop ON uzum_orders(shop_id);
CREATE INDEX IF NOT EXISTS idx_uzum_orders_arrived ON uzum_orders(arrived_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_uzum_orders_mc ON uzum_orders(moysklad_id);

-- `uzum_order_detail` qatorlari.
CREATE TABLE IF NOT EXISTS uzum_order_items (
  item_id       TEXT PRIMARY KEY,   -- A
  order_id      TEXT NOT NULL,
  barcode       TEXT,               -- B
  sku_title     TEXT,               -- C
  title         TEXT,               -- D
  price         REAL,               -- E
  amount        REAL,               -- F
  photo         TEXT,               -- G
  -- I·J·K·L jadvalda FORMULA edi; server ularni `orders/formulas.js` bilan
  -- o'zi hisoblaydi. Import paytida jadvaldagi qiymat yoziladi — shundagina
  -- ko'chirilgan buyurtma bugungi natija bilan solishtirilishi mumkin.
  product_ref   TEXT,               -- I
  entity_type   TEXT,               -- J
  quantity_for_mc REAL,             -- K
  price_is_total INTEGER,           -- L
  sheet_row     INTEGER,
  imported_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_uzum_order_items_order ON uzum_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_uzum_order_items_sku ON uzum_order_items(sku_title);
