// Keshni bir marta yangilaydi va natijani chiqaradi — serversiz tekshirish
// uchun (`npm run refresh`). Sozlamalar to'g'riligini tekshirishning eng tez yo'li.
import { refreshCache } from "../cache/refresh.js";
import { getStats, findAmbiguousBarcodes } from "../cache/queries.js";
import logger from "../logger.js";

try {
  const summary = await refreshCache();
  console.log("\n--- Natija ---");
  console.log(JSON.stringify(summary, null, 2));
  console.log("\n--- Kesh holati ---");
  console.log(JSON.stringify(getStats(), null, 2));

  const ambiguous = findAmbiguousBarcodes(10);
  if (ambiguous.length) {
    console.log("\n--- Bir xil barcode turli tovarlarda ---");
    console.log(JSON.stringify(ambiguous, null, 2));
  }
  process.exit(0);
} catch (e) {
  logger.error(`Yangilash muvaffaqiyatsiz: ${e.stack || e.message}`);
  process.exit(1);
}
