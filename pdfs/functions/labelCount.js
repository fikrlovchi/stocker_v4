// Bitta detail qatori uchun nechta ShK yorlig'i chiqishi.
//
// NEGA ALOHIDA MODUL: bu hisob ikki formatda ham bir xil bo'lishi kerak,
// lekin YANGI (40×30) formatda u tushib qolgan edi — har qator uchun faqat
// `copies` ta yorliq chiqardi va `Quantity for mc` (K) hisobga olinmasdi.
// Kartochkada bir nechta tovar bo'lganda (`link_product!N > 1`) yorliq
// yetmasdi: 1 ta Uzum SKU = 3 dona tovar bo'lsa 6 emas, 2 ta yorliq
// chiqardi.
//
// Bog'liqliksiz modul — testda ham shundoq ishlatiladi.

/**
 * @param {number} quantity  `uzum_order_detail!K` — "Quantity for mc",
 *   ya'ni MoySklad birligidagi son (Uzum miqdori × kartochkadagi miqdor).
 *   `uzum_order_detail!F` (Uzum miqdori) EMAS — kartochkada bir nechta
 *   tovar bo'lsa F yetarli bo'lmaydi.
 * @param {number} copies  bitta tovarga necha nusxa (standart 2)
 * @returns {number} betlar soni. `quantity` yaroqsiz bo'lsa 0 — bu
 *   ma'lumotdagi xato va uni jim to'ldirib qo'yish yorliqni noto'g'ri
 *   chiqarishdan yomonroq.
 */
export function shkPageCount(quantity, copies = 2) {
  const q = Math.floor(Number(quantity) || 0);
  if (q < 1) return 0;
  const c = Math.max(1, Math.floor(Number(copies) || 1));
  return q * c;
}
