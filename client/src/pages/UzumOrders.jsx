import { useTranslation } from "react-i18next";

// Uzum buyurtmalari — alohida bo'lim.
//
// Hozircha bo'sh: server buyurtmalarni Uzum API'dan to'g'ridan-to'g'ri
// tortadigan qatlam yozilmagan (docs/V3-MIGRATION.md, 5-bosqich). Bugun
// buyurtmalar Google Sheets keshidan keladi va ular "Yig'ish" bo'limida
// ko'rinadi — shuni takrorlab, ikkita haqiqat manbai yasamaslik uchun bu
// ekran ataylab bo'sh qoldirildi.
export default function UzumOrders() {
  const { t } = useTranslation();
  return (
    <div className="content">
      <h1>{t("nav.uzum_orders")}</h1>
      <p className="page-sub">{t("uzumOrders.sub")}</p>
      <div className="card muted">{t("uzumOrders.soon")}</div>
    </div>
  );
}
