-- MoySklad tovar keshi. `orders`/`items` dan FARQLI o'laroq bu jadvallar har
-- tsiklda qayta qurilmaydi — ular uzoq muddatli kesh (TTL config.moysklad.
-- barcodeTtlDays). Tovar barcode'i kamdan-kam o'zgaradi, shuning uchun bir
-- marta olingan UUID qayta so'ralmaydi va MoySklad'ga yuk deyarli tushmaydi.
CREATE TABLE IF NOT EXISTS mc_products (
  uuid         TEXT PRIMARY KEY,
  entity_type  TEXT,
  name         TEXT,
  fetched_at   TEXT NOT NULL,
  -- MoySklad'da topilmadi (o'chirilgan yoki href noto'g'ri). 24 soatdan keyin
  -- qayta uriniladi — har tsiklda bekorga so'rov yubormaslik uchun.
  missing      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_mc_products_fetched ON mc_products(fetched_at);

CREATE TABLE IF NOT EXISTS mc_barcodes (
  uuid     TEXT NOT NULL,
  barcode  TEXT NOT NULL,   -- normalizeBarcode dan o'tgan
  type     TEXT,            -- ean13 | code128 | gtin | upc ...
  raw      TEXT,            -- MoySklad'dagi asl ko'rinish
  PRIMARY KEY (uuid, barcode)
);
CREATE INDEX IF NOT EXISTS idx_mc_barcodes_barcode ON mc_barcodes(barcode);
