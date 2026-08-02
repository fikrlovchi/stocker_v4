// Kesh mantiqini Google/MoySklad'siz tekshiradi: fixture qatorlar -> applyRefresh
// -> baza -> so'rovlar. Vaqtinchalik SQLite fayl ishlatiladi, haqiqiy kesh tegilmaydi.
//
//   node src/scripts/selfTest.js
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// DB_FILE'ni config.js import qilinishidan OLDIN o'rnatamiz (dotenv mavjud
// process.env qiymatini bosib o'tmaydi), shuning uchun dinamik import.
const TMP_DB = path.join(os.tmpdir(), `stocker-selftest-${process.pid}.db`);
process.env.DB_FILE = TMP_DB;
process.env.SERVICE_TOKEN = "selftest";

const { applyRefresh, extractProductRefs } = await import("../cache/refresh.js");
const { getStats, getOrder, getProduct, findByBarcode, findAmbiguousBarcodes } = await import(
  "../cache/queries.js"
);
const { normalizeBarcode, extractProductRef, parseSheetTimeToEpochMs } = await import(
  "../util/sheetValues.js"
);
const { db } = await import("../db/index.js");

/* ---------------- yordamchi ---------------- */

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failures.push(`${name}\n    kutilgan: ${e}\n    olingan:  ${a}`);
  }
}

// "A" -> 0 ustun indeksi bo'yicha qator yasaydi: row({A: "x", Q: 1})
function row(cells) {
  const out = [];
  for (const [letter, value] of Object.entries(cells)) {
    let idx = 0;
    for (const ch of letter.toUpperCase()) idx = idx * 26 + (ch.charCodeAt(0) - 64);
    out[idx - 1] = value;
  }
  for (let i = 0; i < out.length; i++) if (out[i] === undefined) out[i] = "";
  return out;
}

const NOW = Date.now();
const TASHKENT = 5 * 60 * 60 * 1000;
// Toshkent devor-soati ko'rinishidagi "N soat oldin" (orderFetch.js shu formatda yozadi)
const hoursAgo = (h) =>
  new Date(NOW + TASHKENT - h * 3600 * 1000).toISOString().replace("T", " ").slice(0, 19);

/* ---------------- 1. Sof funksiyalar ---------------- */

check("normalizeBarcode: oddiy", normalizeBarcode("1000111953348"), "1000111953348");
check("normalizeBarcode: bo'shliqli", normalizeBarcode("1 000 111 953 348"), "1000111953348");
check("normalizeBarcode: tireli", normalizeBarcode("100-011-1953348"), "1000111953348");
check("normalizeBarcode: bosh nol saqlanadi", normalizeBarcode("0123456"), "0123456");
check("normalizeBarcode: raqam tipi", normalizeBarcode(1000111953348), "1000111953348");
check("normalizeBarcode: harfli kod", normalizeBarcode("abc-123"), "ABC123");
check("normalizeBarcode: #N/A bo'sh", normalizeBarcode("#N/A"), "");

check(
  "extractProductRef: to'liq href",
  extractProductRef("https://api.moysklad.ru/api/remap/1.2/entity/product/043c4a47-ac53-11ed-0a80-01db000c6e32"),
  "043c4a47-ac53-11ed-0a80-01db000c6e32"
);
check(
  "extractProductRef: yalang'och UUID",
  extractProductRef("043C4A47-AC53-11ED-0A80-01DB000C6E32"),
  "043c4a47-ac53-11ed-0a80-01db000c6e32"
);
check("extractProductRef: #N/A", extractProductRef("#N/A"), null);

check(
  "parseSheetTimeToEpochMs: matn sana",
  parseSheetTimeToEpochMs("2026-08-02 12:00:00"),
  Date.UTC(2026, 7, 2, 12, 0, 0) - TASHKENT
);
check("parseSheetTimeToEpochMs: bo'sh", parseSheetTimeToEpochMs(""), null);

/* ---------------- 2. Fixture'lar ---------------- */

const HREF = (u) => `https://api.moysklad.ru/api/remap/1.2/entity/product/${u}`;
const UUID_A = "aaaaaaaa-ac53-11ed-0a80-01db000c6e32";
const UUID_B = "bbbbbbbb-ac53-11ed-0a80-01db000c6e32";
const UUID_C = "cccccccc-ac53-11ed-0a80-01db000c6e32";

// Q=1, T=1, U=done bo'lgan "sog'lom" buyurtma shabloni
const ok = (id, hoursOld = 2, extra = {}) =>
  row({ A: id, C: hoursAgo(hoursOld), G: "9001", Q: 1, S: `ms-${id}`, T: 1, U: "done", W: hoursAgo(hoursOld), ...extra });

const orderRows = [
  row({ A: "id", Q: "status", W: "arrivedAt" }), // sarlavha
  ok("OK1"),                                              // 2 tovar, 1+2 birlik
  ok("OK2", 10),                                          // 1 tovar
  ok("HOLD", 2, { U: "hold" }),                           // kutish oynasi
  ok("PENDING", 2, { U: "" }),                            // MoySklad holati yo'q
  ok("NOTCONF", 2, { T: "" }),                            // Uzum'da tasdiqlanmagan
  ok("NOTMC", 2, { Q: "" }),                              // MoySklad'da yaratilmagan
  ok("NOMSID", 2, { S: "" }),                             // MoySklad ID yo'q
  ok("CANCELED"),                                         // MoySklad'da bekor
  ok("PACKED"),                                           // uzum_packing'da bor
  ok("OLD", 24 * 5),                                      // saqlash oynasidan eski
  ok("NOITEMS"),                                          // detail'da qatori yo'q
  ok("BADQTY"),                                           // K bo'sh
  ok("NOBC"),                                             // B bo'sh, lekin MoySklad barcode'i bor
  ok("NOBC2"),                                            // B ham, href ham yo'q
  // ⚠️ ASOSIY REGRESSIYA TESTI: V=1 va 30 soatlik, lekin sog'lom.
  // cancelSync 24 soatdan keyin bekor qilinmaganga ham V=1 qo'yadi, shuning
  // uchun V filtr sifatida ISHLATILMASLIGI kerak.
  ok("VSET", 30, { V: 1 }),
];

const det = (itemId, orderId, barcode, title, uuid, qty) =>
  row({ A: itemId, B: barcode, C: title, H: orderId, I: uuid ? HREF(uuid) : "#N/A", J: "product", K: qty });

const detailRows = [
  row({ A: "id", B: "barcode", H: "order" }),
  det("i1", "OK1", "1000111953348", "MT2-ELEGANT,SS", UUID_A, 1),
  det("i2", "OK1", "1000222953348", "MT3-CLASSIC,M", UUID_B, 2),
  det("i3", "OK2", "1 000 333 953 348", "MT4-SLIM,L", UUID_C, 1), // bo'shliqli barcode
  det("i4", "HOLD", "1000111953348", "MT2-ELEGANT,SS", UUID_A, 1),
  det("i5", "PENDING", "1000111953348", "MT2-ELEGANT,SS", UUID_A, 1),
  det("i6", "NOTCONF", "1000111953348", "MT2-ELEGANT,SS", UUID_A, 1),
  det("i7", "NOTMC", "1000111953348", "MT2-ELEGANT,SS", UUID_A, 1),
  det("i8", "NOMSID", "1000111953348", "MT2-ELEGANT,SS", UUID_A, 1),
  det("i9", "CANCELED", "1000111953348", "MT2-ELEGANT,SS", UUID_A, 1),
  det("i10", "PACKED", "1000111953348", "MT2-ELEGANT,SS", UUID_A, 1),
  det("i11", "OLD", "1000111953348", "MT2-ELEGANT,SS", UUID_A, 1),
  det("i12", "BADQTY", "1000111953348", "MT2-ELEGANT,SS", UUID_A, ""),
  // Uzum barcode'i yo'q, lekin MoySklad href'i bor -> MoySklad barcode'i orqali skanerlanadi
  det("i13", "NOBC", "", "MT5-NOBARCODE,XL", UUID_A, 1),
  det("i14", "VSET", "1000444953348", "MT6-OLD,S", UUID_B, 1),
  // Na Uzum barcode'i, na MoySklad href'i -> hech qachon skanerlanmaydi
  det("i16", "NOBC2", "", "MT7-NOREF,XXL", null, 1),
];

const packingRows = [
  row({ A: "packingId", B: "orderId", I: "status" }),
  row({ A: "p1", B: "PACKED", C: "aziz", D: "Ombor-1", F: hoursAgo(1), I: "done" }),
  // Bekor qilingan sessiya buyurtmani "yig'ilgan" qilmasligi kerak
  row({ A: "p2", B: "OK2", C: "aziz", D: "Ombor-1", F: hoursAgo(1), I: "aborted" }),
];

const canceled = new Set(["CANCELED"]);

/* ---------------- 3. MoySklad tovar keshi ---------------- */
// Odatda syncProductBarcodes MoySklad'dan to'ldiradi; testda to'g'ridan-to'g'ri
// yozamiz (mc_products/mc_barcodes har tsiklda qayta qurilmaydi — uzoq TTL kesh).

function seedMc(uuid, name, barcodes) {
  db.prepare(
    "INSERT OR REPLACE INTO mc_products (uuid, entity_type, name, fetched_at, missing) VALUES (?,?,?,?,0)"
  ).run(uuid, "product", name, new Date().toISOString());
  db.prepare("DELETE FROM mc_barcodes WHERE uuid = ?").run(uuid);
  for (const bc of barcodes) {
    db.prepare("INSERT INTO mc_barcodes (uuid, barcode, type, raw) VALUES (?,?,?,?)").run(
      uuid,
      normalizeBarcode(bc),
      "ean13",
      bc
    );
  }
}

seedMc(UUID_A, "Elegant ko'ylak SS", ["4600000000011"]);
seedMc(UUID_C, "Slim shim L", ["4600000000033", "4600000000034"]);

check(
  "extractProductRefs: noyob UUID'lar + turi",
  [...extractProductRefs(detailRows).entries()].sort(),
  [
    [UUID_A, "product"],
    [UUID_B, "product"],
    [UUID_C, "product"],
  ].sort()
);

check("getProduct: barcode'lar", getProduct(UUID_C).barcodes.map((b) => b.barcode), [
  "4600000000033",
  "4600000000034",
]);
check("getProduct: UUID katta harfda ham topiladi", getProduct(UUID_A.toUpperCase())?.name, "Elegant ko'ylak SS");

/* ---------------- 4. applyRefresh ---------------- */

const result = applyRefresh({ orderRows, detailRows, packingRows, canceled, nowMs: NOW });

// Mos buyurtmaning `reason`i null — shuning uchun "keshda yo'q" holatini
// alohida ajratamiz (?? bilan ikkalasi qorishib ketardi).
const reasonOf = (id) => {
  const o = getOrder(id);
  return o ? o.reason : "YO'Q";
};

check("OK1 mos", reasonOf("OK1"), null);
check("OK2 mos (aborted sessiya to'sqinlik qilmaydi)", reasonOf("OK2"), null);
check("VSET mos — V=1 filtr sifatida ishlatilmaydi", reasonOf("VSET"), null);
check("HOLD chiqarib tashlandi", reasonOf("HOLD"), "hold_window");
check("PENDING chiqarib tashlandi", reasonOf("PENDING"), "mc_state_pending");
check("NOTCONF chiqarib tashlandi", reasonOf("NOTCONF"), "not_confirmed_on_uzum");
check("NOTMC chiqarib tashlandi", reasonOf("NOTMC"), "not_in_moysklad");
check("NOMSID chiqarib tashlandi", reasonOf("NOMSID"), "no_moysklad_id");
check("CANCELED chiqarib tashlandi", reasonOf("CANCELED"), "canceled_in_moysklad");
check("PACKED chiqarib tashlandi", reasonOf("PACKED"), "already_packed");
check("NOITEMS chiqarib tashlandi", reasonOf("NOITEMS"), "no_items");
check("BADQTY chiqarib tashlandi", reasonOf("BADQTY"), "bad_quantity");
check("NOBC mos — Uzum barcode'i yo'q, MoySklad'niki bor", reasonOf("NOBC"), null);
check("NOBC2 chiqarib tashlandi — hech qanday barcode yo'q", reasonOf("NOBC2"), "unscannable_item");
check("OLD umuman saqlanmadi", getOrder("OLD"), null);

check("mos buyurtmalar soni", result.eligible, 4);
check("keshdagi buyurtmalar (OLD'siz)", result.cached, 14);
check("OK1 birliklar soni (1+2)", getOrder("OK1").unitCount, 3);
check("OK1 tovarlar soni", getOrder("OK1").itemCount, 2);
check("problems: BADQTY + NOBC2", result.problems.length, 2);

/* ---------------- 5. MoySklad barcode indeksi ---------------- */

check(
  "OK2 tovarida 3 ta barcode (1 uzum + 2 moysklad)",
  getOrder("OK2").items[0].barcodes.map((b) => b.source).sort(),
  ["moysklad", "moysklad", "uzum"]
);
check("MoySklad nomi ko'rsatiladi", getOrder("OK2").items[0].mcName, "Slim shim L");
check(
  "skan: MoySklad barcode'i buyurtmani topadi",
  findByBarcode("4600000000033").matches.map((m) => [m.orderId, m.source]),
  [["OK2", "moysklad"]]
);
check(
  "skan: NOBC faqat MoySklad barcode'i orqali topiladi",
  findByBarcode("4600000000011").matches.map((m) => m.orderId).includes("NOBC"),
  true
);
// moysklad: UUID_A 10 ta tovarda (×1 barcode) + UUID_C 1 ta tovarda (×2) = 12
// uzum: B ustuni to'ldirilgan 12 ta tovar (i13/i16 bo'sh, i11 saqlanmagan)
check("barcode manbalari", result.barcodesBySource, { moysklad: 12, uzum: 12 });

/* ---------------- 6. Barcode qidiruvi ---------------- */

check("skan: OK1 birinchi tovari", findByBarcode("1000111953348").matches.map((m) => m.orderId), ["OK1"]);
check(
  "skan: bo'shliqli barcode normallashadi",
  findByBarcode("1000333953348").matches.map((m) => m.orderId),
  ["OK2"]
);
check(
  "skan: skanerdan tire bilan kelsa ham topiladi",
  findByBarcode("1-000-333-953-348").matches.map((m) => m.orderId),
  ["OK2"]
);
check("skan: nomos buyurtma chiqmaydi", findByBarcode("1000444953348", { eligibleOnly: false }).matches.length, 1);
check("skan: noma'lum barcode", findByBarcode("9999999999999").matches, []);
check("skan: bo'sh barcode", findByBarcode("").matches, []);

// Avtomatik tanlash tartibi: eng kam tovarli oldinda (OK2 1 ta, OK1 2 ta)
const sharedRows = [
  ...detailRows,
  det("i15", "OK2", "1000111953348", "MT2-ELEGANT,SS", UUID_A, 1),
];
applyRefresh({ orderRows, detailRows: sharedRows, packingRows, canceled, nowMs: NOW });
check(
  "tartib: eng kam tovarli buyurtma oldinda",
  findByBarcode("1000111953348").matches.map((m) => m.orderId),
  ["OK2", "OK1"]
);

/* ---------------- 5. Bir xil barcode turli tovarlarda ---------------- */

const ambiguousRows = [
  row({ A: "id" }),
  det("a1", "OK1", "5555555555555", "TOVAR-A", UUID_A, 1),
  det("a2", "OK2", "5555555555555", "TOVAR-B", UUID_B, 1),
];
applyRefresh({ orderRows, detailRows: ambiguousRows, packingRows, canceled, nowMs: NOW });
check("noaniq barcode aniqlandi", findAmbiguousBarcodes(10).map((a) => a.barcode), ["5555555555555"]);

/* ---------------- 7. Skan mantiqi (sessiya, lock, avtomatik tanlash) ---------------- */

const { config } = await import("../config.js");
// Testda MoySklad'ga chiqmaymiz (token yo'q) — yakuniy holat tekshiruvini o'chiramiz.
config.packing.maxMoyskladChecks = 0;

const { scan, getActiveSession, cancelSession, expireStaleSessions, pendingPrintIntents } =
  await import("../scan/sessions.js");

// Asosiy fixture'larni tiklaymiz (6-bo'lim keshni o'zgartirgan edi).
applyRefresh({ orderRows, detailRows, packingRows, canceled, nowMs: NOW });

const resetSessions = () =>
  db.exec(
    "DELETE FROM sessions; DELETE FROM session_items; DELETE FROM session_barcodes; DELETE FROM scans; DELETE FROM print_intents"
  );

// --- Buyurtma ochish va progress ---
resetSessions();
let r = await scan({ barcode: "1000111953348", operator: "aziz", stationId: "Ombor-1" });
check("skan: buyurtma ochildi", [r.result, r.session.orderId], ["order_opened", "OK1"]);
check("skan: progress 1/3", [r.session.progress.scanned, r.session.progress.total], [1, 3]);
check("skan: ShK niyati 2 nusxa", [r.print[0].target, r.print[0].copies], ["shk", 2]);

// --- Boshqa buyurtmaning tovari ---
r = await scan({ barcode: "1000333953348", operator: "aziz" });
check("skan: boshqa buyurtma tovari rad etildi", r.result, "wrong_item");
check("skan: progress o'zgarmadi", r.session.progress.scanned, 1);

// --- Miqdori 2 bo'lgan tovar: ikki marta skan ---
r = await scan({ barcode: "1000222953348", operator: "aziz" });
check("skan: 2/3", [r.result, r.session.progress.scanned], ["ok", 2]);
r = await scan({ barcode: "1000222953348", operator: "aziz" });
check("skan: oxirgi birlik -> buyurtma yig'ildi", r.result, "order_complete");
check("skan: progress 3/3", r.session.progress.remaining, 0);
check(
  "skan: yakunda BIG niyati",
  r.print.map((p) => p.target),
  ["shk", "big"]
);

const intents = pendingPrintIntents(r.session.id);
check("niyatlar: 3 ta ShK + 1 ta BIG", intents.filter((i) => i.target === "shk").length, 3);
check("niyatlar: BIG bitta", intents.filter((i) => i.target === "big").length, 1);
check("niyatlar: har ShK 2 nusxa", [...new Set(intents.filter((i) => i.target === "shk").map((i) => i.copies))], [2]);

// --- Yig'ilgan buyurtma qayta ochilmaydi ---
r = await scan({ barcode: "1000111953348", operator: "aziz" });
check("skan: yig'ilgan buyurtma qayta ochilmaydi", r.result, "no_available_order");

// --- Miqdor to'lganda ---
resetSessions();
await scan({ barcode: "1000222953348", operator: "aziz" });
await scan({ barcode: "1000222953348", operator: "aziz" });
r = await scan({ barcode: "1000222953348", operator: "aziz" });
check("skan: miqdor to'lgan", r.result, "already_complete");

// --- LOCK: ikkinchi operator o'sha buyurtmani ololmaydi ---
resetSessions();
await scan({ barcode: "1000111953348", operator: "aziz" });
r = await scan({ barcode: "1000111953348", operator: "bek" });
check("lock: buyurtma band, boshqa operator ololmadi", r.result, "no_available_order");
check("lock: aziz sessiyasi ochiq", getActiveSession("aziz").orderId, "OK1");
check("lock: bekda sessiya yo'q", getActiveSession("bek"), null);

// --- Bekor qilish lock'ni bo'shatadi ---
cancelSession("aziz", "test");
check("bekor: aziz sessiyasi yopildi", getActiveSession("aziz"), null);
r = await scan({ barcode: "1000111953348", operator: "bek" });
check("bekor: endi bek ocha oldi", [r.result, r.session.orderId], ["order_opened", "OK1"]);

// --- Muddat o'tishi lock'ni bo'shatadi ---
db.prepare("UPDATE sessions SET expires_at = ? WHERE status = 'active'").run("2020-01-01T00:00:00.000Z");
check("muddat: 1 ta sessiya yopildi", expireStaleSessions(), 1);
r = await scan({ barcode: "1000111953348", operator: "aziz" });
check("muddat: buyurtma yana bo'sh", [r.result, r.session.orderId], ["order_opened", "OK1"]);

// --- Avtomatik tanlash: eng kam tovarli buyurtma ---
// 4600000000011 ikkita buyurtmada: OK1 (2 tovar) va NOBC (1 tovar) -> NOBC
resetSessions();
r = await scan({ barcode: "4600000000011", operator: "aziz" });
check("avto-tanlash: eng kam tovarli buyurtma olindi", r.session.orderId, "NOBC");
check("avto-tanlash: 1 birlik -> darhol yig'ildi", r.result, "order_complete");

// --- Noma'lum barcode ---
resetSessions();
r = await scan({ barcode: "9999999999999", operator: "aziz" });
check("skan: noma'lum barcode", r.result, "unknown_barcode");
check("skan: noma'lum barcode sessiya ochmaydi", getActiveSession("aziz"), null);

resetSessions();

/* ---------------- Yakun ---------------- */

const stats = getStats();
console.log(`\nKesh holati: ${JSON.stringify({ cachedOrders: stats.cachedOrders, items: stats.items, barcodes: stats.barcodes })}`);

try {
  fs.rmSync(TMP_DB, { force: true });
  fs.rmSync(TMP_DB + "-wal", { force: true });
  fs.rmSync(TMP_DB + "-shm", { force: true });
} catch {}

if (failures.length) {
  console.error(`\n❌ ${failures.length} ta test yiqildi (${passed} ta o'tdi):\n`);
  for (const f of failures) console.error("  • " + f);
  process.exit(1);
}
console.log(`\n✅ Barcha ${passed} ta test o'tdi.`);
