// Buyurtma formulalarini solishtirish — 6-bosqichning BIRINCHI qadami.
//
//   node src/scripts/orderSync.js                 # hammasi (~8200 qator)
//   node src/scripts/orderSync.js --limit=500     # tez tekshiruv
//   node src/scripts/orderSync.js --samples=20    # ko'proq namuna
//
// HECH NARSA YOZMAYDI — na jadvalga, na bazaga, na Uzumga. Vazifasi bitta:
// server hisobi bugungi jadval qiymati bilan AYNAN bir xilmi degan savolga
// javob berish.
//
// Hukm IKKI toifada (`FROZEN` ga qarang): hisoblanadigan ustunlar (R·I·J·K·L)
// aynan mos kelishi SHART — farq bo'lsa exit kodi 1. Muzlatiladigan ustunlar
// (O·P) esa buyurtma bilan saqlanadi va migratsiyada jadvaldan ko'chiriladi,
// shuning uchun ulardagi farq ogohlantirish (⚠) bo'lib qoladi.
//
// Nega kerak: Sheets bilan aloqani uzishdan oldin, formulalar to'g'ri
// ko'chganiga ishonch bo'lishi kerak. `link_product!L`/`!F` uchun xuddi shu
// tartib ishlatilgan (`v3Sync.js`) va u yerda 5 ta farqning hammasi qoldiq
// eskirganidan chiqqan edi — taxminda qolmadi.
import { config } from "../config.js";
import { db } from "../db/index.js";
import { getSheetsClient } from "../google/sheetsClient.js";
import { msGetJson, customerOrderHref } from "../moysklad/client.js";
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
  return { name, same: 0, unlinked: 0, diff: 0, onlySheet: 0, onlyServer: 0, groups: new Map() };
}

/**
 * Farqlar GURUHLANADI: bitta noto'g'ri spravochnik qatori minglab
 * buyurtmada bir xil farq beradi. Namunalarni bittalab chiqarsa hisobot
 * bir xil satrni takrorlab, "nechta HAQIQIY sabab bor" degan savolni
 * yashirib qo'yardi.
 */
function compare(col, { key, sheet, server, group = "", extra = null }) {
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

  const id = `${sheet}|${server}|${group}`;
  const g = col.groups.get(id) || { sheet, server, group, count: 0, samples: [], extras: [], lastSamples: [], lastExtras: [] };
  g.count++;
  // Namunalar: BOSHIDAN ikkita va OXIRIDAN ikkita. Faqat boshidagilar
  // saqlansa hammasi eng eski buyurtmalar bo'lib chiqadi — ular MoySklad'da
  // o'chirilgan bo'lishi mumkin (404) va tekshirish uchun yaramaydi.
  // Har namunaning MoySklad ID si yonida saqlanadi.
  if (g.samples.length < 2) {
    g.samples.push(key);
    g.extras.push(extra);
  } else {
    g.lastSamples.push(key);
    g.lastExtras.push(extra);
    if (g.lastSamples.length > 2) {
      g.lastSamples.shift();
      g.lastExtras.shift();
    }
  }
  col.groups.set(id, g);
}

/**
 * "Qaysi tomon to'g'ri?" degan savolga MoySklad'ning O'ZI javob beradi.
 *
 * UUID solishtirib xulosa chiqarib bo'lmaydi, shuning uchun:
 *   1. har ikkala yuridik shaxsning NOMI so'raladi;
 *   2. namunadagi buyurtma MoySklad'da AYNAN qaysi yuridik shaxs nomida
 *      yaratilgani so'raladi — bu hal qiluvchi dalil.
 *
 * Faqat O'QIYDI. Token bo'lmasa yoki so'rov yiqilsa — skript to'xtamaydi,
 * chunki bu diagnostika, solishtirish natijasi emas.
 */
async function explainOrgDiff(col) {
  const names = new Map();
  const orgName = async (uuid) => {
    if (!uuid) return "(bo'sh)";
    if (names.has(uuid)) return names.get(uuid);
    let label;
    try {
      const json = await msGetJson(`${config.moysklad.baseUrl}/entity/organization/${uuid}`);
      label = json?.name || "(nomsiz)";
    } catch (e) {
      label = `(o'qib bo'lmadi: ${e.message.slice(0, 60)})`;
    }
    names.set(uuid, label);
    return label;
  };

  console.log("\nMoySklad'dan tekshiruv:");
  for (const g of [...col.groups.values()].sort((a, b) => b.count - a.count).slice(0, SAMPLES)) {
    console.log(`  ${g.group}`);
    console.log(`    jadval: ${g.sheet} — ${await orgName(g.sheet)}`);
    console.log(`    server: ${g.server} — ${await orgName(g.server)}`);

    // Hal qiluvchi dalil: namuna MoySklad'da qaysi yuridik shaxs nomida
    // turibdi. Bitta buyurtma o'chirilgan bo'lishi mumkin (404), shuning
    // uchun birinchisida to'xtamaymiz.
    // Eng YANGI buyurtmalardan boshlaymiz: eski buyurtma MoySklad'da
    // o'chirilgan bo'lishi mumkin va 404 beradi.
    const probes = [
      ...g.lastSamples.map((key, i) => ({ key, extra: g.lastExtras[i] })).reverse(),
      ...g.samples.map((key, i) => ({ key, extra: g.extras[i] })),
    ];

    let answered = false;
    for (const { key: sample, extra } of probes) {
      const mcId =
        extra?.mcId ||
        db.prepare("SELECT moysklad_id FROM orders WHERE order_id = ?").get(String(sample))?.moysklad_id ||
        "";
      if (!mcId) continue;
      try {
        const order = await msGetJson(`${customerOrderHref(mcId)}?expand=organization`);
        const actual = order?.organization?.id || "";
        const side =
          actual === g.sheet ? "JADVAL bugungi holatga mos" : actual === g.server ? "SERVER bugungi holatga mos" : "ikkalasi ham emas";
        console.log(`    buyurtma ${sample}: ${order?.organization?.name || actual} → ${side}`);
        answered = true;
        break;
      } catch (e) {
        console.log(`    buyurtma ${sample}: o'qib bo'lmadi (${e.message.split("\n")[0].slice(0, 70)})`);
      }
    }
    if (!answered) console.log("    (namunalarning hech biri MoySklad'da topilmadi)");

    // Ko'chish tarixi — agar yozilgan bo'lsa, sabab shu yerda ochiq turadi.
    const shopId = /do'kon (\S+)/.exec(g.group)?.[1];
    const moves = shopId
      ? db
          .prepare(
            `SELECT from_cabinet_name, to_cabinet_name, detected_at
             FROM uzum_shop_moves WHERE shop_id = ? ORDER BY detected_at DESC LIMIT 3`
          )
          .all(shopId)
      : [];
    for (const m of moves) {
      console.log(`    ko'chish: ${m.from_cabinet_name || "?"} → ${m.to_cabinet_name} (${m.detected_at})`);
    }
    if (!moves.length) console.log("    (ko'chish tarixi yo'q — u faqat 2026-08-08 dan yozila boshlagan)");
  }

  console.log(
    "\n  Ikkala UUID ham haqiqiy firma bo'lsa — sabab do'kon boshqa kabinetga\n" +
      "  ko'chgani. Eski buyurtma O'SHA PAYTDAGI firma nomida yaratilgan va\n" +
      "  shundayligicha qolishi kerak, ya'ni bu farq xato emas.\n" +
      "  Migratsiyada O va P ustunlari JADVALDAN ko'chiriladi (qayta\n" +
      "  hisoblanmaydi); bugungi kabinet faqat YANGI buyurtmalarga qo'llanadi."
  );
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

    const shopId = String(cell(row, ORD.shopId)).trim();
    const { organizationHref, salesChannelHref } = orderRefs(shopId, catalogs);

    // O va P butunlay DO'KON spravochnigidan keladi — farq chiqsa aybdor
    // buyurtma emas, do'kon qatori. Shuning uchun guruh kaliti — do'kon.
    const shop = catalogs.shops.get(shopId);
    const shopLabel = `do'kon ${shopId}${shop?.name ? ` (${shop.name}` : ""}${
      shop?.cabinetName ? ` · ${shop.cabinetName})` : shop?.name ? ")" : ""
    }`;

    compare(cols.O, {
      key: orderId,
      group: shopLabel,
      sheet: normHref(cell(row, ORD.organization)),
      server: normHref(organizationHref),
      // Diagnostika MoySklad'dagi HAQIQIY qiymatni shu ID orqali so'raydi.
      // Keshdan olib bo'lmaydi: kesh faqat 3 kunlik oynani saqlaydi.
      extra: { mcId: String(cell(row, ORD.moySkladId)).trim() },
    });
    compare(cols.P, {
      key: orderId,
      group: shopLabel,
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
    // Detal ustunlari SKU spravochnigidan keladi — guruh kaliti SKU.
    const group = skuTitle ? `SKU ${skuTitle}` : "(skuTitle bo'sh)";

    const sheetRef = extractProductRef(cell(row, DET.product));
    compare(cols.I, { key, group, sheet: sheetRef || "", server: (got.productRef || "").toLowerCase() });

    const sheetType = String(cell(row, DET.entityType)).trim().toLowerCase();
    compare(cols.J, {
      key,
      group,
      sheet: isSheetError(sheetType) ? "" : sheetType,
      server: (got.entityType || "").toLowerCase(),
    });

    const sheetQty = cell(row, DET.quantity);
    compare(cols.K, {
      key,
      group,
      sheet: isSheetError(sheetQty) || sheetQty === "" ? "" : Number(sheetQty),
      server: got.quantityForMc === null ? "" : got.quantityForMc,
    });

    const sheetDiff = cell(row, DET.difference);
    compare(cols.L, {
      key,
      group,
      sheet: isSheetError(sheetDiff) || sheetDiff === "" ? "" : Boolean(sheetDiff),
      server: got.difference === null ? "" : got.difference,
    });
  }

  /* ---------- hisobot ---------- */

  // Ikki toifa, ikki xil hukm:
  //   HISOBLANADIGAN (R·I·J·K·L) — server ularni o'zi hisoblaydi, shuning
  //     uchun jadval bilan AYNAN bir xil bo'lishi shart;
  //   MUZLATILADIGAN (O·P) — buyurtma bilan birga saqlanadi va migratsiyada
  //     jadvaldan ko'chiriladi. Do'kon boshqa kabinetga ko'chsa bugungi
  //     hisob eski buyurtmanikidan farq qiladi va bu TO'G'RI: eski buyurtma
  //     o'sha paytdagi yuridik shaxsda qolishi kerak.
  const FROZEN = new Set(["O", "P"]);

  let failed = 0;
  let frozenDiff = 0;
  for (const [key, col] of Object.entries(cols)) {
    const total = col.same + col.unlinked + col.diff;
    const frozen = FROZEN.has(key);
    const mark = col.diff === 0 ? "✅" : frozen ? "⚠" : "❌";
    console.log(
      `${mark} ${col.name.padEnd(38)} mos ${String(col.same).padStart(5)} · ` +
        `bog'lanmagan ${String(col.unlinked).padStart(4)} · farq ${String(col.diff).padStart(4)} / ${total}`
    );
    if (col.diff) {
      if (frozen) frozenDiff++;
      else failed++;
      if (col.onlySheet) console.log(`     faqat jadvalda: ${col.onlySheet}`);
      if (col.onlyServer) console.log(`     faqat serverda: ${col.onlyServer}`);

      // Sabablar soni farqlar sonidan MUHIMROQ: 224 ta farq bitta noto'g'ri
      // do'kon qatoridan bo'lishi mumkin.
      const groups = [...col.groups.values()].sort((a, b) => b.count - a.count);
      console.log(`     ${groups.length} xil sabab:`);
      for (const g of groups.slice(0, SAMPLES)) {
        console.log(`     • ${g.group} — ${g.count} ta`);
        console.log(`        jadval: ${JSON.stringify(g.sheet)}`);
        console.log(`        server: ${JSON.stringify(g.server)}`);
        console.log(`        masalan: ${[...g.samples, ...g.lastSamples].join(", ")}`);
      }
      if (groups.length > SAMPLES) console.log(`     … yana ${groups.length - SAMPLES} xil sabab`);
    }
  }

  // O ustuni butunlay kabinetning yuridik shaxsidan keladi — farq bo'lsa
  // to'g'irlanadigan joy shu jadval, buyurtma emas. Shuning uchun uni
  // darhol ko'rsatamiz: qaysi kabinetda qanday qiymat turibdi.
  if (cols.O.diff) {
    console.log("\nKabinetlar (Konfiguratsiya → Uzum da tahrirlanadi):");
    for (const c of db
      .prepare(
        `SELECT c.name, c.mc_organization_href,
                (SELECT COUNT(*) FROM uzum_shops s WHERE s.cabinet_id = c.id) AS shops
         FROM uzum_cabinets c ORDER BY c.name`
      )
      .all()) {
      console.log(`  ${c.name} · ${c.shops} do'kon · ${c.mc_organization_href || "(bo'sh)"}`);
    }
    console.log("Jadvaldagi manba: uzum_token!D (yuridik shaxs).");
    await explainOrgDiff(cols.O);
  }

  if (unlinkedSkus.size) {
    const list = [...unlinkedSkus].slice(0, SAMPLES).join(", ");
    console.log(`\nBog'lanmagan SKU: ${unlinkedSkus.size} ta — ${list}${unlinkedSkus.size > SAMPLES ? " …" : ""}`);
    console.log("Ular Tovar bog'lamalari bo'limining tepasida ham ko'rinadi.");
  }

  if (failed) {
    console.log(`\n❌ Hisoblanadigan ustunlarning ${failed} tasida farq bor — ko'chirishdan oldin hal qilinishi kerak.`);
    process.exitCode = 1;
  } else {
    console.log("\n✅ Hisoblanadigan ustunlar (R · I · J · K · L) jadval bilan AYNAN bir xil.");
  }

  if (frozenDiff) {
    console.log(
      `⚠ Muzlatiladigan ustunlarning ${frozenDiff} tasida farq bor (O · P) — bu ko'chishga\n` +
        "  to'sqinlik qilmaydi: ular buyurtma bilan saqlanadi va migratsiyada JADVALDAN\n" +
        "  ko'chiriladi. Sabab odatda do'konning boshqa kabinetga ko'chgani."
    );
  }
}

main().catch((e) => {
  console.error("Xato:", e.message);
  process.exit(1);
});
