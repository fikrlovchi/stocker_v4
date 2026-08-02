// Tray ikonkasini yasaydi (32×32 PNG). Tashqi rasm yuklab olmaslik uchun
// PNG shu yerda qo'lda kodlanadi — zlib'dan boshqa hech narsa kerak emas.
//
//   node scripts/makeIcon.js
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const SIZE = 32;
const BG = [17, 24, 39, 255]; // to'q ko'k-kulrang
const FG = [255, 255, 255, 255];

// Shtrix-kodga o'xshash vertikal chiziqlar (kenglik: 1 = ingichka, 2 = qalin)
const BARS = [2, 1, 1, 2, 1, 3, 1, 1, 2, 2, 1, 1, 3];

function pixels() {
  const buf = Buffer.alloc(SIZE * SIZE * 4);
  const put = (x, y, c) => {
    const i = (y * SIZE + x) * 4;
    buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = c[3];
  };

  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) put(x, y, BG);

  // Chiziqlarni markazga joylash
  const total = BARS.reduce((a, b) => a + b, 0);
  let x = Math.floor((SIZE - total) / 2);
  BARS.forEach((w, i) => {
    if (i % 2 === 0) {
      for (let dx = 0; dx < w && x + dx < SIZE; dx++) {
        for (let y = 6; y < SIZE - 6; y++) put(x + dx, y, FG);
      }
    }
    x += w;
  });
  return buf;
}

function png(rgba) {
  // Har qatorga filtr bayti (0 = None) qo'shiladi
  const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
  for (let y = 0; y < SIZE; y++) {
    raw[y * (SIZE * 4 + 1)] = 0;
    rgba.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
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
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
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

const out = path.join(__dirname, "..", "src", "assets", "tray.png");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png(pixels()));
console.log(`Tayyor: ${out}`);
