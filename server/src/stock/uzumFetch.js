// Uzum'dan SKU ma'lumotini olish — v3 dagi `fetchUzumProducts` ning o'rni.
//
// v3 da bu AppSheet automation'i orqali, `link_product` ga yangi qator
// qo'shilganda ishlardi (A ustuni bo'sh qatorlar bo'yicha). Endi ham xuddi
// shunday: jadval bo'yicha takrorlanmaydi, qator yaratilganda bir marta.
//
// Qidiruv kaliti — `skuTitle`: Uzum javobidagi `skuFullTitle` bilan AYNAN
// mos kelishi kerak. Taxminiy moslik yo'q: noto'g'ri SKU biriktirilsa
// qoldiq boshqa tovarga ketardi.
import { db } from "../db/index.js";
import logger from "../logger.js";

const BASE = "https://api-seller.uzum.uz/api/seller-openapi/v1/product/shop";
const TIMEOUT_MS = 15000;

/**
 * Do'kon va uning kabinet tokenini beradi. Token qaytarilmaydi — faqat
 * shu modul ichida ishlatiladi.
 */
function shopWithToken(shopId) {
  return db
    .prepare(
      `SELECT s.shop_id, s.name, c.token, c.name AS cabinet_name
       FROM uzum_shops s JOIN uzum_cabinets c ON c.id = s.cabinet_id
       WHERE s.shop_id = ?`
    )
    .get(String(shopId));
}

/**
 * `skuTitle` bo'yicha Uzum'dan SKU ni topadi.
 *
 * @returns {{ found: boolean, reason?: string, sku?: object }}
 *   sku: { skuId, productTitle, barcode, image }
 */
export async function fetchUzumSku(skuTitle, shopId) {
  const shop = shopWithToken(shopId);
  if (!shop) return { found: false, reason: `Do'kon katalogda yo'q: ${shopId}` };
  if (!shop.token) return { found: false, reason: `"${shop.cabinet_name}" kabinetida token yo'q` };

  const url =
    `${BASE}/${encodeURIComponent(shop.shop_id)}` +
    `?searchQuery=${encodeURIComponent(skuTitle)}&sortBy=DEFAULT&order=ASC&size=1&page=0&filter=ALL`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      // Uzum seller-openapi: "Bearer" prefiksisiz, xom token.
      headers: { Authorization: shop.token, accept: "*/*" },
      signal: controller.signal,
    });
    if (!res.ok) return { found: false, reason: `Uzum API ${res.status}` };

    const json = await res.json();
    const product = json?.productList?.[0];
    if (!product) return { found: false, reason: "Uzum'da bu nom bilan tovar topilmadi" };

    // AYNAN mos kelishi shart — o'xshash nomli boshqa SKU olinmasin.
    const sku = (product.skuList || []).find((s) => s.skuFullTitle === skuTitle);
    if (!sku) {
      const titles = (product.skuList || []).slice(0, 3).map((s) => s.skuFullTitle).join(", ");
      return { found: false, reason: `Aynan mos SKU yo'q. Topilgani: ${titles || "—"}` };
    }

    return {
      found: true,
      sku: {
        skuId: sku.skuId,
        productTitle: sku.productTitle || product.title || "",
        barcode: sku.barcode ? String(sku.barcode) : "",
        image: product.image || "",
      },
    };
  } catch (e) {
    if (e.name === "AbortError") return { found: false, reason: "Uzum javob bermadi (timeout)" };
    logger.error(`Uzum SKU qidiruv xatosi (${skuTitle}): ${e.message}`);
    return { found: false, reason: e.message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * SKU nomidan do'konni topadi (`uzum_shop!F` — "SKU code").
 *
 * v3 dagi AppSheet formulasining aynan o'zi:
 *
 *   LOOKUP(INDEX(SPLIT(TRIM([skuTitle]), "-"), 1), "uzum_shop", "SKU code", "ID")
 *
 * Ya'ni `skuTitle` `-` bilan bo'linadi va BIRINCHI bo'lagi `SKU code` bilan
 * AYNAN solishtiriladi. "Shu bilan boshlanadi" degan moslik EMAS:
 * `UZONX-1` uchun `UZON` kodi mos kelmasligi kerak, aks holda tovar
 * boshqa do'konga biriktirilib qolardi.
 */
export function shopBySkuPrefix(skuTitle) {
  const prefix = String(skuTitle || "").trim().split("-")[0].trim().toUpperCase();
  if (!prefix) return null;

  return (
    db
      .prepare("SELECT shop_id, name, sku_code FROM uzum_shops WHERE UPPER(TRIM(sku_code)) = ? LIMIT 1")
      .get(prefix) || null
  );
}
