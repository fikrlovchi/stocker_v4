// Google Sheets'dan bevosita o'qib, AppSheet virtual ustunlarini server ichida
// qayta hisoblaydi. AppSheet'siz ishlaydi.
import { sheets } from "../google.js";
import { withRetry } from "./retry.js";

// Manba spreadsheet (barcha tab'lar shu faylda)
const SOURCE_SHEET_ID = "18j8NDVJl9ZD-wuwlP3T1A1-sVoJlW_doFrwQrf-AvsE";

async function readRows(tab, range = "A:Z") {
    const resp = await withRetry(
        () => sheets.spreadsheets.values.get({
            spreadsheetId: SOURCE_SHEET_ID,
            range: `${tab}!${range}`,
        }),
        { label: `read ${tab}` }
    );
    return resp.data.values || [];
}

/* ---------- Paste'dan / massivdan order ID'lar ---------- */
// Qabul qiladi: massiv YOKI "116649323 ,\n116735910 ,\n..." kabi matn
function parseOrderIds(input) {
    if (Array.isArray(input)) {
        return input.map(x => String(x).trim()).filter(Boolean);
    }
    if (typeof input === "string") {
        return input.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
    }
    return [];
}

/* ---------- mc_product: UUID(B) -> Name(E), 10 daqiqa cache ---------- */
let mcCache = { map: null, at: 0 };
const MC_TTL = 10 * 60 * 1000;

async function getProductNameMap() {
    if (mcCache.map && Date.now() - mcCache.at < MC_TTL) return mcCache.map;
    const rows = await readRows("mc_product", "A:E");
    const map = new Map();
    for (let i = 1; i < rows.length; i++) {      // 1-qator header
        const uuid = rows[i][1];                  // B: UUID
        const name = rows[i][4];                  // E: Name
        if (uuid) map.set(String(uuid).trim(), name != null ? String(name) : "");
    }
    mcCache = { map, at: Date.now() };
    return map;
}

/* ---------- uzum_order_detail keshi (yig'ish uchun tez javob) ----------
 * Skan qilinganda yorliq darhol chiqishi kerak — har chop etishda butun
 * varaqni o'qish (2-4 s) juda sekin. 60 soniyalik kesh shu uchun.
 * Yangi buyurtma keshga tushmagan bo'lsa, buildProductForItem majburiy
 * qayta o'qiydi, ya'ni kesh to'g'rilikni buzmaydi.
 */
let detailCache = { rows: null, at: 0 };
const DETAIL_TTL = 60 * 1000;

async function getDetailRows({ force = false } = {}) {
    if (!force && detailCache.rows && Date.now() - detailCache.at < DETAIL_TTL) {
        return detailCache.rows;
    }
    const rows = await readRows("uzum_order_detail", "A:L");
    detailCache = { rows, at: Date.now() };
    return rows;
}

/* ---------- Bitta detail qatoridan yorliq ma'lumoti ----------
 * Yorliq matnining YAGONA manbasi. A5 (dashboard) ham, 40×30 mm (yig'ish)
 * ham shu funksiyadan foydalanadi — shunda ikki yo'l bir-biridan ajralib
 * ketmaydi.
 *   B=Barcode, C=uzum_product, H=uzum_order, I=Product href, K=Quantity for mc
 */
function buildProduct(r, nameMap) {
    const barcode = String(r[1] ?? "").trim();       // B
    const uzumProduct = String(r[2] ?? "").trim();   // C
    const uzumOrder = String(r[7] ?? "").trim();     // H
    const productHref = String(r[8] ?? "").trim();   // I
    const name = nameMap.get(productHref) || "";
    return {
        title: `${uzumProduct},${name}`,
        barcode: `${barcode},${uzumOrder}`,
        quantity: Number(r[10]) || 0,                // K
    };
}

/* ---------- Bitta tovar (itemId) uchun yorliq — yig'ish jarayoni ----------
 * itemId = uzum_order_detail!A (Uzum orderItem id).
 */
async function buildProductForItem(orderId, itemId) {
    const wantItem = String(itemId).trim();
    const wantOrder = String(orderId).trim();

    const find = (rows) => {
        for (let i = 1; i < rows.length; i++) {
            const r = rows[i];
            if (String(r[0] ?? "").trim() !== wantItem) continue;
            if (String(r[7] ?? "").trim() !== wantOrder) continue;
            return r;
        }
        return null;
    };

    const nameMap = await getProductNameMap();
    let row = find(await getDetailRows());
    // Keshda yo'q — yangi buyurtma bo'lishi mumkin, bir marta majburiy o'qiymiz.
    if (!row) row = find(await getDetailRows({ force: true }));
    return row ? buildProduct(row, nameMap) : null;
}

/* ---------- Buyurtmadagi tovarlar ro'yxati (itemId + yorliq ma'lumoti) ----------
 * Sinov skriptlari va diagnostika uchun: qaysi itemId lar bor va ular
 * qanday yorliq beradi.
 */
async function findOrderItems(orderId) {
    const want = String(orderId).trim();
    const [rows, nameMap] = await Promise.all([getDetailRows(), getProductNameMap()]);
    const out = [];
    for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (String(r[7] ?? "").trim() !== want) continue;   // H = uzum_order
        out.push({ itemId: String(r[0] ?? "").trim(), ...buildProduct(r, nameMap) });
    }
    return out;
}

/* ---------- Order ID'lardan PDF mahsulotlarini yasash ----------
 * Har detail:  title="uzum_product,Name", barcode="Barcode,uzum_order"
 *   va (Quantity for mc * 2) marta takrorlanadi.
 * Natija paste tartibida (order'lar ketma-ketligi) qaytadi.
 */
async function buildProductsFromOrders(orderIds) {
    const orderSet = new Set(orderIds);
    const [detailRows, nameMap] = await Promise.all([
        readRows("uzum_order_detail", "A:L"),
        getProductNameMap(),
    ]);

    // Detallarni order bo'yicha guruhlaymiz (sheet tartibini saqlab)
    const byOrder = new Map();
    for (let i = 1; i < detailRows.length; i++) {
        const r = detailRows[i];
        const uzumOrder = String(r[7] ?? "").trim();   // H
        if (!orderSet.has(uzumOrder)) continue;
        if (!byOrder.has(uzumOrder)) byOrder.set(uzumOrder, []);
        byOrder.get(uzumOrder).push(r);
    }

    const products = [];
    for (const oid of orderIds) {                     // paste tartibida
        const list = byOrder.get(oid);
        if (!list) continue;
        for (const r of list) {
            const { title, barcode, quantity } = buildProduct(r, nameMap);
            const rep = quantity * 2;                  // K * 2
            for (let k = 0; k < rep; k++) products.push({ title, barcode });
        }
    }
    return products;
}

/* ---------- Merge uchun: order ID'lardan BIG(N) Drive fileId'lari ---------- */
async function getBigFileIds(orderIds) {
    const orderSet = new Set(orderIds);
    const rows = await readRows("uzum_order", "A:N");
    const byOrder = new Map();
    for (let i = 1; i < rows.length; i++) {
        const id = String(rows[i][0] ?? "").trim();    // A: id
        const big = String(rows[i][13] ?? "").trim();  // N: BIG
        if (orderSet.has(id) && big) byOrder.set(id, big);
    }
    const ids = [];
    for (const oid of orderIds) {
        const b = byOrder.get(oid);
        if (b) ids.push(b);
    }
    return ids;
}

/* ---------- uzum_shop: shopId(A) -> token(C) ---------- */
async function getShopTokenMap() {
    const rows = await readRows("uzum_shop", "A:C");
    const map = new Map();
    for (let i = 1; i < rows.length; i++) {
        const id = String(rows[i][0] ?? "").trim();   // A: shopId
        const tok = rows[i][2];                        // C: token
        if (id && tok) map.set(id, String(tok));
    }
    return map;
}

/* ---------- uzum_order: id(A) -> shopId(G) ---------- */
async function getOrderShopMap(orderIds) {
    const set = new Set(orderIds);
    const rows = await readRows("uzum_order", "A:G");
    const map = new Map();
    for (let i = 1; i < rows.length; i++) {
        const id = String(rows[i][0] ?? "").trim();    // A: id
        if (set.has(id)) map.set(id, String(rows[i][6] ?? "").trim()); // G: shopId
    }
    return map;
}

export {
    parseOrderIds,
    buildProductsFromOrders,
    buildProductForItem,
    findOrderItems,
    getBigFileIds,
    getShopTokenMap,
    getOrderShopMap,
};
