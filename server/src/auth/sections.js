// Dastur bo'limlari — ruxsatlarning yagona ro'yxati.
//
// Baza `user_permissions.section` ni cheklamaydi (yangi bo'lim qo'shish
// migratsiya talab qilmasin), shuning uchun to'g'ri qiymatlar ro'yxati
// SHU YERDA. Server har so'rovda shu bo'yicha tekshiradi — menyuni yashirish
// yetarli emas, aks holda URL'ni qo'lda yozib kirish mumkin bo'lardi.
export const SECTIONS = [
  { key: "orders_to_mc", label: "Uzum order to MC" },
  { key: "packing", label: "Stocker — yig'ish" },
  { key: "labels", label: "Yorliqlar" },
  { key: "users", label: "Foydalanuvchilar va ruxsatlar" },
  { key: "settings", label: "Sozlamalar" },
];

export const SECTION_KEYS = SECTIONS.map((s) => s.key);

// Bayroqlar — bo'lim emas, alohida huquq.
export const FLAGS = [
  { key: "mobile", label: "Mobil ilovadan foydalanish" },
];

export const FLAG_KEYS = FLAGS.map((f) => f.key);

export function isValidSection(section) {
  return SECTION_KEYS.includes(section);
}

export function isValidFlag(flag) {
  return FLAG_KEYS.includes(flag);
}
