// Buyurtma formulalarini solishtirish — 6-bosqichning BIRINCHI qadami.
//
//   node src/scripts/orderSync.js                 # hammasi (~8200 qator)
//   node src/scripts/orderSync.js --limit=500     # tez tekshiruv
//   node src/scripts/orderSync.js --samples=20    # ko'proq namuna
//
// HECH NARSA YOZMAYDI — na jadvalga, na bazaga, na Uzumga. Vazifasi bitta:
// server hisobi bugungi jadval qiymati bilan AYNAN bir xilmi degan savolga
// javob berish. Farq bo'lsa exit kodi 1.
//
// Nega kerak: Sheets bilan aloqani uzishdan oldin, formulalar to'g'ri
// ko'chganiga ishonch bo'lishi kerak. `link_product!L`/`!F` uchun xuddi shu
// tartib ishlatilgan (`v3Sync.js`) va u yerda 5 ta farqning hammasi qoldiq
// eskirganidan chiqqan edi — taxminda qolmadi.
import { config } from "../config.js";
import { getSheetsClient } from "../google/sheetsClient.js";
import { columnIndexMap, extractProductRef } from "../util/sheetValues.js";
import { loadCatalogs, assertReady } from "../orders/catalogs.js";
import { trackingId, orderRefs, detailRefs } from "../orders/formulas.js";

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split("=")[1]) : fallback;
};
const LIMIT = arg("limit", Infinity);
const SAMPLES = arg("samples", 5);

// Hisoblanadigan ustunlar — config.json da yo'q (server ularni o'qimaydi,
// endi HISOBLAYDI), shuning uchun shu yerda.
const ORDER_COLS = { organization: "O", salesChannel: "P", tracking: "R" };
const DETAIL_COLS = { skuTitle: "C", amount: "F", product: "I", entityType: "J", quantity: "K", difference: "L" };

const ORD = columnIndexMap({ ...config.columns.orders, ...ORDER_COLS });
const DET = columnIndexMap(DETAIL_COLS);

const cell = (row, i) => (row && row[i] !== undefined && row[i] !== null ? row[i] : "");
const isSheetError = (v) => typeof v === "string" && v.startsWith("#");

// Jadvalda `online.moysklad.ru`, kodda `api.moysklad.ru` uchraydi — bir xil
// havola (uzumOrderToMC `toHref` ham shuni qiladi).
function normHref(value) {
  const s = String(value ?? "").trim();
  if (!s || isSheetError(s)) return "";
  return s.replace("online.moysklad.ru", "api.moysklad.ru");
}

/**
 * Bitta ustunning hisobi.
 *
 * Uch xil natija ATAYLAB ajratilgan — ular boshqa-boshqa xulosa beradi:
 *   same     — mos keldi;
 *   unlinked — ikkala tomonda ham qiymat yo'q (jadvalda `#N/A`/bo'sh, serverda
 *              null). Bu XATO emas: SKU yoki do'kon bog'lanmagan;
 *   diff     — haqiqiy farq, ko'chirishga to'sqinlik qiladi.
 */
function column(name) {
  return { name, same: 0, unlinked: 0, diff: 0, onlySheet: 0, onlyServer: 0, samples: [] };
}

function compare(col, { key, sheet, server }) {
  const sheetEmpty = sheet === "" || sheet === null || sheet === undefined;
  const serverEmpty = server === "" || server === null || server === undefined;

  if (sheetEmpty && serverEmpty) {
    col.unlinked++;
    return;
  }
  if (String(sheet) === String(server)) {
    col.same++;
    return;
  }

  if (serverEmpty) col.onlyServer++;
  else if (sheetEmpty) col.onlySheet++;
  col.diff++;
  if (col.samples.length < SAMPLES) col.samples.push({ key, sheet, server });
}

async function main() {
  const catalogs = loadCatalogs();
  assertReady(catalogs);

  const sheets = getSheetsClient();
  const { data } = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: config.spreadsheetId,
    ranges: [`${config.sheets.orders}!A:W`, `${config.sheets.details}!A:L`],
    // Xato kataklar ("#N/A") shu rejimda matn bo'lib keladi — aynan shu kerak:
    // "bog'lama yo'q" holatini farqdan ajratamiz.
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  const orderRows = data.valueRanges[0].values || [];
  const detailRows = data.valueRanges[1].values || [];

  console.log(`\nJadval: ${orderRows.length - 1} buyurtma · ${detailRows.length - 1} qator`);
  console.log(
    `Katalog: ${catalogs.shops.size} do'kon · ${catalogs.links.size} bog'lama · ` +
      `${catalogs.productByExternalId.size} MoySklad tovari\n`
  );

  const cols = {
    O: column("uzum_order!O  organization_href"),
    P: column("uzum_order!P  saleschannel_href"),
    R: column("uzum_order!R  Tracking ID"),
    I: column("uzum_order_detail!I  Product href"),
    J: column("uzum_order_detail!J  Entity type"),
    K: column("uzum_order_detail!K  Quantity for mc"),
    L: column("uzum_order_detail!L  Difference"),
  };

  /* ---------- uzum_order ---------- */

  for (let i = 1; i < orderRows.length && i <= LIMIT; i++) {
    const row = orderRows[i];
    const orderId = cell(row, ORD.orderId);
    if (!orderId) continue;

    const { organizationHref, salesChannelHref } = orderRefs(cell(row, ORD.shopId), catalogs);

    compare(cols.O, {
      key: orderId,
      sheet: normHref(cell(row, ORD.organization)),
      server: normHref(organizationHref),
    });
    compare(cols.P, {
      key: orderId,
      sheet: normHref(cell(row, ORD.salesChannel)),
      server: normHref(salesChannelHref),
    });
    compare(cols.R, {
      key: orderId,
      sheet: String(cell(row, ORD.tracking)).trim(),
      server: trackingId(orderId),
    });
  }

  /* ---------- uzum_order_detail ---------- */

  // "Bog'lanmagan" holatni alohida sanaymiz: bu ko'chishga to'sqinlik
  // qilmaydi, lekin nechtaligi bilinishi kerak (Tovar bog'lamalari bo'limida
  // shu ro'yxat turadi).
  const unlinkedSkus = new Set();

  for (let j = 1; j < detailRows.length && j <= LIMIT; j++) {
    const row = detailRows[j];
    const skuTitle = String(cell(row, DET.skuTitle)).trim();
    const amount = cell(row, DET.amount);
    const key = `${skuTitle || "(bo'sh)"} · qator ${j + 1}`;

    const got = detailRefs({ skuTitle, amount }, catalogs);
    if (skuTitle && !got.linked) unlinkedSkus.add(skuTitle);

    // `extractProductRef` UUID ni kichik harfga keltiradi — server tomonida
    // ham shunday qilamiz, aks holda harf registri farq bo'lib ko'rinardi.
    const sheetRef = extractProductRef(cell(row, DET.product));
    compare(cols.I, { key, sheet: sheetRef || "", server: (got.productRef || "").toLowerCase() });

    const sheetType = String(cell(row, DET.entityType)).trim().toLowerCase();
    compare(cols.J, {
      key,
      sheet: isSheetError(sheetType) ? "" : sheetType,
      server: (got.entityType || "").toLowerCase(),
    });

    const sheetQty = cell(row, DET.quantity);
    compare(cols.K, {
      key,
      sheet: isSheetError(sheetQty) || sheetQty === "" ? "" : Number(sheetQty),
      server: got.quantityForMc === null ? "" : got.quantityForMc,
    });

    const sheetDiff = cell(row, DET.difference);
    compare(cols.L, {
      key,
      sheet: isSheetError(sheetDiff) || sheetDiff === "" ? "" : Boolean(sheetDiff),
      server: got.difference === null ? "" : got.difference,
    });
  }

  /* ---------- hisobot ---------- */

  let failed = 0;
  for (const col of Object.values(cols)) {
    const total = col.same + col.unlinked + col.diff;
    const mark = col.diff === 0 ? "✅" : "❌";
    console.log(
      `${mark} ${col.name.padEnd(38)} mos ${String(col.same).padStart(5)} · ` +
        `bog'lanmagan ${String(col.unlinked).padStart(4)} · farq ${String(col.diff).padStart(4)} / ${total}`
    );
    if (col.diff) {
      failed++;
      if (col.onlySheet) console.log(`     faqat jadvalda: ${col.onlySheet}`);
      if (col.onlyServer) console.log(`     faqat serverda: ${col.onlyServer}`);
      for (const s of col.samples) {
        console.log(`     ${s.key}\n        jadval: ${JSON.stringify(s.sheet)}\n        server: ${JSON.stringify(s.server)}`);
      }
    }
  }

  if (unlinkedSkus.size) {
    const list = [...unlinkedSkus].slice(0, SAMPLES).join(", ");
    console.log(`\nBog'lanmagan SKU: ${unlinkedSkus.size} ta — ${list}${unlinkedSkus.size > SAMPLES ? " …" : ""}`);
    console.log("Ular Tovar bog'lamalari bo'limining tepasida ham ko'rinadi.");
  }

  if (failed) {
    console.log(`\n❌ ${failed} ta ustunda farq bor — ko'chirishdan oldin hal qilinishi kerak.`);
    process.exitCode = 1;
  } else {
    console.log("\n✅ Hamma hisoblanadigan ustun jadval bilan bir xil.");
  }
}

main().catch((e) => {
  console.error("Xato:", e.message);
  process.exit(1);
});
