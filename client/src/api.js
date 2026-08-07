// Server bilan aloqa. Token localStorage'da: bu admin interfeysi, mobil
// ilovadagidek uzoq sessiya kerak emas, lekin har sahifa yangilanishida
// qayta kirish ham keraksiz.
const TOKEN_KEY = "stocker.token";

export const getToken = () => localStorage.getItem(TOKEN_KEY) || "";
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function call(path, { method = "GET", body } = {}) {
  const token = getToken();
  const res = await fetch(`/web${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Server HTML qaytargan bo'lsa (nginx xatosi) — matnni xabar sifatida.
    throw new ApiError(text.slice(0, 120) || `HTTP ${res.status}`, res.status);
  }

  if (!res.ok) throw new ApiError(data?.error || `HTTP ${res.status}`, res.status);
  return data;
}

// Ikkilik javob (PDF) — token sarlavhasi bilan olinadi va blob URL'ga
// aylantiriladi: `<iframe src>` va `<a href>` sarlavha yubora olmaydi.
export async function blobUrl(path, { method = "GET", body } = {}) {
  const token = getToken();
  const res = await fetch(`/web${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = `HTTP ${res.status}`;
    try {
      msg = JSON.parse(text).error || msg;
    } catch {
      /* HTML yoki bo'sh javob — kod bilan cheklanamiz */
    }
    throw new ApiError(msg, res.status);
  }
  return URL.createObjectURL(await res.blob());
}

export const api = {
  login: (login, password) => call("/auth/login", { method: "POST", body: { login, password } }),
  logout: () => call("/auth/logout", { method: "POST" }),
  me: () => call("/auth/me"),

  listBatches: () => call("/batches"),
  createBatch: (name, orders) => call("/batches", { method: "POST", body: { name, orders } }),
  getBatch: (id, shop) => call(`/batches/${id}${shop ? `?shop=${encodeURIComponent(shop)}` : ""}`),
  closeBatch: (id) => call(`/batches/${id}/close`, { method: "POST" }),
  reopenBatch: (id) => call(`/batches/${id}/reopen`, { method: "POST" }),
  deleteBatch: (id) => call(`/batches/${id}`, { method: "DELETE" }),
  removeBatchOrder: (id, orderId) => call(`/batches/${id}/orders/${encodeURIComponent(orderId)}`, { method: "DELETE" }),

  variables: () => call("/variables"),
  addSheet: (name, sheetId) => call("/variables/sheets", { method: "POST", body: { name, sheetId } }),
  addSheetList: (id, name) => call(`/variables/sheets/${id}/lists`, { method: "POST", body: { name } }),
  addCabinet: (name, token) => call("/variables/uzum/cabinets", { method: "POST", body: { name, token } }),
  syncUzumShops: (id) => call(`/variables/uzum/cabinets/${id}/sync`, { method: "POST" }),
  renameShop: (id, name) => call(`/variables/uzum/shops/${id}`, { method: "PATCH", body: { name } }),
  deleteVar: (kind, id) => call(`/variables/${kind}/${id}`, { method: "DELETE" }),
  addBinding: (payload) => call("/variables/bindings", { method: "POST", body: payload }),
  deleteBinding: (id) => call(`/variables/bindings/${id}`, { method: "DELETE" }),

  // Telegram (Konfiguratsiya → Telegram). Bot va chat alohida katalog,
  // integratsiyaga esa "bot + chat" juftligi biriktiriladi.
  telegram: () => call("/telegram"),
  addTgBot: (body) => call("/telegram/bots", { method: "POST", body }),
  editTgBot: (id, body) => call(`/telegram/bots/${id}`, { method: "PATCH", body }),
  deleteTgBot: (id) => call(`/telegram/bots/${id}`, { method: "DELETE" }),
  testTgBot: (id) => call(`/telegram/bots/${id}/test`, { method: "POST" }),
  addTgChat: (body) => call("/telegram/chats", { method: "POST", body }),
  editTgChat: (id, body) => call(`/telegram/chats/${id}`, { method: "PATCH", body }),
  deleteTgChat: (id) => call(`/telegram/chats/${id}`, { method: "DELETE" }),
  bindTg: (key, botId, chatId) => call(`/telegram/integrations/${key}`, { method: "PUT", body: { botId, chatId } }),
  testTgBinding: (key) => call(`/telegram/integrations/${key}/test`, { method: "POST" }),

  moysklad: () => call("/moysklad"),
  setMcToken: (token) => call("/moysklad/token", { method: "PUT", body: { token } }),
  clearMcToken: () => call("/moysklad/token", { method: "DELETE" }),
  testMc: () => call("/moysklad/test", { method: "POST" }),

  listProjects: () => call("/projects"),
  getProject: (slug) => call(`/projects/${encodeURIComponent(slug)}`),
  projectPause: (slug) => call(`/projects/${encodeURIComponent(slug)}/pause`, { method: "POST" }),
  projectResume: (slug) => call(`/projects/${encodeURIComponent(slug)}/resume`, { method: "POST" }),
  projectRunNow: (slug) => call(`/projects/${encodeURIComponent(slug)}/run-now`, { method: "POST" }),
  projectInterval: (slug, seconds) =>
    call(`/projects/${encodeURIComponent(slug)}/interval`, { method: "POST", body: { seconds } }),

  labelsConfig: () => call("/labels/config"),
  saveLabelsConfig: (config) => call("/labels/config", { method: "PUT", body: config }),
  labelsProcess: (orderIds, format, pdfConfig) =>
    call("/labels/process", { method: "POST", body: { orderIds, format, pdfConfig } }),
  labelsBatch: (id) => call(`/labels/batch/${encodeURIComponent(id)}`),
  labelsHistory: () => call("/labels/history"),

  listUsers: () => call("/users"),
  createUser: (payload) => call("/users", { method: "POST", body: payload }),
  updateUser: (id, payload) => call(`/users/${id}`, { method: "PATCH", body: payload }),
  deleteUser: (id) => call(`/users/${id}`, { method: "DELETE" }),
};
