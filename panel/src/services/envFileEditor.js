const fs = require("fs");

function parseEnvLines(content) {
  return content.split(/\r?\n/);
}

function readEnvValues(envPath, keys) {
  const result = {};
  for (const key of keys) result[key] = null;
  if (!fs.existsSync(envPath)) return result;

  for (const line of parseEnvLines(fs.readFileSync(envPath, "utf8"))) {
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx);
    if (Object.prototype.hasOwnProperty.call(result, key)) {
      result[key] = line.slice(idx + 1);
    }
  }
  return result;
}

// Faqat berilgan kalitlarni almashtiradi/qo'shadi, faylning qolgan qismini o'zgartirmaydi.
function updateEnvValues(envPath, updates) {
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const lines = existing.length ? parseEnvLines(existing) : [];
  const remaining = new Map(Object.entries(updates));

  const updatedLines = lines.map((line) => {
    const idx = line.indexOf("=");
    if (idx <= 0) return line;
    const key = line.slice(0, idx);
    if (remaining.has(key)) {
      const value = remaining.get(key);
      remaining.delete(key);
      return `${key}=${value}`;
    }
    return line;
  });

  while (updatedLines.length && updatedLines[updatedLines.length - 1] === "") updatedLines.pop();
  for (const [key, value] of remaining) updatedLines.push(`${key}=${value}`);

  const tmpPath = `${envPath}.tmp`;
  fs.writeFileSync(tmpPath, updatedLines.join("\n") + "\n");
  fs.renameSync(tmpPath, envPath);
}

// Berilgan kalitlarga mos qatorlarni faylning o'zidan butunlay olib tashlaydi.
function removeEnvKeys(envPath, keys) {
  if (!fs.existsSync(envPath)) return;
  const keySet = new Set(keys);
  const lines = parseEnvLines(fs.readFileSync(envPath, "utf8")).filter((line) => {
    const idx = line.indexOf("=");
    if (idx <= 0) return true;
    return !keySet.has(line.slice(0, idx));
  });

  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  const tmpPath = `${envPath}.tmp`;
  fs.writeFileSync(tmpPath, lines.join("\n") + "\n");
  fs.renameSync(tmpPath, envPath);
}

function maskSecret(value) {
  if (!value) return "";
  if (value.length <= 4) return "•".repeat(value.length);
  return "•".repeat(value.length - 4) + value.slice(-4);
}

module.exports = { readEnvValues, updateEnvValues, removeEnvKeys, maskSecret };
