// Windows'da PDF chop etish.
//
// `pdf-to-printer` ichida SumatraPDF bor — alohida yuklab olish kerak emas
// va aynan shu vosita termo yorliqni to'g'ri chiqaradi. Electron'ning
// `webContents.print` ishlatilmadi: u masshtablab yuboradi va printerni
// aniq tanlash ishonchsiz, 40×30 mm yorliqda bu qabul qilib bo'lmaydi.
//
// Masshtab:
//   ShK -> "noscale" (yorliq aynan 40×30 mm qilib yasalgan)
//   BIG -> "fit"     (Uzum labeli 166×242 mm, 4×4" qog'ozga sig'diriladi)
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { print, getPrinters } = require("pdf-to-printer");

const TMP_DIR = path.join(os.tmpdir(), "stocker-print");
fs.mkdirSync(TMP_DIR, { recursive: true });

async function listPrinters() {
  try {
    const printers = await getPrinters();
    return printers.map((p) => ({ name: p.name, displayName: p.displayName || p.name }));
  } catch (e) {
    return { error: e.message };
  }
}

// PDF baytlarini vaqtinchalik faylga yozib chop etadi, so'ng o'chiradi.
async function printPdf(buffer, { printer, scale = "noscale", copies = 1, label = "job" }) {
  if (!printer) throw new Error("Printer tanlanmagan");

  const file = path.join(TMP_DIR, `${label}_${Date.now()}.pdf`);
  fs.writeFileSync(file, buffer);
  try {
    await print(file, { printer, scale, copies: Math.max(1, copies) });
  } finally {
    // Diagnostika kerak bo'lsa fayl qoladigan qilish uchun STOCKER_KEEP_PDF=1
    if (!process.env.STOCKER_KEEP_PDF) {
      try {
        fs.unlinkSync(file);
      } catch {
        /* ahamiyatsiz */
      }
    }
  }
  return file;
}

module.exports = { listPrinters, printPdf, TMP_DIR };
