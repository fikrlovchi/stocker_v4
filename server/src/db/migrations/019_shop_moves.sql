-- Do'konning kabinetdan kabinetga ko'chishi.
--
-- Amaliyotda do'konlar vaqti-vaqti bilan boshqa kabinetga o'tkaziladi
-- (masalan `uzon.market` ИП SHINGARYOVA dan ИП Софья Кокчан ga). Bu jim
-- o'tib ketadigan hodisa emas: kabinet = MoySklad'dagi YURIDIK SHAXS, ya'ni
-- ko'chishdan keyin yaratilgan buyurtmalar boshqa firma nomida yoziladi.
--
-- Nega tarix kerak: eski buyurtma O'SHA PAYTDAGI firma nomida yaratilgan va
-- shundayligicha qolishi kerak. Bugungi kabinet bo'yicha qayta hisoblash
-- tarixni buzadi — `orderSync.js` dagi 224 ta "farq" aynan shundan chiqqan.
CREATE TABLE IF NOT EXISTS uzum_shop_moves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id TEXT NOT NULL,
  from_cabinet_id INTEGER,
  to_cabinet_id INTEGER NOT NULL,
  -- Ko'chish paytidagi nomlar: kabinet keyin o'chirilsa ham tarix o'qilsin.
  from_cabinet_name TEXT,
  to_cabinet_name TEXT,
  detected_at TEXT NOT NULL DEFAULT (datetime('now')),
  source TEXT NOT NULL DEFAULT 'sync'
);
CREATE INDEX IF NOT EXISTS idx_shop_moves_shop ON uzum_shop_moves(shop_id);

-- Bitta do'kon IKKI kabinetda tura olmaydi. Ilgari yagona indeks
-- `(cabinet_id, shop_id)` juftligida edi — ya'ni ko'chgan do'kon eski
-- kabinetda ham qolib, `orderRefs` tasodifiy birini olardi.
--
-- Mavjud takrorlar avval tozalanadi: eng oxirgi qator (katta id) qoladi,
-- chunki sinxronizatsiya do'konni oxirgi ko'rgan kabinetga qo'shgan.
DELETE FROM uzum_shops
WHERE id NOT IN (SELECT MAX(id) FROM uzum_shops GROUP BY shop_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_uzum_shops_shop_id ON uzum_shops(shop_id);
