// ShK — kichik termo yorliq (Proton DTP-4207, 40×30 mm).
//
// Maket (foydalanuvchi maketi bo'yicha, hammasi GORIZONTAL):
//
//   ┌──────────────────────────────────────────────┐
//   │ Стакан керамическая        ┌──────────┐      │  1. NOM (MoySklad)
//   │ белая 450 мл               │    QR    │      │  2. QR
//   │                            └──────────┘      │
//   │ 120103126               LYDISP3              │  3. BUYURTMA ID  4. SKU PREFIKSI
//   │ 697JLYF00 6648                               │  5. SHTRIX (dumi qalin+yirik)
//   └──────────────────────────────────────────────┘
//
// Maydonlar:
//   1. Tovar nomi     — mc_product!E, 3 qatorgacha, avto o'lcham
//   2. QR             — shtrix-kod, o'zgarmas o'lcham
//   3. Buyurtma ID    — yirik, qalin dum YO'Q
//   4. SKU prefiksi   — SKU ning birinchi chiziqqacha qismi, QALIN
//                       LYDISP3-F006632-1        -> LYDISP3
//                       ENVACCE-SS00589          -> ENVACCE
//                       LIVAUTO-TT1612002063-ЧЕРН -> LIVAUTO
//   5. Shtrix-kod     — oxirgi 4 belgi qalin va kattaroq
//
// Bandlar balandligi va o'rta bandning kenglik bo'linishi konfiguratsiyadan —
// fizik sinovdan keyin kodga tegmasdan sozlash mumkin.
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
  qrMm: 15,             // o'zgarmas
  copies: 2,

  // Bandlar balandligi (mm). Yuqori band QR'dan kichik bo'lmaydi, qolgan
  // ikkisi esa qolgan joyga NISBATAN taqsimlanadi — shuning uchun `qrMm`
  // ni o'zgartirsa yetarli, boshqa o'lchamlarni qo'lda moslash kerak emas.
  rowNameMm: 15,        // nom + QR
  rowMidMm: 7,          // buyurtma ID + SKU prefiksi
  rowBarcodeMm: 5.6,    // shtrix

  // O'rta band kengligining buyurtma ID ga tegadigan ulushi (qolgani prefiksga)
  midOrderShare: 0.55,

  nameMaxLines: 4,
  boldTail: 4,          // shtrix-kodning oxirgi nechta belgisi qalin
  boldTailScale: 1.2,   // qalin dumning nisbiy o'lchami

  // Ba'zi drayverlar bet yo'nalishini o'zi buradi (qog'oz o'lchami 40×30
  // emas, 30×40 deb belgilangan bo'lsa). Drayverdan tuzatish afzal, lekin
  // imkoni bo'lmasa: uzumPDFs .env da SHK_ROTATE=90 (0 | 90 | 180 | 270).
  pageRotate: Number(process.env.SHK_ROTATE) || 0,

  // Tekshiruv rejimi: har maydonning hisoblangan chegarasi ramka bilan
  // chiziladi. Siyoh ramkadan chiqsa hisob xato degani.
  debugBoxes: false,

  font: {
    name: { max: 10, min: 4.5 },
    order: { max: 18, min: 8 },
    prefix: { max: 16, min: 7 },
    barcode: { max: 11, min: 5.5 },
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

/** SKU ning birinchi chiziqqacha bo'lgan qismi. */
function skuPrefix(sku) {
  const s = String(sku || "").trim();
  if (!s) return "";
  const i = s.indexOf("-");
  return (i > 0 ? s.slice(0, i) : s).trim();
}

/** So'z bo'yicha o'raydi; bitta so'z sig'masa belgi bo'yicha sindiradi. */
function wrap(font, text, size, maxWidth) {
  const lines = [];
  let current = "";

  const pushChars = (word) => {
    for (const ch of word) {
      if (current && font.widthOfTextAtSize(current + ch, size) > maxWidth) {
        lines.push(current);
        current = ch;
      } else current += ch;
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

/** To'rtburchakka sig'adigan eng katta o'lchamda ko'p qatorli matn. */
function fitParagraph(font, text, box, range, maxLines, lineFactor = 1.12) {
  if (!text) return { size: 0, lines: [], truncated: false };
  for (let size = range.max; size >= range.min; size -= 0.25) {
    const lines = wrap(font, text, size, box.w);
    if (lines.length <= maxLines && lines.length * size * lineFactor <= box.h) {
      return { size, lines, truncated: false };
    }
  }
  const size = range.min;
  const allowed = Math.max(1, Math.min(maxLines, Math.floor(box.h / (size * lineFactor))));
  const all = wrap(font, text, size, box.w);
  const lines = all.slice(0, allowed);
  let truncated = false;
  if (all.length > allowed && lines.length) {
    let last = lines[lines.length - 1];
    while (last && font.widthOfTextAtSize(last + "…", size) > box.w) last = last.slice(0, -1);
    lines[lines.length - 1] = last + "…";
    truncated = true;
  }
  return { size, lines, truncated };
}

/** O'lchamlarni 0.25 qadamga tekislaydi — sonlar toza va takrorlanadigan bo'lsin. */
const step = (v) => Math.floor(v * 4) / 4;

/** Bir qatorga sig'adigan eng katta o'lcham (kenglik va balandlik bo'yicha). */
function fitLine(font, text, box, range) {
  if (!text) return 0;
  let size = step(Math.min(range.max, box.h / 1.05));
  while (size > range.min && font.widthOfTextAtSize(text, size) > box.w) size -= 0.25;
  return Math.max(size, range.min);
}

// product: { title: "<SKU>,<MoySklad nomi>", barcode: "<shtrix>,<buyurtma №>" }
async function createShkSmall(product, options = {}) {
  const opt = merge(DEFAULTS, options);

  const W = opt.widthMm * MM;
  const H = opt.heightMm * MM;
  const m = opt.marginMm * MM;
  const gap = opt.gapMm * MM;
  const qr = opt.qrMm * MM;

  /* ---------------- matnlarni ajratamiz ---------------- */

  const titleStr = String(product.title ?? "");
  const ci = titleStr.indexOf(",");
  const sku = (ci >= 0 ? titleStr.slice(0, ci) : titleStr).trim();
  const mcName = ci >= 0 ? titleStr.slice(ci + 1).trim() : "";
  // mc_product'da mos topilmasa nom bo'sh keladi — bunda to'liq SKU nom
  // maydoniga chiqadi (yorliq nomsiz qolmasin).
  const nameText = mcName || sku;
  const prefixText = skuPrefix(sku);

  const parts = String(product.barcode ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const barcodeVal = parts[0] || "";
  const orderVal = parts.slice(1).join(",");

  /* ---------------- maydonlar (chap-past burchak, kenglik, balandlik) ---------------- */

  // Yuqori band QR'ni sig'dirishi kerak; qolgan balandlik o'rta va pastki
  // bandlar orasida NISBATAN bo'linadi. Shu sababdan QR kattalashsa
  // buyurtma ID va prefiks avtomatik pastga tushadi.
  const usableH = H - m * 2;
  const rowName = Math.max(opt.rowNameMm * MM, qr);
  const restH = usableH - rowName - gap * 2;
  const wantMid = opt.rowMidMm * MM;
  const wantBar = opt.rowBarcodeMm * MM;
  const scale = wantMid + wantBar > 0 ? restH / (wantMid + wantBar) : 0;
  const rowMid = Math.max(0, wantMid * scale);
  const rowBar = Math.max(0, wantBar * scale);

  const yName = H - m - rowName;
  const yMid = yName - gap - rowMid;
  const yBar = yMid - gap - rowBar;

  const innerW = W - m * 2;
  const midOrderW = innerW * opt.midOrderShare;
  const midPrefixW = innerW - midOrderW - gap;

  const box = {
    name: { x: m, y: yName, w: innerW - qr - gap, h: rowName },
    qr: { x: W - m - qr, y: yName, w: qr, h: qr },
    order: { x: m, y: yMid, w: midOrderW, h: rowMid },
    prefix: { x: m + midOrderW + gap, y: yMid, w: midPrefixW, h: rowMid },
    barcode: { x: m, y: yBar, w: innerW, h: rowBar },
  };

  /* ---------------- shriftlar ---------------- */

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const normal = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  // Tovar nomi kirillcha bo'ladi — Helvetica kirillni qo'llamaydi.
  const uni = await pdfDoc.embedFont(
    fs.readFileSync(path.resolve("./fonts/dejavu/ttf/DejaVuLGCSans.ttf"))
  );

  const qrDataUrl = await QRCode.toDataURL(barcodeVal || " ", { margin: 0 });
  const qrImage = await pdfDoc.embedPng(Buffer.from(qrDataUrl.split(",")[1], "base64"));

  /* ---------------- o'lchamlarni hisoblaymiz ---------------- */

  const name = fitParagraph(uni, nameText, box.name, opt.font.name, opt.nameMaxLines);
  const orderSize = fitLine(normal, orderVal, box.order, opt.font.order);
  const prefixSize = fitLine(bold, prefixText, box.prefix, opt.font.prefix);

  // Shtrix: bosh qism oddiy, oxirgi `boldTail` belgi qalin va kattaroq.
  const bcHead = barcodeVal.slice(0, -opt.boldTail);
  const bcTail = barcodeVal.slice(-opt.boldTail);
  const bcWidth = (s) =>
    normal.widthOfTextAtSize(bcHead, s) + bold.widthOfTextAtSize(bcTail, s * opt.boldTailScale);
  let bcSize = step(Math.min(opt.font.barcode.max, box.barcode.h / (1.05 * opt.boldTailScale)));
  while (bcSize > opt.font.barcode.min && bcWidth(bcSize) > box.barcode.w) bcSize -= 0.25;
  bcSize = Math.max(bcSize, opt.font.barcode.min);

  const metrics = {
    nameSize: name.size,
    nameLines: name.lines.length,
    nameTruncated: name.truncated,
    orderSize: orderVal ? orderSize : null,
    prefix: prefixText || null,
    prefixSize: prefixText ? prefixSize : null,
    barcodeSize: barcodeVal ? bcSize : null,
    barcodeTailSize: barcodeVal ? +(bcSize * opt.boldTailScale).toFixed(2) : null,
    qrMm: opt.qrMm,
    boxes: Object.fromEntries(
      Object.entries(box).map(([k, b]) => [
        k,
        { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.w.toFixed(1), h: +b.h.toFixed(1) },
      ])
    ),
    // Ishchi balandlik yetarlimi (bandlar + oraliqlar betga sig'dimi)
    fitsVertically: yBar >= m - 0.01,
  };

  /* ---------------- chizamiz ---------------- */

  for (let copy = 0; copy < Math.max(1, opt.copies); copy++) {
    const page = pdfDoc.addPage([W, H]);
    if (opt.pageRotate) page.setRotation(degrees(opt.pageRotate));

    if (opt.debugBoxes) {
      for (const b of Object.values(box)) {
        page.drawRectangle({
          x: b.x, y: b.y, width: b.w, height: b.h,
          borderWidth: 0.3, borderColor: rgb(0.75, 0.75, 0.75),
        });
      }
    }

    // 1. Nom — maydonning yuqorisidan pastga
    let ny = box.name.y + box.name.h;
    for (const line of name.lines) {
      ny -= name.size;
      page.drawText(line, { x: box.name.x, y: ny, size: name.size, font: uni, color: rgb(0, 0, 0) });
      ny -= name.size * 0.12;
    }

    // 2. QR
    page.drawImage(qrImage, { x: box.qr.x, y: box.qr.y, width: qr, height: qr });

    // 3. Buyurtma ID — maydon markazida vertikal bo'yicha (qalin dum YO'Q)
    if (orderVal) {
      page.drawText(orderVal, {
        x: box.order.x,
        y: box.order.y + (box.order.h - orderSize * 0.72) / 2,
        size: orderSize,
        font: normal,
        color: rgb(0, 0, 0),
      });
    }

    // 4. SKU prefiksi — QALIN, o'ng tomonda
    if (prefixText) {
      page.drawText(prefixText, {
        x: box.prefix.x,
        y: box.prefix.y + (box.prefix.h - prefixSize * 0.72) / 2,
        size: prefixSize,
        font: bold,
        color: rgb(0, 0, 0),
      });
    }

    // 5. Shtrix-kod — oxirgi 4 belgi qalin va kattaroq, umumiy asos chiziqda
    if (barcodeVal) {
      const tailSize = bcSize * opt.boldTailScale;
      const baseY = box.barcode.y + (box.barcode.h - tailSize * 0.72) / 2;
      let x = box.barcode.x;
      if (bcHead) {
        page.drawText(bcHead, { x, y: baseY, size: bcSize, font: normal, color: rgb(0, 0, 0) });
        x += normal.widthOfTextAtSize(bcHead, bcSize);
      }
      page.drawText(bcTail, { x, y: baseY, size: tailSize, font: bold, color: rgb(0, 0, 0) });
    }
  }

  if (typeof opt.onMetrics === "function") opt.onMetrics(metrics);
  return await pdfDoc.save();
}

export { createShkSmall, DEFAULTS as SHK_SMALL_DEFAULTS };
