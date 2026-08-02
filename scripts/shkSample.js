// 40×30 mm ShK yorlig'i uchun namuna PDF yasaydi — Proton DTP-4207 dan
// chiqarib maketni ko'z bilan baholash uchun. Google Sheets kerak emas.
//
//   node scripts/shkSample.js
//   node scripts/shkSample.js --qr=16 --lines=3     QR kattaroq, nom 3 qator
//   node scripts/shkSample.js --sku=0               SKU'siz (nomga ko'proq joy)
//
// Natija: uploads/shk_sample.pdf
import fs from "fs";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { createShkSmall } from "../functions/shkSmall.js";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);

// Haqiqiy ma'lumotdan olingan namunalar — eng og'ir holatlarni ham qamraydi.
const samples = [
  { label: "odatiy", title: "LYDISP1-697JLYF006648-1,Диспенсер для мыла", barcode: "1000076067784,120185532" },
  { label: "uzun SKU", title: "MT2-ELEGANT-SS-XXL-2026-EDITION-01,Ко'ylak Elegant SS", barcode: "1000057600931,119706915" },
  { label: "qisqa SKU", title: "AB1,Стакан", barcode: "697JLYF006648,120103126" },
  { label: "kirillcha nom", title: "KRUZH-450,Кружка керамическая белая 450 мл", barcode: "1000114076242,120185532" },
  {
    label: "juda uzun nom",
    title: "DISP-500A,Диспенсер для жидкого мыла автоматический сенсорный настенный 500 мл",
    barcode: "1000076067791,119706915",
  },
  { label: "nomsiz (#N/A)", title: "LYDISP1-697JLYF006648-1,", barcode: "697JLYF006648,120103126" },
];

const overrides = {};
if (args.qr) overrides.qrMm = Number(args.qr);
if (args.lines) overrides.nameMaxLines = Number(args.lines);
if (args.sku === "0") overrides.showSku = false;
if (args.barcode === "0") overrides.showBarcode = false;

const merged = await PDFDocument.create();
console.log("namuna          nom   qator  kesildi  buyurtma   SKU   shtrix");
console.log("─".repeat(64));

for (const s of samples) {
  let m = {};
  const bytes = await createShkSmall(s, { ...overrides, copies: 1, onMetrics: (x) => (m = x) });
  const doc = await PDFDocument.load(bytes);
  const pages = await merged.copyPages(doc, doc.getPageIndices());
  pages.forEach((p) => merged.addPage(p));

  console.log(
    `${s.label.padEnd(15)} ` +
      `${String(m.nameSize ?? "-").padEnd(5)} ` +
      `${String(m.nameLines).padEnd(6)} ` +
      `${(m.nameTruncated ? "HA" : "yo'q").padEnd(8)} ` +
      `${String(m.orderSize ?? "-").padEnd(10)} ` +
      `${String(m.skuSize ?? "-").padEnd(5)} ` +
      `${String(m.barcodeSize ?? "-")}`
  );
}

const outDir = path.join(process.cwd(), "uploads");
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, "shk_sample.pdf");
fs.writeFileSync(out, Buffer.from(await merged.save()));

const size = merged.getPage(0).getSize();
console.log(`\nBet o'lchami: ${size.width.toFixed(2)} × ${size.height.toFixed(2)} pt`);
console.log(`             ${(size.width / 72 * 25.4).toFixed(1)} × ${(size.height / 72 * 25.4).toFixed(1)} mm`);
console.log(`Betlar: ${merged.getPageCount()}`);
console.log(`\nTayyor: ${out}`);
