const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const manageableUnits = require("../config/manageable-units");

const execFileAsync = promisify(execFile);
const SYSTEMCTL = "/usr/bin/systemctl";
const EXEC_TIMEOUT_MS = 5000;

class UnmanagedProjectError extends Error {}

function getUnitsOrThrow(slug) {
  const entry = manageableUnits[slug];
  if (!entry) throw new UnmanagedProjectError(`"${slug}" boshqariladigan loyihalar ro'yxatida yo'q`);
  return entry;
}

function runSystemctl(args) {
  return execFileAsync(SYSTEMCTL, args, { timeout: EXEC_TIMEOUT_MS });
}

async function setTimerInterval(slug, totalSeconds) {
  if (!Number.isInteger(totalSeconds) || totalSeconds < 10 || totalSeconds > 86400) {
    throw new Error("Interval 10 soniyadan 24 soatgacha (86400 soniya) butun son bo'lishi kerak");
  }
  const { timerUnit, timerUnitPath } = getUnitsOrThrow(slug);
  if (!timerUnit || !timerUnitPath) throw new Error(`"${slug}" uchun timer sozlanmagan`);

  const content = fs.readFileSync(timerUnitPath, "utf8");
  if (!/^OnUnitActiveSec=/m.test(content)) {
    throw new Error("Timer faylida OnUnitActiveSec= qatori topilmadi");
  }
  const updated = content.replace(/^OnUnitActiveSec=.*$/m, `OnUnitActiveSec=${totalSeconds}`);

  const tmpPath = `${timerUnitPath}.tmp`;
  fs.writeFileSync(tmpPath, updated);
  fs.renameSync(tmpPath, timerUnitPath);

  await runSystemctl(["daemon-reload"]);
  await runSystemctl(["restart", timerUnit]);
}

async function pauseTimer(slug) {
  const { timerUnit } = getUnitsOrThrow(slug);
  if (!timerUnit) throw new Error(`"${slug}" uchun timer sozlanmagan`);
  await runSystemctl(["stop", timerUnit]);
}

async function resumeTimer(slug) {
  const { timerUnit } = getUnitsOrThrow(slug);
  if (!timerUnit) throw new Error(`"${slug}" uchun timer sozlanmagan`);
  await runSystemctl(["start", timerUnit]);
}

async function runNow(slug) {
  const { serviceUnit } = getUnitsOrThrow(slug);
  if (!serviceUnit) throw new Error(`"${slug}" uchun service sozlanmagan`);
  await runSystemctl(["start", serviceUnit]);
}

// Doimiy daemon (masalan stocker-server) uchun: timer bo'lmaganda "hozir
// ishga tushirish" ma'nosiz — servis allaqachon ishlab turadi.
async function restartService(slug) {
  const { serviceUnit } = getUnitsOrThrow(slug);
  if (!serviceUnit) throw new Error(`"${slug}" uchun service sozlanmagan`);
  await runSystemctl(["restart", serviceUnit]);
}

async function stopService(slug) {
  const { serviceUnit } = getUnitsOrThrow(slug);
  if (!serviceUnit) throw new Error(`"${slug}" uchun service sozlanmagan`);
  await runSystemctl(["stop", serviceUnit]);
}

async function startService(slug) {
  const { serviceUnit } = getUnitsOrThrow(slug);
  if (!serviceUnit) throw new Error(`"${slug}" uchun service sozlanmagan`);
  await runSystemctl(["start", serviceUnit]);
}

// Loyiha timer bilan (davriy) yoki doimiy daemon sifatida ishlaydimi.
function hasTimer(slug) {
  return Boolean(manageableUnits[slug]?.timerUnit);
}

function parseProps(stdout) {
  const result = {};
  for (const line of stdout.split("\n")) {
    const idx = line.indexOf("=");
    if (idx > 0) result[line.slice(0, idx)] = line.slice(idx + 1);
  }
  return result;
}

async function getStatus(slug) {
  const { serviceUnit, timerUnit } = getUnitsOrThrow(slug);
  const props = "--property=ActiveState,SubState,Result";
  const [serviceOut, timerOut] = await Promise.all([
    serviceUnit ? runSystemctl(["show", serviceUnit, props]) : Promise.resolve({ stdout: "" }),
    timerUnit ? runSystemctl(["show", timerUnit, props]) : Promise.resolve({ stdout: "" }),
  ]);
  return { service: parseProps(serviceOut.stdout), timer: parseProps(timerOut.stdout) };
}

function getConfiguredIntervalSeconds(slug) {
  const entry = manageableUnits[slug];
  if (!entry || !entry.timerUnitPath) return null;
  try {
    const content = fs.readFileSync(entry.timerUnitPath, "utf8");
    const match = content.match(/^OnUnitActiveSec=(\d+)\s*$/m);
    return match ? parseInt(match[1], 10) : null;
  } catch {
    return null;
  }
}

module.exports = {
  setTimerInterval,
  pauseTimer,
  resumeTimer,
  runNow,
  restartService,
  stopService,
  startService,
  hasTimer,
  getStatus,
  getConfiguredIntervalSeconds,
  UnmanagedProjectError,
};
