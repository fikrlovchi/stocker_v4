// O'zbek va rus tillari. Tarjimalar shu faylda: hozircha hajmi kichik,
// alohida JSON fayllarga bo'lish faqat qidiruvni qiyinlashtiradi.
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const uz = {
  app: { title: "Stocker", loading: "Yuklanmoqda…" },
  nav: {
    orders_to_mc: "Uzum order to MC",
    packing: "Yig'ish",
    labels: "Yorliqlar",
    users: "Foydalanuvchilar",
    settings: "Sozlamalar",
    logout: "Chiqish",
  },
  login: {
    sub: "Ombor va marketplace boshqaruvi",
    login: "Login",
    password: "Parol",
    submit: "Kirish",
    failed: "Login yoki parol noto'g'ri",
    empty: "Login va parolni kiriting",
  },
  users: {
    title: "Foydalanuvchilar va ruxsatlar",
    sub: "Kim tizimga kira oladi va qaysi bo'limlarni ko'radi",
    add: "Foydalanuvchi qo'shish",
    login: "Login",
    name: "To'liq ism",
    password: "Parol",
    newPassword: "yangi parol",
    sections: "Bo'limlar",
    flags: "Qo'shimcha",
    status: "Holat",
    active: "faol",
    inactive: "faolsiz",
    superadmin: "superadmin",
    actions: "Amallar",
    save: "Saqlash",
    resetPassword: "Parolni tiklash",
    disable: "Faolsizlantirish",
    enable: "Faollashtirish",
    remove: "O'chirish",
    confirmRemove: "o'chirilsinmi?",
    superadminHint: "Superadmin barcha bo'limni ko'radi — ruxsat belgilanmaydi.",
    saved: "Saqlandi",
  },
  section: {
    orders_to_mc: "Uzum order to MC",
    packing: "Stocker — yig'ish",
    labels: "Yorliqlar",
    users: "Foydalanuvchilar va ruxsatlar",
    settings: "Sozlamalar",
  },
  flag: { mobile: "Mobil ilova" },
  soon: {
    title: "Bu bo'lim ko'chirilmoqda",
    body: "Hozircha eski interfeysda ishlaydi — havola pastda. Bo'lim shu yerga ko'chgach havola yo'qoladi.",
    open: "Eski interfeysni ochish",
  },
  theme: { dark: "Qora", light: "Oq" },
};

const ru = {
  app: { title: "Stocker", loading: "Загрузка…" },
  nav: {
    orders_to_mc: "Uzum order to MC",
    packing: "Сборка",
    labels: "Этикетки",
    users: "Пользователи",
    settings: "Настройки",
    logout: "Выйти",
  },
  login: {
    sub: "Управление складом и маркетплейсами",
    login: "Логин",
    password: "Пароль",
    submit: "Войти",
    failed: "Неверный логин или пароль",
    empty: "Введите логин и пароль",
  },
  users: {
    title: "Пользователи и права",
    sub: "Кто может войти и какие разделы видит",
    add: "Добавить пользователя",
    login: "Логин",
    name: "Полное имя",
    password: "Пароль",
    newPassword: "новый пароль",
    sections: "Разделы",
    flags: "Дополнительно",
    status: "Статус",
    active: "активен",
    inactive: "отключён",
    superadmin: "суперадмин",
    actions: "Действия",
    save: "Сохранить",
    resetPassword: "Сбросить пароль",
    disable: "Отключить",
    enable: "Включить",
    remove: "Удалить",
    confirmRemove: "удалить?",
    superadminHint: "Суперадмин видит все разделы — права не назначаются.",
    saved: "Сохранено",
  },
  section: {
    orders_to_mc: "Uzum order to MC",
    packing: "Stocker — сборка",
    labels: "Этикетки",
    users: "Пользователи и права",
    settings: "Настройки",
  },
  flag: { mobile: "Мобильное приложение" },
  soon: {
    title: "Раздел переносится",
    body: "Пока работает в старом интерфейсе — ссылка ниже. После переноса ссылка исчезнет.",
    open: "Открыть старый интерфейс",
  },
  theme: { dark: "Тёмная", light: "Светлая" },
};

const STORED = "stocker.lang";

i18n.use(initReactI18next).init({
  resources: { uz: { translation: uz }, ru: { translation: ru } },
  lng: localStorage.getItem(STORED) || "uz",
  fallbackLng: "uz",
  interpolation: { escapeValue: false },
});

export function setLanguage(lng) {
  localStorage.setItem(STORED, lng);
  i18n.changeLanguage(lng);
}

export default i18n;
