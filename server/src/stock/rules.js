// Uzumga yuboriladigan qoldiqni hisoblash — v3 dagi `link_product!L1` va
// `link_product!F1` formulalarining aynan o'zi, faqat kodda.
//
// Nega "aynan": ko'chish davrida server hisobi bugungi jadval qiymati bilan
// solishtiriladi (`src/scripts/compareStock.js`). Farq chiqsa — bu xato, ya'ni
// mantiqni "yaxshilash" solishtiruvni ma'nosiz qilardi. Soddalashtirish
// keyin, jadval o'chgandan so'ng.
//
// Sheets'ning ikkita xatti-harakati ataylab takrorlangan:
//   • `INT()` — pastga yaxlitlash (manfiyda ham −∞ tomon);
//   • `IFERROR(... / N, 0)` — N bo'sh yoki 0 bo'lsa natija 0, xato emas.

/** Manbadagi uchta operator; boshqasi yozilgan bo'lsa qoida hech qachon ishlamaydi. */
export const COMPARISONS = ["greater than", "less than", "equal"];

function matches(amount, comparison, threshold) {
  if (comparison === "greater than") return amount > threshold;
  if (comparison === "less than") return amount < threshold;
  if (comparison === "equal") return amount === threshold;
  return false;
}

// Qoidalar `priority` bo'yicha o'sish tartibida ko'riladi va BIRINCHI mos
// kelgani g'olib (manbada SORT(...,TRUE) + INDEX(...,1)).
function firstMatch(rules, amount) {
  return [...rules].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0)).find((r) => matches(amount, r.comparison, r.quantityFrom));
}

// Manbada bo'sh katak "" bo'lib qaytadi va bu "qiymat yo'q" degani —
// 0 bilan aralashtirib bo'lmaydi.
const isBlank = (v) => v === "" || v === null || v === undefined;

/**
 * `link_product!L` — "mc_stock fact".
 *
 * MoySklad qoldig'i, kartochkadagi eski `@N` qo'shimchasiga bo'lingan holda.
 * MoySklad tovari biriktirilmagan (`mcUuid` bo'sh) yoki qoldiq topilmagan
 * bo'lsa — `null` ("" ning o'rni), bu 0 EMAS.
 *
 * @param {number|null} stock  mc_stock dagi qoldiq (topilmasa null)
 * @param {object} row  { mcUuid, legacyDivisor }
 */
export function mcStockFact(stock, { mcUuid, legacyDivisor = 1 } = {}) {
  if (!mcUuid) return null;
  if (stock === null || stock === undefined || stock === "") return null;
  return Math.floor(Number(stock) / (Number(legacyDivisor) || 1));
}

/**
 * `link_product!F` — Uzumga yuboriladigan son.
 *
 * @param {number|null} fact  mcStockFact() natijasi
 * @param {object} row  { skuTitle, cardQuantity }
 * @param {object} rules  { mod, defaults }
 *   mod      — shu SKU uchun `uzum_stock_mod` qatori va uning `details` i (yo'q bo'lsa null)
 *   defaults — `uzum_mod_default` qatorlari
 * @returns {number|null} null — manbadagi "" (skuTitle bo'sh)
 */
export function uzumAmount(fact, { skuTitle, cardQuantity = 1 } = {}, { mod = null, defaults = [] } = {}) {
  if (!skuTitle) return null;
  // Qoldiq noma'lum yoki manfiy — Uzumga 0 ketadi.
  if (fact === null || fact === undefined || fact === "" || fact < 0) return 0;

  // 1. Shu SKU uchun maxsus qoida.
  //    "NO_MATCH" — qoida umuman yo'q yoki hech biri mos kelmadi.
  //    "" — qoida mos keldi, lekin natijasi bo'sh: haqiqiy qoldiq qoladi.
  let custom = "NO_MATCH";
  if (mod) {
    const hit = firstMatch(mod.details || [], fact);
    if (hit) custom = hit.useDefault ? mod.defaultQuantity : hit.quantityTo;
  }

  let final;
  if (custom !== "NO_MATCH") {
    final = isBlank(custom) ? fact : custom;
  } else {
    const hit = firstMatch(defaults, fact);
    final = hit && !isBlank(hit.quantityTo) ? hit.quantityTo : "";
  }

  // Hech qaysi qoida qiymat bermadi — kodga yozilgan zaxira shart.
  // (Bugun `uzum_mod_default` da aynan shu qoida turibdi, ya'ni bu yo'l
  // faqat standart qoida o'chirilsa ishlaydi.)
  if (isBlank(final)) final = fact < 10 ? 0 : fact;

  // Kartochkada bir nechta tovar bo'lsa: MoySklad'da 100 ta, kartochkada 3 ta
  // → Uzumga 33. N bo'sh bo'lsa manbada #DIV/0! chiqib IFERROR 0 berardi.
  const n = Number(cardQuantity);
  if (!n) return 0;
  return Math.floor(Number(final) / n);
}

/**
 * Bitta qator uchun ikkovini birga hisoblaydi — chaqiruvchi joylarda
 * ketma-ketlik takrorlanmasin.
 */
export function computeRow(row, { stock, mod, defaults }) {
  const fact = mcStockFact(stock, row);
  return { fact, amount: uzumAmount(fact, row, { mod, defaults }) };
}
