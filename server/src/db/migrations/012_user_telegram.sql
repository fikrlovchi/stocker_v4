-- Foydalanuvchining Telegram ID si — v3 dagi `user` listida bor edi.
--
-- Nima uchun kerak: xabar yuborishda odamni chatda belgilash (mention) va
-- kelajakda bot orqali kelgan so'rovni hisobga bog'lash uchun (DMS v8 dagi
-- `app_user.telegram_id` bilan bir xil vazifa).
--
-- v3 dagi `Role` ustuni KO'CHIRILMAYDI: bu yerda huquq `user_permissions`
-- orqali beriladi, ikkinchi va u bilan kelishmaydigan mexanizm kerak emas.
ALTER TABLE users ADD COLUMN telegram_id TEXT;
