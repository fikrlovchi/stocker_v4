// Ombor sharoiti uchun: to'q fon (batareya + ko'z), yirik matn, kuchli
// rang kontrasti — natija bir metrdan ham ko'rinishi kerak.
export const colors = {
  bg: "#0f172a",
  panel: "#1e293b",
  line: "#334155",
  text: "#e2e8f0",
  muted: "#94a3b8",
  accent: "#3b82f6",
  ok: "#16a34a",
  warn: "#d97706",
  err: "#dc2626",
  done: "#7c3aed",
};

// Skan natijasi -> rang, sarlavha, tebranish turi.
// Server `result` kodlari: PLAN.md 4-bo'lim / server README.
export const RESULT_STYLE = {
  order_opened: { color: colors.accent, title: "BUYURTMA OCHILDI", haptic: "ok" },
  ok: { color: colors.ok, title: "QABUL QILINDI", haptic: "ok" },
  order_complete: { color: colors.done, title: "BUYURTMA YIG'ILDI", haptic: "done" },
  wrong_item: { color: colors.err, title: "BOSHQA TOVAR", haptic: "err" },
  already_complete: { color: colors.warn, title: "TO'LIQ SKANERLANGAN", haptic: "warn" },
  unknown_barcode: { color: colors.err, title: "BARCODE TOPILMADI", haptic: "err" },
  no_available_order: { color: colors.warn, title: "BUYURTMA YO'Q", haptic: "warn" },
};
