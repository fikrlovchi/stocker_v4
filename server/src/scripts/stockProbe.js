// MoySklad qoldiq hisobotining barqarorligini o'lchaydi.
//
//   node src/scripts/stockProbe.js          # 4 marta so'rab solishtiradi
//   node src/scripts/stockProbe.js 6        # 6 marta
//
// NIMA UCHUN: `report/stock/all/current` ketma-ket chaqirilganda har xil son
// qaytaradi. Bunga qarshi ikkita yechim bor va ular BIR-BIRINI ALMASHTIRMAYDI:
//   • maqsadli qayta so'rov — tushib qolgan tovarni alohida so'rash;
//   • kutish (hysteresis) — bir necha javobda kelmagandagina 0 deb belgilash.
//
// Birinchisi ishlashiga ISHONISH yetarli emas: agar nomuvofiqlik MoySklad
// tomonidagi keshdan bo'lsa, maqsadli so'rov ham o'sha noto'g'ri javobni
// qaytaradi. Shu skript aynan shuni tekshiradi — tushib qolgan tovarni
// alohida so'rab, javobni ko'rsatadi.
//
// Faqat O'QIYDI: bazaga ham, MoySklad'ga ham hech narsa yozilmaydi.
import { config } from "../config.js";
import { msFetch } from "../moysklad/client.js";
import { fetchStockFor } from "../moysklad/assortment.js";

const ROUNDS = Math.max(2, Number(process.argv[2]) || 4);
const STORE = config.moysklad.stockStoreId;

async function fullReport(extraFilter = "") {
  const filter = [`storeId=${STORE}`, ...(extraFilter ? [extraFilter] : [])].join(";");
  const res = await msFetch(`${config.moysklad.baseUrl}/report/stock/all/current?filter=${filter}`, { method: "GET" });
  if (!res.ok) throw new Error(`MoySklad ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const rows = await res.json();
  return new Map(rows.map((r) => [r.assortmentId, Number(r.stock) || 0]));
}

async function main() {
  console.log(`Ombor: ${STORE}`);
  console.log(`To'liq hisobot ${ROUNDS} marta so'raladi…\n`);

  const rounds = [];
  for (let i = 1; i <= ROUNDS; i++) {
    const map = await fullReport();
    rounds.push(map);
    console.log(`  ${i}-so'rov: ${map.size} ta tovar`);
  }

  // Har bir so'rovda bo'lgan / ba'zisida bo'lmagan tovarlar.
  const everywhere = new Set(rounds[0].keys());
  const anywhere = new Set();
  for (const map of rounds) {
    for (const uuid of map.keys()) anywhere.add(uuid);
    for (const uuid of [...everywhere]) if (!map.has(uuid)) everywhere.delete(uuid);
  }

  const unstable = [...anywhere].filter((u) => !everywhere.has(u));
  console.log(`\nHamma so'rovda bor: ${everywhere.size}`);
  console.log(`Kamida bittasida bor: ${anywhere.size}`);
  console.log(`BEQAROR (ba'zisida yo'q): ${unstable.length}`);

  if (!unstable.length) {
    console.log("\n✅ Bu safar nomuvofiqlik ko'rinmadi. Boshqa vaqtda yoki ko'proq so'rov bilan qaytaring.");
    return;
  }

  // Beqaror tovarlar qaysi so'rovda ko'ringani — naqsh bormi?
  console.log("\nBeqaror tovarlar (birinchi 15 tasi):");
  for (const uuid of unstable.slice(0, 15)) {
    const pattern = rounds.map((m) => (m.has(uuid) ? String(m.get(uuid)) : "—")).join(" · ");
    console.log(`  ${uuid}  [${pattern}]`);
  }

  // ASOSIY SAVOL: maqsadli so'rov shu tovarlarni topadimi?
  console.log(`\n── Maqsadli so'rov: ${unstable.length} ta tovar alohida so'raladi`);
  try {
    const first = await fetchStockFor(unstable, STORE);
    console.log(`   1-urinish: ${first.size}/${unstable.length} topildi`);

    // Ikkinchi marta — maqsadli so'rovning O'ZI barqarormi?
    const second = await fetchStockFor(unstable, STORE);
    console.log(`   2-urinish: ${second.size}/${unstable.length} topildi`);

    const differ = unstable.filter((u) => first.has(u) !== second.has(u) || first.get(u) !== second.get(u));
    console.log(`   ikki urinish orasidagi farq: ${differ.length}`);

    const missedByBoth = unstable.filter((u) => !first.has(u) && !second.has(u));
    console.log(`   ikkalasida ham topilmadi: ${missedByBoth.length}`);

    console.log("\nXULOSA:");
    if (differ.length === 0 && missedByBoth.length === 0) {
      console.log("  ✅ Maqsadli so'rov BARQAROR va hammasini topdi — taklif ishlaydi.");
      console.log("     Kutish rejimi zaxira sifatida qoladi (maqsadli so'rov xato bersa).");
    } else if (differ.length === 0) {
      console.log(`  ⚠ Maqsadli so'rov barqaror, lekin ${missedByBoth.length} tasini u ham topmadi.`);
      console.log("     Ular haqiqatan qoldiqsiz bo'lishi mumkin — MoySklad'da qo'lda tekshiring.");
      console.log("     Kutish rejimi aynan shular uchun kerak.");
    } else {
      console.log(`  ❌ Maqsadli so'rovning O'ZI ham beqaror (${differ.length} ta farq).`);
      console.log("     Nomuvofiqlik MoySklad tomonida — alohida so'rov muammoni yechmaydi,");
      console.log("     asosiy himoya kutish rejimi bo'lib qoladi.");
    }
  } catch (e) {
    console.log(`   ❌ Maqsadli so'rov XATO berdi: ${e.message}`);
    console.log("\nXULOSA: bu endpoint assortmentId filtrini qabul qilmaydi —");
    console.log("  faqat kutish rejimi bilan ishlanadi (kod shunga tayyor).");
  }

  // Yon tekshiruv: nol qoldiqlar ham qaytarilsa, "yo'qolish" o'zi yo'qoladi.
  try {
    const all = await fullReport("stockMode=all");
    console.log(`\nQo'shimcha: stockMode=all bilan ${all.size} ta (oddiy so'rovda ${rounds[0].size} ta).`);
    if (all.size > rounds[0].size) {
      console.log("  Bu rejim nol qoldiqlarni ham qaytaradi — 'tushib qolish' o'rniga 0 ko'rinadi.");
    }
  } catch (e) {
    console.log(`\nQo'shimcha: stockMode=all ishlamadi (${e.message.slice(0, 80)})`);
  }
}

main().catch((e) => {
  console.error("Xato:", e.message);
  process.exit(1);
});
