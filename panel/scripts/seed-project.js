// Ishlatilishi:
//   node scripts/seed-project.js <slug> <displayName> [systemdService] [systemdTimer] [--regenerate-key]
//
// Loyiha mavjud bo'lmasa yangi API kalit yaratib bazaga qo'shadi va kalitni
// (faqat shu safar) konsolga chiqaradi. Loyiha mavjud bo'lsa nomi/unit
// nomlarini yangilaydi; --regenerate-key berilsa yangi kalit yaratadi.
const crypto = require("crypto");
const db = require("../src/db");
const projects = require("../src/db/queries/projects");

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const regenerateKey = process.argv.includes("--regenerate-key");
const [slug, displayName, systemdService = null, systemdTimer = null] = args;

if (!slug || !displayName) {
  console.error(
    "Ishlatilishi: node scripts/seed-project.js <slug> <displayName> [systemdService] [systemdTimer] [--regenerate-key]"
  );
  process.exit(1);
}

function generateKeyAndHash() {
  const apiKey = crypto.randomBytes(32).toString("hex");
  const apiKeyHash = crypto.createHash("sha256").update(apiKey).digest("hex");
  return { apiKey, apiKeyHash };
}

const existing = projects.getBySlug(slug);

if (!existing) {
  const { apiKey, apiKeyHash } = generateKeyAndHash();
  projects.create({ slug, displayName, apiKeyHash, systemdService, systemdTimer });
  console.log(`Loyiha "${slug}" yaratildi.`);
  console.log("\nAPI kalit (loyihaning .env fayliga PANEL_API_KEY sifatida qo'ying, faqat bir marta ko'rsatiladi):");
  console.log(apiKey);
} else {
  db.prepare(
    "UPDATE projects SET display_name = ?, systemd_service = ?, systemd_timer = ? WHERE slug = ?"
  ).run(displayName, systemdService, systemdTimer, slug);
  console.log(`Loyiha "${slug}" yangilandi (nom/unit nomlari).`);

  if (regenerateKey) {
    const { apiKey, apiKeyHash } = generateKeyAndHash();
    db.prepare("UPDATE projects SET api_key_hash = ? WHERE slug = ?").run(apiKeyHash, slug);
    console.log("\nYangi API kalit (eski kalit endi ishlamaydi):");
    console.log(apiKey);
  }
}
