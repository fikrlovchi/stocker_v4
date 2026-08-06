// Panel va yig'ish serverining SQLite bazalarini BITTA faylga birlashtiradi
// (konsolidatsiya 2-bosqichi).
//
//   panel/data/panel.db  ─┐
//                         ├─→  data/stocker.db   (repo ildizida)
//   server/data/stocker.db ┘
//
// Ishlatilishi (serverda, /root/stocker ichidan):
//   node deploy/merge-databases.js            # ko'rib chiqish (hech nima yozmaydi)
//   node deploy/merge-databases.js --apply    # bajarish
//
// Xavfsizlik:
//   • Manba fayllar TEGILMAYDI — faqat o'qiladi.
//   • Natija yangi faylga yoziladi; mavjud bo'lsa `.bak-<vaqt>` ga ko'chiriladi.
//   • Har jadval bo'yicha qatorlar soni solishtiriladi.
//
// Nega shunday: ikkala bazada `schema_migrations` bor, lekin ustunlari har xil
// (panel `filename`, server `name`). Panel'niki `panel_schema_migrations` ga
// ko'chiriladi — aks holda panel migratsiyalarni qaytadan yurgizib yuboradi.
const fs = require("node:fs");
const path = require("node:path");
const Database = require("../server/node_modules/better-sqlite3");

const ROOT = path.join(__dirname, "..");
const PANEL_DB = process.env.PANEL_DB || path.join(ROOT, "panel", "data", "panel.db");
const SERVER_DB = process.env.SERVER_DB || path.join(ROOT, "server", "data", "stocker.db");
const TARGET = process.env.TARGET_DB || path.join(ROOT, "data", "stocker.db");

const APPLY = process.argv.includes("--apply");
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);

const log = (msg) => console.log(msg);
const die = (msg) => {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
};

function tablesOf(db) {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((r) => r.name);
}

function countOf(db, table) {
  try {
    return db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get().n;
  } catch {
    return -1;
  }
}

if (!fs.existsSync(SERVER_DB)) die(`Yig'ish bazasi topilmadi: ${SERVER_DB}`);
if (!fs.existsSync(PANEL_DB)) die(`Panel bazasi topilmadi: ${PANEL_DB}`);

const panel = new Database(PANEL_DB, { readonly: true });
const server = new Database(SERVER_DB, { readonly: true });

const panelTables = tablesOf(panel).filter((t) => t !== "schema_migrations");
const serverTables = tablesOf(server);
const clash = panelTables.filter((t) => serverTables.includes(t));

log(`Panel bazasi:  ${PANEL_DB}`);
for (const t of panelTables) log(`    ${t.padEnd(28)} ${countOf(panel, t)}`);
log(`Yig'ish bazasi: ${SERVER_DB}`);
for (const t of serverTables) log(`    ${t.padEnd(28)} ${countOf(server, t)}`);

if (clash.length) {
  die(
    `Jadval nomlari to'qnashdi: ${clash.join(", ")}\n` +
      "Birlashtirishdan oldin ularni qayta nomlash kerak."
  );
}
log(`\nTo'qnashuv yo'q. Natija: ${TARGET}`);

if (!APPLY) {
  log("\nKo'rib chiqish rejimi — hech nima yozilmadi. Bajarish uchun: --apply");
  process.exit(0);
}

panel.close();
server.close();

/* ---------- bajarish ---------- */

fs.mkdirSync(path.dirname(TARGET), { recursive: true });
if (fs.existsSync(TARGET)) {
  const bak = `${TARGET}.bak-${stamp}`;
  fs.renameSync(TARGET, bak);
  log(`Mavjud natija zaxiraga: ${bak}`);
}

// Yig'ish bazasi asos bo'ladi — u kattaroq va uning `schema_migrations` i
// server kodiga mos keladi. WAL fayllari nusxalanmaydi: ochilishda baza
// o'zi checkpoint qiladi.
const src = new Database(SERVER_DB, { readonly: true });
src.backup(TARGET).then(runMerge, (e) => die(`Nusxa olishda xato: ${e.message}`));

function runMerge() {
  src.close();
  const out = new Database(TARGET);
  out.pragma("journal_mode = WAL");
  out.pragma("foreign_keys = OFF"); // ko'chirish tartibi cheklamasin

  out.prepare("ATTACH DATABASE ? AS panel").run(PANEL_DB);

  const copied = [];
  const copy = out.transaction(() => {
    for (const table of panelTables) {
      const ddl = out
        .prepare("SELECT sql FROM panel.sqlite_master WHERE type = 'table' AND name = ?")
        .get(table).sql;
      out.exec(ddl);
      out.exec(`INSERT INTO main."${table}" SELECT * FROM panel."${table}"`);

      // Indekslar va triggerlar ham ko'chiriladi.
      for (const row of out
        .prepare("SELECT sql FROM panel.sqlite_master WHERE type IN ('index','trigger') AND tbl_name = ? AND sql IS NOT NULL")
        .all(table)) {
        try {
          out.exec(row.sql);
        } catch (e) {
          log(`  ⚠️  indeks o'tmadi (${table}): ${e.message}`);
        }
      }
      copied.push(table);
    }

    // Panel migratsiya hisobi — alohida nom bilan.
    out.exec(`
      CREATE TABLE IF NOT EXISTS panel_schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    out.exec(
      "INSERT OR IGNORE INTO panel_schema_migrations (filename, applied_at) " +
        "SELECT filename, applied_at FROM panel.schema_migrations"
    );
  });

  copy();
  out.exec("DETACH DATABASE panel");

  // Tekshiruv: har jadval bo'yicha qatorlar soni manba bilan bir xilmi.
  const check = new Database(PANEL_DB, { readonly: true });
  let bad = 0;
  log("\nTekshiruv:");
  for (const t of copied) {
    const a = countOf(check, t);
    const b = countOf(out, t);
    const ok = a === b;
    if (!ok) bad += 1;
    log(`  ${ok ? "✅" : "❌"} ${t.padEnd(28)} ${a} → ${b}`);
  }
  const mig = out.prepare("SELECT COUNT(*) AS n FROM panel_schema_migrations").get().n;
  log(`  ✅ panel_schema_migrations   ${mig}`);
  check.close();
  out.close();

  if (bad) die(`${bad} ta jadvalda qatorlar soni mos kelmadi — natija ishlatilmasin.`);

  log(`\nTayyor: ${TARGET}`);
  log("Keyingi qadam: panel va stocker-server ni restart qiling.");
  log("Eski fayllar o'z joyida qoldi (panel/data/panel.db, server/data/stocker.db).");
}
