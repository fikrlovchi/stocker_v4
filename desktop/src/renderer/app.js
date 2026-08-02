const $ = (id) => document.getElementById(id);

const STATUS_TEXT = {
  connected: "ulangan",
  connecting: "ulanmoqda…",
  disconnected: "uzilgan — qayta urinilmoqda",
  unconfigured: "sozlanmagan",
  error: "xato",
  stopped: "to'xtatilgan",
  starting: "ishga tushmoqda",
};

/* ---------------- tab'lar ---------------- */

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    $(`tab-${btn.dataset.tab}`).classList.add("active");
    if (btn.dataset.tab === "pair") renderQr();
  });
});

/* ---------------- holat ---------------- */

function renderStatus(s) {
  const el = $("status");
  el.textContent = STATUS_TEXT[s.state] || s.state;
  el.className = `badge ${s.state}`;
  if (s.message) el.title = s.message;
}

function renderJobs(jobs) {
  const body = $("jobs-body");
  if (!jobs.length) {
    body.innerHTML = '<tr><td colspan="5" class="muted">Hozircha chop etilgan yorliq yo\'q</td></tr>';
    return;
  }
  body.innerHTML = jobs
    .map(
      (j) => `<tr>
        <td class="muted">${new Date(j.at).toLocaleTimeString("uz-UZ")}</td>
        <td>${j.target === "big" ? "BIG" : "ShK"}${j.copies > 1 ? ` ×${j.copies}` : ""}</td>
        <td>${j.orderId}</td>
        <td class="muted">${j.printer || "—"}</td>
        <td class="${j.ok ? "ok" : "err"}">${j.ok ? "chop etildi" : j.error || "xato"}</td>
      </tr>`
    )
    .join("");
}

function addLog(line) {
  const div = document.createElement("div");
  div.className = line.level === "error" ? "error" : "";
  div.innerHTML = `<span class="time">${new Date(line.at).toLocaleTimeString("uz-UZ")}</span>${escapeHtml(line.text)}`;
  $("logs").prepend(div);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
}

/* ---------------- sozlamalar ---------------- */

const FIELDS = ["serverUrl", "token", "stationId", "stationName"];

async function loadConfig() {
  const cfg = await window.stocker.getConfig();
  FIELDS.forEach((k) => ($(k).value = cfg[k] || ""));
  $("shkScale").value = cfg.shkScale || "noscale";
  $("bigScale").value = cfg.bigScale || "shrink";
  $("autoStart").checked = Boolean(cfg.autoStart);
  $("station-label").textContent = cfg.stationId ? `${cfg.stationId}${cfg.stationName ? ` · ${cfg.stationName}` : ""}` : "ish joyi tanlanmagan";
  await loadPrinters(cfg);
}

async function loadPrinters(cfg) {
  const result = await window.stocker.listPrinters();
  const printers = Array.isArray(result) ? result : [];
  if (!Array.isArray(result)) {
    addLog({ at: new Date().toISOString(), text: `Printerlar ro'yxati olinmadi: ${result.error}`, level: "error" });
  }
  for (const [sel, current] of [["shkPrinter", cfg.shkPrinter], ["bigPrinter", cfg.bigPrinter]]) {
    const el = $(sel);
    el.innerHTML =
      '<option value="">— tanlang —</option>' +
      printers.map((p) => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.displayName)}</option>`).join("");
    // Saqlangan printer ro'yxatda bo'lmasa ham ko'rinib tursin (o'chirilgan/oflayn)
    if (current && !printers.some((p) => p.name === current)) {
      el.innerHTML += `<option value="${escapeHtml(current)}">${escapeHtml(current)} (topilmadi)</option>`;
    }
    el.value = current || "";
  }
}

$("save").addEventListener("click", async () => {
  const patch = Object.fromEntries(FIELDS.map((k) => [k, $(k).value.trim()]));
  patch.shkPrinter = $("shkPrinter").value;
  patch.bigPrinter = $("bigPrinter").value;
  patch.shkScale = $("shkScale").value;
  patch.bigScale = $("bigScale").value;
  patch.autoStart = $("autoStart").checked;
  await window.stocker.saveConfig(patch);
  $("save-note").textContent = "Saqlandi";
  setTimeout(() => ($("save-note").textContent = ""), 2500);
  await loadConfig();
});

$("refresh-printers").addEventListener("click", async () => loadPrinters(await window.stocker.getConfig()));
$("reconnect").addEventListener("click", () => window.stocker.reconnect());

for (const target of ["shk", "big"]) {
  $(`test-${target}`).addEventListener("click", async (e) => {
    e.target.disabled = true;
    const r = await window.stocker.testPrint(target);
    e.target.disabled = false;
    if (!r.ok) alert(`Sinov chop etilmadi: ${r.error}`);
  });
}

/* ---------------- QR juftlash ---------------- */

async function renderQr() {
  const r = await window.stocker.pairQr();
  const box = $("qr-box");
  if (r.error) {
    box.innerHTML = `<span class="muted">${escapeHtml(r.error)}</span>`;
    $("qr-payload").textContent = "";
    return;
  }
  box.innerHTML = `<img src="${r.dataUrl}" alt="Juftlash QR" />`;
  $("qr-payload").textContent = r.payload;
}

/* ---------------- ishga tushirish ---------------- */

window.stocker.onStatus(renderStatus);
window.stocker.onJobs(renderJobs);
window.stocker.onLog(addLog);

(async () => {
  await loadConfig();
  const state = await window.stocker.getState();
  renderStatus(state.status);
  renderJobs(state.jobs);
  state.logs.slice().reverse().forEach(addLog);
})();
