const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

function formatTashkent(isoString) {
  if (!isoString) return "";
  const d = new Date(new Date(isoString).getTime() + TASHKENT_OFFSET_MS);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

module.exports = { formatTashkent };
