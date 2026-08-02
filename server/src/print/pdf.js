// PDF'ni uzumPDFs loyihasidan oladi.
//
// Desktop client PDF'ni TO'G'RIDAN-TO'G'RI uzumPDFs'dan olmaydi — u
// stocker'dan so'raydi, stocker esa service token bilan uzumPDFs'ga boradi.
// Shunda service token faqat serverda qoladi, ish joyidagi kompyuterlarga
// tarqalmaydi.
//
// Yorliq MATNI uzumPDFs tomonida hisoblanadi (buildProductForItem) — format
// bitta joyda qolishi uchun; stocker faqat orderId/itemId yuboradi.
import { config, env } from "../config.js";

const BASE = process.env.UZUMPDFS_BASE_URL || config.print.uzumPdfsBaseUrl;

async function call(path, init) {
  if (!env.serviceToken) throw new Error("SERVICE_TOKEN o'rnatilmagan");
  const resp = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "X-Service-Token": env.serviceToken, ...(init?.headers || {}) },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`uzumPDFs ${resp.status} (${path}): ${text.slice(0, 200)}`);
  }
  return Buffer.from(await resp.arrayBuffer());
}

export async function fetchJobPdf(job) {
  if (job.target === "shk") {
    if (!job.itemId) throw new Error("ShK uchun itemId kerak");
    return call("/internal/shk-item", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: job.orderId, itemId: job.itemId, copies: job.copies }),
    });
  }
  if (job.target === "big") {
    return call(`/internal/big/${encodeURIComponent(job.orderId)}`, { method: "GET" });
  }
  throw new Error(`noma'lum target: ${job.target}`);
}
