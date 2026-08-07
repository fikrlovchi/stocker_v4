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
import { createLinkProduct, retryLinkProduct, recentEvents } from "../stock/linkProductCreate.js";

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

  /**
   * Forma uchun do'konlar ro'yxati (token YO'Q).
   *
   * `skuCode` — SKU prefiksi: forma skuTitle kiritilganda do'konni shu
   * bo'yicha o'zi tanlaydi (v3 dagi AppSheet "initial value" kabi).
   */
  router.get("/shops", (req, res) => {
    res.json({
      shops: db
        .prepare(
          `SELECT s.shop_id AS shopId, s.name, s.sku_code AS skuCode, c.name AS cabinetName
           FROM uzum_shops s JOIN uzum_cabinets c ON c.id = s.cabinet_id
           ORDER BY c.name, s.name`
        )
        .all(),
    });
  });

  /**
   * External ID bo'yicha MoySklad tovarini topadi.
   *
   * v3 da bu `mc_product` ustunining formulasi edi va `MC External ID`
   * maydonining sharti unga tayanardi:
   *
   *   valid_if: ISNOTBLANK([mc_product])
   *
   * Ya'ni tovar topilmasa qiymatni saqlab bo'lmasdi. Shu shart interfeysga
   * chiqarilgan: forma va ro'yxat SAQLASHDAN OLDIN shu endpoint'ni chaqirib
   * tovar nomini ko'rsatadi. Serverdagi tekshiruv ham joyida qoladi —
   * interfeys himoya emas.
   *
   * `@N` / `$` qo'shimchalari ATAYLAB kesilmaydi: yangi tartibda External ID
   * toza bo'ladi, moslik esa aynan bo'lishi kerak.
   */
  router.get("/mc-product", (req, res) => {
    const externalId = String(req.query.externalId || "").trim();
    if (!externalId) return res.json({ found: false, reason: "bo'sh" });

    const rows = db
      .prepare("SELECT uuid, name, entity_type, code, article FROM mc_product WHERE external_id = ? LIMIT 2")
      .all(externalId);

    if (!rows.length) return res.json({ found: false, reason: "MoySklad'da topilmadi" });
    return res.json({
      found: true,
      uuid: rows[0].uuid,
      name: rows[0].name,
      entityType: rows[0].entity_type,
      code: rows[0].code,
      article: rows[0].article,
      // Bir xil External ID ikki tovarda bo'lsa qaysi biri olinishi noaniq —
      // bu ma'lumotdagi xato, ko'rinib turishi kerak.
      ambiguous: rows.length > 1,
    });
  });

  /**
   * Yangi bog'lama. Qator yaratilgach IKKI amal bajariladi: Uzum'dan SKU
   * ma'lumotini olish va barcode'ni MoySklad'ga qo'shish — v3 dagi AppSheet
   * automation'i kabi, jadval bo'yicha emas.
   */
  router.post("/", async (req, res) => {
    try {
      res.json(await createLinkProduct(req.body || {}, req.user?.login));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // Birinchi urinishda Uzum javob bermagan bo'lsa — qayta urinish.
  router.post("/:id/retry", async (req, res) => {
    try {
      res.json(await retryLinkProduct(Number(req.params.id), req.user?.login));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.get("/:id/events", (req, res) => {
    const row = db.prepare("SELECT sku_title FROM link_product WHERE id = ?").get(Number(req.params.id));
    if (!row) return res.status(404).json({ error: "Qator topilmadi" });
    res.json({ events: recentEvents({ skuTitle: row.sku_title, limit: 20 }) });
  });

  // Hisoblangan qoldiq bilan birga: interfeysda "nega bu son ketadi" degan
  // savolga javob bo'lishi kerak, aks holda faqat jadvalning nusxasi bo'lardi.
  router.get("/", (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const search = String(req.query.search || "").trim();
    const shopId = String(req.query.shop || "").trim();

    // WHERE ikki so'rovda ishlatiladi: COUNT (jadvalning o'zi) va ro'yxat
    // (JOIN bilan). JOIN'da ustun nomlari ikki jadvalda uchraydi, shuning
    // uchun shart `lp.` bilan yasaladi va COUNT uchun taxallus beriladi.
    const where = [];
    const params = {};
    if (search) {
      where.push(
        "(lp.sku_title LIKE @q OR lp.product_title LIKE @q OR lp.barcode LIKE @q OR lp.mc_external_id LIKE @q)"
      );
      params.q = `%${search}%`;
    }
    if (shopId) {
      where.push("lp.shop_id = @shop");
      params.shop = shopId;
    }
    const sql = where.length ? ` WHERE ${where.join(" AND ")}` : "";

    const total = db.prepare(`SELECT COUNT(*) n FROM link_product lp${sql}`).get(params).n;

    // MoySklad tovarining NOMI ham qo'shiladi: "MC External ID" ni
    // tahrirlashdan oldin qaysi tovar biriktirilganini ko'rish kerak.
    const rows = db
      .prepare(
        `SELECT lp.id, lp.sku_id, lp.sku_title, lp.product_title, lp.barcode, lp.shop_id,
                lp.status, lp.stock_update, lp.mc_external_id, lp.mc_uuid,
                lp.card_quantity, lp.legacy_divisor,
                p.name AS mc_product_name, p.entity_type AS mc_entity_type
         FROM link_product lp
         LEFT JOIN mc_product p ON p.uuid = lp.mc_uuid${sql}
         ORDER BY lp.id LIMIT @limit OFFSET @offset`
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
        mcProductName: r.mc_product_name,
        mcEntityType: r.mc_entity_type,
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

/**
 * Barcode va SKU jurnali — alohida bo'lim.
 *
 * Bu ikki amal (Uzum'dan SKU olish va barcode → MoySklad) yangi bog'lama
 * qo'shilganda bajariladi, ya'ni ularni "ishga tushirish" degan tugma
 * ma'nosiz. Shuning uchun bu yerda faqat NATIJA ko'rinadi.
 */
export function skuLogRouter() {
  const router = express.Router();

  router.get("/", (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 60, 200);
    const kind = ["uzum_fetch", "mc_barcode"].includes(req.query.kind) ? req.query.kind : null;
    const events = recentEvents({ limit, kind, skuTitle: req.query.search });

    // Xulosa: xato bo'lganlar ko'zga tashlanib turishi kerak.
    const count = (k, s) => events.filter((e) => e.kind === k && e.status === s).length;
    res.json({
      events,
      summary: {
        total: events.length,
        uzumFetchErrors: count("uzum_fetch", "error"),
        barcodeErrors: count("mc_barcode", "error"),
        barcodeAdded: count("mc_barcode", "success"),
      },
    });
  });

  return router;
}
