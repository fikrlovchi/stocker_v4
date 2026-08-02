// Butun MoySklad assortimentini majburiy qayta o'qiydi (TTL va "topilmadi"
// belgisiga qaramasdan). Odatda bu kechasi soat 3:00 da avtomatik bajariladi.
//
// Qo'lda kerak bo'ladigan holatlar:
//   • MoySklad'da ko'p tovarga barcode qo'shildi va darhol kerak
//   • tovarlar xato "topilmadi" deb belgilanib qolgan (24 soat kutmaslik uchun)
//
//   node src/scripts/syncBarcodes.js
import { fullAssortmentSync } from "../moysklad/productBarcodes.js";
import { getStats } from "../cache/queries.js";
import logger from "../logger.js";

try {
  const result = await fullAssortmentSync();
  console.log("\n--- Natija ---");
  console.log(JSON.stringify(result, null, 2));
  console.log("\n--- Kesh holati ---");
  const s = getStats();
  console.log(
    JSON.stringify(
      {
        mcProducts: s.mcProducts,
        mcProductsMissing: s.mcProductsMissing,
        mcBarcodes: s.mcBarcodes,
        lastFullSyncAt: s.lastFullSyncAt,
      },
      null,
      2
    )
  );
  console.log("\nEndi `node src/scripts/refreshOnce.js` bilan indeksni qayta quring.");
  process.exit(0);
} catch (e) {
  logger.error(`To'liq sinxronizatsiya muvaffaqiyatsiz: ${e.stack || e.message}`);
  process.exit(1);
}
