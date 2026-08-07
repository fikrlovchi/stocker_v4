-- Konfiguratsiya bo'limi: Telegram spravochnigi va uni integratsiyalarga
-- biriktirish. Tuzilma DMS v8 dagidek (`Server/DMS/v8`, migratsiya 0022/0026).
--
-- Nega eski `telegram_bots/chats/topics` (panel'dan kelgan) yetmaydi:
--   * chat turi yo'q — shaxsiy, guruh, kanal va mavzuli guruh farqlanmaydi;
--   * mavzu alohida jadvalda, ya'ni "qayerga yuboraman" degan javob ikki
--     qatordan yig'iladi. Xabar yuborishda bu har safar qo'shimcha qadam;
--   * faol/nofaol bayrog'i yo'q — botni vaqtincha o'chirib turib bo'lmaydi.
--
-- Eski jadvallar O'CHIRILMAYDI: ulardagi yozuvlar `importLegacyTelegram()`
-- bilan ko'chiriladi (server/src/config/telegram.js), eski katalog esa panel
-- o'chirilgunicha joyida qoladi.

CREATE TABLE IF NOT EXISTS telegram_bot (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  token TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT
);

-- type: personal | group | supergroup | topic_group | channel
-- topic_id faqat type = 'topic_group' bo'lganda to'ladi.
CREATE TABLE IF NOT EXISTS telegram_chat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'group',
  topic_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT
);

-- Bir xil manzil ikki marta kiritilmasin (mavzusiz chat uchun topic_id NULL —
-- SQLite'da NULL'lar noyob indeksda to'qnashmaydi, shuning uchun '' ga
-- keltiriladi).
CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_chat_unique
  ON telegram_chat(chat_id, COALESCE(topic_id, ''));

-- Integratsiyaga bot va chat biriktirish. v8 da har modul uchun alohida
-- jadval (`money_request_config`, `refund_request_config`) — bu yerda bitta
-- jadval va kalit, chunki integratsiyalar ro'yxati o'sib boradi va har biri
-- uchun migratsiya yozish ortiqcha.
CREATE TABLE IF NOT EXISTS integration_telegram (
  integration_key TEXT PRIMARY KEY,
  bot_id INTEGER REFERENCES telegram_bot(id) ON DELETE SET NULL,
  chat_id INTEGER REFERENCES telegram_chat(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT
);
