-- Do'kon guruhlari.
--
-- Bir necha do'kon amalda BITTA ombordan yig'iladi (Uzon home · Uzon Fashion ·
-- Uzon accessories · Uzon Auto). Operator uchun ular bitta oqim, shuning
-- uchun skan paytida do'kon tanlash shart emas — guruh yetarli.
--
-- ID BUTUN SON va qo'lda beriladi: operator ekranda uni ko'radi va shu
-- raqam bo'yicha buyurtmalarni saralaydi. Avtomatik o'suvchi ID bo'lsa
-- raqamlar tasodifiy bo'lib qolardi va yodda qolmasdi.
CREATE TABLE IF NOT EXISTS uzum_shop_groups (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Do'kon guruhsiz ham bo'lishi mumkin (yangi qo'shilgan, hali biriktirilmagan).
ALTER TABLE uzum_shops ADD COLUMN group_id INTEGER REFERENCES uzum_shop_groups(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_uzum_shops_group ON uzum_shops(group_id);
