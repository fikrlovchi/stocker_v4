// MoySklad'da "Otmenen" holatidagi buyurtmalarni bitta (kerak bo'lsa bir necha
// sahifali) so'rov bilan oladi. `externalCode` = Uzum orderId — uzumOrderToMC
// buyurtmani aynan shunday yaratadi (moysklad.js:findByExternalCode).
//
// Nega sheetdan emas: `uzum_order!V` "bekor qilingan" degani EMAS — cancelSync
// 24 soatlik monitoring tugagach bekor qilinmagan buyurtmaga ham V=1 qo'yadi
// (cancelSync.js:148, HANDOFF.md 2-band). Ya'ni V bo'yicha filtrlash 24
// soatdan oshgan sog'lom buyurtmalarni ham yo'qotib yuborardi.
import { config } from "../config.js";
import { msGetJson } from "./client.js";
import logger from "../logger.js";

const PAGE_SIZE = 1000;

// MoySklad sana formati: "YYYY-MM-DD HH:MM:SS" (akkaunt vaqt mintaqasida).
function msDate(ms) {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19);
}

// Oxirgi `canceledLookbackDays` kun ichida yaratilgan, holati "Otmenen" bo'lgan
// buyurtmalarning Uzum orderId'lari. Xatolik bo'lsa exception tashlaydi —
// chaqiruvchi eski ro'yxatni saqlab qolishi kerak.
export async function fetchCanceledOrderIds() {
  const { baseUrl, states, canceledLookbackDays } = config.moysklad;
  const since = msDate(Date.now() - canceledLookbackDays * 24 * 60 * 60 * 1000);

  const ids = new Set();
  let offset = 0;

  while (true) {
    const filter = encodeURIComponent(`state=${states.canceledHref};created>=${since}`);
    const url = `${baseUrl}/entity/customerorder?filter=${filter}&limit=${PAGE_SIZE}&offset=${offset}`;
    const json = await msGetJson(url);

    const rows = json.rows || [];
    for (const row of rows) {
      const code = String(row.externalCode || "").trim();
      if (code) ids.add(code);
    }

    const size = json.meta?.size ?? rows.length;
    offset += PAGE_SIZE;
    if (rows.length === 0 || offset >= size) break;
  }

  logger.info(`MoySklad: ${ids.size} ta bekor qilingan buyurtma (oxirgi ${canceledLookbackDays} kun).`);
  return ids;
}
