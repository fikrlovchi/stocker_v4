// Buyurtma yig'ishga chiqadimi — yagona qaror joyi (PLAN.md 3.1).
//
//   Q = 1        MoySklad'da yaratilgan
//   T = 1        Uzum'da tasdiqlangan (tasdiqlanmasdan bekor bo'lganlar T bo'sh qoladi)
//   U = "done"   MoySklad holati o'rnatilgan. "hold" (kutish oynasi) va bo'sh
//                (hali ishlanmagan) shu shart bilan chiqib ketadi
//   W            oxirgi `retentionDays` kun ichida
//   MoySklad'da bekor qilinmagan  (V ustuni bu maqsad uchun yaramaydi)
//   uzum_packing da yo'q          (allaqachon yig'ilmagan)
//
// `V` (cancelHandled) ATAYLAB ishlatilmaydi: cancelSync 24 soatlik monitoring
// tugagach bekor qilinmagan buyurtmaga ham V=1 qo'yadi (cancelSync.js:148).

export const REASONS = {
  OK: null,
  TOO_OLD: "too_old",
  NO_DATE: "no_date",
  NOT_IN_MOYSKLAD: "not_in_moysklad",
  NOT_CONFIRMED_ON_UZUM: "not_confirmed_on_uzum",
  HOLD_WINDOW: "hold_window",
  MC_STATE_PENDING: "mc_state_pending",
  NO_MOYSKLAD_ID: "no_moysklad_id",
  CANCELED: "canceled_in_moysklad",
  ALREADY_PACKED: "already_packed",
  NO_ITEMS: "no_items",
  BAD_QUANTITY: "bad_quantity",
  UNSCANNABLE_ITEM: "unscannable_item",
};

export const REASON_TEXT = {
  [REASONS.TOO_OLD]: "saqlash oynasidan eski",
  [REASONS.NO_DATE]: "W va C ustunlari bo'sh — buyurtma yoshini aniqlab bo'lmadi",
  [REASONS.NOT_IN_MOYSKLAD]: "MoySklad'da yaratilmagan (Q ≠ 1)",
  [REASONS.NOT_CONFIRMED_ON_UZUM]: "Uzum'da tasdiqlanmagan (T ≠ 1)",
  [REASONS.HOLD_WINDOW]: "kutish oynasida (U = hold)",
  [REASONS.MC_STATE_PENDING]: "MoySklad holati hali o'rnatilmagan (U bo'sh)",
  [REASONS.NO_MOYSKLAD_ID]: "MoySklad ID yo'q (S bo'sh)",
  [REASONS.CANCELED]: "MoySklad'da bekor qilingan",
  [REASONS.ALREADY_PACKED]: "allaqachon yig'ilgan (uzum_packing)",
  [REASONS.NO_ITEMS]: "uzum_order_detail'da qatori yo'q",
  [REASONS.BAD_QUANTITY]: "tovar miqdori (K) noto'g'ri yoki bo'sh",
  [REASONS.UNSCANNABLE_ITEM]: "tovarda birorta ham barcode yo'q",
};

// order: {orderId, statusQ, confirmedT, mcStateU, moySkladId, arrivedAtMs}
// items: [{quantity, barcodeCount}]
// ctx:   {nowMs, retentionMs, canceled:Set, packed:Set}
export function evaluateOrder(order, items, ctx) {
  if (order.arrivedAtMs == null) return REASONS.NO_DATE;
  if (ctx.nowMs - order.arrivedAtMs > ctx.retentionMs) return REASONS.TOO_OLD;

  if (String(order.statusQ) !== "1") return REASONS.NOT_IN_MOYSKLAD;
  if (String(order.confirmedT) !== "1") return REASONS.NOT_CONFIRMED_ON_UZUM;

  const state = String(order.mcStateU || "").trim().toLowerCase();
  if (state === "hold") return REASONS.HOLD_WINDOW;
  if (state !== "done") return REASONS.MC_STATE_PENDING;

  if (!order.moySkladId) return REASONS.NO_MOYSKLAD_ID;
  if (ctx.canceled.has(order.orderId)) return REASONS.CANCELED;
  if (ctx.packed.has(order.orderId)) return REASONS.ALREADY_PACKED;

  if (items.length === 0) return REASONS.NO_ITEMS;
  if (items.some((i) => !Number.isInteger(i.quantity) || i.quantity < 1)) return REASONS.BAD_QUANTITY;
  if (items.some((i) => i.barcodeCount === 0)) return REASONS.UNSCANNABLE_ITEM;

  return REASONS.OK;
}
