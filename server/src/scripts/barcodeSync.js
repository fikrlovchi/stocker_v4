// Bayroq qo'yilgan barcode'larni MoySklad'ga qo'shish — v3 dagi
// `addBarcodesToMoySklad` ning o'rni.
//
//   node src/scripts/barcodeSync.js                        # DRY-RUN
//   node src/scripts/barcodeSync.js --write                # HAQIQATAN yozadi
//   node src/scripts/barcodeSync.js --write --keep-sheet-flag
//
// STANDART HOLAT — DRY-RUN. Bu oqim MoySklad'ni o'zgartiradi va jadvalga
// yozadi (bayroqni tozalaydi).
//
// `--keep-sheet-flag` — MoySklad'ga yozadi, jadvaldagi bayroqqa tegmaydi.
// GAS trigger'i hali yoqiq bo'lsa shu bilan sinash mumkin: GAS keyin
// "allaqachon bor" deb ko'radi va bayroqni o'zi tozalaydi.
//
// Mantiq `stock/runner.js` da — interfeys va jadval ham shu yo'ldan o'tadi.
import logger from "../logger.js";
import { runStockJob } from "../stock/runner.js";

const args = new Set(process.argv.slice(2));

async function main() {
  const run = await runStockJob("barcode", {
    trigger: "cli",
    startedBy: "cli",
    dryRun: !args.has("--write"),
    keepSheetFlag: args.has("--keep-sheet-flag"),
  });

  const s = run.summary || {};

  console.log(`\n${args.has("--write") ? "YOZISH" : "DRY-RUN — hech narsa yozilmaydi"}`);
  console.log(`Bayroq qo'yilgan qator: ${s.pending ?? 0}\n`);

  if (!s.pending) {
    console.log("Ishlash uchun qator yo'q.");
    return;
  }

  console.log("Natija:");
  console.log(`   qo'shildi:          ${s.added ?? 0}`);
  console.log(`   allaqachon bor edi: ${s.already ?? 0}`);
  console.log(`   ma'lumot yetarsiz:  ${s.skipped ?? 0}`);
  console.log(`   xato:               ${s.failed ?? 0}`);

  for (const f of s.failures || []) console.log(`     ✕ ${f.skuTitle}: ${f.reason}`);

  if (s.sheet) {
    console.log(`\nJadvalda bayroq tozalandi: ${s.sheet.cleared}`);
    if (s.sheet.notFound?.length) console.log(`   ⚠ jadvalda topilmadi: ${s.sheet.notFound.join(", ")}`);
  }

  if (run.status === "error") {
    console.log(`\n❌ Xato: ${run.error}`);
    process.exit(1);
  }

  if (!args.has("--write")) console.log("\nHech narsa yozilmadi. Yozish uchun: --write");
  process.exit(s.failed ? 1 : 0);
}

main().catch((e) => {
  logger.error(`barcodeSync xatosi: ${e.message}`);
  console.error(e);
  process.exit(1);
});
