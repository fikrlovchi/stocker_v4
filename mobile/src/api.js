// Server bilan aloqa.
//
// 8-fazagacha autentifikatsiya X-Service-Token bilan va `operator` so'rov
// tanasida yuboriladi. 8-fazada bu operator JWT'siga almashadi — o'shanda
// faqat shu fayl o'zgaradi, ekranlar tegilmaydi.
const TIMEOUT_MS = 12000;

class ApiError extends Error {
  constructor(message, { status, offline = false } = {}) {
    super(message);
    this.status = status;
    this.offline = offline;
  }
}

function base(cfg) {
  return String(cfg.serverUrl || "").replace(/\/$/, "");
}

async function request(cfg, path, { method = "GET", body } = {}) {
  const url = `${base(cfg)}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let resp;
  try {
    resp = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Service-Token": cfg.token || "",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (e) {
    // Tarmoq uzilishi — bu server xatosi emas, ilova buni boshqacha
    // ko'rsatadi (qayta urinish mumkin degan ma'noda).
    throw new ApiError(
      e.name === "AbortError" ? "Server javob bermadi (vaqt tugadi)" : "Serverga ulanib bo'lmadi",
      { offline: true }
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await resp.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError(`Serverdan noto'g'ri javob (HTTP ${resp.status})`, { status: resp.status });
  }

  if (!resp.ok) {
    if (resp.status === 401) throw new ApiError("Kalit (token) noto'g'ri", { status: 401 });
    throw new ApiError(data?.error || `Server xatosi (HTTP ${resp.status})`, { status: resp.status });
  }
  return data;
}

export const api = {
  health: (cfg) => request(cfg, "/health"),

  scan: (cfg, barcode) =>
    request(cfg, "/api/scan", {
      method: "POST",
      body: { barcode, operator: cfg.operator, stationId: cfg.stationId || undefined },
    }),

  // ?last=1 — buyurtma yig'ilib bo'lgandan keyin ham oxirgi sessiyani
  // ko'rsatamiz (qayta chiqarish uchun).
  session: (cfg) =>
    request(cfg, `/api/session?operator=${encodeURIComponent(cfg.operator)}&last=1`),

  cancelSession: (cfg, reason) =>
    request(cfg, "/api/session/cancel", {
      method: "POST",
      body: { operator: cfg.operator, reason },
    }),

  jobs: (cfg, sessionId) => request(cfg, `/api/jobs?sessionId=${encodeURIComponent(sessionId)}`),

  reprint: (cfg, jobId) =>
    request(cfg, "/api/reprint", {
      method: "POST",
      body: { jobId, stationId: cfg.stationId || undefined },
    }),
};

export { ApiError };
