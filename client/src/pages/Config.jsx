import { useState } from "react";
import { useTranslation } from "react-i18next";
import UzumConfig from "./config/UzumConfig";
import MoyskladConfig from "./config/MoyskladConfig";
import TelegramConfig from "./config/TelegramConfig";
import SheetsConfig from "./config/SheetsConfig";
import StockModConfig from "./config/StockModConfig";

// Konfiguratsiya — Stocker ishlaydigan hamma tashqi manba shu yerda:
// Uzum kabinetlari, MoySklad tokeni, Telegram manzillari, Google Sheets.
// Har biri alohida sahifa emas, tab: ular bir-biriga bog'liq (masalan
// integratsiyaga Telegram biriktirilganda bot ham shu yerdan tanlanadi).
const TABS = [
  { key: "uzum", Component: UzumConfig },
  { key: "moysklad", Component: MoyskladConfig },
  { key: "telegram", Component: TelegramConfig },
  { key: "sheets", Component: SheetsConfig },
  { key: "stockmod", Component: StockModConfig },
];

export default function Config() {
  const { t } = useTranslation();
  const [tab, setTab] = useState("uzum");
  const Active = TABS.find((x) => x.key === tab).Component;

  return (
    <div className="content">
      <h1>{t("cfg.title")}</h1>
      <p className="page-sub">{t("cfg.sub")}</p>

      <div className="row tabs" style={{ marginBottom: 16 }}>
        {TABS.map((x) => (
          <button key={x.key} className={x.key === tab ? "" : "ghost"} onClick={() => setTab(x.key)}>
            {t(`cfg.tab.${x.key}`)}
          </button>
        ))}
      </div>

      <Active />
    </div>
  );
}
