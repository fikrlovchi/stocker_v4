// uzumOrderToMC/src/logger.js bilan bir xil shakl, lekin ikki farq bilan:
//  1. Log fayl nomi HAR YOZUVDA hisoblanadi — bu doimiy ishlaydigan daemon,
//     import paytida bir marta hisoblansa yarim tundan keyin ham kechagi
//     faylga yozib qolaverardi.
//  2. Bufer chegaralangan: panel bir "run"da 500 tadan ortiq log qabul
//     qilmaydi (ingest.js: MAX_LOGS), shuning uchun eng eskilari tashlanadi.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./config.js";

const LOG_DIR = path.join(ROOT, "logs");
fs.mkdirSync(LOG_DIR, { recursive: true });

const MAX_BUFFER = 400;

let buffer = [];
let dropped = 0;

function write(level, message) {
  const loggedAt = new Date().toISOString();
  const line = `[${loggedAt}] [${level}] ${message}`;
  console.log(line);

  try {
    fs.appendFileSync(path.join(LOG_DIR, `${loggedAt.slice(0, 10)}.log`), line + "\n");
  } catch (e) {
    console.error("log faylga yozib bo'lmadi:", e.message);
  }

  buffer.push({ level, message, loggedAt });
  if (buffer.length > MAX_BUFFER) {
    buffer.shift();
    dropped++;
  }
}

// Panel'ga yuborish uchun buferni oladi va tozalaydi.
function takeBuffer() {
  const current = buffer;
  const lost = dropped;
  buffer = [];
  dropped = 0;
  if (lost > 0) {
    current.unshift({
      level: "INFO",
      message: `⚠️ ${lost} ta log qatori bufer to'lgani uchun tashlandi`,
      loggedAt: new Date().toISOString(),
    });
  }
  return current;
}

export const logger = {
  info: (msg) => write("INFO", msg),
  error: (msg) => write("ERROR", msg),
  // Panel faqat INFO/ERROR qabul qiladi — ogohlantirish INFO sifatida ketadi.
  warn: (msg) => write("INFO", `⚠️ ${msg}`),
  takeBuffer,
};

export default logger;
