import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";

// Barcode va SKU jurnali.
//
// Bu ikki amal — Uzum'dan SKU ma'lumotini olish va barcode'ni MoySklad'ga
// qo'shish — yangi tovar bog'lamasi qo'shilganda bajariladi (v3 dagi
// AppSheet automation'i kabi). Jadval bo'yicha takrorlanmaydi, shuning
// uchun bu bo'limda "ishga tushirish" tugmasi YO'Q: faqat natija.
const KINDS = [
  { key: "", labelKey: "skuLog.all" },
  { key: "uzum_fetch", labelKey: "skuLog.uzumFetch" },
  { key: "mc_barcode", labelKey: "skuLog.mcBarcode" },
];

const STATUS_CLASS = { success: "on", skipped: "off", error: "off" };

export default function SkuLog() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [kind, setKind] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await api.skuLog({ kind, search: query, limit: 100 }));
    } catch (e) {
      setError(e.message);
    }
  }, [kind, query]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="content">
      <h1>{t("skuLog.title")}</h1>
      <p className="page-sub">{t("skuLog.sub")}</p>

      {error && <div className="card error">{error}</div>}

      <div className="row" style={{ marginBottom: 12 }}>
        {KINDS.map((k) => (
          <button key={k.key} className={k.key === kind ? "" : "ghost"} onClick={() => setKind(k.key)}>
            {t(k.labelKey)}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setQuery(search.trim())}
          placeholder="skuTitle"
          style={{ width: 220 }}
        />
        <button onClick={() => setQuery(search.trim())}>{t("skuLog.search")}</button>
        <button className="ghost" onClick={load}>{t("skuLog.refresh")}</button>
      </div>

      {!data ? (
        !error && <div className="card muted">{t("app.loading")}</div>
      ) : (
        <>
          <div className="card">
            <div className="row">
              <span className="muted">{t("skuLog.shown", { n: data.summary.total })}</span>
              <span className="badge on">
                {t("skuLog.barcodeAdded", { n: data.summary.barcodeAdded })}
              </span>
              {data.summary.uzumFetchErrors > 0 && (
                <span className="badge off">{t("skuLog.uzumErrors", { n: data.summary.uzumFetchErrors })}</span>
              )}
              {data.summary.barcodeErrors > 0 && (
                <span className="badge off">{t("skuLog.barcodeErrors", { n: data.summary.barcodeErrors })}</span>
              )}
            </div>
          </div>

          {data.events.length === 0 ? (
            <div className="card muted">{t("skuLog.empty")}</div>
          ) : (
            <div className="card" style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>{t("skuLog.at")}</th>
                    <th>skuTitle</th>
                    <th>{t("skuLog.kind")}</th>
                    <th>{t("skuLog.status")}</th>
                    <th>{t("skuLog.message")}</th>
                    <th>{t("skuLog.who")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.events.map((e) => (
                    <tr key={e.id}>
                      <td>{e.at}</td>
                      <td>{e.sku_title}</td>
                      <td>{t(`skuLog.${e.kind === "uzum_fetch" ? "uzumFetch" : "mcBarcode"}`)}</td>
                      <td>
                        <span className={`badge ${STATUS_CLASS[e.status] || "off"}`}>
                          {t(`skuLog.st.${e.status}`)}
                        </span>
                      </td>
                      <td className={e.status === "error" ? "error" : "muted"}>{e.message || "—"}</td>
                      <td className="muted">{e.by_login || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
