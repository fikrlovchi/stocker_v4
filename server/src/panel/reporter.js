// fikrlovchi-panel'ga hisobot. uzumOrderToMC/src/reporter.js bilan bir xil
// shartnoma (POST /api/ingest/runs), lekin bu doimiy daemon bo'lgani uchun
// "run" tushunchasi boshqacha: har `panel.heartbeatIntervalMs` da bitta run
// yuboriladi — o'sha oynada to'plangan loglar va sanoqlar bilan.
//
// Fire-and-forget: panel ishlamasa ham yig'ish jarayoniga ta'sir qilmaydi.
import { config, env } from "../config.js";
import logger from "../logger.js";

const TIMEOUT_MS = 3000;

let windowStartedAt = new Date().toISOString();
let successCount = 0;
let errorCount = 0;

export function countSuccess(n = 1) {
  successCount += n;
}

export function countError(n = 1) {
  errorCount += n;
}

function configured() {
  return Boolean(env.panel.ingestUrl && env.panel.apiKey && env.panel.slug);
}

async function flush(summary) {
  const logs = logger.takeBuffer();
  const startedAt = windowStartedAt;
  const success = successCount;
  const errors = errorCount;

  windowStartedAt = new Date().toISOString();
  successCount = 0;
  errorCount = 0;

  if (!configured()) return;
  if (logs.length === 0 && success === 0 && errors === 0) return; // jim oyna — yubormaymiz

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    await fetch(env.panel.ingestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + env.panel.apiKey,
        "X-Project-Slug": env.panel.slug,
      },
      body: JSON.stringify({
        startedAt,
        finishedAt: new Date().toISOString(),
        status: errors > 0 ? (success > 0 ? "partial" : "error") : "success",
        successCount: success,
        errorCount: errors,
        summary,
        logs,
      }),
      signal: controller.signal,
    });
  } catch {
    // panelga yetkazib bo'lmadi — asosiy jarayon uchun ahamiyatsiz
  } finally {
    clearTimeout(timeout);
  }
}

export function startHeartbeat(summaryFn) {
  if (!configured()) {
    logger.warn("Panel integratsiyasi sozlanmagan (PANEL_* o'zgaruvchilari) — hisobot yuborilmaydi.");
    // Bufer cheksiz o'smasligi uchun baribir vaqti-vaqti bilan tozalaymiz.
    setInterval(() => logger.takeBuffer(), config.panel.heartbeatIntervalMs).unref();
    return;
  }
  const timer = setInterval(() => {
    flush(summaryFn?.() ?? null).catch(() => {});
  }, config.panel.heartbeatIntervalMs);
  timer.unref();
}

export { flush };
