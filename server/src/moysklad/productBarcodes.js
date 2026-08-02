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
// ── Nega bulk `filter=id=` emas ────────────────────────────────────────
// `assortment` endpointining `id` filtri href qabul qilmaydi — MoySklad
// 1014 xatosi bilan rad etadi ("Неверное значение ... параметра
// фильтрации 'id'"). Shuning uchun ikki bosqichli yondashuv:
//
//   1. TO'LIQ ASSORTIMENT — `?limit=1000&offset=N` bilan sahifalab.
//      Filtrsiz, ya'ni ishonchli. Aynan shu usul addBarcodeToMC/
//      fetch_barcodes.py da allaqachon ishlab turibdi. Bir necha so'rovda
//      butun katalog tushadi, 570 ta tovar uchun 570 ta so'rov kerak emas.
//   2. QOLDIQLAR — to'liq sinxronizatsiyadan keyin ham topilmagan UUID'lar
//      (masalan oxirgi sinxronizatsiyadan keyin yaratilgan tovar) bittalab
//      `GET /entity/<type>/<uuid>` orqali olinadi. Bu oddiy entity o'qish,
//      filtr emas — har doim ishlaydi. Byudjet bilan cheklangan.
import { config } from "../config.js";
import { db, getMeta, setMeta } from "../db/index.js";
import logger from "../logger.js";
import { msFetch, msGetJson } from "./client.js";
import { normalizeBarcode } from "../util/sheetValues.js";

const MS = config.moysklad;
const TTL_MS = MS.barcodeTtlDays * 24 * 60 * 60 * 1000;
const MISSING_RETRY_MS = MS.missingRetryHours * 60 * 60 * 1000;
const PAGE = 1000;

// Turi noma'lum bo'lganda sinab ko'riladigan entity'lar.
const GUESS_TYPES = ["product", "variant", "bundle"];

function entityHref(uuid, type) {
  return `${MS.baseUrl}/entity/${type}/${uuid}`;
}

/* ---------------- saqlash ---------------- */

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

// Bitta tovarning barcode'larini yozadi. Avval eskilari o'chiriladi —
// MoySklad'da barcode olib tashlangan bo'lsa keshda qolib ketmasin.
function storeProduct(row, fetchedAt) {
  const uuid = String(row.id || "").trim().toLowerCase();
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

/* ---------------- 1-bosqich: to'liq assortiment ---------------- */

// Butun katalogni sahifalab o'qiydi. Filtrsiz — MoySklad'ning eng ishonchli
// yo'li (addBarcodeToMC/fetch_barcodes.py shu usulni ishlatadi).
export async function fullAssortmentSync() {
  const fetchedAt = new Date().toISOString();
  let offset = 0;
  let products = 0;
  let barcodes = 0;
  let total = null;

  while (true) {
    const json = await msGetJson(`${MS.baseUrl}/entity/assortment?limit=${PAGE}&offset=${offset}`);
    const rows = json.rows || [];
    if (total === null) {
      total = json.meta?.size ?? rows.length;
      logger.info(`MoySklad assortimenti: jami ${total} ta pozitsiya, ${Math.ceil(total / PAGE)} sahifa.`);
    }

    db.transaction(() => {
      for (const row of rows) {
        const n = storeProduct(row, fetchedAt);
        if (String(row.id || "").trim()) {
          products++;
          barcodes += n;
        }
      }
    })();

    offset += PAGE;
    if (rows.length === 0 || offset >= (json.meta?.size ?? rows.length)) break;
  }

  setMeta("last_full_sync_at", fetchedAt);
  logger.info(`MoySklad to'liq assortiment: ${products} ta tovar, ${barcodes} ta barcode.`);
  return { products, barcodes };
}

/* ---------------- 2-bosqich: qoldiqlarni bittalab ---------------- */

// Bitta entity'ni o'qiydi. 404 bo'lsa null (bu turdagi entity emas).
async function fetchEntity(uuid, type) {
  const response = await msFetch(entityHref(uuid, type), { method: "GET" });
  if (response.status === 404) return null;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`MoySklad ${response.status} (${type}/${uuid}): ${text.slice(0, 200)}`);
  }
  return response.json();
}

// Turi ma'lum bo'lsa bitta so'rov, noma'lum bo'lsa topilguncha sinab ko'riladi.
async function fetchByGuess(uuid, entityType) {
  const types = entityType ? [entityType, ...GUESS_TYPES.filter((t) => t !== entityType)] : GUESS_TYPES;
  for (const type of types) {
    const row = await fetchEntity(uuid, type);
    if (row) return row;
  }
  return null;
}

/* ---------------- qaysi UUID'lar yangilanishi kerak ---------------- */

// refs: Map<uuid, entityType|null>
export function selectStaleRefs(refs, nowMs = Date.now()) {
  if (refs.size === 0) return [];

  const known = new Map(
    db.prepare("SELECT uuid, fetched_at, missing FROM mc_products").all().map((r) => [r.uuid, r])
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

/* ---------------- asosiy funksiya ---------------- */

export async function syncProductBarcodes(refs, { budget = MS.syncBudgetPerCycle } = {}) {
  const result = { fullSync: false, requested: 0, fetched: 0, missing: 0, barcodes: 0, remaining: 0 };
  if (refs.size === 0) return result;

  // Kesh sovuq yoki TTL o'tgan bo'lsa — butun katalogni bir yo'la olamiz.
  // Bu 570 ta alohida so'rovdan ancha arzon.
  const lastFull = getMeta("last_full_sync_at");
  const fullAge = lastFull ? Date.now() - Date.parse(lastFull) : Infinity;
  if (selectStaleRefs(refs).length > 0 && !(fullAge < TTL_MS)) {
    try {
      await fullAssortmentSync();
      result.fullSync = true;
    } catch (e) {
      logger.error(`To'liq assortiment sinxronizatsiyasi xato: ${e.message}`);
    }
  }

  // Katalogda topilmaganlar (masalan hozirgina yaratilgan tovar) — bittalab.
  const stale = selectStaleRefs(refs);
  if (stale.length === 0) return result;

  const batch = stale.slice(0, budget);
  result.requested = batch.length;
  result.remaining = stale.length - batch.length;

  const fetchedAt = new Date().toISOString();
  const missing = [];
  let firstError = null;
  let errorCount = 0;

  for (const { uuid, entityType } of batch) {
    try {
      const row = await fetchByGuess(uuid, entityType);
      if (row) {
        db.transaction(() => {
          result.barcodes += storeProduct(row, fetchedAt);
        })();
        result.fetched++;
      } else {
        missing.push({ uuid, entityType });
      }
    } catch (e) {
      // Bir xil xato takrorlanishi mumkin — birinchisini batafsil, qolganini
      // sanab log qilamiz (panel bir "run"da 500 tadan ortiq log qabul qilmaydi).
      errorCount++;
      if (!firstError) firstError = e.message;
    }
  }

  if (missing.length) {
    db.transaction(() => {
      for (const { uuid, entityType } of missing) markMissing(uuid, entityType, fetchedAt);
    })();
    result.missing = missing.length;
  }

  if (errorCount) {
    logger.error(
      `MoySklad tovar o'qishda ${errorCount} ta xato. Birinchisi: ${firstError}`
    );
  }

  logger.info(
    `MoySklad barcode (qoldiqlar): ${result.fetched} ta tovar, ${result.barcodes} ta barcode` +
      (result.missing ? `, ${result.missing} ta topilmadi` : "") +
      (result.remaining ? `, ${result.remaining} ta keyingi tsiklga qoldi` : "")
  );

  if (missing.length) {
    logger.warn(
      `MoySklad'da topilmagan tovarlar: ${missing.slice(0, 10).map((e) => e.uuid).join(", ")}` +
        (missing.length > 10 ? ` ...(+${missing.length - 10})` : "")
    );
  }

  return result;
}

/* ---------------- indeks uchun yordamchi ---------------- */

// uuid -> barcode soni (eligibility hisobi uchun)
export function barcodeCountsByRef() {
  return new Map(
    db.prepare("SELECT uuid, COUNT(*) AS n FROM mc_barcodes GROUP BY uuid").all().map((r) => [r.uuid, r.n])
  );
}
