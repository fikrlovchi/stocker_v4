// Dastur bo'limlari — ruxsatlarning yagona ro'yxati.
//
// Baza `user_permissions.section` ni cheklamaydi (yangi bo'lim qo'shish
// migratsiya talab qilmasin), shuning uchun to'g'ri qiymatlar ro'yxati
// SHU YERDA. Server har so'rovda shu bo'yicha tekshiradi — menyuni yashirish
// yetarli emas, aks holda URL'ni qo'lda yozib kirish mumkin bo'lardi.
// Kalitlar O'ZGARMAYDI: `user_permissions.section` da aynan shular yozilgan,
// nomni o'zgartirsak hamma ruxsat yo'qolardi. Ko'rinadigan nom esa erkin.
export const SECTIONS = [
  { key: "orders_to_mc", label: "Integratsiyalar" },
  { key: "link_product", label: "Tovar bog'lamalari (link_product)" },
  { key: "uzum_orders", label: "Uzum buyurtmalari" },
  { key: "packing", label: "Stocker — yig'ish" },
  { key: "labels", label: "Yorliqlar" },
  { key: "users", label: "Foydalanuvchilar va ruxsatlar" },
  { key: "settings", label: "Konfiguratsiya" },
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
