import { createContext, useContext, useEffect, useState } from "react";
import { api, setToken, getToken } from "./api";

// Kim kirgan va u nimani ko'ra oladi. Menyu shu ro'yxatga qarab quriladi,
// lekin bu HIMOYA EMAS: server har so'rovda ruxsatni qaytadan tekshiradi.
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      setReady(true);
      return;
    }
    api
      .me()
      .then((r) => setUser(r.user))
      .catch(() => setToken("")) // token eskirgan — kirish ekraniga
      .finally(() => setReady(true));
  }, []);

  const login = async (l, password) => {
    const r = await api.login(l, password);
    setToken(r.token);
    setUser(r.user);
    return r.user;
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // Server javob bermasa ham mahalliy sessiyani yopamiz.
    }
    setToken("");
    setUser(null);
  };

  const can = (section) => Boolean(user && (user.isSuperadmin || user.sections.includes(section)));

  return (
    <AuthContext.Provider value={{ user, ready, login, logout, can }}>{children}</AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
