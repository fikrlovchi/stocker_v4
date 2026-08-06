const bcrypt = require("bcryptjs");

const plaintext = process.argv[2];
if (!plaintext) {
  console.error("Ishlatilishi: node scripts/hash-password.js <parol>");
  process.exit(1);
}

console.log(bcrypt.hashSync(plaintext, 10));
