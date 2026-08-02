// ShK — kichik termo yorliq (Proton DTP-4207, 40×30 mm).
//
// Maket:
//   ┌──────────────────────────────────────────────┐
//   │ Диспенсер для мыла                           │ ← MoySklad nomi: GORIZONTAL,
//   │                                              │   yuqori tasmada, 3 qatorgacha
//   ├──────────────────────────────────────────────┤
//   │ S   ┌──────────┐   O          B              │
//   │ K   │          │   r          a              │ ← qolganlari 90° aylantirilgan
//   │ U   │    QR    │   d          r              │   (A5 varianti kabi)
//   │     │          │   e          c              │
//   │     └──────────┘   r          o              │
//   │                    I          d              │
//   │                    D          e              │
//   └──────────────────────────────────────────────┘
//     kichik   O'ZGARMAS   ASOSIY    kichik
//
// A5 (createProductsPdf) dan farqlari — foydalanuvchi talabi:
//   • Tovar nomi AYLANTIRILMAYDI, yuqori tasmada gorizontal turadi va
//     butun kenglikdan foydalanadi (aylantirilganda u QR bilan bir qatorda
//     siqilib qolardi).
//   • QR o'lchami O'ZGARMAS (`qrMm`) — yorliqdan yorliqqa farq qilmaydi.
//   • Buyurtma ID da oxirgi 4 ta belgi QALIN EMAS (A5 da qalin edi).
//   • Faqat shtrix-kodning oxirgi 4 tasi qalin.
//   • SKU va shtrix-kod "yaxshi ko'rinishi" shart emas — ular kichik.
//
// Nom tasmasi balandligi matnga qarab o'zgaradi, lekin QR har doim sig'adigan
// darajada cheklangan. Nom qisqa bo'lsa pastki tasma balandroq bo'ladi va
// buyurtma ID yirikroq chiqadi.
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";
import fontkit from "@pdf-lib/fontkit";

const MM = 72 / 25.4;

const DEFAULTS = {
  widthMm: 40,
  heightMm: 30,
  marginMm: 1.2,
  gapMm: 1.0,
  qrMm: 15,           // O'ZGARMAS
  copies: 2,
  boldTail: 4,        // shtrix-kodning oxirgi nechta belgisi qalin
  nameMaxLines: 3,
  skuMaxCols: 2,
  showSku: true,
  showBarcode: true,
  lineFactor: 1.2,    // aylantirilgan ustunlar orasi (A5 dagi kabi)
  nameLineFactor: 1.15,
  font: {
    name: { max: 9, min: 4 },       // ASOSIY
    order: { max: 14, min: 6 },     // ASOSIY
    sku: { max: 5, min: 3.5 },      // kichik
    barcode: { max: 8, min: 4.5 },  // kichik
  },
};

function merge(defaults, override) {
  const out = { ...defaults };
  for (const [k, v] of Object.entries(override || {})) {
    if (v === null || v === undefined) continue;
    out[k] = v && typeof v === "object" && !Array.isArray(v) ? merge(defaults[k] || {}, v) : v;
  }
  return out;
}

// So'z bo'yicha o'raydi; bitta so'z sig'masa (uzun SKU kodi) belgi bo'yicha sindiradi.
function wrap(font, text, size, maxLen) {
  const lines = [];
  let current = "";

  const pushChars = (word) => {
    for (const ch of word) {
      if (current && font.widthOfTextAtSize(current + ch, size) > maxLen) {
        lines.push(current);
        current = ch;
      } else current += ch;
    }
  };

  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxLen) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
      current = "";
    }
    if (font.widthOfTextAtSize(word, size) <= maxLen) current = word;
    else pushChars(word);
  }
  if (current) lines.push(current);
  return lines;
}

// Qatorlar soni chegaradan oshmaydigan ENG KATTA o'lcham.
// (O'lcham kichraysa qatorga ko'proq belgi sig'adi -> qatorlar kamayadi.)
function fitBlock(font, text, maxLen, maxLines, max, min) {
  if (!text) return { size: 0, lines: [] };
  for (let size = max; size >= min; size -= 0.25) {
    const lines = wrap(font, text, size, maxLen);
    if (lines.length <= maxLines) return { size, lines };
  }
  const lines = wrap(font, text, min, maxLen);
  return { size: min, lines: lines.slice(0, maxLines), truncated: lines.length > maxLines };
}

// Bir qatorga sig'adigan eng katta o'lcham.
function fitLine(font, text, maxLen, max, min) {
  if (!text) return 0;
  let size = max;
  while (size > min && font.widthOfTextAtSize(text, size) > maxLen) size -= 0.25;
  return size;
}

// product: { title: "<SKU>,<MoySklad nomi>", barcode: "<shtrix>,<buyurtma №>" }
async function createShkSmall(product, options = {}) {
  const opt = merge(DEFAULTS, options);

  const width = opt.widthMm * MM;
  const height = opt.heightMm * MM;
  const margin = opt.marginMm * MM;
  const gap = opt.gapMm * MM;
  const qrSize = opt.qrMm * MM;

  /* ---------------- matnlarni ajratamiz ---------------- */

  const titleStr = String(product.title ?? "");
  const ci = titleStr.indexOf(",");
  const sku = (ci >= 0 ? titleStr.slice(0, ci) : titleStr).trim();
  const mcName = ci >= 0 ? titleStr.slice(ci + 1).trim() : "";
  // mc_product'da mos topilmasa nom bo'sh keladi — bunda SKU asosiy matn
  // bo'ladi va alohida SKU ustuni chizilmaydi (takrorlanmasin).
  const nameText = mcName || sku;
  const skuText = opt.showSku && sku && sku !== nameText ? sku : "";

  const parts = String(product.barcode ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const barcodeVal = opt.showBarcode ? parts[0] || "" : "";
  const orderVal = parts.slice(1).join(",");

  /* ---------------- shriftlar ---------------- */

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const normalFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  // Tovar nomi kirillcha bo'lishi mumkin — Helvetica kirillni qo'llamaydi.
  const textFont = await pdfDoc.embedFont(
    fs.readFileSync(path.resolve("./fonts/dejavu/ttf/DejaVuLGCSans.ttf"))
  );

  /* ---------------- 1. Yuqori tasma: nom (gorizontal) ---------------- */

  // Nom tasmasi QR sig'adigan joyni yeb qo'ymasligi kerak.
  const maxNameHeight = height - margin * 2 - gap - qrSize;
  const nameLineLimit = Math.max(1, Math.floor(maxNameHeight / (opt.font.name.min * opt.nameLineFactor)));
  const nameBlock = fitBlock(
    textFont,
    nameText,
    width - margin * 2,
    Math.min(opt.nameMaxLines, nameLineLimit),
    opt.font.name.max,
    opt.font.name.min
  );
  const nameHeight = nameBlock.lines.length * nameBlock.size * opt.nameLineFactor;

  /* ---------------- 2. Pastki tasma: aylantirilgan ustunlar ---------------- */

  const bandTop = height - margin - nameHeight - (nameHeight ? gap : 0);
  const bandHeight = bandTop - margin;          // aylantirilgan matn qator uzunligi
  const bandCenterY = margin + bandHeight / 2;

  const skuBlock = fitBlock(textFont, skuText, bandHeight, opt.skuMaxCols, opt.font.sku.max, opt.font.sku.min);
  const orderSize = fitLine(normalFont, orderVal, bandHeight, opt.font.order.max, opt.font.order.min);
  const barcodeSize = fitLine(normalFont, barcodeVal, bandHeight, opt.font.barcode.max, opt.font.barcode.min);

  const skuWidth = skuBlock.lines.length * skuBlock.size * opt.lineFactor;
  const orderWidth = orderVal ? orderSize * opt.lineFactor : 0;
  const barcodeWidth = barcodeVal ? barcodeSize * opt.lineFactor : 0;

  // Guruh gorizontal markazlashadi — ortiqcha joy chapga to'planib qolmasin.
  const groupWidth = skuWidth + (skuWidth ? gap : 0) + qrSize + gap + orderWidth + barcodeWidth;
  const startX = margin + Math.max(0, (width - margin * 2 - groupWidth) / 2);

  const metrics = {
    nameSize: nameBlock.size,
    nameLines: nameBlock.lines.length,
    nameTruncated: Boolean(nameBlock.truncated),
    orderSize: orderVal ? orderSize : null,
    barcodeSize: barcodeVal ? barcodeSize : null,
    skuSize: skuText ? skuBlock.size : null,
    qrMm: opt.qrMm,
    bandMm: +(bandHeight / MM).toFixed(1),
    overflow: groupWidth > width - margin * 2,
  };

  /* ---------------- chizamiz ---------------- */

  const qrDataUrl = await QRCode.toDataURL(parts[0] || " ", { margin: 0 });
  const qrImage = await pdfDoc.embedPng(Buffer.from(qrDataUrl.split(",")[1], "base64"));

  // Aylantirilgan blok: har qator yangi ustun, tasma bo'yicha markazda.
  const drawRotatedBlock = (page, block, font, x) => {
    const lh = block.size * opt.lineFactor;
    block.lines.forEach((line, i) => {
      const w = font.widthOfTextAtSize(line, block.size);
      page.drawText(line, {
        x: x + i * lh,
        y: bandCenterY - w / 2,
        size: block.size,
        font,
        rotate: degrees(90),
        color: rgb(0, 0, 0),
      });
    });
    return x + block.lines.length * lh;
  };

  for (let copy = 0; copy < Math.max(1, opt.copies); copy++) {
    const page = pdfDoc.addPage([width, height]);

    // --- Nom: gorizontal, yuqori chapdan ---
    let ny = height - margin;
    for (const line of nameBlock.lines) {
      ny -= nameBlock.size;
      page.drawText(line, { x: margin, y: ny, size: nameBlock.size, font: textFont, color: rgb(0, 0, 0) });
      ny -= nameBlock.size * (opt.nameLineFactor - 1);
    }

    let x = startX;

    // --- SKU (kichik) ---
    if (skuText) x = drawRotatedBlock(page, skuBlock, textFont, x) + gap;

    // --- QR: o'zgarmas o'lcham, tasma markazida ---
    page.drawImage(qrImage, { x, y: bandCenterY - qrSize / 2, width: qrSize, height: qrSize });
    x += qrSize + gap;

    // --- Buyurtma ID (asosiy) — QALIN DUM YO'Q ---
    if (orderVal) {
      const w = normalFont.widthOfTextAtSize(orderVal, orderSize);
      page.drawText(orderVal, {
        x,
        y: bandCenterY - w / 2,
        size: orderSize,
        font: normalFont,
        rotate: degrees(90),
        color: rgb(0, 0, 0),
      });
      x += orderWidth;
    }

    // --- Shtrix-kod (kichik) — oxirgi 4 ta belgi QALIN ---
    if (barcodeVal) {
      const head = barcodeVal.slice(0, -opt.boldTail);
      const tail = barcodeVal.slice(-opt.boldTail);
      const headWidth = normalFont.widthOfTextAtSize(head, barcodeSize);
      const tailWidth = boldFont.widthOfTextAtSize(tail, barcodeSize);
      const y = bandCenterY - (headWidth + tailWidth) / 2;
      if (head) {
        page.drawText(head, { x, y, size: barcodeSize, font: normalFont, rotate: degrees(90), color: rgb(0, 0, 0) });
      }
      page.drawText(tail, {
        x,
        y: y + headWidth,
        size: barcodeSize,
        font: boldFont,
        rotate: degrees(90),
        color: rgb(0, 0, 0),
      });
    }
  }

  if (typeof opt.onMetrics === "function") opt.onMetrics(metrics);
  return await pdfDoc.save();
}

export { createShkSmall, DEFAULTS as SHK_SMALL_DEFAULTS };
