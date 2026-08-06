-- Bir xil do'kon avtomatik sinxronizatsiyada ikki marta qo'shilib
-- ketmasligi uchun (cabinet_id, shop_id) juftligi noyob bo'lishi kerak.
CREATE UNIQUE INDEX IF NOT EXISTS idx_uzum_shops_unique ON uzum_shops(cabinet_id, shop_id);
