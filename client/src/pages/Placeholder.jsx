import { useTranslation } from "react-i18next";

// Hali ko'chirilmagan bo'limlar. Soxta interfeys chizmaymiz — bo'lim
// haqiqatda qayerda ishlayotganini aytamiz va o'sha yerga havola beramiz.
// Bo'lim ko'chgach shu sahifa o'chiriladi.
export default function Placeholder({ titleKey, href }) {
  const { t } = useTranslation();
  return (
    <div className="content">
      <h1>{t(titleKey)}</h1>
      <p className="page-sub">{t("soon.title")}</p>
      <div className="card">
        <p style={{ marginTop: 0 }}>{t("soon.body")}</p>
        <a href={href}>
          <button>{t("soon.open")}</button>
        </a>
      </div>
    </div>
  );
}
