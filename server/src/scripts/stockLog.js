// Qoldiq sinxronizatsiyasi tarixi — nomuvofiqlik qanchalik uchraydi?
//
//   node src/scripts/stockLog.js        # oxirgi 30 yozuv + xulosa
//   node src/scripts/stockLog.js 100    # oxirgi 100 yozuv
//
// `stockMissingConfirmations` ni pasaytirish xavfsizmi degan savolga aynan
// shu tarix javob beradi: agar "maqsadli so'rov topdi" ustuni deyarli har
// safar to'lgan bo'lsa, kutish rejimi amalda ishlamayapti va uni
// qisqartirsa bo'ladi.
import { recentStockSyncs, stockSyncSummary } from "../moysklad/stockLog.js";

const LIMIT = Math.max(1, Number(process.argv[2]) || 30);

const rows = recentStockSyncs(LIMIT);
if (!rows.length) {
  console.log("Hali yozuv yo'q — qoldiq sinxronizatsiyasi ishga tushmagan.");
  process.exit(0);
}

console.log("\nVaqt                 Hisobot  Saqlandi  Kelmadi  Topildi  Hamon yo'q  0 qilindi");
console.log("─".repeat(84));
for (const r of rows) {
  const flag = r.applied ? "" : "  ⛔ RAD ETILDI";
  console.log(
    `${r.at}  ${String(r.report_count ?? "—").padStart(7)}  ${String(r.stored_count ?? "—").padStart(8)}` +
      `  ${String(r.missing).padStart(7)}  ${String(r.restored).padStart(7)}` +
      `  ${String(r.still_missing).padStart(10)}  ${String(r.zeroed).padStart(9)}${flag}`
  );
  if (r.reason) console.log(`    sabab: ${r.reason}`);
  if (r.recheck_error) console.log(`    maqsadli so'rov xatosi: ${r.recheck_error}`);
}

const s = stockSyncSummary(LIMIT);
console.log(`\nXulosa (${s.runs} ta sinxronizatsiya, ${s.from} → ${s.to}):`);
console.log(`  rad etilgan hisobot:            ${s.rejected}`);
console.log(`  tovar tushib qolgan safarlar:   ${s.runsWithMissing}`);
console.log(`  bir safarda eng ko'p tushgani:  ${s.maxMissing}`);
console.log(`  maqsadli so'rov topgani:        ${s.restoredTotal}`);
console.log(`  maqsadli so'rov ham topmagani:  ${s.stillMissingTotal}`);
console.log(`  0 deb belgilangani:             ${s.zeroedTotal}`);
console.log(`  maqsadli so'rov xatolari:       ${s.recheckErrors}`);

if (s.runsWithMissing === 0) {
  console.log("\n✅ Nomuvofiqlik kuzatilmadi.");
} else if (s.stillMissingTotal === 0 && s.recheckErrors === 0) {
  console.log("\n✅ Har safar maqsadli so'rov hal qildi — kutish rejimi amalda ishlamadi.");
  console.log("   stockMissingConfirmations ni 2 ga tushirish xavfsiz ko'rinadi.");
} else {
  console.log("\n⚠ Maqsadli so'rov hammasini hal qilmadi — kutish rejimi kerak bo'lgan holatlar bor.");
  console.log("   stockMissingConfirmations ni pasaytirmang.");
}
