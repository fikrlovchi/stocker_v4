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

const BG = [17, 24, 39, 255]; // to'q ko'k-kulrang
const FG = [255, 255, 255, 255];

// Shtrix-kodga o'xshash vertikal chiziqlar (nisbiy kengliklar)
const BARS = [2, 1, 1, 2, 1, 3, 1, 1, 2, 2, 1, 1, 3];

function pixels(size) {
  const buf = Buffer.alloc(size * size * 4);
  const put = (x, y, c) => {
    const i = (y * size + x) * 4;
    buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = c[3];
  };

  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) put(x, y, BG);

  const unit = Math.max(1, Math.round(size / 32));
  const total = BARS.reduce((a, b) => a + b, 0) * unit;
  const top = Math.round(size * 0.19);
  const bottom = size - top;

  let x = Math.floor((size - total) / 2);
  BARS.forEach((w, i) => {
    const px = w * unit;
    if (i % 2 === 0) {
      for (let dx = 0; dx < px && x + dx < size; dx++) {
        for (let y = top; y < bottom; y++) put(x + dx, y, FG);
      }
    }
    x += px;
  });
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
