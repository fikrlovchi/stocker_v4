import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import PendingOrders from "./PendingOrders";

// Yig'ish bo'limi = partiyalar. Bu yerda admin buyurtma ID ro'yxatini
// joylaydi; telefon faqat OCHIQ partiyadagi buyurtmalarni ko'radi.
export default function Packing() {
  const { t } = useTranslation();
  const [list, setList] = useState([]);
  const [selected, setSelected] = useState(null); // {batch, shops, orders}
  const [shop, setShop] = useState(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // yangi partiya natijasi
  // Ikki ko'rinish: yig'ilishi kerak buyurtmalar (o'zi chiqadi) va
  // partiyalar (qo'lda tuzilgan ro'yxatlar). Birinchisi standart —
  // 5-bosqichda asosiy ish shu bo'ldi.
  const [tab, setTab] = useState("pending");

  const loadList = () =>
    api
      .listBatches()
      .then((r) => setList(r.batches))
      .catch((e) => setError(e.message));

  const openBatch = (id, shopId = null) =>
    api
      .getBatch(id, shopId)
      .then((r) => {
        setSelected(r);
        setShop(shopId);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    loadList();
  }, []);

  const run = async (fn) => {
    setError("");
    try {
      await fn();
      await loadList();
      if (selected) await openBatch(selected.batch.id, shop);
    } catch (e) {
      setError(e.message);
    }
  };

  const openCount = list.filter((b) => b.isOpen).length;

  return (
    <div className="content">
      <h1>{tab === "pending" ? t("pend.title") : t("packing.title")}</h1>
      <p className="page-sub">{tab === "pending" ? t("pend.sub") : t("packing.sub")}</p>

      <div className="row tabs" style={{ marginBottom: 16 }}>
        <button className={tab === "pending" ? "" : "ghost"} onClick={() => setTab("pending")}>
          {t("pend.tab")}
        </button>
        <button className={tab === "batches" ? "" : "ghost"} onClick={() => setTab("batches")}>
          {t("packing.tab")}
        </button>
      </div>

      {tab === "pending" ? <PendingOrders /> : <>

      {error && <div className="card error">{error}</div>}
      {openCount > 1 && <div className="card" style={{ color: "var(--warn)" }}>{t("packing.warnMany")}</div>}

      <NewBatch onCreated={(r) => { setResult(r); loadList(); }} onError={setError} />
      {result && <CreateResult result={result} onOpen={() => openBatch(result.batch.id)} />}

      <div className="card">
        <h2>{t("packing.title")}</h2>
        {list.length === 0 ? (
          <div className="muted">{t("packing.empty")}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t("packing.name")}</th>
                <th>{t("packing.progress")}</th>
                <th>{t("packing.status")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((b) => (
                <tr key={b.id}>
                  <td>
                    <button className="ghost" onClick={() => openBatch(b.id)}>{b.name}</button>
                    <div className="muted">{b.createdAt} · {b.createdBy}</div>
                  </td>
                  <td>
                    <Progress packed={b.packed} total={b.total} />
                  </td>
                  <td>
                    <span className={`badge ${b.isOpen ? "on" : "off"}`}>
                      {b.isOpen ? t("packing.open") : t("packing.closed")}
                    </span>
                  </td>
                  <td>
                    <div className="row">
                      {b.isOpen ? (
                        <button className="ghost" onClick={() => run(() => api.closeBatch(b.id))}>
                          {t("packing.close")}
                        </button>
                      ) : (
                        <button className="ghost" onClick={() => run(() => api.reopenBatch(b.id))}>
                          {t("packing.reopen")}
                        </button>
                      )}
                      <button
                        className="link"
                        onClick={() => {
                          if (confirm(`${b.name} — ${t("packing.confirmRemove")}`)) {
                            run(() => api.deleteBatch(b.id).then(() => setSelected(null)));
                          }
                        }}
                      >
                        {t("packing.remove")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <BatchDetail
          data={selected}
          shop={shop}
          onShop={(s) => openBatch(selected.batch.id, s)}
          onRemoveOrder={(orderId) => run(() => api.removeBatchOrder(selected.batch.id, orderId))}
        />
      )}
      </>}
    </div>
  );
}

// "2/22" — mobil ilovadagi ko'rsatkich bilan bir xil hisob.
function Progress({ packed, total }) {
  const percent = total ? Math.round((packed / total) * 100) : 0;
  return (
    <div style={{ minWidth: 120 }}>
      <b>{packed}/{total}</b>
      <div style={{ height: 6, background: "var(--surface-2)", borderRadius: 999, marginTop: 4 }}>
        <div style={{ width: `${percent}%`, height: "100%", background: "var(--accent)", borderRadius: 999 }} />
      </div>
    </div>
  );
}

function NewBatch({ onCreated, onError }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [orders, setOrders] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.createBatch(name.trim(), orders);
      setName("");
      setOrders("");
      onCreated(r);
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2>{t("packing.newBatch")}</h2>
      <div className="row" style={{ marginBottom: 10 }}>
        <input
          placeholder={t("packing.namePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ minWidth: 260 }}
        />
      </div>
      <label className="muted">{t("packing.orders")}</label>
      <textarea
        value={orders}
        onChange={(e) => setOrders(e.target.value)}
        placeholder={t("packing.ordersPlaceholder")}
        rows={6}
        style={{
          width: "100%",
          marginTop: 6,
          padding: 12,
          borderRadius: 12,
          border: "1px solid var(--border)",
          background: "var(--bg)",
          color: "var(--text)",
          fontFamily: "ui-monospace, Consolas, monospace",
          fontSize: 13,
        }}
      />
      <div className="row" style={{ marginTop: 12 }}>
        <button disabled={busy || !name.trim() || !orders.trim()} onClick={submit}>
          {t("packing.create")}
        </button>
        <span className="muted">{orders.split(/[\s,;]+/).filter(Boolean).length}</span>
      </div>
    </div>
  );
}

// Yaratilgandan keyingi hisobot: qaysi ID qo'shildi, qaysi biri keshda
// topilmadi, qaysi biri boshqa ochiq partiyada qolib ketdi.
function CreateResult({ result, onOpen }) {
  const { t } = useTranslation();
  return (
    <div className="card">
      <div className="row">
        <b>{result.batch.name}</b>
        <span className="badge on">{result.added.length} {t("packing.added")}</span>
        {result.unknown.length > 0 && (
          <span className="badge off">{result.unknown.length} {t("packing.unknown")}</span>
        )}
        {result.skipped.length > 0 && (
          <span className="badge off">{result.skipped.length} {t("packing.skipped")}</span>
        )}
        <button className="ghost" onClick={onOpen}>→</button>
      </div>
      {result.unknown.length > 0 && (
        <div className="muted" style={{ marginTop: 8 }}>
          {t("packing.unknown")}: <code>{result.unknown.join(", ")}</code>
        </div>
      )}
      {result.skipped.length > 0 && (
        <div className="muted" style={{ marginTop: 4 }}>
          {t("packing.skipped")}: <code>{result.skipped.map((s) => `${s.orderId} (${s.batch})`).join(", ")}</code>
        </div>
      )}
    </div>
  );
}

function BatchDetail({ data, shop, onShop, onRemoveOrder }) {
  const { t } = useTranslation();
  const { batch, shops, orders } = data;

  return (
    <div className="card">
      <h2>
        {batch.name} · <Progress packed={batch.packed} total={batch.total} />
      </h2>

      <div className="row" style={{ margin: "10px 0 16px" }}>
        <button className={shop ? "ghost" : ""} onClick={() => onShop(null)}>{t("packing.all")}</button>
        {shops.map((s) => (
          <button key={s.shopId} className={shop === s.shopId ? "" : "ghost"} onClick={() => onShop(s.shopId)}>
            {s.name || s.shopId} · {s.packed}/{s.total}
          </button>
        ))}
      </div>

      <table>
        <thead>
          <tr>
            <th>{t("packing.orderId")}</th>
            <th>{t("packing.shop")}</th>
            <th>{t("packing.status")}</th>
            <th>{t("packing.packedBy")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.orderId}>
              <td>
                <code>{o.orderId}</code>
                {!o.inCache && <span className="badge off" style={{ marginLeft: 8 }}>{t("packing.notInCache")}</span>}
                {o.inCache && !o.eligible && (
                  <span className="badge off" style={{ marginLeft: 8 }}>{t("packing.notEligible")}</span>
                )}
              </td>
              <td>{o.shopName || o.shopId || "—"}</td>
              <td>
                <span className={`badge ${o.status === "packed" ? "on" : "off"}`}>
                  {o.status === "packed" ? t("packing.statusPacked") : t("packing.statusPending")}
                </span>
              </td>
              <td className="muted">{o.packedBy || "—"}</td>
              <td>
                {o.status !== "packed" && (
                  <button className="link" onClick={() => onRemoveOrder(o.orderId)}>×</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
