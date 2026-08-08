// `uzum_order` + `uzum_order_detail` ni serverga ko'chirish.
//
//   node src/scripts/importOrders.js            # hammasi
//   node src/scripts/importOrders.js --compare  # yozmaydi, faqat farqni sanaydi
//
// FAQAT BAZAGA yozadi — na jadvalga, na Uzumga, na MoySklad'ga. Shuning
// uchun `pushStock.js` dagi kabi `--send` bayrog'i kerak emas: tashqi natija
// yo'q, eng yomoni ma'lumot qayta yoziladi.
//
// Ko'chirilgandan keyin "Uzum buyurtmalari" bo'limida hammasi ko'rinadi va
// jadvaldagi qiymatlar bilan solishtirib tekshirish mumkin.
import { config } from "../config.js";
import { db } from "../db/index.js";
import { getSheetsClient } from "../google/sheetsClient.js";
import { importOrders, importStatus } from "../orders/importFromSheet.js";

const COMPARE = process.argv.includes("--compare");

async function main() {
  const sheets = getSheetsClient();
  const { data } = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: config.spreadsheetId,
    ranges: [`${config.sheets.orders}!A:W`, `${config.sheets.details}!A:L`],
    // Barcode bosh nollarini yo'qotmaslik uchun detal FORMATTED bo'lishi
    // kerak edi, lekin bitta batchGet ikki xil rejimni qo'llamaydi —
    // shuning uchun ikkita so'rov.
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const orderRows = data.valueRanges[0].values || [];

  const detailResp = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: `${config.sheets.details}!A:L`,
    // `readSheets.js` bilan bir xil sabab: UNFORMATTED barcode'ning bosh
    // nollarini yeb qo'yadi va indeks ShK'dagi barcode bilan mos kelmaydi.
    valueRenderOption: "FORMATTED_VALUE",
  });
  const detailRows = detailResp.data.values || [];

  console.log(`\nJadval: ${orderRows.length - 1} buyurtma · ${detailRows.length - 1} qator`);

  const before = importStatus();
  console.log(`Bazada hozir: ${before.orders} buyurtma · ${before.items} qator`);

  if (COMPARE) {
    const sheetIds = new Set();
    for (let i = 1; i < orderRows.length; i++) {
      const id = String(orderRows[i]?.[0] ?? "").trim();
      if (id) sheetIds.add(id);
    }
    const dbIds = new Set(db.prepare("SELECT order_id FROM uzum_orders").all().map((r) => r.order_id));
    const onlySheet = [...sheetIds].filter((id) => !dbIds.has(id));
    const onlyDb = [...dbIds].filter((id) => !sheetIds.has(id));
    console.log(`\nFaqat jadvalda: ${onlySheet.length}${onlySheet.length ? ` — ${onlySheet.slice(0, 10).join(", ")}` : ""}`);
    console.log(`Faqat bazada:   ${onlyDb.length}${onlyDb.length ? ` — ${onlyDb.slice(0, 10).join(", ")}` : ""}`);
    console.log("\n(--compare: hech narsa yozilmadi)");
    return;
  }

  const result = importOrders({ orderRows, detailRows });
  const after = importStatus();

  console.log(`\nKo'chirildi: ${result.orders} buyurtma · ${result.items} qator`);
  if (result.skipped.orders || result.skipped.items) {
    console.log(`ID si yo'q qatorlar o'tkazib yuborildi: ${result.skipped.orders} buyurtma · ${result.skipped.items} detal`);
  }
  console.log(`Bazada endi: ${after.orders} buyurtma · ${after.items} qator`);
  console.log(`Shundan yig'ish keshida (oxirgi 3 kun): ${after.inCache}`);
  console.log("\n✅ Tayyor — Uzum buyurtmalari bo'limida ko'rinadi.");
}

main().catch((e) => {
  console.error("Xato:", e.message);
  process.exit(1);
});
