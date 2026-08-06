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

/* ==================== Til (uz/ru) ==================== */
// Interfeys matnlari `data-i18n` atributi orqali almashadi. Tanlov
// localStorage'da — ilova qayta ochilganda saqlanadi.
const I18N = {
  uz: {
    reconnect: "Qayta ulanish",
    tabJobs: "Navbat", tabSettings: "Sozlamalar", tabPair: "Telefonni ulash", tabLogs: "Loglar",
    clearQueue: "Navbatni tozalash",
    clearHint: "Faqat ro'yxat tozalanadi — chop etilgan yorliqlar qayta chiqmaydi.",
    colTime: "Vaqt", colType: "Tur", colOrder: "Buyurtma", colPrinter: "Printer", colResult: "Natija",
    emptyJobs: "Hozircha chop etilgan yorliq yo'q",
    printed: "chop etildi", failed: "xato",
  },
  ru: {
    reconnect: "Переподключить",
    tabJobs: "Очередь", tabSettings: "Настройки", tabPair: "Подключить телефон", tabLogs: "Логи",
    clearQueue: "Очистить очередь",
    clearHint: "Очищается только список — напечатанные этикетки не выйдут повторно.",
    colTime: "Время", colType: "Тип", colOrder: "Заказ", colPrinter: "Принтер", colResult: "Результат",
    emptyJobs: "Пока нет напечатанных этикеток",
    printed: "напечатано", failed: "ошибка",
  },
};

let lang = localStorage.getItem("stocker.lang") || "uz";
const T = (key) => (I18N[lang] && I18N[lang][key]) || I18N.uz[key] || key;

function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = T(el.dataset.i18n);
  });
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
        <td class="muted">${new Date(j.at).toLocaleTimeString(lang === "ru" ? "ru-RU" : "uz-UZ")}</td>
        <td>${j.target === "big" ? "BIG" : "ShK"}${j.copies > 1 ? ` ×${j.copies}` : ""}</td>
        <td>${j.orderId}</td>
        <td class="muted">${j.printer || "—"}</td>
        <td class="${j.ok ? "ok" : "err"}">${j.ok ? T("printed") : j.error || T("failed")}</td>
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
  $("shkOrientation").value = cfg.shkOrientation || "";
  $("bigOrientation").value = cfg.bigOrientation || "";
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
  patch.shkOrientation = $("shkOrientation").value;
  patch.bigOrientation = $("bigOrientation").value;
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

// Til tanlash va navbatni tozalash.
$("lang").value = lang;
$("lang").addEventListener("change", (e) => {
  lang = e.target.value;
  localStorage.setItem("stocker.lang", lang);
  applyLang();
  window.stocker.getState().then((st) => renderJobs(st.jobs));
});

$("clear-jobs").addEventListener("click", async () => {
  await window.stocker.clearJobs();
  renderJobs([]);
});

(async () => {
  applyLang();
  await loadConfig();
  const state = await window.stocker.getState();
  renderStatus(state.status);
  renderJobs(state.jobs);
  state.logs.slice().reverse().forEach(addLog);
})();
