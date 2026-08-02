-- Buyurtma keshi. Faqat saqlash oynasi (config.cache.retentionDays) ichidagi
-- buyurtmalar turadi — mos kelmaganlari ham, `eligible=0` va sababi bilan:
-- shunda "nega bu buyurtma skanerlanmayapti?" savoliga /debug/order javob bera oladi.
CREATE TABLE IF NOT EXISTS orders (
  order_id          TEXT PRIMARY KEY,
  shop_id           TEXT,
  moysklad_id       TEXT,
  arrived_at_ms     INTEGER,
  status_q          TEXT,
  confirmed_t       TEXT,
  mc_state_u        TEXT,
  cancel_handled_v  TEXT,
  item_count        INTEGER NOT NULL DEFAULT 0,
  unit_count        INTEGER NOT NULL DEFAULT 0,
  eligible          INTEGER NOT NULL DEFAULT 0,
  reason            TEXT,
  refreshed_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_eligible ON orders(eligible, arrived_at_ms);

-- uzum_order_detail qatorlari. item_id = detail!A (Uzum orderItem id).
CREATE TABLE IF NOT EXISTS items (
  item_id       TEXT PRIMARY KEY,
  order_id      TEXT NOT NULL,
  sheet_row     INTEGER NOT NULL,
  uzum_barcode  TEXT,
  sku_title     TEXT,
  product_ref   TEXT,
  entity_type   TEXT,
  quantity      INTEGER NOT NULL DEFAULT 0,
  refreshed_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_order ON items(order_id);
CREATE INDEX IF NOT EXISTS idx_items_ref ON items(product_ref);

-- Barcode -> item indeksi. 1-fazada faqat `uzum` manbasi (detail!B) to'ldiriladi;
-- 2-fazada MoySklad barcode'lari `moysklad` manbasi bilan qo'shiladi.
CREATE TABLE IF NOT EXISTS item_barcodes (
  barcode  TEXT NOT NULL,
  item_id  TEXT NOT NULL,
  source   TEXT NOT NULL,
  raw      TEXT,
  PRIMARY KEY (barcode, item_id, source)
);
CREATE INDEX IF NOT EXISTS idx_item_barcodes_item ON item_barcodes(item_id);

-- MoySklad'da "Otmenen" holatiga o'tgan buyurtmalar (externalCode = Uzum orderId).
-- `uzum_order!V` bu maqsad uchun yaramaydi: cancelSync 24 soatdan keyin bekor
-- qilinmagan buyurtmaga ham V=1 qo'yadi (HANDOFF.md, 2-band).
CREATE TABLE IF NOT EXISTS canceled_orders (
  order_id  TEXT PRIMARY KEY,
  seen_at   TEXT NOT NULL
);

-- uzum_packing varag'idan o'qilgan, allaqachon yig'ilgan buyurtmalar.
CREATE TABLE IF NOT EXISTS packed_orders (
  order_id     TEXT PRIMARY KEY,
  packed_at    TEXT,
  operator     TEXT,
  status       TEXT
);

-- Kalit-qiymat holati (oxirgi yangilanish vaqti va h.k.)
CREATE TABLE IF NOT EXISTS meta (
  key    TEXT PRIMARY KEY,
  value  TEXT
);
