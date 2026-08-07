// Qoldiq oqimlari va `link_product` katalogi — SPA uchun API.
//
// Bo'lim ruxsati `routes.js` da qo'yiladi. Yuborish (`push`) tashqi natijaga
// olib keladi, shuning uchun interfeysdan ham himoya bilan ishlaydi:
// himoya `stock/runner.js` ichida, ya'ni skript ham, interfeys ham, jadval
// ham bir xil tekshiruvdan o'tadi.
import express from "express";
import { db } from "../db/index.js";
import {
  KINDS,
  getSchedule,
  setSchedule,
  startStockSchedule,
  runStockJob,
  recentRuns,
  lastRun,
  stockCacheStatus,
} from "../stock/runner.js";
import { loadMods, loadDefaults, loadStockByExternalId, loadShopTokens } from "../stock/catalog.js";
import { computeRow } from "../stock/rules.js";
import { recentStockSyncs, stockSyncSummary } from "../moysklad/stockLog.js";

export function stockRouter() {
  const router = express.Router();

  /* ---------- holat ---------- */

  router.get("/", (req, res) => {
    res.json({
      cache: stockCacheStatus(),
      schedule: getSchedule(),
      last: Object.fromEntries(KINDS.map((k) => [k, lastRun(k)])),
      stockLog: stockSyncSummary(100),
    });
  });

  router.get("/runs", (req, res) => {
    const kind = req.query.kind && KINDS.includes(req.query.kind) ? req.query.kind : null;
    res.json({ runs: recentRuns({ kind, limit: Math.min(Number(req.query.limit) || 30, 100) }) });
  });

  // MoySklad hisobotining nomuvofiqligi tarixi (`mc_stock_sync_log`).
  router.get("/sync-log", (req, res) => {
    res.json({
      entries: recentStockSyncs(Math.min(Number(req.query.limit) || 30, 100)),
      summary: stockSyncSummary(100),
    });
  });

  /* ---------- ishga tushirish ---------- */

  router.post("/run/:kind", async (req, res) => {
    const { kind } = req.params;
    if (!KINDS.includes(kind)) return res.status(400).json({ error: "Noma'lum oqim" });

    const { dryRun = true, force = false, shopId, limit, keepSheetFlag } = req.body || {};
    try {
      const result = await runStockJob(kind, {
        trigger: "manual",
        startedBy: req.user?.login,
        dryRun: Boolean(dryRun),
        // Himoyani chetlab o'tish faqat superadmin qo'lida: bu "bilib turib
        // nol yuborish" degan qaror.
        force: Boolean(force) && req.user?.isSuperadmin,
        shopId,
        limit: Number(limit) || 0,
        keepSheetFlag: Boolean(keepSheetFlag),
      });
      res.json({ run: result });
    } catch (e) {
      res.status(409).json({ error: e.message });
    }
  });

  /* ---------- jadval ---------- */

  router.put("/schedule", (req, res) => {
    try {
      const schedule = setSchedule(req.body || {}, req.user?.login);
      startStockSchedule();
      res.json({ schedule });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  return router;
}

/**
 * `link_product` katalogi — alohida bo'lim va alohida ruxsat.
 *
 * Nega ajratilgan: katalogni tahrirlash (kartochka miqdori, External ID)
 * va oqimlarni ishga tushirish (Uzumga yozish) — turli xil vakolat.
 */
export function linkProductRouter() {
  const router = express.Router();

  // Hisoblangan qoldiq bilan birga: interfeysda "nega bu son ketadi" degan
  // savolga javob bo'lishi kerak, aks holda faqat jadvalning nusxasi bo'lardi.
  router.get("/", (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const search = String(req.query.search || "").trim();
    const shopId = String(req.query.shop || "").trim();

    const where = [];
    const params = {};
    if (search) {
      where.push("(sku_title LIKE @q OR product_title LIKE @q OR barcode LIKE @q OR mc_external_id LIKE @q)");
      params.q = `%${search}%`;
    }
    if (shopId) {
      where.push("shop_id = @shop");
      params.shop = shopId;
    }
    const sql = where.length ? ` WHERE ${where.join(" AND ")}` : "";

    const total = db.prepare(`SELECT COUNT(*) n FROM link_product${sql}`).get(params).n;
    const rows = db
      .prepare(
        `SELECT id, sku_id, sku_title, product_title, barcode, shop_id, status, stock_update,
                mc_external_id, mc_uuid, card_quantity, legacy_divisor
         FROM link_product${sql} ORDER BY id LIMIT @limit OFFSET @offset`
      )
      .all({ ...params, limit, offset });

    // Hisoblash uchun kerakli kataloglar bir marta o'qiladi.
    const mods = loadMods();
    const defaults = loadDefaults();
    const stock = loadStockByExternalId();
    const shops = loadShopTokens();

    const items = rows.map((r) => {
      const row = {
        skuTitle: r.sku_title,
        mcUuid: r.mc_uuid,
        cardQuantity: r.card_quantity,
        legacyDivisor: r.legacy_divisor,
      };
      const { fact, amount } = computeRow(row, {
        stock: stock.has(r.mc_external_id) ? stock.get(r.mc_external_id) : null,
        mod: mods.get(r.sku_title) || null,
        defaults,
      });
      const shop = shops.get(String(r.shop_id));
      return {
        id: r.id,
        skuId: r.sku_id,
        skuTitle: r.sku_title,
        productTitle: r.product_title,
        barcode: r.barcode,
        shopId: r.shop_id,
        shopName: shop?.name || null,
        cabinetName: shop?.cabinetName || null,
        status: r.status,
        stockUpdate: r.stock_update === 1,
        mcExternalId: r.mc_external_id,
        mcUuid: r.mc_uuid,
        cardQuantity: r.card_quantity,
        legacyDivisor: r.legacy_divisor,
        hasRule: mods.has(r.sku_title),
        // fact — MoySklad qoldig'i, amount — Uzumga ketadigan son.
        fact,
        amount,
      };
    });

    res.json({ items, total, limit, offset });
  });

  // Qatorni tahrirlash. Faqat odam kiritadigan maydonlar: qolganlari
  // hisoblanadi yoki tashqi manbadan keladi.
  router.patch("/:id", (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare("SELECT * FROM link_product WHERE id = ?").get(id);
    if (!row) return res.status(404).json({ error: "Qator topilmadi" });

    const { cardQuantity, stockUpdate, mcExternalId, status } = req.body || {};

    if (cardQuantity !== undefined) {
      const n = Number(cardQuantity);
      // 0 yoki bo'sh bo'lsa Uzumga 0 ketadi (formulada #DIV/0! bo'lardi) —
      // shuning uchun bu yerda ruxsat berilmaydi.
      if (!Number.isFinite(n) || n < 1) return res.status(400).json({ error: "Kartochka miqdori kamida 1 bo'lishi kerak" });
    }

    // External ID o'zgarsa UUID darhol `mc_product` dan topiladi va
    // topilmasa xato qaytadi — v3 dagi qo'shimchalar (@N/$) o'rniga shu
    // tartib qabul qilingan.
    let mcUuid = row.mc_uuid;
    if (mcExternalId !== undefined) {
      const value = String(mcExternalId || "").trim();
      if (!value) {
        mcUuid = null;
      } else {
        const found = db.prepare("SELECT uuid FROM mc_product WHERE external_id = ? LIMIT 1").get(value);
        if (!found) return res.status(400).json({ error: `MoySklad'da bu External ID topilmadi: ${value}` });
        mcUuid = found.uuid;
      }
    }

    db.prepare(
      `UPDATE link_product SET card_quantity = ?, stock_update = ?, mc_external_id = ?, mc_uuid = ?,
              status = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      cardQuantity === undefined ? row.card_quantity : Math.round(Number(cardQuantity)),
      stockUpdate === undefined ? row.stock_update : stockUpdate ? 1 : 0,
      mcExternalId === undefined ? row.mc_external_id : String(mcExternalId || "").trim() || null,
      mcUuid,
      status === undefined ? row.status : String(status || "").trim() || null,
      id
    );

    res.json({ ok: true });
  });

  return router;
}
