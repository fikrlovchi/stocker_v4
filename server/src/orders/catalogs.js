// `orders/formulas.js` uchun spravochniklar — bazadan bir marta o'qiladi.
//
// Bo'sh katalog bilan hisoblash ma'nosiz: hamma qator "topilmadi" bo'lib
// chiqadi va solishtirish "8000 ta farq" deb ko'rsatadi. Shuning uchun
// `assertReady` bor — 2026-08-07 dagi "20 ta SKU nolga tushdi" holatidan
// olingan saboq: ogohlantirishni matnga emas, KODGA qo'yish kerak.
import { db } from "../db/index.js";

export function loadCatalogs() {
  const shops = new Map();
  for (const r of db
    .prepare(
      `SELECT s.shop_id, s.mc_saleschannel_href, c.mc_organization_href
       FROM uzum_shops s JOIN uzum_cabinets c ON c.id = s.cabinet_id`
    )
    .all()) {
    shops.set(String(r.shop_id), {
      salesChannelHref: r.mc_saleschannel_href || null,
      organizationHref: r.mc_organization_href || null,
    });
  }

  const links = new Map();
  for (const r of db
    .prepare("SELECT sku_title, mc_external_id, mc_uuid, card_quantity FROM link_product")
    .all()) {
    // Takror skuTitle bo'lsa BIRINCHISI qoladi — XLOOKUP ham shunday ishlaydi.
    if (!links.has(r.sku_title)) {
      links.set(r.sku_title, {
        mcExternalId: r.mc_external_id || "",
        mcUuid: r.mc_uuid || null,
        cardQuantity: Number(r.card_quantity) || 1,
      });
    }
  }

  const productByExternalId = new Map();
  const entityByUuid = new Map();
  for (const r of db.prepare("SELECT uuid, external_id, entity_type FROM mc_product").all()) {
    entityByUuid.set(r.uuid, r.entity_type);
    if (r.external_id && !productByExternalId.has(r.external_id)) {
      productByExternalId.set(r.external_id, r.uuid);
    }
  }

  return { shops, links, productByExternalId, entityByUuid };
}

/** Bo'sh katalog bilan solishtirish/hisoblash ishga tushmasin. */
export function assertReady(catalogs) {
  const empty = [];
  if (catalogs.shops.size === 0) empty.push("uzum_shops (Konfiguratsiya → Uzum)");
  if (catalogs.links.size === 0) empty.push("link_product (v3Sync.js)");
  if (catalogs.productByExternalId.size === 0) empty.push("mc_product (v3Sync.js)");
  if (empty.length) {
    throw new Error(`Katalog bo'sh, solishtirish ma'nosiz: ${empty.join(" · ")}`);
  }
}
