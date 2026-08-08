// `uzum_order` va `uzum_order_detail` ni serverga ko'chirish.
//
// Kesh (`orders`/`items`) bilan ARALASHTIRMASLIK kerak: u 3 kunlik oyna
// uchun va har yangilanishda qaytadan quriladi. Bu yerda jadvalning
// HAMMASI saqlanadi — Sheets bilan aloqa uzilgach yagona manba shu bo'ladi.
//
// `O` va `P` (yuridik shaxs va sotuv kanali) jadvaldagi qiymat bilan
// yoziladi va qayta hisoblanmaydi: do'kon boshqa kabinetga ko'chsa,
// buyurtma o'sha paytdagi firmada qolishi kerak.
import { db } from "../db/index.js";
import { columnIndexMap, parseSheetTimeToEpochMs, cellText } from "../util/sheetValues.js";

// `uzum_order` A..W. Nomlar manbadagi sarlavhalardan.
const ORDER_COLS = {
  orderId: "A",
  uzumStatus: "B",
  dateCreated: "C",
  acceptUntil: "D",
  deliverUntil: "E",
  price: "F",
  shopId: "G",
  stockTitle: "H",
  stockAddress: "I",
  place: "J",
  invoiceNumber: "K",
  dropoffAddress: "L",
  scheme: "M",
  organization: "O",
  salesChannel: "P",
  sentToMc: "Q",
  tracking: "R",
  moySkladId: "S",
  uzumConfirmed: "T",
  mcState: "U",
  cancelHandled: "V",
  arrivedAt: "W",
};

const ITEM_COLS = {
  itemId: "A",
  barcode: "B",
  skuTitle: "C",
  title: "D",
  price: "E",
  amount: "F",
  photo: "G",
  orderId: "H",
  product: "I",
  entityType: "J",
  quantity: "K",
  priceIsTotal: "L",
};

const ORD = columnIndexMap(ORDER_COLS);
const ITM = columnIndexMap(ITEM_COLS);

const cell = (row, i) => (row && row[i] !== undefined && row[i] !== null ? row[i] : "");
const text = (row, i) => cellText(cell(row, i)) || null;
const num = (row, i) => {
  const v = Number(cell(row, i));
  return Number.isFinite(v) && cell(row, i) !== "" ? v : null;
};
// Jadvaldagi bayroqlar 1 / "1" / TRUE ko'rinishida bo'lishi mumkin.
const flag = (row, i) => {
  const v = cell(row, i);
  if (v === "" || v === null || v === undefined) return null;
  return v === true || String(v).trim() === "1" || String(v).toUpperCase() === "TRUE" ? 1 : 0;
};

/**
 * Jadvaldagi qatorlarni bazaga yozadi (upsert).
 *
 * Qaytaradi: {orders, items, skipped} — `skipped` ID si yo'q qatorlar.
 */
export function importOrders({ orderRows, detailRows }) {
  const now = new Date().toISOString();

  const upsertOrder = db.prepare(`
    INSERT INTO uzum_orders (
      order_id, uzum_status, date_created, accept_until, deliver_until, price, shop_id,
      stock_title, stock_address, place, invoice_number, dropoff_address, scheme,
      mc_organization_href, mc_saleschannel_href, sent_to_mc, tracking_number, moysklad_id,
      uzum_confirmed, mc_state, cancel_handled, arrived_at, arrived_at_ms,
      sheet_row, source, imported_at, updated_at
    ) VALUES (
      @order_id, @uzum_status, @date_created, @accept_until, @deliver_until, @price, @shop_id,
      @stock_title, @stock_address, @place, @invoice_number, @dropoff_address, @scheme,
      @mc_organization_href, @mc_saleschannel_href, @sent_to_mc, @tracking_number, @moysklad_id,
      @uzum_confirmed, @mc_state, @cancel_handled, @arrived_at, @arrived_at_ms,
      @sheet_row, @source, @imported_at, @updated_at
    )
    ON CONFLICT(order_id) DO UPDATE SET
      uzum_status = excluded.uzum_status,
      date_created = excluded.date_created,
      accept_until = excluded.accept_until,
      deliver_until = excluded.deliver_until,
      price = excluded.price,
      shop_id = excluded.shop_id,
      stock_title = excluded.stock_title,
      stock_address = excluded.stock_address,
      place = excluded.place,
      invoice_number = excluded.invoice_number,
      dropoff_address = excluded.dropoff_address,
      scheme = excluded.scheme,
      mc_organization_href = excluded.mc_organization_href,
      mc_saleschannel_href = excluded.mc_saleschannel_href,
      sent_to_mc = excluded.sent_to_mc,
      tracking_number = excluded.tracking_number,
      moysklad_id = excluded.moysklad_id,
      uzum_confirmed = excluded.uzum_confirmed,
      mc_state = excluded.mc_state,
      cancel_handled = excluded.cancel_handled,
      arrived_at = excluded.arrived_at,
      arrived_at_ms = excluded.arrived_at_ms,
      sheet_row = excluded.sheet_row,
      updated_at = excluded.updated_at
  `);

  const upsertItem = db.prepare(`
    INSERT INTO uzum_order_items (
      item_id, order_id, barcode, sku_title, title, price, amount, photo,
      product_ref, entity_type, quantity_for_mc, price_is_total, sheet_row, imported_at
    ) VALUES (
      @item_id, @order_id, @barcode, @sku_title, @title, @price, @amount, @photo,
      @product_ref, @entity_type, @quantity_for_mc, @price_is_total, @sheet_row, @imported_at
    )
    ON CONFLICT(item_id) DO UPDATE SET
      order_id = excluded.order_id,
      barcode = excluded.barcode,
      sku_title = excluded.sku_title,
      title = excluded.title,
      price = excluded.price,
      amount = excluded.amount,
      photo = excluded.photo,
      product_ref = excluded.product_ref,
      entity_type = excluded.entity_type,
      quantity_for_mc = excluded.quantity_for_mc,
      price_is_total = excluded.price_is_total,
      sheet_row = excluded.sheet_row
  `);

  let orders = 0;
  let items = 0;
  const skipped = { orders: 0, items: 0 };

  db.transaction(() => {
    for (let i = 1; i < orderRows.length; i++) {
      const row = orderRows[i];
      const orderId = cellText(cell(row, ORD.orderId));
      if (!orderId) {
        skipped.orders++;
        continue;
      }
      // Vaqt W dan, u bo'sh bo'lsa C dan — kesh ham shu tartibda ishlaydi.
      const arrivedMs =
        parseSheetTimeToEpochMs(cell(row, ORD.arrivedAt)) ??
        parseSheetTimeToEpochMs(cell(row, ORD.dateCreated));

      upsertOrder.run({
        order_id: orderId,
        uzum_status: text(row, ORD.uzumStatus),
        date_created: text(row, ORD.dateCreated),
        accept_until: text(row, ORD.acceptUntil),
        deliver_until: text(row, ORD.deliverUntil),
        price: num(row, ORD.price),
        shop_id: text(row, ORD.shopId),
        stock_title: text(row, ORD.stockTitle),
        stock_address: text(row, ORD.stockAddress),
        place: text(row, ORD.place),
        invoice_number: text(row, ORD.invoiceNumber),
        dropoff_address: text(row, ORD.dropoffAddress),
        scheme: text(row, ORD.scheme),
        mc_organization_href: text(row, ORD.organization),
        mc_saleschannel_href: text(row, ORD.salesChannel),
        sent_to_mc: flag(row, ORD.sentToMc),
        tracking_number: text(row, ORD.tracking),
        moysklad_id: text(row, ORD.moySkladId),
        uzum_confirmed: flag(row, ORD.uzumConfirmed),
        mc_state: text(row, ORD.mcState),
        cancel_handled: flag(row, ORD.cancelHandled),
        arrived_at: text(row, ORD.arrivedAt),
        arrived_at_ms: arrivedMs,
        sheet_row: i + 1,
        source: "sheet",
        imported_at: now,
        updated_at: now,
      });
      orders++;
    }

    for (let j = 1; j < detailRows.length; j++) {
      const row = detailRows[j];
      const itemId = cellText(cell(row, ITM.itemId));
      const orderId = cellText(cell(row, ITM.orderId));
      if (!itemId || !orderId) {
        skipped.items++;
        continue;
      }

      const flagTotal = cell(row, ITM.priceIsTotal);
      upsertItem.run({
        item_id: itemId,
        order_id: orderId,
        // Barcode MATN bo'lib qolishi kerak — bosh nollar yo'qolmasin.
        barcode: cellText(cell(row, ITM.barcode)) || null,
        sku_title: text(row, ITM.skuTitle),
        title: text(row, ITM.title),
        price: num(row, ITM.price),
        amount: num(row, ITM.amount),
        photo: text(row, ITM.photo),
        product_ref: text(row, ITM.product),
        entity_type: text(row, ITM.entityType),
        quantity_for_mc: num(row, ITM.quantity),
        price_is_total: flagTotal === "" || flagTotal === null || flagTotal === undefined
          ? null
          : flagTotal === true || String(flagTotal).toUpperCase() === "TRUE"
            ? 1
            : 0,
        sheet_row: j + 1,
        imported_at: now,
      });
      items++;
    }
  })();

  return { orders, items, skipped };
}

/** Ko'chirilgan buyurtmalar holati — interfeys va skript uchun bir xil. */
export function importStatus() {
  const orders = db.prepare("SELECT COUNT(*) n FROM uzum_orders").get().n;
  const items = db.prepare("SELECT COUNT(*) n FROM uzum_order_items").get().n;
  const last = db.prepare("SELECT MAX(imported_at) t FROM uzum_orders").get().t;
  // Keshda (3 kunlik oyna) turgani — "serverda bor" degani.
  const inCache = db
    .prepare("SELECT COUNT(*) n FROM uzum_orders o WHERE EXISTS (SELECT 1 FROM orders c WHERE c.order_id = o.order_id)")
    .get().n;
  return { orders, items, inCache, lastImportedAt: last };
}
