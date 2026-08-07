// Uzumga qoldiq yuborish — v3 dagi `pushToUzumFast` ning o'rni.
//
//   node src/scripts/pushStock.js                # DRY-RUN: hech narsa yuborilmaydi
//   node src/scripts/pushStock.js --send         # HAQIQATAN yuboradi
//   node src/scripts/pushStock.js --send --shop=682 --limit=20
//
// STANDART HOLAT — DRY-RUN. Uzumga yozish tashqi natijaga olib keladi:
// noto'g'ri son ketsa tovar sotuvdan chiqadi.
//
// Mantiq `stock/runner.js` da — interfeys va jadval ham AYNAN shu yo'ldan
// o'tadi. Skript o'z tekshiruvini yozmaydi: 2026-08-07 da himoya faqat
// bitta joyda bo'lgani uchun 20 ta SKU nolga tushgan edi.
import logger from "../logger.js";
import { runStockJob } from "../stock/runner.js";

const args = process.argv.slice(2);
const has = (name) => args.includes(name);
const value = (name) => args.find((a) => a.startsWith(`${name}=`))?.split("=")[1];

const send = has("--send");
// Ataylab uzun nom: tasodifan yozilmaydi va buyruq tarixida ko'rinib turadi.
const force = has("--ignore-safety-checks");

async function main() {
  const run = await runStockJob("push", {
    trigger: "cli",
    startedBy: "cli",
    dryRun: !send,
    force,
    shopId: value("--shop"),
    limit: Number(value("--limit")) || 0,
  });

  const s = run.summary || {};

  console.log(`\n${send ? "YUBORISH" : "DRY-RUN — hech narsa yuborilmaydi"}`);
  console.log(`O'qildi: ${s.rows} qator · yuboriladi: ${s.toSend} SKU`);

  if (s.tokens?.length) {
    console.log("\nKabinet bo'yicha:");
    for (const t of s.tokens) console.log(`   ${t.label}: ${t.count} SKU`);
  }

  if (s.skipped) {
    console.log("\nO'tkazib yuborilganlar:");
    for (const [key, n] of Object.entries(s.skipped)) if (n) console.log(`   ${key}: ${n}`);
  }

  if (s.cache) {
    console.log(
      `\nQoldiq keshi: ${s.cache.stockRows} qator` +
        (s.cache.stockSyncedAt ? `, oxirgi yangilanish ${s.cache.stockSyncedAt}` : " — HECH QACHON YANGILANMAGAN")
    );
  }
  console.log(`Nol qoldiq bilan ketadigan SKU: ${s.zeros} / ${s.toSend}`);

  if (s.safety && !s.safety.ok) {
    console.log("\n⛔ TEKSHIRUV O'TMADI:");
    for (const p of s.safety.problems) console.log(`   • ${p}`);
    console.log("\nQoldiqni yangilash:  node src/scripts/v3Sync.js");
  }

  if (run.status === "blocked") {
    console.log("\nYuborish TO'XTATILDI. Chindan ham shu holatda yuborish kerak bo'lsa:");
    console.log("   --ignore-safety-checks");
    process.exit(2);
  }

  if (run.status === "error") {
    console.log(`\n❌ Xato: ${run.error}`);
    process.exit(1);
  }

  if (!send) {
    console.log("\nHech narsa yuborilmadi. Yuborish uchun: --send");
    return;
  }

  console.log(`\n✅ ${s.sent}/${s.total} yuborildi`);
  if (s.failed) console.log(`   ❌ xato: ${s.failed} SKU`);
  process.exit(s.failed ? 1 : 0);
}

main().catch((e) => {
  logger.error(`pushStock xatosi: ${e.message}`);
  console.error(e);
  process.exit(1);
});
