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
  // Ba'zi termo printer drayverlari bet yo'nalishini o'zi burib yuboradi
  // (drayverdagi qog'oz o'lchami 40×30 emas, 30×40 deb belgilangan bo'lsa).
  // Bunda yorliq 90° og'ib chiqadi. Buni drayverdan tuzatish afzal, lekin
  // imkoni bo'lmasa shu yerdan oldindan burib yuborish mumkin:
  // uzumPDFs .env da SHK_ROTATE=90 (0 | 90 | 180 | 270).
  pageRotate: Number(process.env.SHK_ROTATE) || 0,
  boldTail: 4,        // shtrix-kodning oxirgi nechta belgisi qalin
  nameMaxLines: 3,
  skuMaxCols: 2,
  showSku: true,
  showBarcode: true,
  colGapFactor: 1.1,  // aylantirilgan ustun kengligi = shrift balandligi × shu
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

  // ⚠ pdf-lib matnni (x, y) BASELINE nuqtasi atrofida buradi. 90° da glif
  // balandligi −X tomonga cho'ziladi, ya'ni siyohning asosiy qismi
  // baseline'ning CHAP tomonida qoladi. Ustunning chap chekkasi X bo'lishi
  // uchun baseline X + ascent ga qo'yilishi kerak. Aynan shu hisobga
  // olinmagani uchun buyurtma ID QR ustiga chiqib ketgan edi.
  const ascentOf = (font, size) => font.heightAtSize(size, { descender: false });
  const colWidthOf = (font, size) => font.heightAtSize(size) * opt.colGapFactor;

  const skuColWidth = skuText ? colWidthOf(textFont, skuBlock.size) : 0;
  const skuWidth = skuBlock.lines.length * skuColWidth;
  const orderWidth = orderVal ? colWidthOf(normalFont, orderSize) : 0;
  const barcodeWidth = barcodeVal ? colWidthOf(normalFont, barcodeSize) : 0;

  // Guruh gorizontal markazlashadi — ortiqcha joy chapga to'planib qolmasin.
  const groupWidth = skuWidth + (skuWidth ? gap : 0) + qrSize + gap + orderWidth + barcodeWidth;
  const startX = margin + Math.max(0, (width - margin * 2 - groupWidth) / 2);

  // Har elementning gorizontal chegarasi — ustma-ust tushishni ISBOTLAB
  // tekshirish uchun (avvalgi versiyada buyurtma ID QR ustiga chiqib ketgan edi).
  const layout = [];
  {
    let lx = startX;
    if (skuText) {
      layout.push({ el: "SKU", x0: lx, x1: lx + skuWidth });
      lx += skuWidth + gap;
    }
    layout.push({ el: "QR", x0: lx, x1: lx + qrSize });
    lx += qrSize + gap;
    if (orderVal) {
      layout.push({ el: "Buyurtma", x0: lx, x1: lx + orderWidth });
      lx += orderWidth;
    }
    if (barcodeVal) layout.push({ el: "Shtrix", x0: lx, x1: lx + barcodeWidth });
  }
  const overlaps = [];
  for (let i = 1; i < layout.length; i++) {
    if (layout[i].x0 < layout[i - 1].x1 - 0.01) {
      overlaps.push(`${layout[i - 1].el}↔${layout[i].el}`);
    }
  }
  const last = layout[layout.length - 1];

  const metrics = {
    nameSize: nameBlock.size,
    nameLines: nameBlock.lines.length,
    nameTruncated: Boolean(nameBlock.truncated),
    orderSize: orderVal ? orderSize : null,
    barcodeSize: barcodeVal ? barcodeSize : null,
    skuSize: skuText ? skuBlock.size : null,
    qrMm: opt.qrMm,
    bandMm: +(bandHeight / MM).toFixed(1),
    layout: layout.map((l) => ({ ...l, x0: +l.x0.toFixed(1), x1: +l.x1.toFixed(1) })),
    overlaps,
    rightEdgeMm: +((width - margin - last.x1) / MM).toFixed(2), // manfiy bo'lsa betdan chiqib ketgan
    fits: overlaps.length === 0 && last.x1 <= width - margin + 0.01,
  };

  /* ---------------- chizamiz ---------------- */

  const qrDataUrl = await QRCode.toDataURL(parts[0] || " ", { margin: 0 });
  const qrImage = await pdfDoc.embedPng(Buffer.from(qrDataUrl.split(",")[1], "base64"));

  // Aylantirilgan blok: har qator yangi ustun, tasma bo'yicha markazda.
  // `x` — ustunning CHAP CHEKKASI; baseline ascent'ga suriladi (yuqoriga q.).
  const drawRotatedBlock = (page, block, font, x) => {
    const colW = colWidthOf(font, block.size);
    const asc = ascentOf(font, block.size);
    block.lines.forEach((line, i) => {
      const w = font.widthOfTextAtSize(line, block.size);
      page.drawText(line, {
        x: x + asc + i * colW,
        y: bandCenterY - w / 2,
        size: block.size,
        font,
        rotate: degrees(90),
        color: rgb(0, 0, 0),
      });
    });
    return x + block.lines.length * colW;
  };

  for (let copy = 0; copy < Math.max(1, opt.copies); copy++) {
    const page = pdfDoc.addPage([width, height]);
    // Bet darajasidagi burilish: mazmun o'zgarmaydi, faqat chop etishda
    // qanday yo'nalishda chiqishi belgilanadi (DEFAULTS.pageRotate izohiga q.).
    if (opt.pageRotate) page.setRotation(degrees(opt.pageRotate));

    // Tekshiruv rejimi: har elementning HISOBLANGAN chegarasi ramka bilan
    // chiziladi. Siyoh ramkadan chiqib ketsa — hisob xato degani.
    // (Aynan shunday xato bo'lgan edi: aylantirilgan matnning baseline'i
    // ustunning chap chekkasi deb hisoblangan, aslida siyoh chapga cho'zilgan.)
    if (opt.debugBoxes) {
      for (const l of layout) {
        page.drawRectangle({
          x: l.x0,
          y: margin,
          width: l.x1 - l.x0,
          height: bandTop - margin,
          borderColor: rgb(0.55, 0.55, 0.55),
          borderWidth: 0.3,
        });
      }
      page.drawRectangle({
        x: margin,
        y: bandTop,
        width: width - margin * 2,
        height: height - margin - bandTop,
        borderColor: rgb(0.55, 0.55, 0.55),
        borderWidth: 0.3,
      });
    }

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
        x: x + ascentOf(normalFont, orderSize),
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
      const bx = x + ascentOf(normalFont, barcodeSize);
      if (head) {
        page.drawText(head, { x: bx, y, size: barcodeSize, font: normalFont, rotate: degrees(90), color: rgb(0, 0, 0) });
      }
      page.drawText(tail, {
        x: bx,
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
