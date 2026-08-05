// Original logotipdan barcha ikonkalarni yasaydi — logotip TEGILMAYDI, faqat
// o'lchami kichraytiriladi.
//
// Kirish (siz qo'yasiz):
//   brand/logo-icon.png     — kvadrat ikonka (yashil fon + qora "S"), ≥512×512
//
// Chiqish:
//   desktop/src/assets/icon.ico                              256×256
//   desktop/src/assets/tray.png                               32×32
//   android/.../res/mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher.png
//   android/.../res/mipmap-{...}/ic_launcher_foreground.png   adaptive ikonka uchun
//   android/.../res/mipmap-anydpi-v26/ic_launcher.xml         (qayta yoziladi)
//
// Ishlatilishi:
//   node brand/scripts/makeIcons.js
//
// Tashqi kutubxona yo'q: PNG o'qish/yozish va o'lchamni kichraytirish shu
// faylda, faqat zlib bilan. Sabab — build mashinasiga qo'shimcha bog'liqlik
// (sharp/canvas) o'rnatish shart bo'lmasin.
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const ROOT = path.join(__dirname, "..", "..");
const SOURCE = path.join(ROOT, "brand", "logo-icon.png");

/* ==================== PNG o'qish ==================== */

function readPng(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file} PNG emas`);

  let pos = 8;
  let ihdr = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        depth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    pos += 12 + len;
  }
  if (!ihdr) throw new Error("IHDR topilmadi");
  if (ihdr.depth !== 8) throw new Error(`${ihdr.depth}-bitli PNG qo'llanmaydi — 8-bit sifatida saqlang`);
  if (ihdr.interlace !== 0) throw new Error("Interlaced PNG qo'llanmaydi — oddiy (non-interlaced) saqlang");

  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[ihdr.colorType];
  if (!channels) throw new Error(`colorType ${ihdr.colorType} qo'llanmaydi (palitrali PNG'ni RGBA qilib saqlang)`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const { width, height } = ihdr;
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));

    // PNG filtrlarini yechish (spetsifikatsiya 9.2).
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      switch (filter) {
        case 1: line[i] = (line[i] + a) & 0xff; break;
        case 2: line[i] = (line[i] + b) & 0xff; break;
        case 3: line[i] = (line[i] + ((a + b) >> 1)) & 0xff; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          line[i] = (line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
          break;
        }
      }
    }
    prev = line;

    for (let x = 0; x < width; x++) {
      const s = x * channels;
      const d = (y * width + x) * 4;
      if (channels === 1) {
        out[d] = out[d + 1] = out[d + 2] = line[s];
        out[d + 3] = 255;
      } else if (channels === 2) {
        out[d] = out[d + 1] = out[d + 2] = line[s];
        out[d + 3] = line[s + 1];
      } else {
        out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2];
        out[d + 3] = channels === 4 ? line[s + 3] : 255;
      }
    }
  }
  return { width, height, data: out };
}

/* ==================== o'lcham o'zgartirish ==================== */

// Maydon bo'yicha o'rtachalash (box filter): kichraytirishda eng toza natija,
// alfa kanali oldindan ko'paytirilib qo'shiladi — chetlarda qora halqa
// paydo bo'lmasligi uchun.
function resize(img, size) {
  const out = Buffer.alloc(size * size * 4);
  const sx = img.width / size;
  const sy = img.height / size;

  for (let y = 0; y < size; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < size; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let r = 0, g = 0, b = 0, a = 0, n = 0;

      for (let yy = y0; yy < y1 && yy < img.height; yy++) {
        for (let xx = x0; xx < x1 && xx < img.width; xx++) {
          const i = (yy * img.width + xx) * 4;
          const alpha = img.data[i + 3] / 255;
          r += img.data[i] * alpha;
          g += img.data[i + 1] * alpha;
          b += img.data[i + 2] * alpha;
          a += img.data[i + 3];
          n++;
        }
      }
      const d = (y * size + x) * 4;
      const av = a / n;
      const k = av > 0 ? 255 / av : 0;
      out[d] = Math.round((r / n) * k);
      out[d + 1] = Math.round((g / n) * k);
      out[d + 2] = Math.round((b / n) * k);
      out[d + 3] = Math.round(av);
    }
  }
  return { width: size, height: size, data: out };
}

// Ikonkani shaffof kanvas markaziga joylaydi (adaptive ikonka uchun:
// chetdagi ~27% kesilishi mumkin, shuning uchun logotip kichraytiriladi).
function inset(img, canvasSize, ratio) {
  const inner = Math.round(canvasSize * ratio);
  const small = resize(img, inner);
  const out = Buffer.alloc(canvasSize * canvasSize * 4);
  const off = Math.round((canvasSize - inner) / 2);
  for (let y = 0; y < inner; y++) {
    small.data.copy(
      out,
      ((y + off) * canvasSize + off) * 4,
      y * inner * 4,
      (y + 1) * inner * 4
    );
  }
  return { width: canvasSize, height: canvasSize, data: out };
}

/* ==================== PNG / ICO yozish ==================== */

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

function writePng(img) {
  const { width, height, data } = img;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filtr: None
    data.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  const chunk = (type, payload) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(payload.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), payload]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ICO ichida PNG bo'lishi mumkin (Windows Vista+). 256 uchun o'lcham bayti 0.
function writeIco(pngBuf, size) {
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0);
  dir.writeUInt16LE(1, 2);
  dir.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(16);
  entry[0] = size >= 256 ? 0 : size;
  entry[1] = size >= 256 ? 0 : size;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngBuf.length, 8);
  entry.writeUInt32LE(6 + 16, 12);

  return Buffer.concat([dir, entry, pngBuf]);
}

/* ==================== ishga tushirish ==================== */

module.exports = { readPng, resize, inset, writePng, writeIco };

// Sinov uchun boshqa fayldan chaqirilganda ishga tushmaydi.
if (require.main !== module) return;

if (!fs.existsSync(SOURCE)) {
  console.error(
    `Manba topilmadi: ${path.relative(ROOT, SOURCE)}\n\n` +
      "Original logotip faylini shu yerga qo'ying (kvadrat ikonka varianti,\n" +
      "yashil fon + qora \"S\", 8-bitli oddiy PNG, kamida 512×512).\n" +
      "Shundan keyin bu skript logotipni O'ZGARTIRMASDAN barcha ikonkalarni yasaydi."
  );
  process.exit(1);
}

const src = readPng(SOURCE);
if (src.width !== src.height) {
  console.warn(`⚠️  Manba kvadrat emas (${src.width}×${src.height}) — ikonkalar cho'ziladi.`);
}
if (src.width < 512) {
  console.warn(`⚠️  Manba kichik (${src.width}px) — 512px yoki kattaroq bo'lgani yaxshi.`);
}
console.log(`Manba: ${path.relative(ROOT, SOURCE)} (${src.width}×${src.height})`);

const write = (rel, buf) => {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  console.log(`  ${rel}`);
};

// Desktop
write("desktop/src/assets/tray.png", writePng(resize(src, 32)));
write("desktop/src/assets/icon.ico", writeIco(writePng(resize(src, 256)), 256));

// Android: eski (legacy) ikonka — logotip to'liq, tegilmagan holda.
const RES = "android/app/src/main/res";
const DENSITIES = [
  ["mdpi", 48],
  ["hdpi", 72],
  ["xhdpi", 96],
  ["xxhdpi", 144],
  ["xxxhdpi", 192],
];
for (const [density, size] of DENSITIES) {
  write(`${RES}/mipmap-${density}/ic_launcher.png`, writePng(resize(src, size)));
  // Adaptive ikonka: kanvas 108dp, ichidagi xavfsiz maydon 72dp. Logotip
  // 72/108 = 0.667 nisbatida markazda — shunda launcher qanday qirqmasa ham
  // "S" butun ko'rinadi. Fon rangi @color/ic_launcher_background bilan
  // logotipning yashili ustma-ust tushadi.
  write(`${RES}/mipmap-${density}/ic_launcher_foreground.png`, writePng(inset(src, Math.round(size * 2.25), 2 / 3)));
}

write(
  `${RES}/mipmap-anydpi-v26/ic_launcher.xml`,
  Buffer.from(
    `<?xml version="1.0" encoding="utf-8"?>
<!-- brand/scripts/makeIcons.js yasaydi — qo'lda tahrirlamang.
     Foreground = original logotip (kichraytirilgan, o'zgartirilmagan). -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`,
    "utf8"
  )
);
write(
  `${RES}/mipmap-anydpi-v26/ic_launcher_round.xml`,
  Buffer.from(
    `<?xml version="1.0" encoding="utf-8"?>
<!-- brand/scripts/makeIcons.js yasaydi — qo'lda tahrirlamang. -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`,
    "utf8"
  )
);

console.log(
  "\nTayyor. Keyingi qadam:\n" +
    "  1. android/app/src/main/res/drawable/ic_launcher_foreground.xml ni o'chirish\n" +
    "     (endi mipmap PNG ishlatiladi, vektor qayta chizilgan variant kerak emas)\n" +
    "  2. APK va desktop o'rnatgichini qayta yig'ish"
);
