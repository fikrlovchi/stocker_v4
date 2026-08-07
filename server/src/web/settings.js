// Umumiy sozlamalar — hozircha yorliq (ShK) standart o'lchamlari.
//
// Nega serverda: ilgari bu qiymatlar brauzerning localStorage'ida edi
// (`uzumPdfCfg`). Bir kompyuterda moslab qo'yilgan bo'lsa, boshqasida yo'q —
// va yorliq boshqacha chiqardi. Endi qiymat bazada: kim ochsa ham bir xil.
import logger from "../logger.js";
import { getSetting, setSetting, deleteSetting } from "../settings.js";

export const SHK_CONFIG_KEY = "labels.shkConfig";

// ESKI format (A5 maket) uchun uzumPDFs'da qo'lda moslab yozilgan qiymatlar.
// Ular `pdfs/main.js` dagi DEFAULT_PDF_CONFIG bilan bir xil — shu yerga
// ko'chirildi, endi yagona manba shu va uni interfeysdan o'zgartirsa bo'ladi.
export const DEFAULT_SHK_CONFIG = {
  format: "legacy",
  legacy: {
    orientation: "portrait",
    qrSize: 360,
    pageSize: { width: 594, height: 420 },
    textSize: { top: 24, bottom: 50 },
    qrPosition: { x: 90, y: 40 },
  },
  // YANGI format (40×30) — o'lchamlari `pdfs/functions/shkSmall.js` dagi
  // DEFAULTS bilan bir xil. Bo'sh qoldirilgan maydon o'sha standartni
  // oladi, shuning uchun bu yerda faqat operator o'zgartirishi mumkin
  // bo'lganlari turadi.
  small: {
    copies: 2,
    qrMm: 15,
    nameMaxLines: 4,
  },
};

export function getShkConfig() {
  const saved = getSetting(SHK_CONFIG_KEY);
  if (!saved) return { config: DEFAULT_SHK_CONFIG, isDefault: true, updatedAt: null, updatedBy: null };
  // Saqlangan qiymat to'liq bo'lmasligi mumkin (yangi maydon qo'shilgan) —
  // standart ustiga qo'yiladi.
  return {
    config: {
      ...DEFAULT_SHK_CONFIG,
      ...saved.value,
      legacy: { ...DEFAULT_SHK_CONFIG.legacy, ...(saved.value.legacy || {}) },
      small: { ...DEFAULT_SHK_CONFIG.small, ...(saved.value.small || {}) },
    },
    isDefault: false,
    updatedAt: saved.updatedAt,
    updatedBy: saved.updatedBy,
  };
}

export function setShkConfig(config, login) {
  setSetting(SHK_CONFIG_KEY, config, login);
  logger.info(`Yorliq standart o'lchamlari yangilandi (${login})`);
  return getShkConfig();
}

export function resetShkConfig(login) {
  deleteSetting(SHK_CONFIG_KEY);
  logger.info(`Yorliq o'lchamlari standartga qaytarildi (${login})`);
  return getShkConfig();
}
