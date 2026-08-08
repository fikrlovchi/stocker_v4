// v3 jadvalidagi HISOBLANADIGAN buyurtma kataklari — aynan o'sha mantiq, toza
// funksiya sifatida (docs/V3-MIGRATION.md, 6-bosqich).
//
// Manba formulalar (`dumpSheet.js`, 2026-08-08):
//
//   uzum_order!O  organization_href
//     XLOOKUP(XLOOKUP(G, uzum_shop!A, uzum_shop!D), uzum_token!C, uzum_token!D)
//     → do'kon → kabinet → yuridik shaxs. Serverda: uzum_cabinets.mc_organization_href
//
//   uzum_order!P  saleschannel_href
//     XLOOKUP(G, uzum_shop!A, uzum_shop!G)
//     → do'konning sotuv kanali. Serverda: uzum_shops.mc_saleschannel_href
//
//   uzum_order!R  Tracking ID
//     IF(A<>"", "10-" & TEXT(A, "0000000000") & "-1", "")
//     → faqat buyurtma ID sidan hosil bo'ladi, hech qanday spravochnik kerak emas
//
//   uzum_order_detail!I  Product href
//     IF(C="", "", XLOOKUP(clean(XLOOKUP(C, link_product!B, link_product!K)),
//                          mc_product!F, mc_product!B))
//     → skuTitle → link_product!K (MC External ID) → mc_product!B (UUID)
//
//   uzum_order_detail!J  Entity type
//     IFNA(XLOOKUP(I, mc_product!B, mc_product!C))
//
//   uzum_order_detail!K  Quantity for mc
//     IF(C="", "", IF(ISNUMBER(F), F * XLOOKUP(C, link_product!B, link_product!N), ""))
//     → Uzum miqdori × kartochkadagi tovar soni
//
//   uzum_order_detail!L  Difference
//     IF(F=K, FALSE, TRUE)
//     → uzumOrderToMC buni `priceIsTotal` deb o'qiydi: TRUE bo'lsa E×F qator
//       UMUMIY summasi (index.js:66)
//
// Topilmagan qiymat null bilan belgilanadi. Jadvalda uning o'rnida `#N/A`
// turadi — bu XATO emas, "bog'lama yo'q" degan MA'NOLI holat, shuning uchun
// solishtirishda alohida sanaladi (`orderSync.js`).

// link_product!K dagi eski qo'shimcha: `@3` · `#2` · `%5` · `&1` yoki oxiridagi
// yolg'iz `$`. Jadval ham qidirishdan oldin shuni kesadi.
const LEGACY_SUFFIX = /([@#%&$]\d+|\$)$/;

/** Sheets `TEXT(A, "0000000000")` — 10 xonagacha nol bilan to'ldiradi. */
function pad10(orderId) {
  const s = String(orderId).trim();
  // Raqam bo'lmasa TEXT() qiymatni o'zgartirmaydi — o'sha xatti-harakat.
  return /^\d+$/.test(s) ? s.padStart(10, "0") : s;
}

/** `uzum_order!R` — buyurtma ID sidan tracking raqami. */
export function trackingId(orderId) {
  const id = String(orderId ?? "").trim();
  if (!id) return "";
  return `10-${pad10(id)}-1`;
}

/** `link_product!K` qiymatidan qo'shimchani kesadi (jadvaldagi REGEXREPLACE). */
export function cleanExternalId(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  return s.replace(LEGACY_SUFFIX, "");
}

/**
 * `uzum_order!O` va `!P`.
 *
 * shops: Map(shopId → {organizationHref, salesChannelHref}).
 * Do'kon katalogda bo'lmasa ikkalasi ham null — jadvalda `#N/A`.
 */
export function orderRefs(shopId, { shops }) {
  const shop = shops.get(String(shopId ?? "").trim());
  return {
    organizationHref: shop?.organizationHref || null,
    salesChannelHref: shop?.salesChannelHref || null,
  };
}

/**
 * `uzum_order_detail!I · J · K · L`.
 *
 * links:    Map(skuTitle → {mcExternalId, mcUuid, cardQuantity})
 * products: Map(externalId → uuid) va Map(uuid → entityType)
 *
 * `amount` — `uzum_order_detail!F` (Uzum miqdori).
 */
export function detailRefs({ skuTitle, amount }, { links, productByExternalId, entityByUuid }) {
  const sku = String(skuTitle ?? "").trim();
  if (!sku) {
    // Jadvalda ham bo'sh qator: `IF(C="", "", …)`.
    return { productRef: null, entityType: null, quantityForMc: null, difference: null, linked: true };
  }

  const link = links.get(sku) || null;

  // I: External ID → UUID. Jadvalda bo'sh External ID `XLOOKUP("")` bo'lib
  // tasodifan bo'sh katakka tushishi mumkin edi; server bunday qilmaydi.
  const externalId = cleanExternalId(link?.mcExternalId);
  const productRef = externalId ? productByExternalId.get(externalId) || null : null;

  // J: UUID → tur.
  const entityType = productRef ? entityByUuid.get(productRef) || null : null;

  // K: Uzum miqdori × kartochkadagi son. Miqdor raqam bo'lmasa jadvalda ham
  // bo'sh; SKU bog'lanmagan bo'lsa `#N/A`.
  const qty = Number(amount);
  const quantityForMc =
    !link || !Number.isFinite(qty) || amount === "" || amount === null || amount === undefined
      ? null
      : qty * link.cardQuantity;

  // L: F ≠ K. K aniqlanmagan bo'lsa jadvalda ham qiymat yo'q.
  const difference = quantityForMc === null ? null : qty !== quantityForMc;

  return { productRef, entityType, quantityForMc, difference, linked: Boolean(link) };
}
