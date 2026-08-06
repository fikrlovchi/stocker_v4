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
}
