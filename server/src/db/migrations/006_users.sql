-- Yagona foydalanuvchi va ruxsat modeli (konsolidatsiya, 2-bosqich).
--
-- Shu paytgacha ikki xil kirish bor edi:
--   • panel admin — `.env` dagi ADMIN_PASSWORD_HASH, bitta hisob
--   • operatorlar — panel'dagi `project_users`, faqat mobil ilova uchun
--
-- Endi bitta jadval: kim bo'lishidan qat'i nazar `users` da yozuv, unga
-- bo'limlar (`user_permissions`) va bayroqlar (`user_flags`) biriktiriladi.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  -- Superadmin har doim hamma bo'limni ko'radi va ruxsat bera oladi.
  -- Ruxsatlar jadvaliga qaralmaydi — o'zini bloklab qo'yish holati bo'lmasin.
  is_superadmin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

-- Bo'limlar: 'orders_to_mc' | 'packing' | 'labels' | 'users' | 'settings'
-- Ro'yxat kodda (server/src/auth/sections.js) — baza cheklamaydi, chunki
-- yangi bo'lim qo'shilganda migratsiya yozish shart bo'lmasin.
CREATE TABLE IF NOT EXISTS user_permissions (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  PRIMARY KEY (user_id, section)
);

-- Bayroqlar: hozircha faqat 'mobile' — mobil ilovaga kirish huquqi.
-- Alohida jadval: keyin 'api', 'reports' kabilar qo'shilishi mumkin.
CREATE TABLE IF NOT EXISTS user_flags (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  flag TEXT NOT NULL,
  PRIMARY KEY (user_id, flag)
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_flags_user ON user_flags(user_id);
