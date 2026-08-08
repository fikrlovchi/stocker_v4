// "Uzum buyurtmalari" bo'limi — serverga ko'chirilgan buyurtmalar.
//
// Maqsad: Sheets bilan aloqani uzishdan OLDIN ma'lumotni ko'z bilan
// tekshirish. Shuning uchun ekran jadvalning nusxasi emas — har qatorda
// jadvaldagi bayroqlar (Q·T·U·V) va MoySklad havolalari ham ko'rinadi,
// tarkibini ochib tovarlarini ko'rish mumkin.
import express from "express";
import fs from "node:fs";
import { db } from "../db/index.js";
import { shopName } from "../packing/shops.js";
import { importStatus } from "../orders/importFromSheet.js";
import { orderStatus, parseHHMM } from "../orders/status.js";
import { UNITS, readEnvValue } from "./projects.js";

// Kutish oynasi `uzum-order-to-mc/.env` da — status aynan shu oraliqqa
// tayanadi, shuning uchun ikkinchi joyda takrorlanmasligi kerak. Standart
// qiymatlar `orderStatusSync.js` dagi bilan bir xil.
function holdWindowMinutes() {
  const fallback = { holdStartMin: parseHHMM("06:10"), holdEndMin: parseHHMM("11:00") };
  const envPath = UNITS["uzum-order-to-mc"]?.envPath;
  if (!envPath) return fallback;
  try {
    const text = fs.readFileSync(envPath, "utf8");
    return {
      holdStartMin: parseHHMM(readEnvValue(text, "WINDOW_HOLD_START")) ?? fallback.holdStartMin,
      holdEndMin: parseHHMM(readEnvValue(text, "WINDOW_HOLD_END")) ?? fallback.holdEndMin,
    };
  } catch {
    return fallback;
  }
}

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
                EXISTS (SELECT 1 FROM orders c WHERE c.order_id = o.order_id) AS inCache,
                EXISTS (SELECT 1 FROM canceled_orders x WHERE x.order_id = o.order_id) AS canceledInMc,
                EXISTS (SELECT 1 FROM packed_orders p WHERE p.order_id = o.order_id) AS packed
         FROM uzum_orders o${sql}
         ORDER BY o.arrived_at_ms DESC, o.order_id DESC
         LIMIT @limit OFFSET @offset`
      )
      .all({ ...params, limit, offset });

    const window = holdWindowMinutes();

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
        // Status SAQLANMAYDI — har so'rovda hisoblanadi.
        status: orderStatus(
          {
            arrivedAtMs: r.arrived_at_ms,
            uzumConfirmed: r.uzum_confirmed === 1,
            mcState: r.mc_state,
            canceledInMc: Boolean(r.canceledInMc),
            packed: Boolean(r.packed),
          },
          window
        ),
        // Bayroqlar ustun bo'lib chiqmaydi, lekin javobda qoladi: interfeys
        // ularni izoh sifatida ko'rsatadi ("nega shu status?").
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

    // MoySklad tovarining NOMI qo'shiladi: UUID hech kimga hech narsa
    // aytmaydi, nom esa darhol tanitadi. `mc_product` serverda allaqachon
    // bor (assortiment MoySklad'dan o'qiladi) — qo'shimcha import kerak emas.
    res.json({
      items: db
        .prepare(
          `SELECT i.item_id AS itemId, i.barcode, i.sku_title AS skuTitle, i.price, i.amount,
                  i.product_ref AS productRef, i.entity_type AS entityType,
                  i.quantity_for_mc AS quantityForMc, i.price_is_total AS priceIsTotal,
                  i.sheet_row AS sheetRow,
                  p.name AS mcProductName, p.external_id AS mcExternalId
           FROM uzum_order_items i
           LEFT JOIN mc_product p ON p.uuid = i.product_ref
           WHERE i.order_id = ? ORDER BY i.sheet_row`
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
