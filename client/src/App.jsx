import { BrowserRouter, NavLink, Navigate, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "./auth";
import { useTheme } from "./theme";
import { setLanguage } from "./i18n";
import Login from "./pages/Login";
import Users from "./pages/Users";
import Labels from "./pages/Labels";
import Packing from "./pages/Packing";
import Projects from "./pages/Projects";
import UzumOrders from "./pages/UzumOrders";
import LinkProducts from "./pages/LinkProducts";
import SkuLog from "./pages/SkuLog";
import Config from "./pages/Config";

// Menyu — bo'lim kaliti bilan. Ko'rinishi foydalanuvchi ruxsatiga bog'liq;
// server esa har so'rovda o'zi tekshiradi (menyu yashirish himoya emas).
//
// Kalitlar `user_permissions` dagi qiymatlar — ularni o'zgartirib bo'lmaydi.
// Ko'rinadigan nom `nav.<kalit>` tarjimasidan keladi, shuning uchun
// "Uzum order to MC" → "Integratsiyalar" ga aylanishi uchun migratsiya
// kerak bo'lmadi.
const NAV = [
  { section: "orders_to_mc", to: "/integrations" },
  { section: "link_product", to: "/link-products" },
  { section: "sku_log", to: "/sku-log" },
  { section: "uzum_orders", to: "/uzum-orders" },
  { section: "packing", to: "/packing" },
  { section: "labels", to: "/labels" },
  { section: "users", to: "/users" },
  { section: "settings", to: "/config" },
];

function Sidebar() {
  const { t } = useTranslation();
  const { user, can, logout } = useAuth();

  return (
    <aside className="sidebar">
      <div className="brand">
        <img className="icon" src="/logo-icon.png" alt="" />
        <img className="wordmark" src="/logo-wordmark.png" alt="Stocker" />
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
            path="/integrations"
            element={
              <Guarded section="orders_to_mc">
                <Projects />
              </Guarded>
            }
          />
          <Route
            path="/link-products"
            element={
              <Guarded section="link_product">
                <LinkProducts />
              </Guarded>
            }
          />
          <Route
            path="/sku-log"
            element={
              <Guarded section="sku_log">
                <SkuLog />
              </Guarded>
            }
          />
          <Route
            path="/uzum-orders"
            element={
              <Guarded section="uzum_orders">
                <UzumOrders />
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
            path="/config"
            element={
              <Guarded section="settings">
                <Config />
              </Guarded>
            }
          />
          {/* Eski manzillar — saqlangan havolalar buzilmasin. */}
          <Route path="/orders-to-mc" element={<Navigate to="/integrations" replace />} />
          <Route path="/variables" element={<Navigate to="/config" replace />} />
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

  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}
