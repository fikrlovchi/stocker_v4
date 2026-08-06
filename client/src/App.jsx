import { BrowserRouter, NavLink, Navigate, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "./auth";
import { useTheme } from "./theme";
import { setLanguage } from "./i18n";
import Login from "./pages/Login";
import Users from "./pages/Users";
import Labels from "./pages/Labels";
import Packing from "./pages/Packing";
import Placeholder from "./pages/Placeholder";

// Menyu — bo'lim kaliti bilan. Ko'rinishi foydalanuvchi ruxsatiga bog'liq;
// server esa har so'rovda o'zi tekshiradi (menyu yashirish himoya emas).
const NAV = [
  { section: "orders_to_mc", to: "/orders-to-mc" },
  { section: "packing", to: "/packing" },
  { section: "labels", to: "/labels" },
  { section: "users", to: "/users" },
];

function Sidebar() {
  const { t } = useTranslation();
  const { user, can, logout } = useAuth();

  return (
    <aside className="sidebar">
      <div className="brand">
        <img className="icon" src="/app/logo-icon.png" alt="" />
        <img className="wordmark" src="/app/logo-wordmark.png" alt="Stocker" />
      </div>

      {NAV.filter((n) => can(n.section)).map((n) => (
        <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          {t(`nav.${n.section}`)}
        </NavLink>
      ))}

      <div className="spacer" />
      <div className="who">
        {user?.displayName}
        <br />
        <code>{user?.login}</code>
      </div>
      <button className="ghost" onClick={logout}>{t("nav.logout")}</button>
    </aside>
  );
}

function Topbar() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();

  return (
    <header className="topbar">
      <select value={i18n.language} onChange={(e) => setLanguage(e.target.value)}>
        <option value="uz">O'zbekcha</option>
        <option value="ru">Русский</option>
      </select>
      <button className="ghost" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
        {theme === "dark" ? t("theme.light") : t("theme.dark")}
      </button>
    </header>
  );
}

// Ruxsati yo'q bo'limga URL orqali kirishga urinish — birinchi ochiq
// bo'limga qaytariladi.
function Guarded({ section, children }) {
  const { can } = useAuth();
  const first = NAV.find((n) => can(n.section));
  if (!can(section)) return <Navigate to={first ? first.to : "/no-access"} replace />;
  return children;
}

function Shell() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const first = NAV.find((n) => can(n.section));

  return (
    <div className="shell">
      <Sidebar />
      <div>
        <Topbar />
        <Routes>
          <Route path="/" element={<Navigate to={first ? first.to : "/no-access"} replace />} />
          <Route
            path="/orders-to-mc"
            element={
              <Guarded section="orders_to_mc">
                <Placeholder titleKey="section.orders_to_mc" href="/projects/uzum-order-to-mc" />
              </Guarded>
            }
          />
          <Route
            path="/packing"
            element={
              <Guarded section="packing">
                <Packing />
              </Guarded>
            }
          />
          <Route
            path="/labels"
            element={
              <Guarded section="labels">
                <Labels />
              </Guarded>
            }
          />
          <Route
            path="/users"
            element={
              <Guarded section="users">
                <Users />
              </Guarded>
            }
          />
          <Route
            path="/no-access"
            element={
              <div className="content">
                <h1>{t("app.title")}</h1>
                <p className="page-sub">—</p>
              </div>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  const { t } = useTranslation();
  const { user, ready } = useAuth();

  if (!ready) return <div className="login-page muted">{t("app.loading")}</div>;
  if (!user) return <Login />;

  // basename: SPA hozircha `/app/` da (vite.config.js izohiga qarang).
  return (
    <BrowserRouter basename="/app">
      <Shell />
    </BrowserRouter>
  );
}
