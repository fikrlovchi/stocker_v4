// 40×30 mm ShK yorlig'i uchun namuna PDF yasaydi — Proton DTP-4207 dan
// chiqarib maketni ko'z bilan baholash uchun. Google Sheets kerak emas.
//
//   node scripts/shkSample.js
//   node scripts/shkSample.js --debug          maydon chegaralarini ramkada ko'rsatadi
//   node scripts/shkSample.js --qr=12          QR o'lchami (mm)
//   node scripts/shkSample.js --share=0.5      buyurtma ID / SKU prefiksi kenglik ulushi
//   node scripts/shkSample.js --mid=10         o'rta band balandligi (mm)
//   node scripts/shkSample.js --rotate=90      betni burib chiqarish
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
  { label: "uzun prefiks", title: "LIVAUTO-TT1612002063-ЧЕРН,Автомобильный держатель", barcode: "1000057600931,119706915" },
  { label: "chiziqsiz SKU", title: "AB1,Стакан", barcode: "697JLYF006648,120103126" },
  { label: "kirillcha nom", title: "ENVACCE-SS00589,Кружка керамическая белая 450 мл", barcode: "1000114076242,120185532" },
  {
    label: "juda uzun nom",
    title: "LYDISP3-F006632-1,Диспенсер для жидкого мыла автоматический сенсорный настенный 500 мл",
    barcode: "1000076067791,119706915",
  },
  { label: "nomsiz (#N/A)", title: "LYDISP1-006654-3,", barcode: "697JLYF006648,120103126" },
];

const overrides = {};
if (args.qr) overrides.qrMm = Number(args.qr);
if (args.lines) overrides.nameMaxLines = Number(args.lines);
if (args.share) overrides.midOrderShare = Number(args.share);
if (args.mid) overrides.rowMidMm = Number(args.mid);
if (args.rotate) overrides.pageRotate = Number(args.rotate);
// --debug: har maydonning hisoblangan chegarasini ramka bilan chizadi.
// Siyoh ramkadan chiqsa hisob xato — ko'z bilan darhol ko'rinadi.
if (args.debug) overrides.debugBoxes = true;

const merged = await PDFDocument.create();
let last = null;

console.log("namuna           nom  qator kesildi buyurtma prefiks       shtrix  sig'di");
console.log("─".repeat(76));

for (const s of samples) {
  let m = {};
  const bytes = await createShkSmall(s, { ...overrides, copies: 1, onMetrics: (x) => (m = x) });
  const doc = await PDFDocument.load(bytes);
  const pages = await merged.copyPages(doc, doc.getPageIndices());
  pages.forEach((p) => merged.addPage(p));

  console.log(
    `${s.label.padEnd(16)} ` +
      `${String(m.nameSize ?? "-").padEnd(4)} ` +
      `${String(m.nameLines).padEnd(5)} ` +
      `${(m.nameTruncated ? "HA" : "yo'q").padEnd(7)} ` +
      `${String(m.orderSize ?? "-").padEnd(8)} ` +
      `${(`${m.prefix ?? "-"} ${m.prefixSize ?? ""}`).padEnd(13)} ` +
      `${String(m.barcodeSize ?? "-").padEnd(7)} ` +
      `${m.fitsVertically ? "ha" : "YO'Q ⚠"}`
  );
  last = m;
}

const outDir = path.join(process.cwd(), "uploads");
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, "shk_sample.pdf");
fs.writeFileSync(out, Buffer.from(await merged.save()));

if (last) {
  console.log("\n--- Maydonlar (pt: x, y, kenglik × balandlik) ---");
  for (const [name, b] of Object.entries(last.boxes)) {
    console.log(`  ${name.padEnd(8)} x=${String(b.x).padStart(6)}  y=${String(b.y).padStart(6)}  ${String(b.w).padStart(6)} × ${b.h}`);
  }
  console.log(`  shtrix dumi: ${last.barcodeTailSize}pt (asos ${last.barcodeSize}pt)`);
}

const size = merged.getPage(0).getSize();
console.log(`\nBet o'lchami: ${size.width.toFixed(2)} × ${size.height.toFixed(2)} pt`);
console.log(`             ${(size.width / 72 * 25.4).toFixed(1)} × ${(size.height / 72 * 25.4).toFixed(1)} mm`);
console.log(`Betlar: ${merged.getPageCount()}`);
console.log(`\nTayyor: ${out}`);
