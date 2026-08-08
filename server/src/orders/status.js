// Buyurtma STATUSI — hisoblanadi, saqlanmaydi (docs/V3-MIGRATION.md, 6-bosqich).
//
// Ikkinchi haqiqat manbai bo'lmasligi uchun status hech qayerda yozilmaydi:
// har safar mavjud ma'lumotdan chiqariladi. Kalit saqlanadi, matn esa
// interfeysda tarjima qilinadi (`client/src/i18n.js`) — ilova ikki tilli.
//
// Kirish signallari va ular qayerdan keladi:
//
//   arrivedAtMs      `uzum_order!W` — buyurtma TUSHGAN vaqt (joriy soat emas)
//   uzumConfirmed    `!T` — Uzum'da tasdiqlangan
//   mcState          `!U` — MoySklad holati o'rnatilgan ("hold" | "done")
//   canceledInMc     MoySklad "Отменен" (`canceled_orders`, MoySklad'dan o'qiladi)
//   packed           yig'ilgan (`packed_orders` yoki tugagan sessiya)
//   markBuildError   `/canceluzum` qabul qilgan (MoySklad "Ошибка сборки")
//   markCanceled     `/mccanceled` qabul qilgan (MoySklad "Отменен")
//   canceledOnUzum   Uzum'da bekor, MoySklad'da hali emas
//
// ⚠ `canceledOnUzum` bugungi ma'lumotda YO'Q: `uzum_order!B` buyurtma
// tushgan paytdagi holat (CREATED) va keyin yangilanmaydi. Shuning uchun
// `cancel_pending` server Uzum'dan holatni o'zi so'ray boshlagandan keyin
// paydo bo'ladi. Xuddi shunday `build_error` ham `/canceluzum` yozilgach.

export const STATUS = {
  NEW: "new",                       // Yangi
  PACKING: "packing",               // Yig'ilmoqda
  PACKED: "packed",                 // Yig'ildi
  AUTO_CANCELED: "auto_canceled",   // Avtomatik bekor bo'ldi
  CANCEL_PENDING: "cancel_pending", // Bekor qilinishi kutilmoqda
  BUILD_ERROR: "build_error",       // Yig'ish xatosi (Ошибка сборки)
  CANCELED: "canceled",             // Bekor qilindi
};

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Berilgan paytning Toshkent bo'yicha kun boshidan hisoblangan daqiqasi. */
export function tashkentMinutes(ms) {
  const d = new Date(ms + TASHKENT_OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** "HH:mm" → daqiqa. Noto'g'ri qiymatda null. */
export function parseHHMM(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Buyurtma kutish oynasida TUSHGANMI.
 *
 * `uzum-order-to-mc/src/timeWindow.js` bilan bir xil yarim ochiq oraliq
 * `[start, end)` — "ichida"/"tashqarida" ikki joyda boshqacha hisoblansa
 * ular bir-biriga zid kelib qolardi.
 */
export function arrivedInHoldWindow(arrivedAtMs, startMin, endMin) {
  if (arrivedAtMs == null || startMin == null || endMin == null) return false;
  const min = tashkentMinutes(arrivedAtMs);
  return min >= startMin && min < endMin;
}

/**
 * Statusni hisoblaydi. Tartib MUHIM — yuqoridagi shart pastdagilarni
 * bosib o'tadi.
 */
export function orderStatus(order, { holdStartMin, holdEndMin } = {}) {
  // 1. Endpoint belgilari — tashqaridan kelgan aniq fakt, ular ustidan
  //    boshqa hech narsa hukm qilmaydi.
  if (order.markBuildError) return STATUS.BUILD_ERROR;
  if (order.markCanceled) return STATUS.CANCELED;

  // 2. Bekor qilinganlik YIG'ILGANDAN USTUN turadi.
  //
  //    Yig'ilgan buyurtma keyin bekor qilinsa — bu odatiy holat emas va
  //    e'tibor talab qiladi. "Yig'ildi" deb ko'rsatilsa muammo ekranda
  //    umuman ko'rinmay qolardi.
  //
  //    Tasdiqlanmagan (T ≠ 1) bo'lsa — buyurtma tasdiqlanishidan oldin
  //    bekor bo'lgan va tizim uni O'ZI MoySklad'da bekor qilib xabar bergan
  //    (orderStatusSync). Tasdiqlangan bo'lsa — bekor qilishni odam qilgan.
  if (order.canceledInMc) {
    return order.uzumConfirmed ? STATUS.CANCELED : STATUS.AUTO_CANCELED;
  }

  // 3. Uzum'da bekor, MoySklad'da hali emas — qo'lda bekor qilish kutilmoqda.
  if (order.canceledOnUzum) return STATUS.CANCEL_PENDING;

  // 4. Yig'ib bo'lingan.
  if (order.packed) return STATUS.PACKED;

  // 5. Kutish oynasida tushgan va hali ishlanmagan.
  //
  //    Shart TUSHGAN VAQT bo'yicha, joriy soat bo'yicha emas: oynada tushgan
  //    buyurtma 11:01 dagi ishlovgacha "Yangi" bo'lib turadi. Ishlov
  //    tugaganini `mcState = "done"` bildiradi.
  if (String(order.mcState || "").toLowerCase() !== "done") {
    if (arrivedInHoldWindow(order.arrivedAtMs, holdStartMin, holdEndMin)) return STATUS.NEW;
  }

  return STATUS.PACKING;
}
