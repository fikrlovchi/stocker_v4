// MoySklad → `mc_product` va `mc_stock`.
//
// v3 da bu ish ikkita GAS skriptida edi:
//   gas_v3/volume_product.js  — assortiment boshqa jadvalga, u yerdan
//                               `IMPORTRANGE` bilan mc_product ga
//   gas_v3/get_mcstock_v3.js  — qoldiq mc_stock ga
//
// Endi ikkalasi ham shu yerda: oraliq jadval va importrange kerak emas.
import { config } from "../config.js";
import { db } from "../db/index.js";
import logger from "../logger.js";
import { msGetJson, msFetch } from "./client.js";

const ENTITIES = ["product", "variant", "service", "bundle"];
const PAGE = 1000;

/**
 * Butun assortimentni o'qib `mc_product` ni yangilaydi.
 *
 * Jadval TO'LIQ ALMASHTIRILMAYDI, upsert qilinadi: o'qish yarmida uzilib
 * qolsa ham eski ma'lumot joyida qoladi. Yetishmaganlar `synced_at` bo'yicha
 * ko'rinadi.
 */
export async function syncProducts() {
  const now = new Date().toISOString();
  const upsert = db.prepare(
    `INSERT INTO mc_product (uuid, entity_type, group_path, code, name, external_id, article, synced_at)
     VALUES (@uuid, @entityType, @groupPath, @code, @name, @externalId, @article, @syncedAt)
     ON CONFLICT(uuid) DO UPDATE SET
       entity_type = excluded.entity_type, group_path = excluded.group_path,
       code = excluded.code, name = excluded.name, external_id = excluded.external_id,
       article = excluded.article, synced_at = excluded.synced_at`
  );

  let total = 0;
  for (const entity of ENTITIES) {
    let offset = 0;
    for (;;) {
      const data = await msGetJson(`${config.moysklad.baseUrl}/entity/${entity}?limit=${PAGE}&offset=${offset}`);
      const rows = data.rows || [];
      if (!rows.length) break;

      db.transaction(() => {
        for (const item of rows) {
          upsert.run({
            uuid: item.id,
            entityType: entity,
            groupPath: item.pathName || null,
            code: item.code || null,
            name: item.name || null,
            externalId: item.externalCode || null,
            article: item.article || null,
            syncedAt: now,
          });
        }
      })();

      total += rows.length;
      if (rows.length < PAGE) break;
      offset += PAGE;
    }
  }

  const stale = db.prepare("SELECT COUNT(*) n FROM mc_product WHERE synced_at < ?").get(now).n;
  logger.info(`mc_product yangilandi: ${total} ta (${stale} ta bu safar kelmadi)`);
  return { total, stale };
}

/**
 * Hisobotni oldingi holat bilan birlashtiradi.
 *
 * MoySklad `report/stock/all/current` ketma-ket chaqirilganda turli son
 * qaytaradi (3000 → 2997 → 2998). Yo'qolganlar aslida boshqa omborga
 * o'tmagan va nolga tushmagan — bu API nomuvofiqligi. To'g'ridan-to'g'ri
 * ishonsak, sotuvdagi tovarga Uzumga 0 yuborib qo'yardik.
 *
 * Shuning uchun ikki qavat himoya. Ikkalasi ham qo'shimcha so'rov
 * talab qilmaydi — hamon bitta chaqiruv.
 *
 * Toza funksiya: bazani bilmaydi, testda to'liq tekshiriladi.
 */
export function mergeStockReport(previous, report, { missingConfirmations = 3, minResponseRatio = 0.95 } = {}) {
  // 1-qavat: butun javob shubhali bo'lsa umuman qo'llanmaydi. Bir necha
  //    tovar tushib qolishi mumkin, lekin ommaviy kamayish — bu nosozlik.
  if (previous.length && report.length < previous.length * minResponseRatio) {
    return {
      applied: false,
      reason: `javobda ${report.length} ta, oldingi safar ${previous.length} ta edi`,
      rows: [],
      kept: [],
      dropped: [],
    };
  }

  const rows = report.map((r) => ({ uuid: r.uuid, stock: r.stock, missingCount: 0, seen: true }));
  const seen = new Set(rows.map((r) => r.uuid));

  // 2-qavat: bitta javobda ko'rinmagan tovar darhol yo'q deb hisoblanmaydi.
  //    Oxirgi ma'lum qoldig'i saqlanadi, faqat ketma-ket bir necha marta
  //    kelmagandan keyin o'chiriladi (o'chgani = qoldiq 0).
  const kept = [];
  const dropped = [];
  for (const p of previous) {
    if (seen.has(p.uuid)) continue;
    const missingCount = (p.missingCount || 0) + 1;
    if (missingCount >= missingConfirmations) {
      dropped.push(p.uuid);
    } else {
      rows.push({ uuid: p.uuid, stock: p.stock, missingCount, seen: false });
      kept.push(p.uuid);
    }
  }

  return { applied: true, rows, kept, dropped };
}

/** Ombordagi qoldiqni o'qib `mc_stock` ni yangilaydi. */
export async function syncStock() {
  const storeId = config.moysklad.stockStoreId;
  if (!storeId) throw new Error("config.json: moysklad.stockStoreId ko'rsatilmagan");

  const url = `${config.moysklad.baseUrl}/report/stock/all/current?filter=storeId=${storeId}`;
  const res = await msFetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`MoySklad ${res.status}: qoldiq hisoboti olinmadi`);

  const report = await res.json();
  if (!Array.isArray(report)) throw new Error("MoySklad qoldiq hisoboti kutilmagan ko'rinishda");

  const previous = db
    .prepare("SELECT uuid, stock, missing_count AS missingCount, last_seen_at AS lastSeenAt FROM mc_stock")
    .all();

  const merged = mergeStockReport(
    previous,
    report.map((r) => ({ uuid: r.assortmentId, stock: Number(r.stock) || 0 })),
    {
      missingConfirmations: config.moysklad.stockMissingConfirmations,
      minResponseRatio: config.moysklad.stockMinResponseRatio,
    }
  );

  if (!merged.applied) {
    logger.error(`mc_stock YANGILANMADI — hisobot shubhali: ${merged.reason}. Eski qoldiq saqlanib qoldi.`);
    return { applied: false, reason: merged.reason, total: report.length, previous: previous.length };
  }

  const now = new Date().toISOString();
  const lastSeen = new Map(previous.map((p) => [p.uuid, p.lastSeenAt]));
  // External ID `mc_product` dan olinadi — hisobotning o'zida u yo'q.
  const externalById = new Map(
    db.prepare("SELECT uuid, external_id FROM mc_product WHERE external_id IS NOT NULL").all().map((r) => [r.uuid, r.external_id])
  );

  const insert = db.prepare(
    "INSERT INTO mc_stock (uuid, stock, external_id, missing_count, last_seen_at, synced_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  let withoutExternal = 0;

  db.transaction(() => {
    db.exec("DELETE FROM mc_stock");
    for (const row of merged.rows) {
      const externalId = externalById.get(row.uuid) || null;
      if (!externalId) withoutExternal++;
      insert.run(row.uuid, row.stock, externalId, row.missingCount, row.seen ? now : lastSeen.get(row.uuid) || null, now);
    }
  })();

  const note =
    merged.kept.length || merged.dropped.length
      ? ` — ${merged.kept.length} ta kelmadi (oxirgi qoldiq saqlandi), ${merged.dropped.length} ta 0 deb belgilandi`
      : "";
  logger.info(`mc_stock yangilandi: ${report.length} ta qoldiq (${withoutExternal} tasida External ID yo'q)${note}`);

  return {
    applied: true,
    total: report.length,
    stored: merged.rows.length,
    keptMissing: merged.kept.length,
    dropped: merged.dropped.length,
    withoutExternal,
  };
}
