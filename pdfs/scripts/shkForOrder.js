// HAQIQIY buyurtma bo'yicha ShK yasaydi — server skanerda aynan shu yo'ldan
// o'tadi (`POST /internal/shk-item` ham shu ikki funksiyani chaqiradi):
//
//     buildProductForItem(orderId, itemId)   <- Google Sheets
//     createShkSmall(product, { copies })    <- PDF
//
// Ya'ni bu namuna emas, haqiqiy chiqadigan yorliqning o'zi.
// Google Sheets kerak (oauth.json) — serverda ishlatiladi.
//
//   node scripts/shkForOrder.js 120185532            butun buyurtma
//   node scripts/shkForOrder.js 120185532 237150353  bitta tovar
//   node scripts/shkForOrder.js 120185532 --copies=1
//
// Natija: uploads/shk_order_<orderId>.pdf
import fs from "fs";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { createShkSmall } from "../functions/shkSmall.js";
import { buildProductForItem, findOrderItems } from "../functions/sheetData.js";

const argv = process.argv.slice(2);
const flags = Object.fromEntries(
  argv.filter((a) => a.startsWith("--")).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);
const positional = argv.filter((a) => !a.startsWith("--"));
const [orderId, itemIdArg] = positional;

if (!orderId) {
  console.error("Foydalanish: node scripts/shkForOrder.js <orderId> [itemId] [--copies=2] [--qr=15]");
  process.exit(1);
}

const opts = { copies: Number(flags.copies ?? 2) };
if (flags.qr) opts.qrMm = Number(flags.qr);
if (flags.lines) opts.nameMaxLines = Number(flags.lines);

console.log(`Buyurtma ${orderId} — Google Sheets'dan o'qilmoqda...\n`);

let items;
if (itemIdArg) {
  const product = await buildProductForItem(orderId, itemIdArg);
  if (!product) {
    console.error(`XATO: ${orderId}/${itemIdArg} uchun uzum_order_detail'da qator topilmadi.`);
    process.exit(1);
  }
  items = [{ itemId: itemIdArg, ...product }];
} else {
  items = await findOrderItems(orderId);
  if (!items.length) {
    console.error(`XATO: ${orderId} uchun uzum_order_detail'da qator topilmadi.`);
    process.exit(1);
  }
}

const merged = await PDFDocument.create();

for (const item of items) {
  const [sku, mcName] = item.title.split(/,(.*)/s);
  const [barcode, order] = item.barcode.split(/,(.*)/s);

  console.log(`itemId ${item.itemId}   (miqdor ${item.quantity})`);
  console.log(`  SKU            : ${sku}`);
  console.log(`  MoySklad nomi  : ${mcName || "(BO'SH — mc_product'da topilmadi)"}`);
  console.log(`  Shtrix-kod     : ${barcode}`);
  console.log(`  Buyurtma ID    : ${order}`);

  let m = {};
  const bytes = await createShkSmall(item, { ...opts, onMetrics: (x) => (m = x) });
  const doc = await PDFDocument.load(bytes);
  const pages = await merged.copyPages(doc, doc.getPageIndices());
  pages.forEach((p) => merged.addPage(p));

  console.log(
    `  o'lchamlar     : nom ${m.nameSize}pt/${m.nameLines} qator, ` +
      `buyurtma ${m.orderSize}pt, shtrix ${m.barcodeSize}pt, SKU ${m.skuSize ?? "-"}pt, QR ${m.qrMm}mm`
  );
  for (const l of m.layout) console.log(`    ${l.el.padEnd(9)} x: ${String(l.x0).padStart(6)} … ${String(l.x1).padStart(6)} pt`);
  console.log(`  ustma-ust      : ${m.overlaps.length ? "⚠ " + m.overlaps.join(", ") : "yo'q"}`);
  console.log(`  o'ng chekka    : ${m.rightEdgeMm} mm${m.rightEdgeMm < 0 ? "  ⚠ BETDAN CHIQIB KETGAN" : ""}`);
  console.log(`  sarlavha kesil.: ${m.nameTruncated ? "HA" : "yo'q"}`);
  console.log(`  natija         : ${m.fits && !m.nameTruncated ? "✅ joyida" : "⚠ tekshiring"}\n`);
}

const outDir = path.join(process.cwd(), "uploads");
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `shk_order_${orderId}.pdf`);
fs.writeFileSync(out, Buffer.from(await merged.save()));

console.log(`${items.length} ta tovar × ${opts.copies} nusxa = ${merged.getPageCount()} bet`);
console.log(`Tayyor: ${out}`);
