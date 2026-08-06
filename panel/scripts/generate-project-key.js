const crypto = require("crypto");

const apiKey = crypto.randomBytes(32).toString("hex");
const apiKeyHash = crypto.createHash("sha256").update(apiKey).digest("hex");

console.log("API kalit (loyihaning .env fayliga qo'ying, faqat bir marta ko'rsatiladi):");
console.log(apiKey);
console.log("\nHash (baza uchun, api_key_hash ustuniga):");
console.log(apiKeyHash);
