// MoySklad remap 1.2 klienti. 429 (tezlik limiti: 45 so'rov / 3 s) kelganda
// server aytgan intervalcha kutib qayta uriniladi — uzumOrderToMC/src/moysklad.js
// dagi msFetch bilan bir xil mantiq.
import { config, env } from "../config.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function msFetch(url, options = {}) {
  if (!env.moyskladToken) throw new Error("MOYSKLAD_TOKEN o'rnatilmagan");

  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json;charset=utf-8",
        Authorization: "Bearer " + env.moyskladToken,
        ...(options.headers || {}),
      },
    });
    if (response.status !== 429) return response;

    const waitMs = parseInt(response.headers.get("x-lognex-retry-timeinterval") || "1000", 10) || 1000;
    await sleep(Math.min(Math.max(waitMs, 500), 5000));
  }
  throw new Error("MoySklad 429: tezlik limiti 3 urinishdan keyin ham o'tmadi");
}

export async function msGetJson(url) {
  const response = await msFetch(url, { method: "GET" });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`MoySklad ${response.status}: ${text.slice(0, 300)}`);
  }
  return response.json();
}

export function customerOrderHref(moySkladId) {
  return `${config.moysklad.baseUrl}/entity/customerorder/${moySkladId}`;
}

// Bitta buyurtmaning joriy holat href'i (sessiya ochilishidagi yakuniy tekshiruv
// uchun — 4-fazada ishlatiladi). Buyurtma topilmasa null.
export async function getOrderStateHref(moySkladId) {
  const json = await msGetJson(customerOrderHref(moySkladId));
  return json?.state?.meta?.href || null;
}
