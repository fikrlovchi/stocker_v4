// `link_product` dagi barcode'ni MoySklad tovariga qo'shish — v3 dagi
// `gas_v3/addBarcodeToMC.js` ning o'rni (docs/V3-MIGRATION.md, 4-bosqich).
//
// ENG MUHIM QOIDA: PUT'dan oldin tovarning hozirgi barcode'lari MoySklad'dan
// JONLI o'qiladi va yangisi ularning USTIGA qo'shiladi. Bazadagi yoki
// jadvaldagi nusxaga tayanib PUT qilsak, oradagi vaqtda MoySklad'da
// qo'shilgan barcode'lar yo'q bo'lib ketardi.
import { config } from "../config.js";
import { db } from "../db/index.js";
import logger from "../logger.js";
import { msFetch } from "../moysklad/client.js";

// MoySklad barcode saqlanadigan obyekt turlari.
const ENTITIES = ["product", "variant", "bundle", "service", "consignment"];

/** Katakdagi qiymatni toza matnga aylantiradi (eksponentadan himoya). */
export function normalizeCode(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Math.round(v).toFixed(0);
  return String(v).trim();
}

/** GTIN/EAN/UPC nazorat raqami (8/12/13/14 raqamli). */
export function isValidGtin(code) {
  if (!/^\d+$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop();
  let sum = 0;
  let w = 3; // eng o'ngdagi ma'lumot raqamidan boshlab 3,1,3,1…
  for (let i = digits.length - 1; i >= 0; i--) {
    sum += digits[i] * w;
    w = w === 3 ? 1 : 3;
  }
  return (10 - (sum % 10)) % 10 === check;
}

/** Barcode qiymatidan MoySklad turini aniqlaydi. */
export function detectBarcodeType(raw) {
  const code = normalizeCode(raw);
  if (/^\d{13}$/.test(code) && isValidGtin(code)) return "ean13";
  if (/^\d{8}$/.test(code) && isValidGtin(code)) return "ean8";
  if (/^\d{12}$/.test(code) && isValidGtin(code)) return "upc";
  if (/^\d{14}$/.test(code) && isValidGtin(code)) return "gtin";
  // Raqamli bo'lmagan yoki checksum mos kelmagan holatlar.
  return "code128";
}

/** Barcode ro'yxatida shu qiymat bormi (turidan qat'i nazar)? */
export function barcodeExists(current, value) {
  const needle = String(value).trim();
  return current.some((obj) => Object.values(obj).some((v) => String(v).trim() === needle));
}

/** Qaysi entity turlarini sinash kerak: ma'lum bo'lsa faqat o'sha. */
function entityOrder(entityType) {
  const e = String(entityType || "").trim().toLowerCase();
  return ENTITIES.includes(e) ? [e] : ["product", "variant"];
}

async function mcRequest(method, entity, uuid, body) {
  const res = await msFetch(`${config.moysklad.baseUrl}/entity/${entity}/${uuid}`, {
    method,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, text: res.ok ? "" : (await res.text()).slice(0, 300), json: res.ok ? await res.json() : null };
}

/** Tovardagi mavjud barcode massivini oladi. */
export async function getBarcodes(uuid, entityType) {
  let last = null;
  for (const entity of entityOrder(entityType)) {
    const r = await mcRequest("GET", entity, uuid);
    if (r.status === 200) return { ok: true, entity, barcodes: r.json.barcodes || [] };
    last = { ok: false, entity, status: r.status, text: r.text, barcodes: [] };
    // 404 — boshqa turni sinaymiz; qolgan xatolarda fallback ma'nosiz.
    if (r.status !== 404) break;
  }
  return last;
}

async function putBarcodes(uuid, entity, barcodes) {
  const r = await mcRequest("PUT", entity, uuid, { barcodes });
  return { ok: r.status === 200, status: r.status, text: r.text };
}

/**
 * Bayroq qo'yilgan qatorlarni topadi.
 *
 * v3 da bayroq `link_product!H` ("status") ustunida edi va GAS TRUE/yes/ha/
 * 1/x/✓/yubor qiymatlarini qabul qilardi. Shu ro'yxat saqlanadi: jadval hali
 * ishlab turgani uchun operator o'sha qiymatlarni yozishi mumkin.
 */
const FLAG_VALUES = new Set(["true", "yes", "ha", "1", "x", "✓", "yubor"]);
export const isFlagged = (v) =>
  v === true || v === 1 || FLAG_VALUES.has(String(v ?? "").trim().toLowerCase());

export function pendingBarcodeRows() {
  return db
    .prepare(
      `SELECT lp.id, lp.sku_title, lp.barcode, lp.mc_uuid, lp.status, p.entity_type
       FROM link_product lp
       LEFT JOIN mc_product p ON p.uuid = lp.mc_uuid
       ORDER BY lp.id`
    )
    .all()
    .filter((r) => isFlagged(r.status))
    .map((r) => ({
      id: r.id,
      skuTitle: r.sku_title,
      barcode: normalizeCode(r.barcode),
      mcUuid: r.mc_uuid,
      entityType: r.entity_type,
    }));
}

/**
 * Bayroqli qatorlarni MoySklad'ga yozadi.
 *
 * @param {object} opts
 *   dryRun — hech narsa yozilmaydi, faqat nima bo'lishi hisoblanadi
 *   onDone(row, outcome) — muvaffaqiyatli qatorda chaqiriladi (bayroqni
 *     jadvalda tozalash uchun; server bazasidagi bayroq bu yerda tozalanadi)
 */
export async function addBarcodesToMoySklad(rows, { dryRun = true, onDone } = {}) {
  const report = { total: rows.length, added: [], already: [], skipped: [], failed: [] };

  for (const row of rows) {
    if (!row.barcode || !row.mcUuid) {
      // Bayroq qo'yilgan, lekin ishlash uchun ma'lumot yetarli emas —
      // bayroq QOLADI, e'tibor tortishi kerak.
      report.skipped.push({ ...row, reason: "barcode yoki MoySklad UUID yo'q" });
      continue;
    }

    const current = await getBarcodes(row.mcUuid, row.entityType);
    if (!current?.ok) {
      report.failed.push({ ...row, reason: `GET ${current?.status}: ${current?.text || "xato"}` });
      continue;
    }

    if (barcodeExists(current.barcodes, row.barcode)) {
      // Allaqachon bor — PUT qilmaymiz, lekin bayroq tozalanadi.
      report.already.push(row);
      if (!dryRun && onDone) await onDone(row, "already");
      continue;
    }

    const type = detectBarcodeType(row.barcode);
    if (dryRun) {
      report.added.push({ ...row, type, totalAfter: current.barcodes.length + 1, entity: current.entity });
      continue;
    }

    const put = await putBarcodes(row.mcUuid, current.entity, [...current.barcodes, { [type]: row.barcode }]);
    if (!put.ok) {
      report.failed.push({ ...row, reason: `PUT ${put.status}: ${put.text}` });
      continue;
    }

    report.added.push({ ...row, type, totalAfter: current.barcodes.length + 1, entity: current.entity });
    logger.info(`Barcode qo'shildi: ${row.barcode} (${type}) → ${current.entity}/${row.mcUuid}`);
    if (onDone) await onDone(row, "added");
  }

  return report;
}

/** Server bazasidagi bayroqni tozalaydi. Jadvaldagisi alohida yoziladi. */
export function clearFlag(id) {
  db.prepare("UPDATE link_product SET status = NULL WHERE id = ?").run(id);
}
