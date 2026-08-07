// Jadvalga yozish — ko'chish davrida zarur bo'lgan yagona yo'nalish.
//
// Nima uchun kerak: `addBarcodeToMC` bayroqni (`link_product!H`) tozalab
// qo'yardi. Server bu ishni bajarib bayroqni tozalamasa, jadvalda bayroq
// qolib ketadi va GAS (yoki keyingi ishga tushish) xuddi shu barcode'ni
// qayta yuboradi.
//
// Qator raqami bazada SAQLANMAYDI: jadval AppSheet orqali o'zgaradi va
// qatorlar surilishi mumkin. Har yozishdan oldin `skuTitle` bo'yicha joriy
// qator topiladi — shunda noto'g'ri qatorga yozilmaydi.
import { config } from "../config.js";
import logger from "../logger.js";

const SHEET = "link_product";
const FLAG_COLUMN = "H";

/** skuTitle → jadvaldagi qator raqami (1 dan). */
async function rowIndex(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: `${SHEET}!B2:B`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const map = new Map();
  (res.data.values || []).forEach((r, i) => {
    const skuTitle = String(r[0] ?? "").trim();
    // Takror bo'lsa BIRINCHISI qoladi — XLOOKUP ham shunday ishlaydi.
    if (skuTitle && !map.has(skuTitle)) map.set(skuTitle, i + 2);
  });
  return map;
}

/**
 * Ko'rsatilgan qatorlarda barcode bayrog'ini tozalaydi (H = FALSE).
 *
 * Hammasi bitta `batchUpdate` bilan yoziladi: 100 qator uchun 100 so'rov
 * emas, bitta. Jadvalda topilmagan `skuTitle` lar qaytariladi — ular
 * e'tiborsiz qolmasligi kerak.
 */
export async function clearBarcodeFlags(sheets, skuTitles) {
  if (!skuTitles.length) return { cleared: 0, notFound: [] };

  const index = await rowIndex(sheets);
  const data = [];
  const notFound = [];

  for (const skuTitle of skuTitles) {
    const row = index.get(skuTitle);
    if (!row) {
      notFound.push(skuTitle);
      continue;
    }
    data.push({ range: `${SHEET}!${FLAG_COLUMN}${row}`, values: [[false]] });
  }

  if (data.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: config.spreadsheetId,
      requestBody: { valueInputOption: "USER_ENTERED", data },
    });
    logger.info(`Jadvalda barcode bayrog'i tozalandi: ${data.length} qator`);
  }

  return { cleared: data.length, notFound };
}
