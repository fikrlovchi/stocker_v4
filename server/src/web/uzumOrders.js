// "Uzum buyurtmalari" bo'limi — serverga ko'chirilgan buyurtmalar.
//
// Maqsad: Sheets bilan aloqani uzishdan OLDIN ma'lumotni ko'z bilan
// tekshirish. Shuning uchun ekran jadvalning nusxasi emas — har qatorda
// jadvaldagi bayroqlar (Q·T·U·V) va MoySklad havolalari ham ko'rinadi,
// tarkibini ochib tovarlarini ko'rish mumkin.
import express from "express";
import { db } from "../db/index.js";
import { shopName } from "../packing/shops.js";
import { importStatus } from "../orders/importFromSheet.js";

export function uzumOrdersRouter() {
  const router = express.Router();

  // Ko'chirish holati — bo'lim ochilganda darhol ko'rinadi.
  router.get("/status", (req, res) => res.json(importStatus()));

  router.get("/", (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const search = String(req.query.search || "").trim();
    const shopId = String(req.query.shop || "").trim();
    // `cache=in` — yig'ish keshida bor (oxirgi 3 kun), `cache=out` — yo'q.
    const cache = String(req.query.cache || "").trim();

    const where = [];
    const params = {};
    if (search) {
      where.push(
        `(o.order_id LIKE @q OR o.moysklad_id LIKE @q OR o.tracking_number LIKE @q
          OR EXISTS (SELECT 1 FROM uzum_order_items i
                     WHERE i.order_id = o.order_id AND (i.sku_title LIKE @q OR i.barcode LIKE @q)))`
      );
      params.q = `%${search}%`;
    }
    if (shopId) {
      where.push("o.shop_id = @shop");
      params.shop = shopId;
    }
    if (cache === "in") where.push("EXISTS (SELECT 1 FROM orders c WHERE c.order_id = o.order_id)");
    if (cache === "out") where.push("NOT EXISTS (SELECT 1 FROM orders c WHERE c.order_id = o.order_id)");

    const sql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    const total = db.prepare(`SELECT COUNT(*) n FROM uzum_orders o${sql}`).get(params).n;

    const rows = db
      .prepare(
        `SELECT o.*,
                (SELECT COUNT(*) FROM uzum_order_items i WHERE i.order_id = o.order_id) AS itemCount,
                EXISTS (SELECT 1 FROM orders c WHERE c.order_id = o.order_id) AS inCache
         FROM uzum_orders o${sql}
         ORDER BY o.arrived_at_ms DESC, o.order_id DESC
         LIMIT @limit OFFSET @offset`
      )
      .all({ ...params, limit, offset });

    res.json({
      items: rows.map((r) => ({
        orderId: r.order_id,
        uzumStatus: r.uzum_status,
        shopId: r.shop_id,
        shopName: r.shop_id ? shopName(r.shop_id) : null,
        arrivedAt: r.arrived_at,
        arrivedAtMs: r.arrived_at_ms,
        price: r.price,
        itemCount: r.itemCount,
        // Jadvaldagi bayroqlar: "nega bu buyurtma yig'ishga chiqmagan"
        // degan savolga javob shu to'rttasida.
        sentToMc: r.sent_to_mc,
        uzumConfirmed: r.uzum_confirmed,
        mcState: r.mc_state,
        cancelHandled: r.cancel_handled,
        moyskladId: r.moysklad_id,
        trackingNumber: r.tracking_number,
        organizationHref: r.mc_organization_href,
        salesChannelHref: r.mc_saleschannel_href,
        scheme: r.scheme,
        invoiceNumber: r.invoice_number,
        inCache: Boolean(r.inCache),
        sheetRow: r.sheet_row,
      })),
      total,
      limit,
      offset,
    });
  });

  // Bitta buyurtma tarkibi — qatorni ochganda so'raladi.
  router.get("/:orderId/items", (req, res) => {
    const order = db.prepare("SELECT order_id FROM uzum_orders WHERE order_id = ?").get(String(req.params.orderId));
    if (!order) return res.status(404).json({ error: "Buyurtma topilmadi" });

    res.json({
      items: db
        .prepare(
          `SELECT item_id AS itemId, barcode, sku_title AS skuTitle, title, price, amount,
                  product_ref AS productRef, entity_type AS entityType,
                  quantity_for_mc AS quantityForMc, price_is_total AS priceIsTotal, sheet_row AS sheetRow
           FROM uzum_order_items WHERE order_id = ? ORDER BY sheet_row`
        )
        .all(String(req.params.orderId)),
    });
  });

  // Filtr uchun do'konlar — faqat buyurtmasi borlari.
  router.get("/shops", (req, res) => {
    res.json({
      shops: db
        .prepare("SELECT shop_id AS shopId, COUNT(*) AS total FROM uzum_orders WHERE shop_id IS NOT NULL GROUP BY shop_id")
        .all()
        .map((r) => ({ ...r, name: shopName(r.shopId) }))
        .sort((a, b) => b.total - a.total),
    });
  });

  return router;
}
