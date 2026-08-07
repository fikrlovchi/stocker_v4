// Uzumga qoldiq yuborish — v3 dagi `pushToUzumFast` ning o'rni.
//
//   node src/scripts/pushStock.js                # DRY-RUN: hech narsa yuborilmaydi
//   node src/scripts/pushStock.js --send         # HAQIQATAN yuboradi
//   node src/scripts/pushStock.js --shop=682     # faqat bitta do'kon
//   node src/scripts/pushStock.js --send --shop=682 --limit=20
//
// STANDART HOLAT — DRY-RUN. Uzumga yozish tashqi natijaga olib keladi:
// noto'g'ri son ketsa tovar sotuvdan chiqadi yoki yo'q tovarga buyurtma
// tushadi. Shuning uchun yuborish faqat `--send` bilan, ataylab.
//
// Ko'chish tartibi (docs/V3-MIGRATION.md):
//   1. dry-run bilan solishtirish — GAS yuborayotgan son bilan bir xilmi;
//   2. `--send --shop=<id> --limit=N` bilan bitta do'konda sinash;
//   3. GAS triggerini o'chirish;
//   4. shundan keyingina to'liq `--send`.
//
// GAS o'chirilmagan bo'lsa ikkalasi bir vaqtda yozadi — natija bir xil
// bo'lgani uchun xavfli emas, lekin so'rovlar ikki barobar bo'ladi.
import logger from "../logger.js";
import { db } from "../db/index.js";
import { loadMods, loadDefaults, loadStockByExternalId, loadLinkProducts, loadShopTokens } from "../stock/catalog.js";
import { buildPayloads, sendPayloads, checkBeforeSend } from "../stock/pushToUzum.js";
import { notify } from "../telegram/index.js";

const args = process.argv.slice(2);
const has = (name) => args.includes(name);
const value = (name) => args.find((a) => a.startsWith(`${name}=`))?.split("=")[1];

const send = has("--send");
// Himoyani chetlab o'tish. Ataylab uzun nom: tasodifan yozilmaydi va
// buyruq tarixida ko'rinib turadi.
const force = has("--ignore-safety-checks");
const onlyShop = value("--shop");
const limit = Number(value("--limit")) || 0;

const list = (items, n = 8) => {
  if (!items.length) return "";
  const shown = items.slice(0, n).map((x) => (typeof x === "string" ? x : x.skuTitle || x.skuId));
  return shown.join(", ") + (items.length > n ? ` … va yana ${items.length - n} ta` : "");
};

async function main() {
  let rows = loadLinkProducts();
  if (onlyShop) rows = rows.filter((r) => String(r.shopId) === String(onlyShop));
  if (limit) rows = rows.slice(0, limit);

  if (!rows.length) {
    console.log("Yuboriladigan qator topilmadi. `v3Sync.js` ishga tushirilganmi?");
    process.exit(1);
  }

  const { byToken, skipped, tokens } = buildPayloads(rows, {
    mods: loadMods(),
    defaults: loadDefaults(),
    stock: loadStockByExternalId(),
    shops: loadShopTokens(),
  });

  const totalToSend = [...byToken.values()].reduce((n, l) => n + l.length, 0);

  console.log(`\n${send ? "YUBORISH" : "DRY-RUN — hech narsa yuborilmaydi"}`);
  console.log(`O'qildi: ${rows.length} qator · yuboriladi: ${totalToSend} SKU\n`);

  console.log("Kabinet bo'yicha:");
  for (const t of tokens) console.log(`   ${t.label}: ${t.count} SKU`);

  console.log("\nO'tkazib yuborilganlar:");
  const s = skipped;
  console.log(`   qoldiq yangilash o'chirilgan (link_product!J): ${s.stockUpdateOff.length}`);
  if (s.noSkuId.length) console.log(`   skuId yo'q: ${s.noSkuId.length} — ${list(s.noSkuId)}`);
  if (s.unknownShop.length) console.log(`   ⚠ do'kon katalogda yo'q: ${s.unknownShop.length} — ${list(s.unknownShop)}`);
  if (s.noToken.length) console.log(`   ⚠ kabinet tokeni yo'q: ${s.noToken.length} — ${list(s.noToken)}`);
  if (s.noAmount.length) console.log(`   qoldiq hisoblanmadi: ${s.noAmount.length} — ${list(s.noAmount)}`);
  if (s.duplicates.length) console.log(`   takroriy skuId (oxirgisi g'olib): ${s.duplicates.length} — ${list(s.duplicates)}`);

  // Namuna — nima ketayotganini ko'zdan kechirish uchun.
  const sample = [...byToken.values()][0]?.slice(0, 10) || [];
  console.log("\nNamuna (birinchi 10 SKU):");
  for (const p of sample) console.log(`   ${p.skuId}  ${String(p.amount).padStart(5)}  ${p.skuTitle}`);

  const zeros = [...byToken.values()].flat().filter((p) => p.amount === 0).length;
  console.log(`\nNol qoldiq bilan ketadigan SKU: ${zeros} / ${totalToSend}`);

  // Qoldiq keshining holati — yuborishdan oldin ko'rinib turishi kerak.
  const cache = db.prepare("SELECT COUNT(*) n, MAX(synced_at) at FROM mc_stock").get();
  console.log(`Qoldiq keshi: ${cache.n} qator${cache.at ? `, oxirgi yangilanish ${cache.at}` : " — HECH QACHON YANGILANMAGAN"}`);

  const safety = checkBeforeSend({
    stockRows: cache.n,
    stockSyncedAt: cache.at,
    zeroCount: zeros,
    totalCount: totalToSend,
  });

  if (!safety.ok) {
    console.log("\n⛔ TEKSHIRUV O'TMADI:");
    for (const p of safety.problems) console.log(`   • ${p}`);
    console.log("\nQoldiqni yangilash:  node src/scripts/v3Sync.js");
    if (send) {
      console.log("Yuborish TO'XTATILDI. Chindan ham shu holatda yuborish kerak bo'lsa:");
      console.log("   --ignore-safety-checks");
      if (!force) process.exit(2);
      console.log("\n⚠ --ignore-safety-checks berilgan — davom etilmoqda.");
    }
  }

  if (!send) {
    console.log("\nHech narsa yuborilmadi. Yuborish uchun: --send");
    return;
  }

  console.log("\nYuborilmoqda…");
  const result = await sendPayloads(byToken);
  console.log(`   ✅ ${result.success}/${result.total} yuborildi`);
  if (result.failed.length) console.log(`   ❌ xato: ${result.failed.length} SKU`);

  logger.info(`Uzumga qoldiq yuborildi: ${result.success}/${result.total}, xato ${result.failed.length}`);

  // Xabar faqat haqiqiy yuborishdan keyin va faqat e'tibor kerak bo'lsa.
  if (result.failed.length) {
    await notify(
      "uzum_stock",
      `⚠️ <b>Uzumga qoldiq yuborishda xato</b>\n` +
        `Yuborildi: ${result.success}/${result.total}\n` +
        `Xato: ${result.failed.length} SKU\n` +
        `Namuna: ${result.failed.slice(0, 10).map((f) => f.skuId).join(", ")}`
    );
  }

  process.exit(result.failed.length ? 1 : 0);
}

main().catch((e) => {
  logger.error(`pushStock xatosi: ${e.message}`);
  console.error(e);
  process.exit(1);
});
