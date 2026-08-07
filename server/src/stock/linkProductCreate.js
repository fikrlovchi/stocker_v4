// Yangi tovar bog'lamasi qo'shish.
//
// v3 da AppSheet formasi qator qo'shar, so'ng automation `runAll()` ni
// chaqirardi: Uzum'dan SKU ma'lumotini olish va barcode'ni MoySklad'ga
// qo'shish. Shu ketma-ketlik saqlanadi — jadval bo'yicha takrorlanmaydi,
// qator yaratilganda bir marta bajariladi.
//
// Tartib muhim: MoySklad UUID topilmasa qator UMUMAN yaratilmaydi. Aks
// holda katalogda "yarim" qator paydo bo'lardi va qoldiq hisobida jim
// ravishda 0 berardi.
import { db } from "../db/index.js";
import logger from "../logger.js";
import { fetchUzumSku } from "./uzumFetch.js";
import { getBarcodes, detectBarcodeType, barcodeExists, normalizeCode } from "./barcodeToMc.js";
import { config } from "../config.js";
import { msFetch } from "../moysklad/client.js";

export function logEvent({ linkProductId, skuTitle, kind, status, message, detail, byLogin }) {
  db.prepare(
    `INSERT INTO link_product_events (link_product_id, sku_title, kind, status, message, detail, by_login)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(linkProductId || null, skuTitle, kind, status, message || null, detail ? JSON.stringify(detail) : null, byLogin || null);
}

export function recentEvents({ limit = 50, kind, skuTitle } = {}) {
  const where = [];
  const params = {};
  if (kind) {
    where.push("kind = @kind");
    params.kind = kind;
  }
  if (skuTitle) {
    where.push("sku_title LIKE @q");
    params.q = `%${skuTitle}%`;
  }
  const sql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  return db
    .prepare(`SELECT * FROM link_product_events${sql} ORDER BY at DESC, id DESC LIMIT @limit`)
    .all({ ...params, limit })
    .map((r) => ({ ...r, detail: r.detail ? JSON.parse(r.detail) : null }));
}

/** Barcode'ni MoySklad tovariga qo'shadi va natijani jurnalga yozadi. */
async function addBarcode({ id, skuTitle, barcode, mcUuid, entityType, byLogin }) {
  const code = normalizeCode(barcode);
  if (!code) {
    logEvent({ linkProductId: id, skuTitle, kind: "mc_barcode", status: "skipped", message: "barcode yo'q", byLogin });
    return { status: "skipped", message: "barcode yo'q" };
  }

  const current = await getBarcodes(mcUuid, entityType);
  if (!current?.ok) {
    const message = `MoySklad GET ${current?.status}: ${current?.text || "xato"}`;
    logEvent({ linkProductId: id, skuTitle, kind: "mc_barcode", status: "error", message, byLogin });
    return { status: "error", message };
  }

  if (barcodeExists(current.barcodes, code)) {
    logEvent({
      linkProductId: id,
      skuTitle,
      kind: "mc_barcode",
      status: "skipped",
      message: "MoySklad'da allaqachon bor",
      detail: { barcode: code, entity: current.entity },
      byLogin,
    });
    return { status: "skipped", message: "MoySklad'da allaqachon bor" };
  }

  const type = detectBarcodeType(code);
  // Mavjudlar USTIGA qo'shiladi — eski barcode'lar yo'qolmasligi kerak.
  const res = await msFetch(`${config.moysklad.baseUrl}/entity/${current.entity}/${mcUuid}`, {
    method: "PUT",
    body: JSON.stringify({ barcodes: [...current.barcodes, { [type]: code }] }),
  });

  if (!res.ok) {
    const message = `MoySklad PUT ${res.status}: ${(await res.text()).slice(0, 200)}`;
    logEvent({ linkProductId: id, skuTitle, kind: "mc_barcode", status: "error", message, byLogin });
    return { status: "error", message };
  }

  logger.info(`Barcode qo'shildi: ${code} (${type}) → ${current.entity}/${mcUuid}`);
  logEvent({
    linkProductId: id,
    skuTitle,
    kind: "mc_barcode",
    status: "success",
    message: `${code} (${type}) qo'shildi`,
    detail: { barcode: code, type, entity: current.entity, totalAfter: current.barcodes.length + 1 },
    byLogin,
  });
  return { status: "success", message: `${code} (${type}) qo'shildi` };
}

/**
 * Yangi qator yaratadi va ikkita amalni bajaradi.
 *
 * Amallardan biri yiqilsa qator SAQLANIB QOLADI: masalan Uzum javob bermasa
 * ham bog'lama kerak, keyin "Qayta urinish" bilan to'ldiriladi. Faqat
 * MoySklad UUID topilmasligi yaratishni to'xtatadi.
 */
export async function createLinkProduct(input, byLogin) {
  const skuTitle = String(input.skuTitle || "").trim();
  const mcExternalId = String(input.mcExternalId || "").trim();
  const shopId = String(input.shopId || "").trim();
  const cardQuantity = Number(input.cardQuantity);

  if (!skuTitle) throw new Error("skuTitle kerak");
  if (!mcExternalId) throw new Error("MC External ID kerak");
  if (!shopId) throw new Error("Do'kon kerak");
  if (!Number.isFinite(cardQuantity) || cardQuantity < 1) throw new Error("Kartochka miqdori kamida 1 bo'lishi kerak");

  if (db.prepare("SELECT 1 FROM link_product WHERE sku_title = ?").get(skuTitle)) {
    throw new Error(`Bu skuTitle allaqachon mavjud: ${skuTitle}`);
  }
  if (!db.prepare("SELECT 1 FROM uzum_shops WHERE shop_id = ?").get(shopId)) {
    throw new Error(`Do'kon katalogda yo'q: ${shopId}`);
  }

  // External ID → UUID. Topilmasa qator yaratilmaydi.
  const product = db
    .prepare("SELECT uuid, entity_type FROM mc_product WHERE external_id = ? LIMIT 1")
    .get(mcExternalId);
  if (!product) throw new Error(`MoySklad'da bu External ID topilmadi: ${mcExternalId}`);

  const id = db
    .prepare(
      `INSERT INTO link_product (sku_title, shop_id, stock_update, order_import, mc_external_id, mc_uuid, card_quantity)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      skuTitle,
      shopId,
      input.stockUpdate === false ? 0 : 1,
      input.orderImport === false ? 0 : 1,
      mcExternalId,
      product.uuid,
      Math.round(cardQuantity)
    ).lastInsertRowid;

  logger.info(`Tovar bog'lamasi qo'shildi: ${skuTitle} (${byLogin})`);

  /* --- 1. Uzum'dan SKU ma'lumoti --- */
  const fetched = await fetchUzumSku(skuTitle, shopId);
  if (fetched.found) {
    db.prepare("UPDATE link_product SET sku_id = ?, product_title = ?, barcode = ?, image = ? WHERE id = ?").run(
      fetched.sku.skuId,
      fetched.sku.productTitle || null,
      fetched.sku.barcode || null,
      fetched.sku.image || null,
      id
    );
    logEvent({
      linkProductId: id,
      skuTitle,
      kind: "uzum_fetch",
      status: "success",
      message: `skuId ${fetched.sku.skuId}, barcode ${fetched.sku.barcode || "—"}`,
      detail: fetched.sku,
      byLogin,
    });
  } else {
    logEvent({ linkProductId: id, skuTitle, kind: "uzum_fetch", status: "error", message: fetched.reason, byLogin });
  }

  /* --- 2. Barcode → MoySklad --- */
  let barcodeResult = { status: "skipped", message: "Uzum'dan barcode kelmadi" };
  if (fetched.found && fetched.sku.barcode) {
    barcodeResult = await addBarcode({
      id,
      skuTitle,
      barcode: fetched.sku.barcode,
      mcUuid: product.uuid,
      entityType: product.entity_type,
      byLogin,
    });
  } else {
    logEvent({ linkProductId: id, skuTitle, kind: "mc_barcode", status: "skipped", message: barcodeResult.message, byLogin });
  }

  return {
    id,
    uzumFetch: fetched.found
      ? { status: "success", message: `skuId ${fetched.sku.skuId}` }
      : { status: "error", message: fetched.reason },
    mcBarcode: barcodeResult,
  };
}

/**
 * Mavjud qator uchun ikkala amalni qayta bajaradi — birinchi urinishda Uzum
 * javob bermagan bo'lsa qo'l keladi.
 */
export async function retryLinkProduct(id, byLogin) {
  const row = db.prepare("SELECT * FROM link_product WHERE id = ?").get(id);
  if (!row) throw new Error("Qator topilmadi");
  if (!row.mc_uuid) throw new Error("MoySklad tovari biriktirilmagan — avval External ID ni tuzating");

  const product = db.prepare("SELECT entity_type FROM mc_product WHERE uuid = ?").get(row.mc_uuid);

  const fetched = await fetchUzumSku(row.sku_title, row.shop_id);
  if (fetched.found) {
    db.prepare("UPDATE link_product SET sku_id = ?, product_title = ?, barcode = ?, image = ? WHERE id = ?").run(
      fetched.sku.skuId,
      fetched.sku.productTitle || null,
      fetched.sku.barcode || null,
      fetched.sku.image || null,
      id
    );
  }
  logEvent({
    linkProductId: id,
    skuTitle: row.sku_title,
    kind: "uzum_fetch",
    status: fetched.found ? "success" : "error",
    message: fetched.found ? `skuId ${fetched.sku.skuId}` : fetched.reason,
    detail: fetched.found ? fetched.sku : null,
    byLogin,
  });

  const barcode = fetched.found ? fetched.sku.barcode : row.barcode;
  const barcodeResult = barcode
    ? await addBarcode({
        id,
        skuTitle: row.sku_title,
        barcode,
        mcUuid: row.mc_uuid,
        entityType: product?.entity_type,
        byLogin,
      })
    : { status: "skipped", message: "barcode yo'q" };

  return {
    uzumFetch: fetched.found ? { status: "success", message: `skuId ${fetched.sku.skuId}` } : { status: "error", message: fetched.reason },
    mcBarcode: barcodeResult,
  };
}
