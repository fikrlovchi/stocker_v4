import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";

// Yig'ilishi kerak buyurtmalar — 5-bosqich.
//
// Ilgari qaysi buyurtmalar yig'ilishini ADMIN belgilardi: partiyaga ID
// ro'yxati joylanardi. Bu ortiqcha qadam edi — "yig'ilishi kerak" degan
// holat allaqachon ma'lum: buyurtma yig'ishga tayyor, hali yig'ilmagan va
// bekor qilinmagan.
//
// Shu bois ro'yxat O'ZI chiqadi. "Buyurtma ID'lari" maydoni esa
// SOLISHTIRISH uchun qoladi: qo'lda tuzilgan ro'yxat haqiqiy holat bilan
// mos keladimi degan savolga javob beradi.
export default function PendingOrders() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ids, setIds] = useState("");
  // Solishtirish natijasi qaysi ro'yxat bilan olinganini eslab qolamiz —
  // maydonni o'zgartirsa natija eskirganini bilish uchun.
  const [comparedWith, setComparedWith] = useState("");
  const [onlyMatched, setOnlyMatched] = useState(false);

  const load = useCallback(async (orders = "") => {
    setBusy(true);
    setError("");
    try {
      const r = await api.pendingOrders(orders.trim() ? { orders } : {});
      setData(r);
      setComparedWith(orders.trim());
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const compare = data?.compare;
  const stale = comparedWith !== ids.trim();

  // Solishtirilgan bo'lsa har buyurtmada "ro'yxatda bormi" belgisi.
  const matchedSet = new Set((compare?.matched || []).map((o) => o.orderId));
  const visible = (orders) => (onlyMatched && compare ? orders.filter((o) => matchedSet.has(o.orderId)) : orders);

  return (
    <>
      {error && <div className="card error">{error}</div>}

      {/* Solishtirish — ro'yxat ustida turadi: avval nima kutilayotgani,
          keyin qo'lda tuzilgan ro'yxat bilan taqqoslash. */}
      <div className="card">
        <h2>{t("pend.compare")}</h2>
        <p className="muted" style={{ marginTop: 0 }}>{t("pend.compareHint")}</p>

        <textarea
          value={ids}
          onChange={(e) => setIds(e.target.value)}
          placeholder={t("pend.idsPlaceholder")}
          rows={3}
          style={{ width: "100%", fontFamily: "ui-monospace, Consolas, monospace", fontSize: 13 }}
        />
        <div className="row" style={{ marginTop: 10 }}>
          <button disabled={busy || !ids.trim()} onClick={() => load(ids)}>
            {busy ? t("pend.working") : t("pend.doCompare")}
          </button>
          {compare && (
            <button className="ghost" onClick={() => { setIds(""); setOnlyMatched(false); load(); }}>
              {t("pend.clear")}
            </button>
          )}
          {compare && stale && <span className="badge off">{t("pend.stale")}</span>}
        </div>

        {compare && (
          <div style={{ marginTop: 14 }}>
            <div className="row">
              <span className="badge on">{t("pend.matched", { n: compare.matched.length })}</span>
              {compare.missing.length > 0 && (
                <span className="badge off">{t("pend.missing", { n: compare.missing.length })}</span>
              )}
              {compare.extra.length > 0 && (
                <span className="badge off">{t("pend.extra", { n: compare.extra.length })}</span>
              )}
              <label className="row" style={{ gap: 6, marginLeft: 8 }}>
                <input type="checkbox" checked={onlyMatched} onChange={(e) => setOnlyMatched(e.target.checked)} />
                {t("pend.onlyMatched")}
              </label>
            </div>

            {/* Ortiqchalar — har biri SABABI bilan. Sabab bo'lmasa
                operator nima qilishini bilmaydi. */}
            {compare.extra.length > 0 && (
              <table style={{ marginTop: 10 }}>
                <thead>
                  <tr>
                    <th>{t("pend.extraTitle")}</th>
                    <th>{t("pend.reason")}</th>
                  </tr>
                </thead>
                <tbody>
                  {compare.extra.map((e) => (
                    <tr key={e.orderId}>
                      <td><code>{e.orderId}</code></td>
                      <td className="muted">{e.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {compare.missing.length > 0 && (
              <p className="muted" style={{ marginBottom: 0 }}>
                {t("pend.missingHint")}{" "}
                {compare.missing.slice(0, 20).map((o) => o.orderId).join(", ")}
                {compare.missing.length > 20 && ` … +${compare.missing.length - 20}`}
              </p>
            )}
          </div>
        )}
      </div>

      {!data ? (
        !error && <div className="card muted">{t("app.loading")}</div>
      ) : data.total === 0 ? (
        <div className="card muted">{t("pend.empty")}</div>
      ) : (
        <>
          <div className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2 style={{ margin: 0 }}>{t("pend.title")}</h2>
              <span className="badge on" style={{ fontSize: 15 }}>{data.total}</span>
            </div>
            <p className="muted" style={{ marginTop: 4 }}>{t("pend.sub")}</p>

            <table>
              <thead>
                <tr>
                  <th>{t("pend.group")}</th>
                  <th>{t("pend.shop")}</th>
                  <th>{t("pend.count")}</th>
                </tr>
              </thead>
              <tbody>
                {data.summary.map((g) =>
                  g.shops.map((sh, i) => (
                    <tr key={`${g.groupId}-${sh.shopId}`}>
                      {i === 0 && (
                        <td rowSpan={g.shops.length}>
                          {g.groupId ? (
                            <>
                              <b style={{ fontSize: 18 }}>{g.groupId}</b>{" "}
                              <span className="muted">{g.groupName}</span>
                            </>
                          ) : (
                            // Guruhsiz do'konlar — sozlash kerak bo'lgan holat.
                            <span className="error">{t("pend.noGroup")}</span>
                          )}
                        </td>
                      )}
                      <td>{sh.shopName || sh.shopId || "—"}</td>
                      <td><b>{sh.total}</b></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="card" style={{ overflowX: "auto" }}>
            <h2>{t("pend.orders")}</h2>
            <table>
              <thead>
                <tr>
                  <th>{t("pend.orderId")}</th>
                  <th>{t("pend.group")}</th>
                  <th>{t("pend.shop")}</th>
                  <th>{t("pend.items")}</th>
                  <th>{t("pend.units")}</th>
                  {compare && <th>{t("pend.inList")}</th>}
                </tr>
              </thead>
              <tbody>
                {visible(data.pending).map((o) => (
                  <tr key={o.orderId}>
                    <td><code>{o.orderId}</code></td>
                    <td>{o.groupId ?? <span className="muted">—</span>}</td>
                    <td>{o.shopName || o.shopId || "—"}</td>
                    <td>{o.itemCount}</td>
                    <td>{o.unitCount}</td>
                    {compare && (
                      <td>
                        {matchedSet.has(o.orderId) ? (
                          <span className="badge on">✓</span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
