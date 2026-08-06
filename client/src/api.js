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

export const api = {
  login: (login, password) => call("/auth/login", { method: "POST", body: { login, password } }),
  logout: () => call("/auth/logout", { method: "POST" }),
  me: () => call("/auth/me"),

  listUsers: () => call("/users"),
  createUser: (payload) => call("/users", { method: "POST", body: payload }),
  updateUser: (id, payload) => call(`/users/${id}`, { method: "PATCH", body: payload }),
  deleteUser: (id) => call(`/users/${id}`, { method: "DELETE" }),
};
