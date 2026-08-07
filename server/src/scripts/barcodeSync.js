// Bayroq qo'yilgan barcode'larni MoySklad'ga qo'shish — v3 dagi
// `addBarcodesToMoySklad` ning o'rni.
//
//   node src/scripts/barcodeSync.js           # DRY-RUN: hech narsa yozilmaydi
//   node src/scripts/barcodeSync.js --write    # HAQIQATAN yozadi
//   node src/scripts/barcodeSync.js --write --keep-sheet-flag
//
// STANDART HOLAT — DRY-RUN. Bu oqim MoySklad'ni o'zgartiradi (tovarga
// barcode qo'shadi) va jadvalga yozadi (bayroqni tozalaydi).
//
// `--keep-sheet-flag` — MoySklad'ga yozadi, lekin jadvaldagi bayroqni
// tegmaydi. GAS trigger'i hali yoqilgan bo'lsa shu bilan sinash mumkin:
// server ishini bajaradi, GAS esa keyin "allaqachon bor" deb ko'radi va
// bayroqni o'zi tozalaydi — takror barcode qo'shilmaydi.
import logger from "../logger.js";
import { getSheetsClient } from "../google/sheetsClient.js";
import { pendingBarcodeRows, addBarcodesToMoySklad, clearFlag, detectBarcodeType } from "../stock/barcodeToMc.js";
import { clearBarcodeFlags } from "../stock/sheetWriteback.js";
import { notify } from "../telegram/index.js";

const args = new Set(process.argv.slice(2));
const write = args.has("--write");
const keepSheetFlag = args.has("--keep-sheet-flag");

async function main() {
  const rows = pendingBarcodeRows();

  console.log(`\n${write ? "YOZISH" : "DRY-RUN — hech narsa yozilmaydi"}`);
  console.log(`Bayroq qo'yilgan qator: ${rows.length}\n`);

  if (!rows.length) {
    console.log("Ishlash uchun qator yo'q.");
    return;
  }

  for (const r of rows.slice(0, 20)) {
    console.log(`   ${r.skuTitle}  ${r.barcode || "(barcode yo'q)"}  ${r.barcode ? detectBarcodeType(r.barcode) : ""}`);
  }
  if (rows.length > 20) console.log(`   … va yana ${rows.length - 20} ta`);

  // Muvaffaqiyatli qatorlar: server bazasidagi bayroq darhol tozalanadi,
  // jadvaldagisi esa oxirida bitta so'rov bilan.
  const doneSkuTitles = [];
  const report = await addBarcodesToMoySklad(rows, {
    dryRun: !write,
    onDone: async (row) => {
      clearFlag(row.id);
      doneSkuTitles.push(row.skuTitle);
    },
  });

  console.log("\nNatija:");
  console.log(`   qo'shildi:          ${report.added.length}`);
  console.log(`   allaqachon bor edi: ${report.already.length}`);
  console.log(`   ma'lumot yetarsiz:  ${report.skipped.length}`);
  console.log(`   xato:               ${report.failed.length}`);

  for (const f of report.failed.slice(0, 10)) console.log(`     ✕ ${f.skuTitle}: ${f.reason}`);
  for (const s of report.skipped.slice(0, 10)) console.log(`     ⚠ ${s.skuTitle}: ${s.reason}`);

  if (!write) {
    console.log("\nHech narsa yozilmadi. Yozish uchun: --write");
    return;
  }

  if (doneSkuTitles.length && !keepSheetFlag) {
    const cleared = await clearBarcodeFlags(getSheetsClient(), doneSkuTitles);
    console.log(`\nJadvalda bayroq tozalandi: ${cleared.cleared}`);
    if (cleared.notFound.length) console.log(`   ⚠ jadvalda topilmadi: ${cleared.notFound.join(", ")}`);
  } else if (keepSheetFlag) {
    console.log("\nJadvaldagi bayroq tegilmadi (--keep-sheet-flag).");
  }

  logger.info(
    `Barcode → MoySklad: ${report.added.length} qo'shildi, ${report.already.length} bor edi, ` +
      `${report.failed.length} xato`
  );

  if (report.failed.length || report.skipped.length) {
    await notify(
      "mc_barcode",
      `⚠️ <b>Barcode → MoySklad</b>\n` +
        `Qo'shildi: ${report.added.length}\n` +
        `Xato: ${report.failed.length}\n` +
        `Ma'lumot yetarsiz: ${report.skipped.length}\n` +
        [...report.failed, ...report.skipped]
          .slice(0, 5)
          .map((f) => `• ${f.skuTitle}: ${f.reason}`)
          .join("\n")
    );
  }

  process.exit(report.failed.length ? 1 : 0);
}

main().catch((e) => {
  logger.error(`barcodeSync xatosi: ${e.message}`);
  console.error(e);
  process.exit(1);
});
