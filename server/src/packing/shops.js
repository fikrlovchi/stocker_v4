// Do'kon nomlari. `uzum_shops` jadvali panel'dan kelgan (bazalar
// birlashtirilgan) — u yerda har do'konning `shop_id` va o'qiladigan `name`
// bo'ladi.
//
// Kesh: nomlar kamdan-kam o'zgaradi, lekin har skan javobida jadvalga
// murojaat qilish keraksiz. TTL qisqa — panelda nom o'zgartirilsa bir
// daqiqada ko'rinadi.
import { db } from "../db/index.js";

const TTL_MS = 60000;
let cache = { at: 0, map: new Map() };

function tableExists() {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'uzum_shops'").get()
  );
}

export function shopNames() {
  if (Date.now() - cache.at < TTL_MS) return cache.map;

  const map = new Map();
  // Jadval bo'lmasligi mumkin (masalan testdagi toza baza) — bunda ID
  // ko'rinaveradi, xato bermaydi.
  if (tableExists()) {
    for (const row of db.prepare("SELECT shop_id, name FROM uzum_shops").all()) {
      if (row.shop_id && row.name) map.set(String(row.shop_id), row.name);
    }
  }
  cache = { at: Date.now(), map };
  return map;
}

/** Nom topilmasa ID ning o'zi qaytadi — ekranda bo'sh joy qolmasin. */
export function shopName(shopId) {
  if (!shopId) return null;
  return shopNames().get(String(shopId)) || String(shopId);
}

export function clearShopNameCache() {
  cache = { at: 0, map: new Map() };
  groupCache = { at: 0, map: new Map() };
}

/* ---------------- Do'kon guruhlari ---------------- */

// Bir necha do'kon amalda bitta ombordan yig'iladi. Operator ekranda guruh
// RAQAMINI ko'radi va shu bo'yicha saralaydi — do'kon tanlash shart emas.
let groupCache = { at: 0, map: new Map() };

function groupsTable() {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'uzum_shop_groups'").get()
  );
}

/** shop_id → { groupId, groupName }. Jadval yo'q bo'lsa bo'sh xarita. */
export function shopGroups() {
  if (Date.now() - groupCache.at < TTL_MS) return groupCache.map;

  const map = new Map();
  if (groupsTable()) {
    const rows = db
      .prepare(
        `SELECT s.shop_id, s.group_id, g.name
         FROM uzum_shops s LEFT JOIN uzum_shop_groups g ON g.id = s.group_id
         WHERE s.group_id IS NOT NULL`
      )
      .all();
    for (const r of rows) map.set(String(r.shop_id), { groupId: r.group_id, groupName: r.name || null });
  }
  groupCache = { at: Date.now(), map };
  return map;
}

/** Do'konning guruhi — topilmasa null (guruhga biriktirilmagan). */
export function shopGroup(shopId) {
  if (!shopId) return null;
  return shopGroups().get(String(shopId)) || null;
}
