-- Token qaysi mijoz uchun berilgan: "mobile" (telefon) yoki "web" (SPA).
--
-- Kerak, chunki mobil ilovaga kirish `mobile` bayrog'i bilan cheklangan,
-- veb interfeysga esa yo'q. Token tekshirilayotganda o'sha paytdagi shart
-- qayta qo'llanadi: veb tokeni bilan mobil API'ga kirib bo'lmasin.
ALTER TABLE operator_tokens ADD COLUMN scope TEXT NOT NULL DEFAULT 'mobile';
