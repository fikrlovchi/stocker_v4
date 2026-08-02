// ShK — kichik termo yorliq (Proton DTP-4207, 40×30 mm).
//
// Nega alohida fayl: mavjud `createProductsPdf` A5 (594×420 pt) uchun qattiq
// yozilgan — matn 90° aylantirilgan, QR 360 pt, joylashuvlar dashboard
// konstruktoridan keladi. 40×30 mm = 113×85 pt ga u umuman sig'maydi.
// Dashboard'ning A5 varianti o'zgarishsiz qoladi, bu esa yig'ish (packing)
// jarayoni uchun.
//
// Maket (gorizontal, 40×30 mm):
//   ┌────────────────────────────────┐
//   │ ┌──────────┐  1201855·32       │  buyurtma № (oxirgi 4 ta yirik/qalin)
//   │ │    QR    │  1000076067784    │  shtrix-kod
//   │ └──────────┘  LYDISP1-697JL…   │  SKU (sig'maganda kesiladi)
//   └────────────────────────────────┘
//
// Barcha o'lchamlar konfiguratsiyadan — fizik sinovdan keyin kodga tegmasdan
// sozlash mumkin.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";
import fontkit from "@pdf-lib/fontkit";

const MM = 72 / 25.4; // 1 mm nechа pt

const DEFAULTS = {
  widthMm: 40,
  heightMm: 30,
  marginMm: 1.2,
  qrMm: 20,
  gapMm: 1.2,
  copies: 2,
  // Sarlavhada nima ko'rsatilsin: "sku" (uzum_order_detail!C),
  // "name" (mc_product!E) yoki "both". 40×30 da odatda faqat "sku" sig'adi.
  titlePart: "sku",
  titleMaxLines: 2,
  boldTail: 4,        // buyurtma raqamining oxirgi nechta belgisi qalin
  boldTailScale: 1.3, // qalin qismning nisbiy o'lchami
  font: {
    order: { max: 11, min: 5.5 },
    barcode: { max: 7.5, min: 4.5 },
    title: { max: 5.5, min: 3.8 },
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

// Berilgan kenglikka sig'adigan eng katta shrift o'lchami.
function fitSize(font, text, maxWidth, max, min) {
  let size = max;
  while (size > min && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.25;
  return size;
}

// SKU kodlarida bo'shliq bo'lmaydi ("LYDISP1-697JLYF006648-1"), shuning uchun
// so'z bo'yicha emas, belgi bo'yicha bo'linadi.
function charWrap(font, text, size, maxWidth, maxLines) {
  const lines = [];
  let current = "";
  for (const ch of text) {
    const test = current + ch;
    if (font.widthOfTextAtSize(test, size) > maxWidth && current) {
      lines.push(current);
      current = ch;
      if (lines.length === maxLines) break;
    } else {
      current = test;
    }
  }
  if (lines.length < maxLines && current) lines.push(current);

  // Sig'magan qism qolgan bo'lsa oxirgi qatorni "…" bilan tugatamiz.
  const shown = lines.join("");
  if (shown.length < text.length && lines.length) {
    let last = lines[lines.length - 1];
    while (last && font.widthOfTextAtSize(last + "…", size) > maxWidth) last = last.slice(0, -1);
    lines[lines.length - 1] = last + "…";
  }
  return lines;
}

// product: { title: "<sku>,<mc nomi>", barcode: "<shtrix>,<buyurtma №>" }
// — `buildProductForItem` qaytaradigan format (A5 varianti bilan bir xil).
//
// options.onMetrics — ixtiyoriy callback: tanlangan shrift o'lchamlari va
// matn kesilgan-kesilmagani. Maketni sozlashda (namuna skripti) ishlatiladi.
async function createShkSmall(product, options = {}) {
  const opt = merge(DEFAULTS, options);
  const metrics = { orderSize: null, barcodeSize: null, titleSize: null, titleTruncated: false, titleLines: 0 };

  const width = opt.widthMm * MM;
  const height = opt.heightMm * MM;
  const margin = opt.marginMm * MM;
  const qrSize = opt.qrMm * MM;
  const gap = opt.gapMm * MM;

  const titleStr = String(product.title ?? "");
  const commaIdx = titleStr.indexOf(",");
  const sku = (commaIdx >= 0 ? titleStr.slice(0, commaIdx) : titleStr).trim();
  const mcName = commaIdx >= 0 ? titleStr.slice(commaIdx + 1).trim() : "";

  const parts = String(product.barcode ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const barcodeVal = parts[0] || "";
  const orderVal = parts.slice(1).join(",");

  const titleText =
    opt.titlePart === "name" ? mcName : opt.titlePart === "both" ? [sku, mcName].filter(Boolean).join(" ") : sku;

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const normalFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  // Sarlavhada kirillcha/lotincha diakritika bo'lishi mumkin — DejaVu.
  const titleFont = await pdfDoc.embedFont(
    fs.readFileSync(path.resolve("./fonts/dejavu/ttf/DejaVuLGCSans.ttf"))
  );

  // QR bir marta generatsiya qilinadi, nusxalarga qayta ishlatiladi.
  const qrDataUrl = await QRCode.toDataURL(barcodeVal || " ", { margin: 0 });
  const qrImage = await pdfDoc.embedPng(Buffer.from(qrDataUrl.split(",")[1], "base64"));

  const textX = margin + qrSize + gap;
  const textWidth = width - textX - margin;

  for (let copy = 0; copy < Math.max(1, opt.copies); copy++) {
    const page = pdfDoc.addPage([width, height]);

    page.drawImage(qrImage, {
      x: margin,
      y: (height - qrSize) / 2,
      width: qrSize,
      height: qrSize,
    });

    // ---- Buyurtma raqami: oxirgi 4 ta belgi yirikroq va qalin ----
    let cursorY = height - margin;
    if (orderVal) {
      const tail = orderVal.slice(-opt.boldTail);
      const head = orderVal.slice(0, -opt.boldTail);
      const f = opt.font.order;
      // head va tail birga sig'adigan o'lcham (tail boldTailScale marta katta)
      let size = f.max;
      const totalWidth = (s) =>
        normalFont.widthOfTextAtSize(head, s) + boldFont.widthOfTextAtSize(tail, s * opt.boldTailScale);
      while (size > f.min && totalWidth(size) > textWidth) size -= 0.25;

      metrics.orderSize = size;
      const tailSize = size * opt.boldTailScale;
      cursorY -= tailSize;
      const headWidth = normalFont.widthOfTextAtSize(head, size);
      if (head) {
        page.drawText(head, { x: textX, y: cursorY, size, font: normalFont, color: rgb(0, 0, 0) });
      }
      page.drawText(tail, {
        x: textX + headWidth,
        y: cursorY,
        size: tailSize,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      cursorY -= 1.5;
    }

    // ---- Shtrix-kod ----
    if (barcodeVal) {
      const f = opt.font.barcode;
      const size = fitSize(normalFont, barcodeVal, textWidth, f.max, f.min);
      metrics.barcodeSize = size;
      cursorY -= size;
      page.drawText(barcodeVal, { x: textX, y: cursorY, size, font: normalFont, color: rgb(0, 0, 0) });
      cursorY -= 1.5;
    }

    // ---- SKU / nom ----
    if (titleText && opt.titleMaxLines > 0) {
      const f = opt.font.title;
      const size = f.max;
      const lines = charWrap(titleFont, titleText, size, textWidth, opt.titleMaxLines);
      metrics.titleSize = size;
      metrics.titleLines = lines.length;
      metrics.titleTruncated = lines.some((l) => l.endsWith("…"));
      for (const line of lines) {
        cursorY -= size;
        if (cursorY < margin) break;
        page.drawText(line, { x: textX, y: cursorY, size, font: titleFont, color: rgb(0, 0, 0) });
        cursorY -= 0.6;
      }
    }
  }

  if (typeof opt.onMetrics === "function") opt.onMetrics(metrics);
  return await pdfDoc.save();
}

export { createShkSmall, DEFAULTS as SHK_SMALL_DEFAULTS };
