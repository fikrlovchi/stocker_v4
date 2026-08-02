// ShK — kichik termo yorliq (Proton DTP-4207, 40×30 mm).
//
// Nega alohida fayl: mavjud `createProductsPdf` A5 (594×420 pt) uchun qattiq
// yozilgan — matn 90° aylantirilgan, QR 360 pt, buyurtma/shtrix 50 pt.
// 40×30 mm = 113×85 pt ga u umuman sig'maydi. Dashboard'ning A5 varianti
// o'zgarishsiz qoladi, bu esa yig'ish (packing) jarayoni uchun.
//
// ── Ustuvorlik (foydalanuvchi talabi) ────────────────────────────────
//   ASOSIY   : MoySklad tovar nomi (mc_product!E) va Buyurtma ID
//   KICHIKROQ: SKU (uzum_order_detail!C) va shtrix-kod
// A5 variantidan farqi shunda: u yerda shtrix-kod buyurtma raqami bilan
// teng (50 pt) va eng yirik element edi.
//
// Maket:
//   ┌────────────────────────────────────────┐
//   │ Кружка керамическая           ┌──────┐ │  nom — asosiy, ko'p qatorli
//   │ белая 450 мл                  │  QR  │ │
//   │                               └──────┘ │
//   │ 1201855·32                             │  buyurtma ID — asosiy, dumi qalin
//   │ KRUZH-450                              │  SKU — kichik
//   │ 1000114076242                          │  shtrix — kichik
//   └────────────────────────────────────────┘
//
// Barcha o'lchamlar konfiguratsiyadan — fizik sinovdan keyin kodga tegmasdan
// sozlash mumkin. Matn mavjud joyga avtomatik moslashadi (fitParagraph/fitSize).
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
  gapMm: 1.2,
  qrMm: 13,
  copies: 2,
  boldTail: 4,          // buyurtma raqamining oxirgi nechta belgisi qalin
  boldTailScale: 1.25,  // qalin qismning nisbiy o'lchami
  nameMaxLines: 4,
  showSku: true,
  showBarcode: true,
  font: {
    name: { max: 8.5, min: 4.5 },     // ASOSIY — MoySklad tovar nomi
    order: { max: 17, min: 7 },       // ASOSIY — buyurtma ID
    sku: { max: 6, min: 3.8 },        // kichik
    barcode: { max: 6, min: 3.8 },    // kichik
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

// So'z bo'yicha bo'ladi; bitta so'z qatorga sig'masa (masalan uzun SKU kodi)
// belgi bo'yicha sindiradi.
function wrap(font, text, size, maxWidth) {
  const lines = [];
  let current = "";

  const pushChars = (word) => {
    for (const ch of word) {
      if (current && font.widthOfTextAtSize(current + ch, size) > maxWidth) {
        lines.push(current);
        current = ch;
      } else {
        current += ch;
      }
    }
  };

  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
      current = "";
    }
    if (font.widthOfTextAtSize(word, size) <= maxWidth) current = word;
    else pushChars(word);
  }
  if (current) lines.push(current);
  return lines;
}

// Matnni berilgan to'rtburchakka sig'adigan ENG KATTA o'lchamda joylashtiradi.
// Sig'masa eng kichik o'lchamda kesib, oxiriga "…" qo'yadi.
function fitParagraph(font, text, maxWidth, maxHeight, max, min, maxLines, lineFactor = 1.12) {
  for (let size = max; size >= min; size -= 0.25) {
    const lines = wrap(font, text, size, maxWidth);
    if (lines.length <= maxLines && lines.length * size * lineFactor <= maxHeight) {
      return { size, lines, truncated: false };
    }
  }

  const size = min;
  const allowed = Math.min(maxLines, Math.floor(maxHeight / (size * lineFactor)));
  const lines = wrap(font, text, size, maxWidth).slice(0, Math.max(1, allowed));
  const shown = lines.join(" ").length;
  let truncated = false;
  if (shown < String(text).replace(/\s+/g, " ").length && lines.length) {
    let last = lines[lines.length - 1];
    while (last && font.widthOfTextAtSize(last + "…", size) > maxWidth) last = last.slice(0, -1);
    lines[lines.length - 1] = last + "…";
    truncated = true;
  }
  return { size, lines, truncated };
}

// product: { title: "<sku>,<MoySklad nomi>", barcode: "<shtrix>,<buyurtma №>" }
// — `buildProductForItem` qaytaradigan format (A5 varianti bilan bir xil).
//
// options.onMetrics — ixtiyoriy callback: tanlangan shrift o'lchamlari va
// matn kesilgan-kesilmagani. Maketni sozlashda (namuna skripti) ishlatiladi.
async function createShkSmall(product, options = {}) {
  const opt = merge(DEFAULTS, options);
  const metrics = { nameSize: null, nameLines: 0, nameTruncated: false, orderSize: null, skuSize: null, barcodeSize: null };

  const width = opt.widthMm * MM;
  const height = opt.heightMm * MM;
  const margin = opt.marginMm * MM;
  const gap = opt.gapMm * MM;
  const qrSize = opt.qrMm * MM;

  // title = "<SKU>,<MoySklad nomi>"
  const titleStr = String(product.title ?? "");
  const commaIdx = titleStr.indexOf(",");
  const sku = (commaIdx >= 0 ? titleStr.slice(0, commaIdx) : titleStr).trim();
  const mcNameRaw = commaIdx >= 0 ? titleStr.slice(commaIdx + 1).trim() : "";
  // mc_product'da mos topilmasa nom bo'sh keladi — bunda SKU asosiy matn bo'ladi.
  const mainName = mcNameRaw || sku;
  const showSku = opt.showSku && sku && sku !== mainName;

  // barcode = "<shtrix>,<buyurtma №>"
  const parts = String(product.barcode ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const barcodeVal = parts[0] || "";
  const orderVal = parts.slice(1).join(",");

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const normalFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  // Tovar nomi kirillcha bo'ladi — DejaVu kerak (Helvetica kirillni qo'llamaydi).
  const nameFont = await pdfDoc.embedFont(
    fs.readFileSync(path.resolve("./fonts/dejavu/ttf/DejaVuLGCSans.ttf"))
  );

  const qrDataUrl = await QRCode.toDataURL(barcodeVal || " ", { margin: 0 });
  const qrImage = await pdfDoc.embedPng(Buffer.from(qrDataUrl.split(",")[1], "base64"));

  /* ---------------- maketni oldindan hisoblaymiz ---------------- */

  const top = height - margin;
  const qrY = top - qrSize;

  // Nom bloki: QR'ning chap tomonida, QR balandligicha.
  const nameWidth = width - margin * 2 - qrSize - gap;
  const name = fitParagraph(
    nameFont,
    mainName,
    nameWidth,
    qrSize,
    opt.font.name.max,
    opt.font.name.min,
    opt.nameMaxLines
  );
  metrics.nameSize = name.size;
  metrics.nameLines = name.lines.length;
  metrics.nameTruncated = name.truncated;

  // Pastki tasma: butun kenglik. Buyurtma ID eng yirik element.
  const fullWidth = width - margin * 2;
  const orderHead = orderVal.slice(0, -opt.boldTail);
  const orderTail = orderVal.slice(-opt.boldTail);
  let orderSize = opt.font.order.max;
  const orderWidth = (s) =>
    normalFont.widthOfTextAtSize(orderHead, s) + boldFont.widthOfTextAtSize(orderTail, s * opt.boldTailScale);
  while (orderSize > opt.font.order.min && orderWidth(orderSize) > fullWidth) orderSize -= 0.25;
  metrics.orderSize = orderVal ? orderSize : null;

  const skuSize = showSku ? fitSize(nameFont, sku, fullWidth, opt.font.sku.max, opt.font.sku.min) : 0;
  const barcodeSize =
    opt.showBarcode && barcodeVal
      ? fitSize(normalFont, barcodeVal, fullWidth, opt.font.barcode.max, opt.font.barcode.min)
      : 0;
  metrics.skuSize = showSku ? skuSize : null;
  metrics.barcodeSize = barcodeSize || null;

  /* ---------------- chizamiz ---------------- */

  for (let copy = 0; copy < Math.max(1, opt.copies); copy++) {
    const page = pdfDoc.addPage([width, height]);

    page.drawImage(qrImage, { x: width - margin - qrSize, y: qrY, width: qrSize, height: qrSize });

    // Nom — yuqori chapdan pastga
    let y = top;
    for (const line of name.lines) {
      y -= name.size;
      page.drawText(line, { x: margin, y, size: name.size, font: nameFont, color: rgb(0, 0, 0) });
      y -= name.size * 0.12;
    }

    // Pastki tasma QR ostidan boshlanadi (nom qancha joy olganidan qat'i nazar)
    let bandY = qrY - gap;

    if (orderVal) {
      const tailSize = orderSize * opt.boldTailScale;
      bandY -= tailSize;
      const headWidth = normalFont.widthOfTextAtSize(orderHead, orderSize);
      if (orderHead) {
        page.drawText(orderHead, { x: margin, y: bandY, size: orderSize, font: normalFont, color: rgb(0, 0, 0) });
      }
      page.drawText(orderTail, {
        x: margin + headWidth,
        y: bandY,
        size: tailSize,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      bandY -= 1.2;
    }

    if (showSku) {
      bandY -= skuSize;
      page.drawText(sku, { x: margin, y: bandY, size: skuSize, font: nameFont, color: rgb(0, 0, 0) });
      bandY -= 0.8;
    }

    if (barcodeSize) {
      bandY -= barcodeSize;
      page.drawText(barcodeVal, { x: margin, y: bandY, size: barcodeSize, font: normalFont, color: rgb(0, 0, 0) });
    }
  }

  if (typeof opt.onMetrics === "function") opt.onMetrics(metrics);
  return await pdfDoc.save();
}

export { createShkSmall, DEFAULTS as SHK_SMALL_DEFAULTS };
