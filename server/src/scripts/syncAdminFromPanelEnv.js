// Panel admini (`panel/.env` dagi ADMIN_USERNAME + ADMIN_PASSWORD_HASH) ni
// yangi `users` jadvaliga moslaydi.
//
// Nega kerak: ko'chirishda login qo'lda "admin" deb berilgan edi, panel esa
// `.env` dagi ADMIN_USERNAME ni ishlatadi. Login mos kelmasa yangi
// interfeysga eski parol bilan kirib bo'lmaydi.
//
// Ishlatilishi (server/ ichidan):
//   node src/scripts/syncAdminFromPanelEnv.js                 # moslashtirish
//   node src/scripts/syncAdminFromPanelEnv.js --check "parol" # parolni tekshirish
//   node src/scripts/syncAdminFromPanelEnv.js --password "yangi"  # yangi parol
//
// Hech qanday hisob o'chirilmaydi: mos login bo'lsa yangilanadi, bo'lmasa
// yaratiladi; eski "admin" yozuvi superadmin bo'lsa — nomi to'g'rilanadi.
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { db } from "../db/index.js";
import { ROOT } from "../config.js";
import { getUserByLogin, listUsers, setPassword, setSections, setFlags } from "../auth/users.js";
import { SECTION_KEYS } from "../auth/sections.js";

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};

const ENV_PATH = process.env.PANEL_ENV || path.join(ROOT, "..", "panel", ".env");

function readPanelEnv() {
  if (!fs.existsSync(ENV_PATH)) {
    console.error(`panel .env topilmadi: ${ENV_PATH}`);
    process.exit(1);
  }
  const text = fs.readFileSync(ENV_PATH, "utf8");
  const pick = (key) => {
    const m = text.match(new RegExp(`^${key}=(.*)$`, "m"));
    if (!m) return "";
    // CRLF fayllarda satr oxirida \r qoladi — u hash'ga qo'shilib ketsa
    // bcrypt hech qachon mos kelmaydi. Qo'shtirnoqlar ham olib tashlanadi.
    return m[1].trim().replace(/^["']|["']$/g, "");
  };
  return { username: pick("ADMIN_USERNAME"), hash: pick("ADMIN_PASSWORD_HASH") };
}

const { username, hash } = readPanelEnv();
console.log(`panel/.env → ADMIN_USERNAME=${username || "(yo'q)"} · hash uzunligi ${hash.length}`);

if (!username || !hash) {
  console.error("ADMIN_USERNAME yoki ADMIN_PASSWORD_HASH bo'sh — panel .env ni tekshiring.");
  process.exit(1);
}
if (!/^\$2[aby]\$/.test(hash)) {
  console.error(`Hash bcrypt formatida emas: ${hash.slice(0, 12)}…`);
  process.exit(1);
}

const login = username.trim().toLowerCase();

/* ---------- parolni tekshirish ---------- */

const check = flag("--check");
if (check !== null) {
  const user = getUserByLogin(login);
  const stored = user
    ? db.prepare("SELECT password_hash FROM users WHERE login = ?").get(login).password_hash
    : null;
  console.log(`panel .env hash bilan mos: ${bcrypt.compareSync(check, hash)}`);
  console.log(`users jadvalidagi hash bilan mos: ${stored ? bcrypt.compareSync(check, stored) : "(hisob yo'q)"}`);
  process.exit(0);
}

/* ---------- moslashtirish ---------- */

let user = getUserByLogin(login);

if (!user) {
  // Ko'chirishda boshqa nom bilan yaratilgan superadmin bormi (masalan "admin")?
  const orphan = listUsers().find((u) => u.isSuperadmin);
  if (orphan) {
    db.prepare("UPDATE users SET login = ?, password_hash = ? WHERE id = ?").run(login, hash, orphan.id);
    console.log(`Superadmin nomi to'g'rilandi: ${orphan.login} → ${login}`);
  } else {
    db.prepare(
      "INSERT INTO users (login, display_name, password_hash, is_superadmin) VALUES (?, ?, ?, 1)"
    ).run(login, "Administrator", hash);
    console.log(`Superadmin yaratildi: ${login}`);
  }
  user = getUserByLogin(login);
} else {
  db.prepare("UPDATE users SET password_hash = ?, is_superadmin = 1, is_active = 1 WHERE id = ?").run(hash, user.id);
  console.log(`Mavjud hisob yangilandi: ${login} (parol panel .env dagi bilan bir xil)`);
}

// Superadmin uchun ruxsatlar jadvali ishlatilmaydi, lekin bo'lsa ham zarari
// yo'q — barcha bo'limni yozib qo'yamiz (kelajakda superadmin bekor qilinsa
// ham hisob ishlab qolsin).
setSections(user.id, SECTION_KEYS);
setFlags(user.id, ["mobile"]);

const newPassword = flag("--password");
if (newPassword) {
  setPassword(user.id, newPassword);
  console.log("Yangi parol o'rnatildi (panel .env dagi paroldan farqli bo'ldi).");
}

console.log("\nHozirgi foydalanuvchilar:");
for (const u of listUsers()) {
  console.log(
    `  ${u.login.padEnd(16)} ${u.isSuperadmin ? "superadmin" : u.sections.join(",") || "—"}` +
      `${u.isActive ? "" : "  (faolsiz)"}`
  );
}
