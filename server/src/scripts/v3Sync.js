// v3 bazasini serverga ko'chirish va natijani jadval bilan solishtirish.
//
//   node src/scripts/v3Sync.js                  # to'liq: MoySklad + jadval + solishtirish
//   node src/scripts/v3Sync.js --skip-moysklad  # faqat jadvaldan ko'chirish
//   node src/scripts/v3Sync.js --compare        # hech narsa yozmay, faqat solishtirish
//
// HECH NARSA YOZILMAYDI: na Uzumga, na jadvalga. Skript faqat o'qiydi va
// server bazasini to'ldiradi — joriy jarayonlar (GAS triggerlari, AppSheet)
// ishlab turaveradi.
//
// Solishtirish nima uchun: ko'chishning butun ma'nosi shu qadamda. Server
// hisoblagan `amount` bugun jadvalda turgan qiymat bilan mos kelmasa,
// GAS triggerini o'chirib bo'lmaydi.
import { config } from "../config.js";
import logger from "../logger.js";
import { getSheetsClient } from "../google/sheetsClient.js";
import { syncProducts, syncStock } from "../moysklad/assortment.js";
import { importAll } from "../stock/importFromSheet.js";
import { loadMods, loadDefaults, loadStockByExternalId, loadLinkProducts } from "../stock/catalog.js";
import { computeRow } from "../stock/rules.js";

const args = new Set(process.argv.slice(2));
const compareOnly = args.has("--compare");
const skipMoysklad = args.has("--skip-moysklad") || compareOnly;

function list(items, limit = 10) {
  if (!items.length) return "yo'q";
  const head = items.slice(0, limit).map((x) => (x.line ? `${x.line}-qator ${x.skuTitle || x.id}` : JSON.stringify(x)));
  return head.join(", ") + (items.length > limit ? ` … va yana ${items.length - limit} ta` : "");
}

/** Jadvaldagi hisoblangan F va L qiymatlarini o'qiydi (solishtirish uchun). */
async function sheetValues(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: "link_product!B2:L",
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const map = new Map();
  for (const row of res.data.values || []) {
    const skuTitle = String(row[0] || "").trim();
    if (!skuTitle) continue;
    // B=0 → F=4 (amount), L=10 (mc_stock fact)
    map.set(skuTitle, { amount: row[4], fact: row[10] });
  }
  return map;
}

async function compare(sheets) {
  const expected = await sheetValues(sheets);
  const mods = loadMods();
  const defaults = loadDefaults();
  const stock = loadStockByExternalId();
  const rows = loadLinkProducts();

  const diff = { amount: [], fact: [], missingInSheet: 0 };
  let checked = 0;

  for (const row of rows) {
    const want = expected.get(row.skuTitle);
    if (!want) {
      diff.missingInSheet++;
      continue;
    }
    checked++;

    const got = computeRow(row, {
      stock: stock.has(row.mcExternalId) ? stock.get(row.mcExternalId) : null,
      mod: mods.get(row.skuTitle) || null,
      defaults,
    });

    // Jadvalda "" bo'sh katak bo'lib keladi, bizda `null` — bir xil ma'no.
    const same = (a, b) => (a === null || a === undefined || a === "" ? b === "" || b === undefined || b === null : Number(a) === Number(b));

    if (!same(got.fact, want.fact)) diff.fact.push({ skuTitle: row.skuTitle, server: got.fact, sheet: want.fact });
    if (!same(got.amount, want.amount)) diff.amount.push({ skuTitle: row.skuTitle, server: got.amount, sheet: want.amount });
  }

  console.log(`\n── Solishtirish: ${checked} ta qator tekshirildi`);
  if (diff.missingInSheet) console.log(`   ${diff.missingInSheet} ta qator jadvalda topilmadi`);
  console.log(`   mc_stock fact (L) farqi: ${diff.fact.length}`);
  console.log(`   amount (F) farqi:        ${diff.amount.length}`);

  for (const d of diff.amount.slice(0, 20)) {
    console.log(`     ✕ ${d.skuTitle}: server=${d.server} jadval=${d.sheet}`);
  }
  if (diff.amount.length > 20) console.log(`     … va yana ${diff.amount.length - 20} ta`);

  for (const d of diff.fact.slice(0, 10)) {
    console.log(`     L ✕ ${d.skuTitle}: server=${d.server} jadval=${d.sheet}`);
  }

  return diff;
}

async function main() {
  if (!skipMoysklad) {
    console.log("── MoySklad: assortiment");
    console.log("  ", JSON.stringify(await syncProducts()));
    console.log("── MoySklad: qoldiq");
    console.log("  ", JSON.stringify(await syncStock()));
  }

  if (!compareOnly) {
    console.log("── Jadvaldan ko'chirish");
    const { links, mods } = await importAll();
    console.log(`   link_product: ${links.imported}/${links.total} (${links.skipped} o'tkazildi)`);
    console.log(`   qoidalar: ${mods.mods} ota, ${mods.details} qoida, ${mods.defaults} standart`);

    // Ogohlantirishlar — bular ko'chishdan keyin tozalanishi kerak.
    if (links.withSuffix.length) console.log(`   ⚠ K da eski qo'shimcha (@N/$): ${list(links.withSuffix)}`);
    if (links.noCardQty.length) console.log(`   ⚠ Card quantity bo'sh (amount 0 bo'ladi): ${list(links.noCardQty)}`);
    if (links.duplicates.length) console.log(`   ⚠ takroriy skuTitle: ${list(links.duplicates)}`);
    if (mods.orphanDetails.length) console.log(`   ⚠ otasi yo'q qoida: ${list(mods.orphanDetails)}`);
    if (mods.badComparison.length) console.log(`   ⚠ noma'lum operator: ${list(mods.badComparison)}`);
  }

  const diff = await compare(getSheetsClient());

  const ok = diff.amount.length === 0 && diff.fact.length === 0;
  console.log(ok ? "\n✅ Server hisobi jadval bilan to'liq mos." : "\n❌ Farq bor — GAS triggerini o'chirmang.");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  logger.error(`v3Sync xatosi: ${e.message}`);
  console.error(e);
  process.exit(1);
});
