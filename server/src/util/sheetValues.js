// uzumOrderToMC/src/sheetsUtil.js dan ko'chirilgan (ESM), + shu loyihaga xos
// normalizatsiya funksiyalari.

// A -> 0, B -> 1, ..., Z -> 25, AA -> 26, ...
export function colLetterToIndex(letter) {
  let index = 0;
  for (const ch of String(letter).toUpperCase()) {
    index = index * 26 + (ch.charCodeAt(0) - 64);
  }
  return index - 1;
}

// {orderId: "A", ...} -> {orderId: 0, ...}
export function columnIndexMap(columns) {
  return Object.fromEntries(Object.entries(columns).map(([k, v]) => [k, colLetterToIndex(v)]));
}

const SHEETS_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

export function tashkentNowString() {
  return new Date(Date.now() + TASHKENT_OFFSET_MS).toISOString().replace("T", " ").slice(0, 19);
}

// uzum_order!W (yoki C) qiymatini absolut UTC epoch-ms ga aylantiradi.
// Uch ko'rinishni qabul qiladi: "yyyy-MM-dd[ HH:mm[:ss]]" matn (Toshkent
// devor-soati), Sheets serial sana (kichik son), epoch-ms (katta son).
export function parseSheetTimeToEpochMs(raw) {
  if (raw === undefined || raw === null || raw === "") return null;

  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    if (raw < 100000) return SHEETS_EPOCH_UTC_MS + raw * 86400 * 1000 - TASHKENT_OFFSET_MS;
    return raw;
  }

  const s = String(raw).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (match) {
    const [, y, mo, d, h, mi, se] = match;
    return Date.UTC(+y, +mo - 1, +d, +(h || 0), +(mi || 0), +(se || 0)) - TASHKENT_OFFSET_MS;
  }

  const parsed = Date.parse(s);
  return Number.isNaN(parsed) ? null : parsed;
}

// Katak qiymatini toza matnga aylantiradi. Sheets formula xatolari
// ("#N/A", "#REF!" va h.k.) bo'sh deb hisoblanadi — `uzum_order_detail!I`
// XLOOKUP'i mos topmasa aynan shunday qiymat qaytaradi.
export function cellText(raw) {
  if (raw === undefined || raw === null) return "";
  const s = String(raw).trim();
  if (s.startsWith("#")) return "";
  return s;
}

// Barcode indeksining kaliti. Skanerdan kelgan qiymat ham, sheetdagi qiymat
// ham shu funksiyadan o'tadi — shunda bo'shliq/tire/ajratgich farqi muammo
// tug'dirmaydi. Faqat raqamlardan iborat bo'lmagan kodlar (masalan "ABC-123")
// uchun harflar saqlanadi va katta harfga keltiriladi.
export function normalizeBarcode(raw) {
  const s = cellText(raw);
  if (!s) return "";
  const digitsOnly = s.replace(/\D/g, "");
  // Faqat raqam + ajratgichlardan iborat bo'lsa — sof raqamlar qoladi.
  if (digitsOnly && /^[\d\s.,\-_]+$/.test(s)) return digitsOnly;
  return s.replace(/[\s\-_]/g, "").toUpperCase();
}

// uzum_order_detail!I ustunida to'liq href ham ("https://.../product/<uuid>"),
// yalang'och UUID ham bo'lishi mumkin. Ikkalasidan ham UUID ajratib olinadi.
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
export function extractProductRef(raw) {
  const s = cellText(raw);
  if (!s) return null;
  const m = UUID_RE.exec(s);
  return m ? m[0].toLowerCase() : null;
}

// href'dan entity turini oladi ("product" | "variant" | "bundle" | ...).
// Faqat to'liq href berilganda ishlaydi, aks holda null.
export function extractEntityType(raw) {
  const s = cellText(raw);
  const m = /\/entity\/([a-z]+)\//i.exec(s);
  return m ? m[1].toLowerCase() : null;
}
