// Tebranish bilan qaytarma aloqa.
//
// Omborda operator ekranga qaramasdan ham natijani bilishi kerak, shuning
// uchun har natija turi o'z naqshiga ega: qabul qilindi — bitta qisqa,
// xato — uchta kuchli, buyurtma yig'ildi — uzun ketma-ketlik.
import * as Haptics from "expo-haptics";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function buzz(kind) {
  try {
    if (kind === "ok") {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (kind === "warn") {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else if (kind === "err") {
      // Uch marta — xatoni sezmay qolish mumkin emas.
      for (let i = 0; i < 3; i++) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        await sleep(140);
      }
    } else if (kind === "done") {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await sleep(160);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      await sleep(120);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } else {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  } catch {
    // Tebranish yo'q qurilmada jim o'tkazib yuboriladi.
  }
}
