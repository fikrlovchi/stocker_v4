// Ikonkalarni yasaydi — tashqi rasm yuklab olmaslik uchun PNG shu yerda
// qo'lda kodlanadi (zlib'dan boshqa hech narsa kerak emas).
//
//   src/assets/tray.png   32×32   — tray ikonkasi
//   src/assets/icon.ico   256×256 — ilova/o'rnatgich ikonkasi
//
//   node scripts/makeIcon.js
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

// Brend palitrasi (brand/README.md): yashil kvadrat, ichida qora "S" belgisi.
const BG = [0, 255, 140, 255];  // Primary Green #00FF8C
const FG = [10, 10, 10, 255];   // Background #0A0A0A

// Belgi geometriyasi brand/stocker-mark.svg bilan bir xil koordinatalarda
// (108×108) yozilgan, keyin ikonka o'lchamiga masshtablanadi.
const VB = 108;
const STROKE = 8;          // chiziq qalinligi
const CORNER = 24;         // kvadrat burchak radiusi
const DOTS = [
  [70, 34, 6],             // yuqori o'ng uch
  [38, 74, 6],             // pastki chap uch
  [62, 54, 5],             // o'rta tugun
];

// "S" yo'li: yuqori gorizontal → chap yarim doira → o'rta gorizontal →
// o'ng yarim doira → pastki gorizontal. Doiralar ko'p qismli siniq chiziq
// bilan yaqinlashtiriladi — masofa hisobi shu bilan sodda va ishonchli.
function markPath() {
  const pts = [[70, 34], [46, 34]];
  const arc = (cx, cy, r, from, to) => {
    const steps = 24;
    for (let i = 1; i <= steps; i++) {
      const a = from + ((to - from) * i) / steps;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  };
  arc(46, 44, 10, -Math.PI / 2, -Math.PI * 1.5); // chap yarim doira
  pts.push([62, 54]);
  arc(62, 64, 10, -Math.PI / 2, Math.PI / 2);    // o'ng yarim doira
  pts.push([38, 74]);
  return pts;
}

const PATH = markPath();

function distToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Belgi ichidami: chiziqdan STROKE/2 masofada yoki nuqtalar ichida.
function markDistance(x, y) {
  let d = Infinity;
  for (let i = 0; i < PATH.length - 1; i++) {
    d = Math.min(d, distToSegment(x, y, PATH[i], PATH[i + 1]) - STROKE / 2);
  }
  for (const [cx, cy, r] of DOTS) {
    d = Math.min(d, Math.hypot(x - cx, y - cy) - r);
  }
  return d;
}

// Dumaloq burchakli kvadratning ichki/tashqi masofasi.
function squareDistance(x, y) {
  const half = VB / 2 - CORNER;
  const qx = Math.max(Math.abs(x - VB / 2) - half, 0);
  const qy = Math.max(Math.abs(y - VB / 2) - half, 0);
  return Math.hypot(qx, qy) - CORNER;
}

function pixels(size) {
  const buf = Buffer.alloc(size * size * 4);
  const k = VB / size;                 // piksel → 108 birlik
  const aa = k;                        // bir pikselga teng yumshatish oynasi
  // Masofadan qoplama: chegara atrofida bitta piksel yumshatiladi, aks holda
  // 32×32 tray ikonkasida chetlari tishli chiqadi.
  const coverage = (d) => Math.max(0, Math.min(1, 0.5 - d / aa));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const ux = (x + 0.5) * k;
      const uy = (y + 0.5) * k;
      const bgA = coverage(squareDistance(ux, uy));
      const fgA = coverage(markDistance(ux, uy)) * bgA;

      const i = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) {
        buf[i + c] = Math.round(BG[c] * (1 - fgA) + FG[c] * fgA);
      }
      buf[i + 3] = Math.round(255 * bgA);
    }
  }
  return buf;
}

let TABLE = null;
function crc32(buf) {
  if (!TABLE) {
    TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABLE[n] = c;
    }
  }
  let c = -1;
  for (const b of buf) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

function png(size) {
  const rgba = pixels(size);
  // Har qatorga filtr bayti (0 = None)
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ICO ichida PNG bo'lishi mumkin (Windows Vista+). 256×256 uchun o'lcham
// baytlari 0 deb yoziladi — ICO formatida 256 shunday ifodalanadi.
function ico(pngBuf, size) {
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0);  // reserved
  dir.writeUInt16LE(1, 2);  // type = icon
  dir.writeUInt16LE(1, 4);  // count

  const entry = Buffer.alloc(16);
  entry[0] = size >= 256 ? 0 : size;
  entry[1] = size >= 256 ? 0 : size;
  entry[2] = 0;             // palitra yo'q
  entry[3] = 0;             // reserved
  entry.writeUInt16LE(1, 4);   // color planes
  entry.writeUInt16LE(32, 6);  // bits per pixel
  entry.writeUInt32BE(0, 8);
  entry.writeUInt32LE(pngBuf.length, 8);
  entry.writeUInt32LE(6 + 16, 12); // ma'lumot boshlanish o'rni

  return Buffer.concat([dir, entry, pngBuf]);
}

const dir = path.join(__dirname, "..", "src", "assets");
fs.mkdirSync(dir, { recursive: true });

const trayPath = path.join(dir, "tray.png");
fs.writeFileSync(trayPath, png(32));
console.log(`Tayyor: ${trayPath}`);

const icoPath = path.join(dir, "icon.ico");
fs.writeFileSync(icoPath, ico(png(256), 256));
console.log(`Tayyor: ${icoPath}`);
