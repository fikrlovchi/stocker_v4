// stocker-server — 1-faza: buyurtma keshi va barcode indeksi.
// Skan/sessiya (4-faza), print quvuri (5-faza) va autentifikatsiya (8-faza)
// keyingi fazalarda qo'shiladi.
import express from "express";
import { config, env } from "./config.js";
import logger from "./logger.js";
import { refreshCache } from "./cache/refresh.js";
import {
  getStats,
  getOrder,
  getProduct,
  listOrders,
  sampleBarcodes,
  findByBarcode,
  findAmbiguousBarcodes,
} from "./cache/queries.js";
import { fullAssortmentSync } from "./moysklad/productBarcodes.js";
import { startHeartbeat, countError, countSuccess } from "./panel/reporter.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

let lastRefresh = { at: null, ok: false, error: null, summary: null };
let refreshing = false;

async function runRefresh(trigger) {
  if (refreshing) {
    logger.warn(`Kesh yangilash o'tkazib yuborildi (${trigger}): oldingisi hali tugamagan.`);
    return lastRefresh;
  }
  refreshing = true;
  try {
    const summary = await refreshCache();
    lastRefresh = { at: new Date().toISOString(), ok: true, error: null, summary };
    countSuccess();
    if (!summary.canceledFresh) countError();
  } catch (e) {
    lastRefresh = { at: new Date().toISOString(), ok: false, error: e.message, summary: null };
    logger.error(`Kesh yangilashda xato (${trigger}): ${e.message}`);
    countError();
  } finally {
    refreshing = false;
  }
  return lastRefresh;
}

/* ==================== Endpointlar ==================== */

// nginx/monitoring uchun — himoyalanmagan, hech qanday maxfiy ma'lumot yo'q.
app.get("/health", (req, res) => {
  res.json({
    ok: lastRefresh.ok,
    lastRefreshAt: lastRefresh.at,
    error: lastRefresh.error,
    eligibleOrders: lastRefresh.summary?.eligible ?? null,
  });
});

// Diagnostika endpointlari SERVICE_TOKEN talab qiladi.
function requireServiceToken(req, res, next) {
  if (!env.serviceToken) {
    return res.status(503).json({ error: "SERVICE_TOKEN o'rnatilmagan — diagnostika o'chirilgan" });
  }
  const header = req.header("X-Service-Token") || "";
  if (header !== env.serviceToken) return res.status(401).json({ error: "Service token noto'g'ri" });
  next();
}

const debug = express.Router();
debug.use(requireServiceToken);

debug.get("/stats", (req, res) => res.json({ ...getStats(), lastRefresh }));

debug.post("/refresh", async (req, res) => res.json(await runRefresh("manual")));

// Navbatdagi buyurtmalar. ?all=1 — nomos bo'lganlari ham.
debug.get("/orders", (req, res) => {
  res.json({
    orders: listOrders({
      eligible: req.query.all !== "1",
      limit: Math.min(Number(req.query.limit) || 20, 200),
    }),
  });
});

// Skan sinovi uchun haqiqiy barcode namunalari.
debug.get("/samples", (req, res) => {
  res.json({ samples: sampleBarcodes(Math.min(Number(req.query.limit) || 10, 50)) });
});

debug.get("/order/:id", (req, res) => {
  const order = getOrder(req.params.id);
  if (!order) {
    return res.status(404).json({
      error: "Buyurtma keshda yo'q",
      hint: `Sabablari: ${config.cache.retentionDays} kundan eski, uzum_order'da yo'q, yoki kesh hali yangilanmagan.`,
    });
  }
  res.json(order);
});

// ?all=1 — yig'ishga tayyor bo'lmagan buyurtmalar ham ko'rsatiladi (nega
// topilmayotganini tushunish uchun).
debug.get("/barcode/:code", (req, res) => {
  const eligibleOnly = req.query.all !== "1";
  res.json(findByBarcode(req.params.code, { eligibleOnly }));
});

debug.get("/ambiguous", (req, res) => res.json({ barcodes: findAmbiguousBarcodes(50) }));

debug.get("/product/:uuid", (req, res) => {
  const product = getProduct(req.params.uuid);
  if (!product) return res.status(404).json({ error: "Tovar keshda yo'q" });
  res.json(product);
});

// Butun assortimentni darhol qayta o'qish (odatda tunda avtomatik bajariladi).
debug.post("/sync-barcodes", async (req, res) => {
  try {
    res.json(await fullAssortmentSync());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.use("/debug", debug);

app.use((req, res) => res.status(404).json({ error: "Topilmadi" }));

/* ==================== Ishga tushirish ==================== */

app.listen(env.port, env.host, async () => {
  logger.info(`stocker-server ${env.host}:${env.port} da ishga tushdi`);

  startHeartbeat(() => {
    const s = lastRefresh.summary;
    return s ? `${s.eligible} ta buyurtma yig'ishga tayyor, ${s.cached} ta keshda` : "kesh hali yangilanmagan";
  });

  await runRefresh("startup");

  // Bir xil barcode turli tovarlarga biriktirilgan bo'lsa — indeks natijasi
  // noaniq bo'ladi, shuni bir marta ogohlantirib qo'yamiz.
  const ambiguous = findAmbiguousBarcodes(5);
  if (ambiguous.length) {
    logger.error(
      `Bir xil barcode turli tovarlarda: ${ambiguous.map((a) => `${a.barcode} (${a.refs} ta tovar)`).join(", ")}` +
        ` — /debug/ambiguous orqali to'liq ro'yxat`
    );
  }

  setInterval(() => runRefresh("interval"), config.cache.refreshIntervalMs);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    logger.info(`${signal} — to'xtatilmoqda`);
    process.exit(0);
  });
}
