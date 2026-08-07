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
 * Ombordagi qoldiqni o'qib `mc_stock` ni yangilaydi.
 *
 * Bu yerda jadval TO'LIQ almashtiriladi (v3 dagidek): hisobotda ko'rinmagan
 * tovarning qoldig'i yo'q degani, eski qatorni qoldirsak "bor" bo'lib
 * ko'rinib qolardi va Uzumga noto'g'ri son ketardi.
 */
export async function syncStock() {
  const storeId = config.moysklad.stockStoreId;
  if (!storeId) throw new Error("config.json: moysklad.stockStoreId ko'rsatilmagan");

  const url = `${config.moysklad.baseUrl}/report/stock/all/current?filter=storeId=${storeId}`;
  const res = await msFetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`MoySklad ${res.status}: qoldiq hisoboti olinmadi`);

  const report = await res.json();
  if (!Array.isArray(report)) throw new Error("MoySklad qoldiq hisoboti kutilmagan ko'rinishda");

  const now = new Date().toISOString();
  // External ID `mc_product` dan olinadi — hisobotning o'zida u yo'q.
  const externalById = new Map(
    db.prepare("SELECT uuid, external_id FROM mc_product WHERE external_id IS NOT NULL").all().map((r) => [r.uuid, r.external_id])
  );

  const insert = db.prepare(
    "INSERT INTO mc_stock (uuid, stock, external_id, synced_at) VALUES (?, ?, ?, ?)"
  );
  let withoutExternal = 0;

  db.transaction(() => {
    db.exec("DELETE FROM mc_stock");
    for (const row of report) {
      const externalId = externalById.get(row.assortmentId) || null;
      if (!externalId) withoutExternal++;
      insert.run(row.assortmentId, Number(row.stock) || 0, externalId, now);
    }
  })();

  logger.info(`mc_stock yangilandi: ${report.length} ta qoldiq (${withoutExternal} tasida External ID yo'q)`);
  return { total: report.length, withoutExternal };
}
