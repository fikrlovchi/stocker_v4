import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";

// Uzum buyurtmalari — serverga ko'chirilgan nusxa (docs/V3-MIGRATION.md,
// 6-bosqich).
//
// Bo'lim Sheets bilan aloqani uzishdan OLDIN ma'lumotni ko'z bilan tekshirish
// uchun: jadvaldagi bayroqlar (Q·T·U·V), MoySklad havolalari va buyurtma
// tarkibi shu yerda ko'rinadi. Shuning uchun u jadvalning nusxasi emas —
// "nega bu buyurtma yig'ishga chiqmadi" degan savolga javob beradi.
const PAGE = 50;

export default function UzumOrders() {
  const { t } = useTranslation();
  const [status, setStatus] = useState(null);
  const [shops, setShops] = useState([]);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [shop, setShop] = useState("");
  const [cache, setCache] = useState("");
  const [offset, setOffset] = useState(0);

  const load = useCallback(async () => {
    try {
      setData(await api.uzumOrders({ search: query, shop, cache, limit: PAGE, offset }));
    } catch (e) {
      setError(e.message);
    }
  }, [query, shop, cache, offset]);

  useEffect(() => {
    api.uzumOrdersStatus().then(setStatus).catch((e) => setError(e.message));
    api.uzumOrdersShops().then((r) => setShops(r.shops)).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submitSearch = () => {
    setOffset(0);
    setQuery(search.trim());
  };

  return (
    <div className="content">
      <h1>{t("nav.uzum_orders")}</h1>
      <p className="page-sub">{t("uzumOrders.sub")}</p>

      {error && <div className="card error">{error}</div>}

      {/* Ko'chirish holati. Bo'sh bo'lsa nima qilish kerakligi aytiladi —
          "hech narsa yo'q" degan bo'sh ekran savol qoldiradi. */}
      {status && (
        <div className={`card ${status.orders === 0 ? "error" : ""}`}>
          {status.orders === 0 ? (
            <>
              <b>{t("uzumOrders.empty")}</b>
              <div className="muted">{t("uzumOrders.emptyHint")}</div>
            </>
          ) : (
            <div className="row" style={{ gap: 18, flexWrap: "wrap" }}>
              <span>{t("uzumOrders.imported", { orders: status.orders, items: status.items })}</span>
              <span className="muted">{t("uzumOrders.inCache", { n: status.inCache })}</span>
              {status.lastImportedAt && (
                <span className="muted">{t("uzumOrders.lastImport")}: {status.lastImportedAt}</span>
              )}
            </div>
          )}
        </div>
      )}

      <div className="row" style={{ margin: "12px 0", flexWrap: "wrap" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submitSearch()}
          placeholder={t("uzumOrders.searchHint")}
          style={{ width: 300 }}
        />
        <button onClick={submitSearch}>{t("lp.search")}</button>

        <select value={shop} onChange={(e) => { setShop(e.target.value); setOffset(0); }}>
          <option value="">{t("uzumOrders.allShops")}</option>
          {shops.map((s) => (
            <option key={s.shopId} value={s.shopId}>{s.name} ({s.total})</option>
          ))}
        </select>

        <select value={cache} onChange={(e) => { setCache(e.target.value); setOffset(0); }}>
          <option value="">{t("uzumOrders.allCache")}</option>
          <option value="in">{t("uzumOrders.inCacheOnly")}</option>
          <option value="out">{t("uzumOrders.outCacheOnly")}</option>
        </select>

        {(query || shop || cache) && (
          <button className="ghost" onClick={() => { setSearch(""); setQuery(""); setShop(""); setCache(""); setOffset(0); }}>
            {t("lp.clear")}
          </button>
        )}
        {data && <span className="muted">{t("lp.found", { total: data.total })}</span>}
      </div>

      {!data ? (
        <div className="card muted">{t("app.loading")}</div>
      ) : data.items.length === 0 ? (
        <div className="card muted">{t("uzumOrders.noRows")}</div>
      ) : (
        <>
          <div className="card" style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>{t("uzumOrders.orderId")}</th>
                  <th>{t("lp.shop")}</th>
                  <th>{t("uzumOrders.arrivedAt")}</th>
                  <th>{t("uzumOrders.items")}</th>
                  <th>{t("uzumOrders.price")}</th>
                  <th>{t("uzumOrders.status")}</th>
                  <th>{t("uzumOrders.moyskladId")}</th>
                  <th>{t("uzumOrders.tracking")}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((o) => <Row key={o.orderId} order={o} />)}
              </tbody>
            </table>
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            <button className="ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
              ← {t("lp.prev")}
            </button>
            <span className="muted">
              {offset + 1}–{Math.min(offset + PAGE, data.total)} / {data.total}
            </span>
            <button className="ghost" disabled={offset + PAGE >= data.total} onClick={() => setOffset(offset + PAGE)}>
              {t("lp.next")} →
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// Statusning ko'rinishi: yakuniy holatlar (yig'ildi) yashil, bekor bo'lganlar
// va e'tibor talab qiladiganlar qizil, oraliq holatlar neytral.
const STATUS_CLASS = {
  packed: "on",
  packing: "off",
  new: "off",
  auto_canceled: "danger",
  cancel_pending: "danger",
  build_error: "danger",
  canceled: "danger",
};

function Row({ order }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);

  // Tarkib faqat ochilganda so'raladi: 50 qator uchun 50 so'rov ketmasin.
  const toggle = async () => {
    setOpen(!open);
    if (!open && !items) {
      try {
        setItems((await api.uzumOrderItems(order.orderId)).items);
      } catch {
        setItems([]);
      }
    }
  };

  return (
    <>
      <tr onClick={toggle} style={{ cursor: "pointer" }}>
        <td>
          <code>{order.orderId}</code>
          {!order.inCache && (
            <span className="badge off" style={{ marginLeft: 6 }} title={t("uzumOrders.outCacheHint")}>
              {t("uzumOrders.outCache")}
            </span>
          )}
        </td>
        <td>{order.shopName || order.shopId || "—"}</td>
        <td className="muted">{order.arrivedAt || "—"}</td>
        <td>{order.itemCount}</td>
        <td>{order.price ?? "—"}</td>
        {/* Status HISOBLANADI. Uni keltirib chiqargan bayroqlar (Q·T·U·V)
            izohda qoladi — "nega shu status?" degan savol javobsiz
            qolmasin. */}
        <td>
          <span
            className={`badge ${STATUS_CLASS[order.status] || "off"}`}
            title={`Q${order.sentToMc ?? "—"} · T${order.uzumConfirmed ?? "—"} · U:${order.mcState || "—"} · V${order.cancelHandled ?? "—"}`}
          >
            {t(`uzumOrders.st.${order.status}`)}
          </span>
        </td>
        <td className="muted">{order.moyskladId || "—"}</td>
        <td className="muted">{order.trackingNumber || "—"}</td>
      </tr>

      {open && (
        <tr>
          <td colSpan={8} style={{ background: "var(--bg-soft, transparent)" }}>
            {!items ? (
              <span className="muted">{t("app.loading")}</span>
            ) : items.length === 0 ? (
              <span className="error">{t("uzumOrders.noItems")}</span>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Barcode</th>
                    <th>{t("uzumOrders.amount")}</th>
                    <th title={t("uzumOrders.qtyMcHint")}>{t("uzumOrders.qtyMc")}</th>
                    <th>{t("uzumOrders.productRef")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.itemId}>
                      <td><code>{it.skuTitle || "—"}</code></td>
                      <td className="muted">{it.barcode || "—"}</td>
                      <td>{it.amount ?? "—"}</td>
                      <td>{it.quantityForMc ?? "—"}</td>
                      {/* MoySklad tovarining NOMI — UUID emas. Bog'lanmagan
                          bo'lsa buyurtma MoySklad'ga umuman o'tmaydi. */}
                      <td className={it.productRef ? "" : "error"}>
                        {it.productRef ? (
                          <>
                            {it.mcProductName || <span className="muted">{it.productRef}</span>}
                            {it.mcExternalId && <div className="muted">{it.mcExternalId}</div>}
                          </>
                        ) : (
                          t("uzumOrders.noRef")
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
