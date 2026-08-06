-- Partiyalar — skan doirasi (konsolidatsiya, 2-bosqich).
--
-- Shu paytgacha telefon KESHDAGI barcha mos buyurtmalar ichidan qidirardi.
-- Endi admin buyurtma ID ro'yxatini joylab "partiya" yasaydi va operator
-- faqat ochiq partiyadagi buyurtmalarni yig'adi. Sabab: omborda bir kunda
-- ma'lum bir ro'yxat yig'iladi, boshqasi emas — skan doirasi shunga qarab
-- toraysin.
CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_by TEXT,                       -- users.login
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- Yopilgan partiya mobil ilovada ko'rinmaydi, lekin tarixda qoladi.
  closed_at TEXT
);

-- Buyurtmaning partiyadagi holati. `shop_id` kesh'dan (uzum_order!G) yoziladi:
-- do'kon bo'yicha guruhlash va "2/22" hisobi shu ustundan.
--
-- Bir buyurtma faqat BITTA ochiq partiyada bo'lishi kerak — aks holda ikki
-- operator uni turli ro'yxatdan ko'rib, ikki marta yig'ib yuboradi. Buni
-- qisman UNIQUE indeks ta'minlaydi (sessiyalardagi lock bilan bir xil usul).
CREATE TABLE IF NOT EXISTS batch_orders (
  batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL,
  shop_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | packed | skipped
  packed_at TEXT,
  packed_by TEXT,                         -- users.login
  PRIMARY KEY (batch_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_batch_orders_order ON batch_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_batch_orders_shop ON batch_orders(batch_id, shop_id, status);
