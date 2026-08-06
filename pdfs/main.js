// .env ni o'qiydi. Ilgari bu yo'q edi — barcha process.env qiymatlari
// (SERVICE_TOKEN, DASHBOARD_PASSWORD, PUBLIC_BASE_URL, LABEL_CACHE_DIR)
// faqat servisni ishga tushiruvchi muhitdan kelardi va `.env` fayli
// e'tiborsiz qolardi. dotenv mavjud process.env qiymatlarini BOSMAYDI,
// shuning uchun hozirgi ishga tushirish usuli buzilmaydi.
import "dotenv/config";
import express from "express";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";
import { createProductsPdf, uploadToDrive } from './functions/createPdf.js'
import { createShkSmall } from './functions/shkSmall.js'
import { parseOrderIds, buildProductsFromOrders, buildProductForItem, findOrderItems, getShopTokenMap, getOrderShopMap } from './functions/sheetData.js'
import { getLabelPdf, cleanupOldLabels } from './functions/uzumLabels.js'
import { withRetry } from './functions/retry.js'
import { drive, sheets } from "./google.js";
import { randomUUID, createHash } from "crypto";

const app = express();
app.use(express.json({ limit: "50mb" }));

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

/* ============ FAYL SAQLASH (serverda) + HTTP orqali berish ============ */
// Chiquvchi PDF'lar serverda saqlanadi va shu manzildan ochiladi:
//   {PUBLIC_BASE_URL}/files/<name>.pdf
// uzum.fikrlovchi.uz domeni ulangach, PUBLIC_BASE_URL ni env orqali bering.
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "http://64.226.69.129:4040";

/* ==================== PAROL HIMOYASI (dashboard) ==================== */
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || "changeme";
if (DASHBOARD_PASSWORD === "changeme") {
    console.warn("⚠️  DASHBOARD_PASSWORD o'rnatilmagan — 'changeme' ishlatilyapti. env orqali o'zgartiring!");
}
const AUTH_TOKEN = createHash("sha256").update("uzum:" + DASHBOARD_PASSWORD).digest("hex");
const publicDir = path.join(process.cwd(), "public");

function parseCookies(req) {
    const h = req.headers.cookie || "";
    const out = {};
    for (const part of h.split(";")) {
        const i = part.indexOf("=");
        if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
    }
    return out;
}

// stocker.uz da bu servis `/pdf/` ostida turadi va kirish PANEL sessiyasi
// bilan nginx `auth_request` orqali tekshiriladi (bitta dastur, bitta parol).
// O'sha holatda o'z parolimizni yana so'rash ikkinchi kirish oynasi degani —
// shuning uchun PANEL_AUTH=1 bo'lsa tekshiruv nginx'ga qoldiriladi.
//
// Xavfsizlik sharti: PANEL_AUTH=1 bo'lganda 4040-port tashqariga chiqmasligi
// kerak — servis 127.0.0.1 da tinglaydi, ya'ni nginx'dan boshqa yo'l yo'q.
const PANEL_AUTH = process.env.PANEL_AUTH === "1";

function requireAuth(req, res, next) {
    if (PANEL_AUTH) return next();
    if (parseCookies(req).uauth === AUTH_TOKEN) return next();
    if (req.method === "GET" && (req.headers.accept || "").includes("text/html")) {
        return res.redirect("/login");
    }
    return res.status(401).json({ status: "error", message: "auth kerak" });
}

// Brend fayllari (stocker_v4/brand/ dan ko'chirilgan) — tokensiz beriladi,
// ular kirish sahifasida ham kerak.
app.get("/logo.svg", (req, res) => res.sendFile(path.join(publicDir, "logo.svg")));
app.get("/logo-icon.png", (req, res) => res.sendFile(path.join(publicDir, "logo-icon.png")));
app.get("/logo-wordmark.png", (req, res) => res.sendFile(path.join(publicDir, "logo-wordmark.png")));
app.get("/login", (req, res) => res.sendFile(path.join(publicDir, "login.html")));
app.post("/login", (req, res) => {
    if ((req.body?.password || "") === DASHBOARD_PASSWORD) {
        const secure = (req.headers["x-forwarded-proto"] || "").includes("https") ? " Secure;" : "";
        res.setHeader("Set-Cookie",
            `uauth=${AUTH_TOKEN}; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=${30 * 24 * 3600}`);
        return res.json({ ok: true });
    }
    return res.status(401).json({ ok: false, message: "Parol xato" });
});
app.get("/logout", (req, res) => {
    res.setHeader("Set-Cookie", "uauth=; HttpOnly; Path=/; Max-Age=0");
    res.redirect("/login");
});
app.get("/", requireAuth, (req, res) => res.sendFile(path.join(publicDir, "index.html")));

// Generatsiya qilingan PDF'lar (auth talab qilinadi)
app.use("/files", requireAuth, express.static(uploadDir));

/* ==================== TARIX (history.json) ==================== */
const HISTORY_FILE = path.join(process.cwd(), "history.json");
function loadHistory() {
    try { return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8")); }
    catch { return []; }
}
function saveHistoryEntry(entry) {
    const h = loadHistory();
    h.unshift(entry);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(h.slice(0, 1000), null, 2));
}

/* ==================== BATCH (ShK + BIG birga) ==================== */
const batches = new Map();   // batchId -> { shk, big, ... }
setInterval(() => {
    const now = Date.now();
    for (const [id, b] of batches) if (now - b.at > 60 * 60 * 1000) batches.delete(id);
}, 10 * 60 * 1000);

/* ==================== YADRO: generate / merge ==================== */
// ShK: order detallaridan QR-yorliqlar PDF
async function runGenerate(orderIds, pdfConfig) {
    const products = await buildProductsFromOrders(orderIds);
    if (!products.length) throw new Error("Berilgan orderlar uchun detail topilmadi");
    const pdfBytes = await createProductsPdf(products, pdfConfig);
    const { fileName, url } = saveGeneratedPdf(Buffer.from(pdfBytes), "shk");
    console.log(`[shk] ${orderIds.length} order -> ${products.length} bet -> ${fileName}`);
    return { fileName, url, pages: products.length, orders: orderIds.length };
}

// YANGI format ShK: 40×30 yorliq — desktop client skan paytida chiqaradigan
// yorliqning aynan o'zi (createShkSmall). Bu yerda butun buyurtmalar ro'yxati
// uchun bitta PDF'ga yig'iladi, ya'ni smena boshida hammasini bir yo'la
// chiqarib olish mumkin.
//
// ESKI format (createProductsPdf, A5) o'z joyida qoldi — `format` maydoni
// bilan tanlanadi.
async function runGenerateSmall(orderIds, options = {}) {
    const merged = await PDFDocument.create();
    let pages = 0;
    const skipped = [];

    for (const orderId of orderIds) {
        let items = [];
        try {
            items = await findOrderItems(orderId);
        } catch (e) {
            skipped.push(orderId);
            console.error(`[shk-small] ${orderId}: ${e.message}`);
            continue;
        }
        if (!items.length) {
            skipped.push(orderId);
            continue;
        }
        for (const item of items) {
            const bytes = await createShkSmall(item, options);
            const doc = await PDFDocument.load(bytes);
            const copied = await merged.copyPages(doc, doc.getPageIndices());
            copied.forEach((pg) => merged.addPage(pg));
            pages += copied.length;
        }
    }

    if (!pages) throw new Error("Berilgan orderlar uchun detail topilmadi");
    const { fileName, url } = saveGeneratedPdf(Buffer.from(await merged.save()), "shk40");
    console.log(`[shk-small] ${orderIds.length} order -> ${pages} bet -> ${fileName}`);
    return { fileName, url, pages, orders: orderIds.length, skipped: skipped.length };
}

// BIG: har order label'ini Uzum API'dan olib (cache) bitta PDF'ga merge
async function runMerge(orderIds) {
    const [shopMap, orderShop] = await Promise.all([getShopTokenMap(), getOrderShopMap(orderIds)]);
    const merged = await PDFDocument.create();
    let count = 0;
    const skipped = [];
    for (const oid of orderIds) {
        try {
            const shopId = orderShop.get(oid);
            const token = shopId ? shopMap.get(shopId) : null;
            const buf = await getLabelPdf(oid, token);
            const pdf = await PDFDocument.load(buf);
            const pages = await merged.copyPages(pdf, pdf.getPageIndices());
            pages.forEach(p => merged.addPage(p));
            count++;
        } catch (e) {
            console.error(`[big] ${oid}: ${e.message}`);
            skipped.push(oid);
        }
    }
    if (!count) throw new Error("Hech qanday label olinmadi (token/shopId tekshiring)");
    const bytes = await merged.save();
    const { fileName, url } = saveGeneratedPdf(Buffer.from(bytes), "big");
    console.log(`[big] ${orderIds.length} order -> ${count} fayl (skip ${skipped.length}) -> ${fileName}`);
    return { fileName, url, merged: count, orders: orderIds.length, skipped: skipped.length };
}

// Standart PDF sozlamasi (dashboard keyin body.pdfConfig orqali o'zgartira oladi)
const DEFAULT_PDF_CONFIG = {
    qrSize: 360,
    pageSize: { width: 594, height: 420 },
    textSize: { top: 24, bottom: 50 },
    orientation: "portrait",
    qrPosition: { x: 90, y: 40 },
};

// PDF'ni diskka saqlab, ochiq URL qaytaradi
function saveGeneratedPdf(buffer, prefix) {
    const fileName = `${prefix}_${Date.now()}.pdf`;
    fs.writeFileSync(path.join(uploadDir, fileName), buffer);
    return { fileName, url: `${PUBLIC_BASE_URL}/files/${fileName}` };
}

// Eski fayllarni avto-tozalash (disk to'lmasligi uchun)
const FILE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 kun
function cleanupOldFiles() {
    const now = Date.now();
    let entries = [];
    try { entries = fs.readdirSync(uploadDir); } catch { return; }
    for (const f of entries) {
        try {
            const p = path.join(uploadDir, f);
            const st = fs.statSync(p);
            // faqat fayllar (labels/ tagpapkasiga tegmaymiz — u cache)
            if (st.isFile() && now - st.mtimeMs > FILE_RETENTION_MS) fs.unlinkSync(p);
        } catch (e) {
            console.error("cleanup xato:", f, e.message);
        }
    }
}
cleanupOldFiles();
setInterval(cleanupOldFiles, 6 * 60 * 60 * 1000);
cleanupOldLabels();                                   // label cache: 3 kun
setInterval(cleanupOldLabels, 6 * 60 * 60 * 1000);

// Drive'dagi fileId'larni yuklab olib bitta PDF'ga merge qiladi
async function mergeDriveFiles(fileIds) {
    const merged = await PDFDocument.create();
    for (const fileId of fileIds) {
        const file = await withRetry(
            () => drive.files.get(
                { fileId, alt: "media", supportsAllDrives: true },
                { responseType: "arraybuffer" }
            ),
            { label: `drive get ${fileId}` }
        );
        const pdf = await PDFDocument.load(Buffer.from(file.data));
        const pages = await merged.copyPages(pdf, pdf.getPageIndices());
        pages.forEach(p => merged.addPage(p));
    }
    return await merged.save();
}

/* ================== NATIJA SHEET SOZLAMALARI ==================
 * Ilgari bu ish GAS ichida bajarilardi. Endi AppSheet to'g'ridan-to'g'ri
 * serverga POST qiladi, server esa natijani shu sheetga yozadi.
 * AppSheet aynan shu sheetdan (id + url) o'qiydi.
 */
const RESULT_SHEET_ID = "18j8NDVJl9ZD-wuwlP3T1A1-sVoJlW_doFrwQrf-AvsE";
const GENERATE_RESULT_TAB = "uzum_generated";
const MERGE_RESULT_TAB = "uzum_merged";

// Generate PDF'lar saqlanadigan Drive papka (AppSheet yubormasa shu ishlatiladi)
const GENERATE_TARGET_FOLDER_ID = "1sMssmy_ukXoo9ARSzguZUCjGjfYVVz8s";

const MERGE_PASSWORD = "5e59a31e-e0d6-436a-8df2-174b6fe9fa24";

/* ---------------- HELPERS (GAS'dan ko'chirildi) ---------------- */

// AppSheet'dan keladigan stringni vergul bo'yicha massivga ajratish
function splitAndClean(text) {
    if (!text) return [];
    return String(text).split(",").map(v => v.trim()).filter(Boolean);
}

// Massiv elementlarini har 2 tadan vergul bilan qo'shib guruhlash
function groupInPairs(arr) {
    const grouped = [];
    for (let i = 0; i < arr.length; i += 2) {
        let pair = arr[i];
        if (arr[i + 1]) pair += "," + arr[i + 1];
        grouped.push(pair);
    }
    return grouped;
}

// 🔒 Natija sheetdagi A ustunda shu id allaqachon bormi? (dublikat webhookdan himoya)
async function isDuplicate(spreadsheetId, tabName, id) {
    const resp = await withRetry(
        () => sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${tabName}!A:A`,
        }),
        { label: `dup check ${tabName}` }
    );
    const rows = resp.data.values || [];
    // 1-qator sarlavha (header), 2-qatordan boshlab tekshiramiz
    for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] != null && String(rows[i][0]) === String(id)) return true;
    }
    return false;
}

// Natija sheetga [id, url] qatorini yozish
async function appendResult(spreadsheetId, tabName, id, url) {
    await withRetry(
        () => sheets.spreadsheets.values.append({
            spreadsheetId,
            range: `${tabName}!A:B`,
            valueInputOption: "RAW",
            requestBody: { values: [[id, url]] },
        }),
        { label: `append ${tabName}` }
    );
}

app.post("/generate-product-pdfs", async (req, res) => {
    try {
        const data = req.body || {};
        const { id } = data;
        const TargetFolderId = data.TargetFolderId || GENERATE_TARGET_FOLDER_ID;

        if (!id) {
            return res.status(400).json({ status: "error", message: "ID missing" });
        }

        /* --------- 🔒 DUPLICATE CHECK --------- */
        if (await isDuplicate(RESULT_SHEET_ID, GENERATE_RESULT_TAB, id)) {
            return res.json({ status: "ignored", message: "Duplicate webhook call", id });
        }

        /* --------- 📦 JUFTLASH LOGIKASI (Details & Barcodes) --------- */
        let products = [];
        if (Array.isArray(data.products) && data.products.length) {
            products = data.products;
        } else {
            const groupedTitles = groupInPairs(splitAndClean(data.Details || ""));
            const groupedBarcodes = groupInPairs(splitAndClean(data.Barcodes || ""));
            const finalLength = Math.min(groupedTitles.length, groupedBarcodes.length);
            for (let j = 0; j < finalLength; j++) {
                products.push({ title: groupedTitles[j], barcode: groupedBarcodes[j] });
            }
        }

        if (!products.length) {
            return res.status(400).json({ status: "error", message: "products required" });
        }

        const pdfConfig = data.pdfConfig || {
            qrSize: 360,
            columns: 2,
            rows: 10,
            pageSize: { width: 594, height: 420 },
            textSize: { top: 24, bottom: 50 },
            orientation: "portrait",
            qrPosition: { x: 90, y: 40 }
        };

        const mergedPdf = await createProductsPdf(products, pdfConfig);

        const fileName = `products_${Date.now()}.pdf`;
        const url = await uploadToDrive(Buffer.from(mergedPdf), fileName, TargetFolderId, drive);

        /* --------- NATIJA SHEETGA [id, url] --------- */
        await appendResult(RESULT_SHEET_ID, GENERATE_RESULT_TAB, id, url);

        return res.json({ status: "ok", id, url });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ status: "error", message: err.message });
    }
});

app.post("/merge-drive-pdfs", async (req, res) => {
    try {
        const data = req.body || {};
        const { id, TargetFolderId, password } = data;

        if (password !== MERGE_PASSWORD) {
            return res.status(403).json({ status: "error", message: "Unauthorized" });
        }

        if (!id) {
            return res.status(400).json({ status: "error", message: "ID missing" });
        }

        /* --------- 🔒 DUPLICATE CHECK --------- */
        if (await isDuplicate(RESULT_SHEET_ID, MERGE_RESULT_TAB, id)) {
            return res.json({ status: "ignored", message: "Duplicate webhook call", id });
        }

        /* --------- fileIds: TEXT → ARRAY --------- */
        const fileIds = Array.isArray(data.fileIds)
            ? data.fileIds
            : splitAndClean(data.fileIds);

        if (!fileIds.length) {
            return res.status(400).json({ status: "error", message: "fileIds required" });
        }

        const pdfBuffers = [];

        for (const fileId of fileIds) {
            const file = await drive.files.get(
                { fileId, alt: "media", supportsAllDrives: true },
                { responseType: "arraybuffer" }
            );
            pdfBuffers.push(Buffer.from(file.data));
        }

        const mergedPdf = await PDFDocument.create();
        for (const buf of pdfBuffers) {
            const pdf = await PDFDocument.load(buf);
            const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            pages.forEach((p) => mergedPdf.addPage(p));
        }
        const mergedPdfBytes = await mergedPdf.save();

        const fileName = `merged_${Date.now()}.pdf`;
        const tempPath = `uploads/${fileName}`;
        fs.writeFileSync(tempPath, mergedPdfBytes);

        const uploaded = await drive.files.create({
            requestBody: {
                name: fileName,
                mimeType: "application/pdf",
                parents: [TargetFolderId],
            },
            media: {
                mimeType: "application/pdf",
                body: fs.createReadStream(tempPath),
            },
            supportsAllDrives: true,
        });

        const newFileId = uploaded.data.id;

        await drive.permissions.create({
            fileId: newFileId,
            requestBody: { role: "reader", type: "anyone" },
            supportsAllDrives: true,
        });

        const url = `https://drive.google.com/file/d/${newFileId}/view`;

        /* --------- NATIJA SHEETGA [id, url] --------- */
        await appendResult(RESULT_SHEET_ID, MERGE_RESULT_TAB, id, url);

        return res.json({ status: "ok", id, url });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ status: "error", message: err.message });
    }
});

// NOTE: /mc-customerorder endpointi alohida servisga ko'chirildi
// (receiveMCPost loyihasi, port 4041). Bu yerda takrorlanmaydi.

/* ==================================================================
 * YANGI (AppSheet'siz): dashboard order ID'larni yuboradi, server
 * Google Sheets'dan bevosita o'qib PDF yasaydi va serverda saqlaydi.
 * ================================================================== */

// Bitta tugma: ShK (generate) + BIG (merge) birga, mustaqil ishlaydi
app.post("/process", requireAuth, (req, res) => {
    const orderIds = parseOrderIds(req.body.orderIds ?? req.body.orders);
    if (!orderIds.length) {
        return res.status(400).json({ status: "error", message: "orderIds required" });
    }
    const pdfConfig = req.body.pdfConfig || DEFAULT_PDF_CONFIG;
    // "small" — 40×30 (desktop client formati), "legacy" — eski A5 maket.
    const format = req.body.format === "small" ? "small" : "legacy";

    const batchId = randomUUID();
    const batch = {
        batchId, at: Date.now(), date: new Date().toISOString(), orders: orderIds.length,
        shk: { status: "pending" }, big: { status: "pending" }, saved: false,
    };
    batches.set(batchId, batch);
    res.json({ batchId });

    const maybeSave = () => {
        if (batch.shk.status === "pending" || batch.big.status === "pending" || batch.saved) return;
        batch.saved = true;
        saveHistoryEntry({
            date: batch.date,
            orders: batch.orders,
            shk: batch.shk.status === "done"
                ? { url: batch.shk.url, fileName: batch.shk.fileName, pages: batch.shk.pages } : null,
            big: batch.big.status === "done"
                ? { url: batch.big.url, fileName: batch.big.fileName, merged: batch.big.merged } : null,
        });
    };

    (async () => {
        try {
            batch.shk = {
                status: "done",
                format,
                ...(format === "small"
                    ? await runGenerateSmall(orderIds, pdfConfig?.small || {})
                    : await runGenerate(orderIds, pdfConfig)),
            };
        }
        catch (e) { console.error("[shk]", e.message); batch.shk = { status: "error", error: e.message }; }
        maybeSave();
    })();
    (async () => {
        try { batch.big = { status: "done", ...(await runMerge(orderIds)) }; }
        catch (e) { console.error("[big]", e.message); batch.big = { status: "error", error: e.message }; }
        maybeSave();
    })();
});

// Konstruktor uchun jonli preview: bitta namuna mahsulotdan 1 betlik PDF
app.post("/preview", requireAuth, async (req, res) => {
    try {
        const pdfConfig = req.body.pdfConfig || DEFAULT_PDF_CONFIG;
        const sample = req.body.sample || {
            title: "MT2-ELEGANT,SS: Namuna mahsulot nomi (uzunroq)",
            barcode: "1000088729458,108424143",
        };
        const pdfBytes = await createProductsPdf([sample], pdfConfig);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Cache-Control", "no-store");
        return res.send(Buffer.from(pdfBytes));
    } catch (err) {
        console.error("[preview]", err.message);
        return res.status(500).json({ status: "error", message: err.message });
    }
});

/* ==================================================================
 * INTERNAL API — stocker-server (yig'ish tizimi) uchun.
 * Cookie auth emas, X-Service-Token bilan. Dashboard'ga aloqasi yo'q.
 *
 * Yorliq MATNI shu yerda hisoblanadi (stocker tayyor matn yubormaydi) —
 * shunda format bitta joyda qoladi va ikki loyiha bir-biridan ajralib
 * ketmaydi. Qarang: functions/sheetData.js -> buildProduct().
 * ================================================================== */
const SERVICE_TOKEN = process.env.SERVICE_TOKEN || "";

function requireServiceToken(req, res, next) {
    if (!SERVICE_TOKEN) {
        return res.status(503).json({ status: "error", message: "SERVICE_TOKEN o'rnatilmagan" });
    }
    if ((req.header("X-Service-Token") || "") !== SERVICE_TOKEN) {
        return res.status(401).json({ status: "error", message: "Service token noto'g'ri" });
    }
    next();
}

// ShK: bitta tovar uchun kichik termo yorliq (40×30 mm), `copies` betda.
app.post("/internal/shk-item", requireServiceToken, async (req, res) => {
    try {
        const { orderId, itemId, copies, shkConfig } = req.body || {};
        if (!orderId || !itemId) {
            return res.status(400).json({ status: "error", message: "orderId va itemId kerak" });
        }

        const product = await buildProductForItem(orderId, itemId);
        if (!product) {
            return res.status(404).json({ status: "error", message: `detail topilmadi (${orderId}/${itemId})` });
        }

        const bytes = await createShkSmall(product, { ...(shkConfig || {}), copies: copies ?? 2 });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Cache-Control", "no-store");
        return res.send(Buffer.from(bytes));
    } catch (err) {
        console.error("[shk-item]", err.message);
        return res.status(500).json({ status: "error", message: err.message });
    }
});

// Sinov sahifasi — printer va qog'oz o'lchamini tekshirish uchun.
// Haqiqiy buyurtma kerak emas, shuning uchun ish joyini sozlashda ishlatiladi.
app.get("/internal/test-page", requireServiceToken, async (req, res) => {
    try {
        const target = req.query.target === "big" ? "big" : "shk";
        let bytes;

        if (target === "shk") {
            bytes = await createShkSmall(
                {
                    title: "SINOV-SHK-001,Sinov sahifasi — 40×30 mm",
                    barcode: "1234567890128,000000000",
                },
                { copies: 1 }
            );
        } else {
            // BIG uchun 4×4" (288×288 pt) ramka: qog'oz to'g'ri o'rnatilganini
            // va masshtab buzilmaganini ko'z bilan tekshirish uchun.
            const doc = await PDFDocument.create();
            const page = doc.addPage([288, 288]);
            const font = await doc.embedFont(StandardFonts.Helvetica);
            page.drawRectangle({ x: 8, y: 8, width: 272, height: 272, borderWidth: 1.5, borderColor: rgb(0, 0, 0) });
            page.drawLine({ start: { x: 144, y: 8 }, end: { x: 144, y: 280 }, thickness: 0.5 });
            page.drawLine({ start: { x: 8, y: 144 }, end: { x: 280, y: 144 }, thickness: 0.5 });
            page.drawText("SINOV — BIG", { x: 20, y: 250, size: 18, font });
            page.drawText("101.6 x 101.6 mm (4x4\")", { x: 20, y: 228, size: 11, font });
            page.drawText("Ramka qog'oz chekkasidan 3 mm ichkarida", { x: 20, y: 30, size: 8, font });
            bytes = await doc.save();
        }

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Cache-Control", "no-store");
        return res.send(Buffer.from(bytes));
    } catch (err) {
        console.error("[test-page]", err.message);
        return res.status(500).json({ status: "error", message: err.message });
    }
});

// BIG: bitta buyurtmaning Uzum label'i (LARGE), shared cache'dan.
app.get("/internal/big/:orderId", requireServiceToken, async (req, res) => {
    const orderId = String(req.params.orderId).trim();
    try {
        let buf;
        try {
            // Odatda label uzumOrderToMC import paytida oldindan cache'ga
            // olingan bo'ladi — bunda token kerak emas va sheet o'qilmaydi.
            buf = await getLabelPdf(orderId, null);
        } catch {
            const [shopMap, orderShop] = await Promise.all([getShopTokenMap(), getOrderShopMap([orderId])]);
            const shopId = orderShop.get(orderId);
            const token = shopId ? shopMap.get(shopId) : null;
            buf = await getLabelPdf(orderId, token);
        }
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Cache-Control", "no-store");
        return res.send(buf);
    } catch (err) {
        console.error(`[big ${orderId}]`, err.message);
        return res.status(404).json({ status: "error", message: err.message });
    }
});

// batch holatini tekshirish (dashboard poll qiladi)
app.get("/batch/:id", requireAuth, (req, res) => {
    const b = batches.get(req.params.id);
    if (!b) return res.status(404).json({ status: "error", message: "batch topilmadi" });
    return res.json(b);
});

// tarix
app.get("/history", requireAuth, (req, res) => res.json(loadHistory()));

// HOST: nginx orqasiga o'tgach `127.0.0.1` qilib qo'ying (tashqaridan faqat
// uzum.fikrlovchi.uz orqali kirilsin). Hozircha eski xatti-harakat saqlanadi,
// aks holda http://<ip>:4040 dagi dashboard ishlamay qoladi.
const HOST = process.env.HOST || "0.0.0.0";
app.listen(4040, HOST, () => {
    console.log(`Server running on ${HOST}:4040`);
    // PANEL_AUTH kirish tekshiruvini nginx'ga topshiradi. Agar servis shu
    // holatda tashqi interfeysda tinglasa, dashboard butunlay parolsiz
    // ochilib qoladi — shuning uchun baland ovozda ogohlantiramiz.
    if (PANEL_AUTH && HOST !== "127.0.0.1" && HOST !== "localhost") {
        console.warn(
            `⚠️  PANEL_AUTH=1, lekin HOST=${HOST} — dashboard tashqaridan PAROLSIZ ochiladi! ` +
            "HOST=127.0.0.1 qilib qo'ying (nginx orqali kirish saqlanadi)."
        );
    }
});


// 1-funksiya Bu yerda google drive file id beriladi ularni merge qilish bo'ladi. Faqat pdf bo'lishi kerak.

// 1- PDF IDlarni olib ularni merge qilish

// Post orqali yuborish:
// GoogleDrive Target Folder_ID
// GoogleDrive PDF ID


// 2-funksiyada postda o'lchamlarni berish va joylashuvlarni berish. Albomniy/Knejniy holati typeni berish

// O'zgaruvchilarni POST orqali olish:
// QR o'lchami
// QR joylashuvi

// PDF o'lchami
// PDF orientatsiyasi (Albom; Kitob)

// GoogleDrive PDF saqlanadigan folder_IDni yuborish

// Serverni sotib olish va sozlash
// Serverda dasturni ishga tushurish
// API chiqarib berish

// APIlarga login parolli qilish. Login and password yuboradi.
