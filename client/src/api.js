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

  labelsProcess: (orderIds, pdfConfig) => call("/labels/process", { method: "POST", body: { orderIds, pdfConfig } }),
  labelsBatch: (id) => call(`/labels/batch/${encodeURIComponent(id)}`),
  labelsHistory: () => call("/labels/history"),

  listUsers: () => call("/users"),
  createUser: (payload) => call("/users", { method: "POST", body: payload }),
  updateUser: (id, payload) => call(`/users/${id}`, { method: "PATCH", body: payload }),
  deleteUser: (id) => call(`/users/${id}`, { method: "DELETE" }),
};
