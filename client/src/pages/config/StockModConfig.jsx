import { useTranslation } from "react-i18next";

// Uzum qoldiq modifikatsiyasi — v3 dagi `uzum_stock_mod` va
// `uzum_stock_mod_detail` listlarining o'rni.
//
// Hozircha bo'sh: qoldiq qanday shart bilan o'zgarishi `link_product!F1`
// formulasida yozilgan va u hali serverga ko'chirilmagan
// (docs/V3-MIGRATION.md, 3-bosqich). Soxta interfeys chizilmadi — sozlanadigan
// ko'rinib turib aslida hech narsaga ta'sir qilmasligi eng yomon variant.
export default function StockModConfig() {
  const { t } = useTranslation();
  return (
    <div className="card">
      <h2>{t("cfg.tab.stockmod")}</h2>
      <p className="muted">{t("cfg.stockModSoon")}</p>
    </div>
  );
}
