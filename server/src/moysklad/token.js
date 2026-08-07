// MoySklad tokeni. Ilgari faqat `.env` dagi `MOYSKLAD_TOKEN` edi — endi
// Konfiguratsiya bo'limidan boshqariladi (v3 ko'chishi: `mc_token!A2` shu
// yerga keladi va GAS skriptlari o'rniga server ishlatadi).
//
// Tartib: bazadagi qiymat ustun; bo'lmasa `.env` ishlatiladi. Server ishga
// tushganda `.env` dagi qiymat bir marta bazaga ko'chiriladi — shunda
// yangilanishdan keyin ham token yo'qolmaydi va `.env` ni keyin tozalash
// mumkin bo'ladi.
import { env } from "../config.js";
import logger from "../logger.js";
import { getSetting, setSetting, deleteSetting } from "../settings.js";

export const MC_TOKEN_KEY = "moysklad.token";

export function getMoyskladToken() {
  return getSetting(MC_TOKEN_KEY)?.value?.token || env.moyskladToken || "";
}

/** Interfeys uchun: tokenning o'zi emas, holati va niqoblangan ko'rinishi. */
export function moyskladTokenInfo() {
  const saved = getSetting(MC_TOKEN_KEY);
  const token = getMoyskladToken();
  return {
    hasToken: Boolean(token),
    source: saved?.value?.token ? "db" : token ? "env" : "none",
    masked: token ? `${token.slice(0, 6)}…${token.slice(-4)}` : null,
    updatedAt: saved?.updatedAt || null,
    updatedBy: saved?.updatedBy || null,
  };
}

export function setMoyskladToken(token, login) {
  const value = String(token || "").trim();
  if (!value) throw new Error("Token bo'sh");
  setSetting(MC_TOKEN_KEY, { token: value }, login);
  logger.info(`MoySklad tokeni yangilandi (${login})`);
  return moyskladTokenInfo();
}

/** Bazadagini o'chiradi — shundan keyin yana `.env` dagi qiymat ishlaydi. */
export function clearMoyskladToken(login) {
  deleteSetting(MC_TOKEN_KEY);
  logger.info(`MoySklad tokeni bazadan o'chirildi (${login})`);
  return moyskladTokenInfo();
}

/** Ishga tushishda bir marta: `.env` dagi token bazaga ko'chiriladi. */
export function importLegacyMoyskladToken() {
  if (!env.moyskladToken) return false;
  if (getSetting(MC_TOKEN_KEY)?.value?.token) return false;
  setSetting(MC_TOKEN_KEY, { token: env.moyskladToken }, "import");
  logger.info("MoySklad tokeni .env dan Konfiguratsiyaga ko'chirildi");
  return true;
}
