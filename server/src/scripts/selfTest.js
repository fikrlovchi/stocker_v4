// Kesh mantiqini Google/MoySklad'siz tekshiradi: fixture qatorlar -> applyRefresh
// -> baza -> so'rovlar. Vaqtinchalik SQLite fayl ishlatiladi, haqiqiy kesh tegilmaydi.
//
//   node src/scripts/selfTest.js
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// DB_FILE'ni config.js import qilinishidan OLDIN o'rnatamiz (dotenv mavjud
// process.env qiymatini bosib o'tmaydi), shuning uchun dinamik import.
const TMP_DB = path.join(os.tmpdir(), `stocker-selftest-${process.pid}.db`);
process.env.DB_FILE = TMP_DB;
process.env.SERVICE_TOKEN = "selftest";

const { applyRefresh, extractProductRefs } = await import("../cache/refresh.js");
const { getStats, getOrder, getProduct, listOrders, sampleBarcodes, findByBarcode, findAmbiguousBarcodes } =
  await import("../cache/queries.js");
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

const { scan, printBig, getActiveSession, cancelSession, expireStaleSessions, sessionJobs } =
  await import("../scan/sessions.js");

// Asosiy fixture'larni tiklaymiz (6-bo'lim keshni o'zgartirgan edi).
applyRefresh({ orderRows, detailRows, packingRows, canceled, nowMs: NOW });

const resetSessions = () =>
  db.exec(
    "DELETE FROM sessions; DELETE FROM session_items; DELETE FROM session_barcodes; DELETE FROM scans; DELETE FROM print_jobs"
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
// BIG endi AVTOMATIK chiqmaydi — operator "Print" tugmasini bosishi kerak
// (config.packing.autoBigPrint = false).
check("skan: yakunda faqat ShK", r.print.map((p) => p.target), ["shk"]);

const completedSessionId = r.session.id;
check(
  "print: BIG hali yasalmagan",
  sessionJobs(completedSessionId).filter((i) => i.target === "big").length,
  0
);

const printed = printBig(completedSessionId, "aziz");
check("print: BIG yasaldi", [printed.ok, printed.reused], [true, false]);
const printedAgain = printBig(completedSessionId, "aziz");
check("print: takror bosilsa yangi yasalmaydi", printedAgain.reused, true);
check("print: boshqa operator bosa olmaydi", printBig(completedSessionId, "vali").error, "Bu sessiya boshqa operatorniki");

const jobs = sessionJobs(completedSessionId);
check("navbat: 3 ta ShK", jobs.filter((i) => i.target === "shk").length, 3);
check("navbat: BIG bitta", jobs.filter((i) => i.target === "big").length, 1);
check("navbat: har ShK 2 nusxa", [...new Set(jobs.filter((i) => i.target === "shk").map((i) => i.copies))], [2]);
check("navbat: hammasi pending", [...new Set(jobs.map((i) => i.status))], ["pending"]);
check("navbat: har jobda fetch token bor", jobs.every((j) => j.fetchToken && j.fetchToken.length >= 32), true);

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

/* ---------------- 8. Chop etish navbati ---------------- */

const {
  createJob,
  claimJobsForStation,
  markSent,
  ackJob,
  sweepStaleJobs,
  getJob,
  queueStats,
  upsertStation,
  getStation,
} = await import("../print/jobs.js");

resetSessions();
db.exec("DELETE FROM print_jobs; DELETE FROM stations");

const j1 = createJob({ sessionId: "s1", orderId: "OK1", itemId: "i1", target: "shk", copies: 2, stationId: "Ombor-1" });
const j2 = createJob({ sessionId: "s1", orderId: "OK1", target: "big", copies: 1, stationId: "Ombor-1" });
createJob({ sessionId: "s2", orderId: "OK2", itemId: "i3", target: "shk", copies: 2, stationId: "Ombor-2" });

check("navbat: station bo'yicha ajratiladi", claimJobsForStation("Ombor-1").map((j) => j.id), [j1.id, j2.id]);
check("navbat: boshqa station 1 ta", claimJobsForStation("Ombor-2").length, 1);

// Yuborildi -> darhol qayta olinmaydi (ACK kutamiz)
markSent(j1.id);
check("navbat: yuborilgan job qayta olinmaydi", claimJobsForStation("Ombor-1").map((j) => j.id), [j2.id]);
check("navbat: urinish sanaldi", getJob(j1.id).attempts, 1);

// ACK -> done
ackJob(j1.id, { ok: true });
check("ACK: done bo'ldi", getJob(j1.id).status, "done");
check("ACK: navbatdan chiqdi", claimJobsForStation("Ombor-1").map((j) => j.id), [j2.id]);

// Idempotentlik: takroriy ACK done holatini buzmaydi
ackJob(j1.id, { ok: false, error: "kechikkan takroriy ACK" });
check("ACK: takroriy ACK done'ni buzmaydi", [getJob(j1.id).status, getJob(j1.id).lastError], ["done", null]);

// Xato ACK -> qayta navbatga
markSent(j2.id);
ackJob(j2.id, { ok: false, error: "printer oflayn" });
check("ACK xato: qayta navbatga", getJob(j2.id).status, "pending");
check("ACK xato: sabab saqlandi", getJob(j2.id).lastError, "printer oflayn");

// Urinishlar tugaganda -> error
markSent(j2.id);
ackJob(j2.id, { ok: false, error: "yana oflayn" });
markSent(j2.id);
ackJob(j2.id, { ok: false, error: "uchinchi marta" });
check("ACK xato: urinishlar tugadi -> error", getJob(j2.id).status, "error");
check("ACK xato: urinishlar soni", getJob(j2.id).attempts, 3);

// ACK kelmasa sweep qayta navbatga qo'yadi
const j3 = createJob({ orderId: "OK1", itemId: "i2", target: "shk", copies: 2, stationId: "Ombor-1" });
markSent(j3.id);
db.prepare("UPDATE print_jobs SET sent_at = '2020-01-01T00:00:00.000Z' WHERE id = ?").run(j3.id);
check("sweep: ACK kelmagan job qayta navbatga", sweepStaleJobs(), { requeued: 1, failed: 0 });
check("sweep: holati pending", getJob(j3.id).status, "pending");

check("navbat statistikasi", queueStats().error, 1);

// Station ma'lumotlari
upsertStation({ id: "Ombor-1", name: "Asosiy ombor", shkPrinter: "Proton DTP-4207", bigPrinter: "Gainsha GS-2408" });
check("station: printerlar saqlandi", [getStation("Ombor-1").shkPrinter, getStation("Ombor-1").bigPrinter], [
  "Proton DTP-4207",
  "Gainsha GS-2408",
]);
upsertStation({ id: "Ombor-1", shkPrinter: "Yangi ShK printer" });
check("station: qisman yangilash boshqasini o'chirmaydi", getStation("Ombor-1").bigPrinter, "Gainsha GS-2408");

/* ---------------- 9. Ro'yxat so'rovlari (filtrsiz yo'llar) ---------------- */
// better-sqlite3 SQL'da mavjud bo'lmagan nomlangan parametrni qabul qilmaydi.
// Filtrsiz chaqiruvlar aynan shu sababdan ishlamay qolgan edi — endi qoplangan.

check("listOrders(): filtrsiz ishlaydi", listOrders().length, 4);
check("listOrders(): eligible=false hammasi", listOrders({ eligible: false, limit: 100 }).length, 14);
check("listOrders(): minUnits=3", listOrders({ minUnits: 3 }).map((o) => o.orderId), ["OK1"]);
check("listOrders(): limit hurmat qilinadi", listOrders({ limit: 2 }).length, 2);
check("sampleBarcodes(): ishlaydi", sampleBarcodes(3).length, 3);

const { listJobs } = await import("../print/jobs.js");
check("listJobs(): filtrsiz ishlaydi", listJobs().length >= 1, true);
check("listJobs(): status bo'yicha", listJobs({ status: "error" }).length, 1);
check("listJobs(): station bo'yicha", listJobs({ stationId: "Ombor-2" }).length, 1);
check("listJobs(): mos kelmaydigan filtr", listJobs({ stationId: "yo'q" }).length, 0);

db.exec("DELETE FROM print_jobs; DELETE FROM stations");
resetSessions();

/* ---------------- 10. Operator autentifikatsiyasi (8-faza) ---------------- */
// Panel'ga chiqmaymiz: ro'yxatni to'g'ridan-to'g'ri keshga yozamiz — aynan
// panel yo'q holatda login ishlashi kerak bo'lgani uchun bu to'g'ri sinov.

const bcrypt = (await import("bcryptjs")).default;
const auth = await import("../auth/operators.js");

const seedOperator = (login, password, isActive = 1) =>
  db
    .prepare(
      "INSERT INTO operators (login, display_name, password_hash, is_active, synced_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(login, login.toUpperCase(), bcrypt.hashSync(password, 10), isActive, new Date().toISOString());

seedOperator("operator1", "parol1");
seedOperator("nofaol", "parol1", 0);

const good = auth.login({ login: "operator1", password: "parol1", ip: "1.1.1.1", device: "selftest" });
check("login: to'g'ri parol token beradi", typeof good.token === "string" && good.token.length === 64, true);
check("login: displayName qaytadi", good.displayName, "OPERATOR1");
check("login: login normalizatsiya (bosh harf/bo'shliq)", Boolean(auth.login({ login: " OPERATOR1 ", password: "parol1", ip: "1.1.1.2" }).token), true);
check("login: noto'g'ri parol", auth.login({ login: "operator1", password: "xato", ip: "2.2.2.2" }).error, "Login yoki parol noto'g'ri");
check("login: yo'q operator", auth.login({ login: "yoq", password: "parol1", ip: "3.3.3.3" }).error, "Login yoki parol noto'g'ri");
check("login: faolsizlantirilgan hisob", auth.login({ login: "nofaol", password: "parol1", ip: "4.4.4.4" }).error, "Hisob faolsizlantirilgan");

check("token: yaroqli", auth.resolveToken(good.token)?.login, "operator1");
check("token: yasama", auth.resolveToken("00" + good.token.slice(2)), null);
check("token: bo'sh", auth.resolveToken(""), null);

// Ko'p urinishdan keyin qulflash — bir IP dan parol terib ko'rishga qarshi.
for (let i = 0; i < 5; i++) auth.login({ login: "operator1", password: "xato", ip: "9.9.9.9" });
const locked = auth.login({ login: "operator1", password: "parol1", ip: "9.9.9.9" });
check("qulflash: to'g'ri parol ham o'tmaydi", Boolean(locked.error && locked.retryAfterMs > 0), true);
check("qulflash: boshqa IP ta'sirlanmaydi", Boolean(auth.login({ login: "operator1", password: "parol1", ip: "8.8.8.8" }).token), true);

// Panel'dan sinxronlash: faolsizlantirilganning tokeni bekor qilinadi,
// o'chirilgani keshdan chiqadi.
const sessionToken = auth.login({ login: "operator1", password: "parol1", ip: "7.7.7.7" }).token;
const applyUsers = auth.applyPanelUsers;
applyUsers([
  { login: "operator1", displayName: "Operator Bir", passwordHash: bcrypt.hashSync("yangi", 10), isActive: false },
]);
check("sinxron: faolsizlantirilganda token bekor", auth.resolveToken(sessionToken), null);
check("sinxron: o'chirilgan operator keshdan chiqdi", auth.getOperator("nofaol"), undefined);
check("sinxron: yangi parol keshga tushdi", auth.login({ login: "operator1", password: "yangi", ip: "6.6.6.6" }).error, "Hisob faolsizlantirilgan");

applyUsers([
  { login: "operator1", displayName: "Operator Bir", passwordHash: bcrypt.hashSync("yangi", 10), isActive: true },
]);
const afterSync = auth.login({ login: "operator1", password: "yangi", ip: "6.6.6.7" });
check("sinxron: qayta faollashtirilgach kiradi", afterSync.displayName, "Operator Bir");
check("logout: token o'chadi", [auth.logout(afterSync.token), auth.resolveToken(afterSync.token)], [true, null]);

// Muddati o'tgan token tozalanadi.
const stale = auth.login({ login: "operator1", password: "yangi", ip: "6.6.6.8" }).token;
db.prepare("UPDATE operator_tokens SET created_at = '2020-01-01T00:00:00.000Z'").run();
check("token: muddati o'tgani yaroqsiz", auth.resolveToken(stale), null);
check("prune: eski tokenlar o'chadi", auth.pruneExpiredTokens() >= 0, true);

db.exec("DELETE FROM operator_tokens; DELETE FROM operators");

/* ---------- 11. Foydalanuvchilar va ruxsatlar (konsolidatsiya) ---------- */

const users = await import("../auth/users.js");
const { SECTION_KEYS } = await import("../auth/sections.js");

const admin = users.createUser({
  login: "admin", displayName: "Administrator", password: "parol1", isSuperadmin: true,
});
const packer = users.createUser({
  login: "packer1", displayName: "Yig'uvchi", password: "parol1",
  sections: ["packing"], flags: ["mobile"],
});
const viewer = users.createUser({
  login: "viewer1", displayName: "Kuzatuvchi", password: "parol1", sections: ["labels"],
});

check("users: superadmin barcha bo'limni oladi", admin.sections.sort(), [...SECTION_KEYS].sort());
check("users: superadminda mobile bayrog'i o'zi bor", users.hasFlag(admin, "mobile"), true);
check("users: oddiy foydalanuvchi faqat berilganini", packer.sections, ["packing"]);
check("users: ruxsat bermagan bo'lim", users.can(packer, "labels"), false);
check("users: bergan bo'lim", users.can(packer, "packing"), true);
check("users: mobil bayrog'i yo'q", users.hasFlag(viewer, "mobile"), false);

check(
  "users: noma'lum bo'lim rad etiladi",
  (() => { try { users.setSections(packer.id, ["yoq"]); return "o'tdi"; } catch (e) { return "rad"; } })(),
  "rad"
);
check(
  "users: superadminni faolsizlantirib bo'lmaydi",
  (() => { try { users.setActive(admin.id, false); return "o'tdi"; } catch { return "rad"; } })(),
  "rad"
);
check(
  "users: superadminni o'chirib bo'lmaydi",
  (() => { try { users.removeUser(admin.id); return "o'tdi"; } catch { return "rad"; } })(),
  "rad"
);

// Login endi `users` dan: mobil bayrog'i borlar kiradi, yo'qlar kirmaydi.
check("login: users jadvalidagi operator", auth.login({ login: "packer1", password: "parol1", ip: "5.1.1.1" }).displayName, "Yig'uvchi");
check("login: mobil bayrog'isiz hisob", auth.login({ login: "viewer1", password: "parol1", ip: "5.1.1.2" }).error, "Hisob faolsizlantirilgan");
check("login: superadmin ham kira oladi", Boolean(auth.login({ login: "admin", password: "parol1", ip: "5.1.1.3" }).token), true);

const packerToken = auth.login({ login: "packer1", password: "parol1", ip: "5.1.1.4" }).token;
users.setActive(packer.id, false);
check("token: faolsizlantirilgach yaroqsiz", auth.resolveToken(packerToken), null);
users.setActive(packer.id, true);

// Eski `project_users` dan ko'chirish (panel bazasi birlashtirilgandan keyin).
db.exec(`CREATE TABLE IF NOT EXISTS project_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER, login TEXT, display_name TEXT,
  password_hash TEXT, is_active INTEGER DEFAULT 1, created_at TEXT)`);
db.prepare("INSERT INTO project_users (project_id, login, display_name, password_hash, is_active) VALUES (1,?,?,?,1)")
  .run("eski1", "Eski Operator", bcrypt.hashSync("parol1", 10));

const imported = users.importLegacyUsers({ adminLogin: "root", adminPasswordHash: bcrypt.hashSync("parol1", 10) });
check("import: operator ko'chdi", imported.operators, 1);
check("import: superadmin yaratildi", imported.admin, 1);
check("import: ko'chgan operator yig'ish bo'limini oldi", users.getUserByLogin("eski1").sections, ["packing"]);
check("import: ko'chgan operator mobil bayrog'ini oldi", users.getUserByLogin("eski1").flags, ["mobile"]);
check("import: eski parol ishlaydi", Boolean(auth.login({ login: "eski1", password: "parol1", ip: "5.2.2.1" }).token), true);

const again = users.importLegacyUsers({ adminLogin: "root", adminPasswordHash: "x" });
check("import: takroriy chaqiruv yangi yozuv yasamaydi", [again.operators, again.admin, again.skipped], [0, 0, 1]);

/* ---------- 12. Partiyalar (skan doirasi) ---------- */

const B = await import("../packing/batches.js");

check("partiya: ID ro'yxatini o'qish", B.parseOrderIds("116649323, 118799194\n10-0118293012-1  116649323"),
  ["116649323", "118799194", "10-0118293012-1"]);
check("partiya: bo'sh matn", B.parseOrderIds("  \n , "), []);

check("partiya: ochiq partiya yo'q", B.hasOpenBatch(), false);

const made = B.createBatch({ name: "5-avgust", orderIds: ["OK1", "NOBC", "YOQ999"], createdBy: "admin" });
check("partiya: qo'shildi", made.added.length, 3);
check("partiya: keshda yo'q ID belgilandi", made.unknown, ["YOQ999"]);
check("partiya: do'kon kesh'dan olindi", B.batchOrders(made.batch.id).find((o) => o.orderId === "OK1").shopId, "9001");
check("partiya: ochiq partiya bor", B.hasOpenBatch(), true);

// Bir buyurtma ikki ochiq partiyada bo'lmasligi kerak.
const second = B.createBatch({ name: "takror", orderIds: ["OK1", "OK2"], createdBy: "admin" });
check("partiya: takroriy buyurtma o'tkazib yuborildi", second.skipped.map((s) => s.orderId), ["OK1"]);
check("partiya: yangi buyurtma qo'shildi", second.added, ["OK2"]);

check("partiya: yig'ilgan deb belgilash", B.markPacked("OK1", "aziz"), true);
check("partiya: takror belgilash o'zgartirmaydi", B.markPacked("OK1", "aziz"), false);
check(
  "partiya: do'kon progressi",
  B.batchShops(made.batch.id).find((s) => s.shopId === "9001"),
  // `uzum_shops` jadvali bu bazada yo'q — nom o'rniga ID qaytadi.
  { shopId: "9001", name: "9001", total: 2, packed: 1, pending: 1 }
);

// Do'kon nomi: jadval bo'lsa nom, bo'lmasa ID.
db.exec("CREATE TABLE IF NOT EXISTS uzum_shops (id INTEGER PRIMARY KEY, cabinet_id INTEGER, name TEXT, shop_id TEXT)");
db.prepare("INSERT INTO uzum_shops (cabinet_id, name, shop_id) VALUES (1, ?, ?)").run("Buyo Fashion", "9001");
const { clearShopNameCache } = await import("../packing/shops.js");
clearShopNameCache();
check("do'kon nomi ko'rinadi", B.batchShops(made.batch.id).find((s) => s.shopId === "9001").name, "Buyo Fashion");
check("nomsiz do'kon uchun ID qoladi", B.batchShops(made.batch.id).find((s) => s.shopId === "—")?.name, "—");
db.exec("DROP TABLE uzum_shops");
clearShopNameCache();
check("partiya: operator tarixi", B.packedByOperator("aziz").map((r) => r.orderId), ["OK1"]);


// Yopilgan partiya skan doirasidan chiqadi.
B.closeBatch(second.batch.id);
B.closeBatch(made.batch.id);
check("partiya: yopilgach ochiq partiya qolmadi", B.hasOpenBatch(), false);
check("partiya: yopilgani ro'yxatda qoladi", B.listBatches().length, 2);
// Yopilgan partiyadagi buyurtmani yangi partiyaga olish mumkin; shundan
// keyin eskisini qayta ochish TAQIQLANADI — aks holda bitta buyurtma ikki
// ochiq ro'yxatda turib qolardi.
const third = B.createBatch({ name: "ertaga", orderIds: ["OK1"], createdBy: "admin" });
check("partiya: yopilganidan keyin buyurtma yangi partiyaga o'tdi", third.added, ["OK1"]);
check(
  "partiya: to'qnashuvda qayta ochilmaydi",
  (() => { try { B.reopenBatch(made.batch.id); return "ochildi"; } catch { return "rad"; } })(),
  "rad"
);
B.removeBatch(third.batch.id);
check("partiya: to'qnashuv ketgach qayta ochiladi", B.reopenBatch(made.batch.id).isOpen, true);

// Skan doirasi: ochiq partiyada bo'lmagan buyurtma topilmaydi.
resetSessions();
db.exec("DELETE FROM batch_orders WHERE order_id = 'NOBC'");
const outOfBatch = await scan({ barcode: "5000000000005", operator: "aziz" });
check("skan: partiyadan tashqaridagi buyurtma chiqmaydi", outOfBatch.result, "unknown_barcode");

const inBatch = await scan({ barcode: "1000111953348", operator: "aziz" });
check("skan: partiyadagi buyurtma ochiladi", inBatch.result, "order_opened");

// Buyurtmani oxirigacha yig'amiz — tarix va partiya belgisi shundan keladi.
await scan({ barcode: "1000222953348", operator: "aziz" });
const finished = await scan({ barcode: "1000222953348", operator: "aziz" });
check("skan: partiyadagi buyurtma yig'ildi", finished.result, "order_complete");
check("partiya: yig'ilgach 'packed' bo'ldi",
  B.batchOrders(made.batch.id).find((o) => o.orderId === "OK1").status, "packed");

// Mobil ilovadagi "men nima yig'dim": sessiyalardan, tarkibi bilan.
const { packedHistory } = await import("../packing/history.js");
const hist = packedHistory("aziz");
check("tarix: yig'ilgan buyurtma ro'yxatda", hist.map((h) => h.orderId), ["OK1"]);
check("tarix: tarkibi bor", hist[0].items.length, 2);
check("tarix: hamma tovar to'liq skanerlangan", hist[0].items.every((i) => i.scanned === i.needed), true);
check("tarix: partiya nomi ko'rinadi", hist[0].batch, "5-avgust");
check("tarix: boshqa operatorda bo'sh", packedHistory("boshqa").length, 0);

resetSessions();

B.removeBatch(made.batch.id);
B.removeBatch(second.batch.id);
check("partiya: o'chirilgach buyurtmalari ham ketdi", db.prepare("SELECT COUNT(*) AS n FROM batch_orders").get().n, 0);

// Veb doirasi (SPA): mobil bayrog'i shart emas, lekin hisob `users` da
// bo'lishi kerak va token doirasi ajratilgan.
const webLogin = auth.login({ login: "viewer1", password: "parol1", ip: "5.3.3.1", scope: "web" });
check("web: mobil bayrog'isiz hisob veb'ga kiradi", Boolean(webLogin.token), true);
check("web: token doirasi saqlanadi", auth.resolveToken(webLogin.token).scope, "web");
check("web: sessiyada bo'limlar bor", auth.resolveToken(webLogin.token).sections, ["labels"]);

const mobileToken = auth.login({ login: "packer1", password: "parol1", ip: "5.3.3.2" }).token;
check("web: mobil token doirasi 'mobile'", auth.resolveToken(mobileToken).scope, "mobile");

db.exec("DELETE FROM batch_orders; DELETE FROM batches; DELETE FROM user_flags; DELETE FROM user_permissions; DELETE FROM users; DROP TABLE project_users; DELETE FROM operator_tokens");

/* ---------- 13. O'zgaruvchilar katalogi ---------- */

// Bu bo'limning jadvallari panel migratsiyalarida yaratilgan, server'nikida
// emas. Shuning uchun bu yerda HAQIQIY panel sxemasi qo'llanadi va router
// HTTP orqali chaqiriladi: mos kelmagan ustun nomi (bir marta `google_sheets.url`
// bo'lgani kabi) faqat so'rov paytida bilinadi va butun bo'limni yopib qo'yadi.
const PANEL_MIGRATIONS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../panel/src/db/migrations"
);

if (!fs.existsSync(PANEL_MIGRATIONS)) {
  console.log("\n(panel/ topilmadi — o'zgaruvchilar katalogi tekshirilmadi)");
} else {
  for (const f of fs.readdirSync(PANEL_MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    db.exec(fs.readFileSync(path.join(PANEL_MIGRATIONS, f), "utf8"));
  }

  const express = (await import("express")).default;
  const { variablesRouter } = await import("../web/variables.js");

  const varsApp = express();
  varsApp.use(express.json());
  varsApp.use("/variables", variablesRouter());
  varsApp.use((err, req, res, next) => res.status(500).json({ error: err.message }));

  const varsServer = varsApp.listen(0, "127.0.0.1");
  await new Promise((r) => varsServer.once("listening", r));
  const varsBase = `http://127.0.0.1:${varsServer.address().port}`;

  const vars = async (p, method = "GET", body) => {
    const res = await fetch(varsBase + p, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    try {
      return { status: res.status, body: text ? JSON.parse(text) : null };
    } catch {
      return { status: res.status, body: { raw: text.slice(0, 120) } };
    }
  };

  // Asosiy holat: bo'sh katalog ham 200 qaytarishi kerak — SPA shu javobni
  // kutib turadi, xato bo'lsa bo'lim "Yuklanmoqda..." da qotib qoladi.
  // Xato matni alohida tekshiriladi: sxema mos kelmasa yiqilish xabarining
  // o'zida sabab ko'rinadi ("no such column: ...").
  const empty = await vars("/variables");
  check("vars: bo'sh katalog xatosiz", empty.body?.error ?? null, null);
  check("vars: bo'sh katalog 200", empty.status, 200);

  if (empty.status !== 200) {
    console.log("\n(katalog o'qilmadi — qolgan tekshiruvlar o'tkazib yuborildi)");
  } else {
    check("vars: javob kalitlari", Object.keys(empty.body).sort(), ["cabinets", "sheets", "sources", "telegramBots"]);

    check("vars: sheet qo'shildi", (await vars("/variables/sheets", "POST", { name: "Buyurtmalar", sheetId: "abc" })).status, 200);
    check("vars: list qo'shildi", (await vars("/variables/sheets/1/lists", "POST", { name: "uzum_order" })).status, 200);
    check("vars: bot qo'shildi", (await vars("/variables/telegram/bots", "POST", { name: "bot", token: "t" })).status, 200);
    check("vars: chat qo'shildi", (await vars("/variables/telegram/bots/1/chats", "POST", { name: "chat", chatId: "-100" })).status, 200);
    check("vars: mavzu qo'shildi", (await vars("/variables/telegram/chats/1/topics", "POST", { name: "mavzu", topicId: "7" })).status, 200);

    const filled = await vars("/variables");
    check("vars: sheet o'qildi", filled.body.sheets.map((s) => [s.name, s.sheet_id]), [["Buyurtmalar", "abc"]]);
    check("vars: list ichma-ich", filled.body.sheets[0].lists.map((l) => l.name), ["uzum_order"]);
    check("vars: chat va mavzu ichma-ich", filled.body.telegramBots[0].chats[0].topics.map((t) => t.topic_id), ["7"]);

    check("vars: nom yoki ID bo'lmasa 400", (await vars("/variables/sheets", "POST", { name: " " })).status, 400);

    // `DELETE /bindings/:id` umumiy `DELETE /:kind/:id` dan oldin turishi kerak.
    check("vars: bindings o'chirish o'z route'iga tushadi", (await vars("/variables/bindings/1", "DELETE")).status, 200);
    check("vars: noma'lum tur 400", (await vars("/variables/xyz/1", "DELETE")).status, 400);
    check("vars: list o'chirildi", (await vars("/variables/list/1", "DELETE")).status, 200);
  }

  await new Promise((r) => varsServer.close(r));
}

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
