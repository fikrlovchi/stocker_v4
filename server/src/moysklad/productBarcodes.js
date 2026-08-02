// MoySklad tovarlarining barcode'larini olib keladi.
//
// Manba: `uzum_order_detail!I` — MoySklad goods href'i. Shu href orqali
// olingan `barcodes[]` massivi ({ean13:"..."}, {code128:"..."}) skan
// indeksiga qo'shiladi. Natijada operator Uzum barcode'ini ham (detail!B),
// MoySklad'dagi istalgan barcode'ni ham skanerlay oladi.
//
// ShK yorlig'i matni BU YERDAN o'zgarmaydi — nom hamon mc_product!E dan
// keladi (PLAN.md 1-bo'lim, 2-qaror). Bu modul faqat tanib olish uchun.
//
// Strategiya:
//  • Bitta so'rovda 25 tagacha UUID — `assortment?filter=id=<href>;id=<href>`
//    (bir xil kalitning bir nechta qiymati MoySklad'da OR sifatida ishlaydi).
//    300 ta yangi tovar = 300 emas, 12 ta so'rov.
//  • Entity turi noma'lum bo'lsa product va variant href'lari ikkalasi ham
//    yuboriladi — mos kelmagani javobga tushmaydi, xato ham bermaydi.
//  • TTL 7 kun; topilmaganlar 24 soat qayta so'ralmaydi.
import { config } from "../config.js";
import { db } from "../db/index.js";
import logger from "../logger.js";
import { msGetJson } from "./client.js";
import { normalizeBarcode } from "../util/sheetValues.js";

const MS = config.moysklad;
const TTL_MS = MS.barcodeTtlDays * 24 * 60 * 60 * 1000;
const MISSING_RETRY_MS = MS.missingRetryHours * 60 * 60 * 1000;

// Turi noma'lum bo'lganda sinab ko'riladigan entity'lar.
const GUESS_TYPES = ["product", "variant"];

function href(uuid, type) {
  return `${MS.baseUrl}/entity/${type}/${uuid}`;
}

/* ---------------- qaysi UUID'lar yangilanishi kerak ---------------- */

// refs: Map<uuid, entityType|null>
export function selectStaleRefs(refs, nowMs = Date.now()) {
  if (refs.size === 0) return [];

  const known = new Map(
    db
      .prepare("SELECT uuid, fetched_at, missing FROM mc_products")
      .all()
      .map((r) => [r.uuid, r])
  );

  const stale = [];
  for (const [uuid, entityType] of refs) {
    const row = known.get(uuid);
    if (!row) {
      stale.push({ uuid, entityType });
      continue;
    }
    const age = nowMs - Date.parse(row.fetched_at);
    const limit = row.missing ? MISSING_RETRY_MS : TTL_MS;
    if (Number.isNaN(age) || age > limit) stale.push({ uuid, entityType });
  }
  return stale;
}

/* ---------------- olish va saqlash ---------------- */

const upsertProduct = () =>
  db.prepare(`
    INSERT INTO mc_products (uuid, entity_type, name, fetched_at, missing)
    VALUES (@uuid, @entity_type, @name, @fetched_at, @missing)
    ON CONFLICT(uuid) DO UPDATE SET
      entity_type = excluded.entity_type,
      name        = excluded.name,
      fetched_at  = excluded.fetched_at,
      missing     = excluded.missing
  `);

// Bitta tovarning barcode'larini yozadi (avval eskilarini o'chirib —
// MoySklad'da barcode olib tashlangan bo'lsa keshda qolib ketmasin).
function storeProduct(row, fetchedAt) {
  const uuid = String(row.id || "").trim();
  if (!uuid) return 0;

  upsertProduct().run({
    uuid,
    entity_type: String(row.meta?.type || "").toLowerCase() || null,
    name: row.name ?? null,
    fetched_at: fetchedAt,
    missing: 0,
  });

  db.prepare("DELETE FROM mc_barcodes WHERE uuid = ?").run(uuid);

  const insert = db.prepare(
    "INSERT INTO mc_barcodes (uuid, barcode, type, raw) VALUES (?, ?, ?, ?) ON CONFLICT(uuid, barcode) DO NOTHING"
  );

  let n = 0;
  for (const entry of row.barcodes || []) {
    if (!entry || typeof entry !== "object") continue;
    // Har element bitta kalitli obyekt: {"ean13": "4600000000001"}
    for (const [type, value] of Object.entries(entry)) {
      const raw = String(value ?? "").trim();
      const barcode = normalizeBarcode(raw);
      if (!barcode) continue;
      insert.run(uuid, barcode, String(type).toLowerCase(), raw);
      n++;
    }
  }
  return n;
}

function markMissing(uuid, entityType, fetchedAt) {
  upsertProduct().run({
    uuid,
    entity_type: entityType || null,
    name: null,
    fetched_at: fetchedAt,
    missing: 1,
  });
  db.prepare("DELETE FROM mc_barcodes WHERE uuid = ?").run(uuid);
}

async function fetchChunk(entries) {
  // Turi ma'lum bo'lsa bitta href, noma'lum bo'lsa taxminlarning hammasi.
  const hrefs = [];
  for (const { uuid, entityType } of entries) {
    if (entityType) hrefs.push(href(uuid, entityType));
    else for (const t of GUESS_TYPES) hrefs.push(href(uuid, t));
  }
  const filter = hrefs.map((h) => `id=${h}`).join(";");
  const url = `${MS.baseUrl}/entity/assortment?filter=${encodeURIComponent(filter)}&limit=1000`;
  const json = await msGetJson(url);
  return json.rows || [];
}

// refs: Map<uuid, entityType|null>. Eskirgan/yangi UUID'larni yangilaydi.
export async function syncProductBarcodes(refs, { budget = MS.syncBudgetPerCycle } = {}) {
  const stale = selectStaleRefs(refs);
  if (stale.length === 0) return { requested: 0, fetched: 0, missing: 0, barcodes: 0, remaining: 0 };

  const batch = stale.slice(0, budget);
  const remaining = stale.length - batch.length;
  const fetchedAt = new Date().toISOString();

  let fetched = 0;
  let barcodes = 0;
  const seen = new Set();

  for (let i = 0; i < batch.length; i += MS.idChunkSize) {
    const chunk = batch.slice(i, i + MS.idChunkSize);
    let rows;
    try {
      rows = await fetchChunk(chunk);
    } catch (e) {
      logger.error(`MoySklad barcode olishda xato (${chunk.length} ta tovar): ${e.message}`);
      continue; // qolgan bo'laklar davom etsin, bular keyingi tsiklda qayta uriniladi
    }

    db.transaction(() => {
      for (const row of rows) {
        const n = storeProduct(row, fetchedAt);
        if (String(row.id || "").trim()) {
          seen.add(String(row.id).trim());
          fetched++;
          barcodes += n;
        }
      }
    })();
  }

  // So'ralgan, lekin javobda kelmagan UUID'lar — MoySklad'da yo'q yoki href
  // noto'g'ri. 24 soat qayta so'ralmaydi.
  const missingEntries = batch.filter((e) => !seen.has(e.uuid));
  if (missingEntries.length) {
    db.transaction(() => {
      for (const { uuid, entityType } of missingEntries) markMissing(uuid, entityType, fetchedAt);
    })();
  }

  logger.info(
    `MoySklad barcode: ${fetched} ta tovar, ${barcodes} ta barcode` +
      (missingEntries.length ? `, ${missingEntries.length} ta topilmadi` : "") +
      (remaining ? `, ${remaining} ta keyingi tsiklga qoldi` : "")
  );

  if (missingEntries.length) {
    logger.warn(
      `MoySklad'da topilmagan tovarlar: ${missingEntries.slice(0, 10).map((e) => e.uuid).join(", ")}` +
        (missingEntries.length > 10 ? ` ...(+${missingEntries.length - 10})` : "")
    );
  }

  return { requested: batch.length, fetched, missing: missingEntries.length, barcodes, remaining };
}

/* ---------------- to'liq assortiment (tunda bir marta) ---------------- */

// Butun assortimentni sahifalab yangilaydi — MoySklad'da barcode qo'shilgan/
// o'zgargan bo'lsa TTL kutmasdan tushadi. addBarcodeToMC/fetch_barcodes.py
// mantiqining Node varianti.
export async function fullAssortmentSync() {
  const PAGE = 1000;
  const fetchedAt = new Date().toISOString();
  let offset = 0;
  let products = 0;
  let barcodes = 0;

  while (true) {
    const url = `${MS.baseUrl}/entity/assortment?limit=${PAGE}&offset=${offset}`;
    const json = await msGetJson(url);
    const rows = json.rows || [];

    db.transaction(() => {
      for (const row of rows) {
        const n = storeProduct(row, fetchedAt);
        if (String(row.id || "").trim()) {
          products++;
          barcodes += n;
        }
      }
    })();

    const size = json.meta?.size ?? rows.length;
    offset += PAGE;
    if (rows.length === 0 || offset >= size) break;
  }

  logger.info(`MoySklad to'liq assortiment: ${products} ta tovar, ${barcodes} ta barcode.`);
  return { products, barcodes };
}

/* ---------------- indeks uchun yordamchi ---------------- */

// uuid -> barcode soni (eligibility hisobi uchun)
export function barcodeCountsByRef() {
  return new Map(
    db.prepare("SELECT uuid, COUNT(*) AS n FROM mc_barcodes GROUP BY uuid").all().map((r) => [r.uuid, r.n])
  );
}
