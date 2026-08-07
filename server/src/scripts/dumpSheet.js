// Stocker v3 bazasi (Google Sheets) tuzilmasini chiqaradi — serverga
// ko'chirishni loyihalash uchun.
//
//   node src/scripts/dumpSheet.js              # config.json dagi jadval
//   node src/scripts/dumpSheet.js <sheetId>    # boshqa jadval
//
// Nima chiqadi: har list uchun nomi, o'lchami, sarlavhalar, birinchi ikki
// ma'lumot qatori va HAR QATORDAGI FORMULALAR (masalan `link_product!F1`).
//
// XAVFSIZLIK: tokenlar chiqmaydi. `mc_token` listi butunlay o'tkazib
// yuboriladi, boshqa joyda tokenga o'xshagan qiymat niqoblanadi — natijani
// chatga yoki repoga qo'yish xavfsiz bo'lsin.
import fs from "node:fs";
import path from "node:path";
import { config, ROOT } from "../config.js";
import { getSheetsClient } from "../google/sheetsClient.js";

const SPREADSHEET_ID = process.argv[2] || config.spreadsheetId;

// Butunlay o'tkazib yuboriladigan listlar (faqat maxfiy qiymat turadi).
const SECRET_SHEETS = new Set(["mc_token"]);

// Uzun, bo'shliqsiz qiymat — token bo'lishi mumkin.
const looksSecret = (v) => typeof v === "string" && v.length >= 24 && !/\s/.test(v);
const mask = (v) => (looksSecret(v) ? `«${v.length} belgi — niqoblandi»` : v);

const cell = (v) => {
  if (v === undefined || v === null || v === "") return "";
  return mask(String(v));
};

async function main() {
  const sheets = getSheetsClient();

  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, includeGridData: false });
  const titles = meta.data.sheets.map((s) => s.properties);

  console.log(`\nJadval: ${meta.data.properties.title}`);
  console.log(`ID: ${SPREADSHEET_ID}`);
  console.log(`Listlar: ${titles.length}\n`);

  const out = { spreadsheetId: SPREADSHEET_ID, title: meta.data.properties.title, sheets: [] };

  for (const props of titles) {
    const name = props.title;
    const entry = {
      name,
      gridRows: props.gridProperties?.rowCount ?? null,
      gridColumns: props.gridProperties?.columnCount ?? null,
      frozenRows: props.gridProperties?.frozenRowCount ?? 0,
    };

    if (SECRET_SHEETS.has(name)) {
      entry.skipped = "maxfiy — o'tkazib yuborildi";
      out.sheets.push(entry);
      console.log(`── ${name}: maxfiy, o'tkazib yuborildi`);
      continue;
    }

    try {
      // Formulalar bilan: sarlavha qatorida ARRAYFORMULA turgan bo'lsa
      // (link_product!F1 kabi) aynan shu ko'rinishda chiqadi.
      const formulas = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${name}!1:3`,
        valueRenderOption: "FORMULA",
      });
      const values = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${name}!1:3`,
        valueRenderOption: "UNFORMATTED_VALUE",
      });

      const f = formulas.data.values || [];
      entry.row1Formulas = (f[0] || []).map(cell);
      entry.row2 = (values.data.values?.[1] || []).map(cell);
      entry.row3 = (values.data.values?.[2] || []).map(cell);

      // Haqiqiy qator soni — A ustuni bo'yicha (gridRows bo'sh qatorlarni
      // ham sanaydi va haqiqatdan uzoq bo'ladi).
      const colA = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${name}!A:A`,
        valueRenderOption: "UNFORMATTED_VALUE",
      });
      entry.dataRows = Math.max(0, (colA.data.values?.length || 0) - 1);

      // Formulali kataklarni alohida ro'yxat qilamiz — ular ko'chirilishi
      // kerak bo'lgan mantiq.
      entry.formulaCells = [];
      f.forEach((row, r) =>
        (row || []).forEach((v, c) => {
          if (typeof v === "string" && v.startsWith("=")) {
            entry.formulaCells.push({ cell: `${colName(c)}${r + 1}`, formula: v });
          }
        })
      );
    } catch (e) {
      entry.error = e.message;
    }

    out.sheets.push(entry);
    console.log(
      `── ${name}: ${entry.dataRows ?? "?"} qator · ${entry.row1Formulas?.length ?? 0} ustun` +
        (entry.formulaCells?.length ? ` · ${entry.formulaCells.length} formula` : "") +
        (entry.error ? ` · XATO: ${entry.error}` : "")
    );
  }

  const file = path.join(ROOT, "..", "docs", "v3-sheet-structure.json");
  fs.writeFileSync(file, JSON.stringify(out, null, 2), "utf8");
  console.log(`\n✅ Yozildi: ${file}`);
  console.log("Formulalar:\n");
  for (const s of out.sheets) {
    for (const fc of s.formulaCells || []) console.log(`  ${s.name}!${fc.cell}\n    ${fc.formula}\n`);
  }
}

// 0 → A, 25 → Z, 26 → AA
function colName(index) {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

main().catch((e) => {
  console.error("Xato:", e.message);
  process.exit(1);
});
