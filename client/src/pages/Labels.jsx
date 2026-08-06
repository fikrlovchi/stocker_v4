import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, blobUrl } from "../api";

// Konstruktor maydonlari — eski dashboard bilan bir xil kalitlar, shuning
// uchun uzumPDFs tomonida hech nima o'zgarmaydi.
const CFG_FIELDS = [
  { key: "pw", label: "Bet eni (pt)" },
  { key: "ph", label: "Bet bo'yi (pt)" },
  { key: "qr", label: "QR o'lchami" },
  { key: "qx", label: "QR X" },
  { key: "qy", label: "QR Y" },
  { key: "tt", label: "Yuqori matn" },
  { key: "bs", label: "Shtrix o'lchami" },
  { key: "os", label: "Buyurtma o'lchami" },
  { key: "tx", label: "Sarlavha X" },
  { key: "ty", label: "Sarlavha Y" },
  { key: "bx", label: "Shtrix X" },
  { key: "by", label: "Shtrix Y" },
];

const CFG_STORE = "stocker.pdfCfg";

// Bo'sh maydon "sozlanmagan" degani — serverga yuborilmaydi (u o'z
// standartini ishlatadi).
function buildConfig(cfg) {
  const num = (k) => (cfg[k] === "" || cfg[k] === undefined ? null : Number(cfg[k]));
  const out = {
    orientation: cfg.ori || undefined,
    qrSize: num("qr"),
    pageSize: { width: num("pw"), height: num("ph") },
    textSize: { top: num("tt"), bottom: num("bs") },
    qrPosition: { x: num("qx"), y: num("qy") },
    barcodeSize: num("bs"),
    orderSize: num("os"),
  };
  if (num("tx") !== null || num("ty") !== null) out.titlePosition = { x: num("tx"), y: num("ty") };
  if (num("bx") !== null || num("by") !== null) out.barcodePosition = { x: num("bx"), y: num("by") };
  return out;
}

export default function Labels() {
  const { t } = useTranslation();
  const [orders, setOrders] = useState("");
  const [cfg, setCfg] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(CFG_STORE) || "{}");
    } catch {
      return {};
    }
  });
  const [batch, setBatch] = useState(null); // {shk, big}
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const [showCfg, setShowCfg] = useState(false);
  const [preview, setPreview] = useState({ url: null, note: "" });

  const poller = useRef(null);
  const previewTimer = useRef(null);

  const ids = orders.split(/[\s,;]+/).filter(Boolean);

  const loadHistory = () => api.labelsHistory().then(setHistory).catch(() => {});

  useEffect(() => {
    loadHistory();
    return () => {
      clearTimeout(poller.current);
      clearTimeout(previewTimer.current);
    };
  }, []);

  // Konstruktor o'zgarganda namuna qayta yasaladi — lekin har harfda emas.
  useEffect(() => {
    if (!showCfg) return;
    clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(async () => {
      setPreview((p) => ({ ...p, note: "…" }));
      try {
        const url = await blobUrl("/labels/preview", { method: "POST", body: { pdfConfig: buildConfig(cfg) } });
        setPreview((prev) => {
          if (prev.url) URL.revokeObjectURL(prev.url);
          return { url, note: "" };
        });
      } catch (e) {
        setPreview((p) => ({ ...p, note: e.message }));
      }
    }, 400);
  }, [cfg, showCfg]);

  const setField = (key, value) => {
    const next = { ...cfg, [key]: value };
    setCfg(next);
    localStorage.setItem(CFG_STORE, JSON.stringify(next));
  };

  const poll = async (batchId) => {
    try {
      const b = await api.labelsBatch(batchId);
      setBatch(b);
      const busy = b.shk?.status === "pending" || b.big?.status === "pending";
      if (busy) poller.current = setTimeout(() => poll(batchId), 1500);
      else {
        setRunning(false);
        loadHistory();
      }
    } catch (e) {
      setError(e.message);
      setRunning(false);
    }
  };

  const start = async () => {
    if (!ids.length) return;
    setError("");
    setBatch(null);
    setRunning(true);
    try {
      const r = await api.labelsProcess(ids, buildConfig(cfg));
      if (!r.batchId) throw new Error(r.message || "Server xatosi");
      poll(r.batchId);
    } catch (e) {
      setError(e.message);
      setRunning(false);
    }
  };

  return (
    <div className="content">
      <h1>{t("labels.title")}</h1>
      <p className="page-sub">{t("labels.sub")}</p>

      {error && <div className="card error">{error}</div>}

      <div className="card">
        <h2>{t("labels.orders")}</h2>
        <textarea
          value={orders}
          onChange={(e) => setOrders(e.target.value)}
          rows={6}
          placeholder={"116649323\n118799194"}
          style={{
            width: "100%",
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
          <button disabled={running || !ids.length} onClick={start}>
            {running ? "…" : t("labels.make")}
          </button>
          <span className="muted">{ids.length}</span>
          <button className="ghost" onClick={() => setShowCfg((v) => !v)}>
            {t("labels.constructor")}
          </button>
        </div>
      </div>

      {showCfg && (
        <div className="card">
          <h2>{t("labels.constructor")}</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
            <label className="muted" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {t("labels.orientation")}
              <select value={cfg.ori || ""} onChange={(e) => setField("ori", e.target.value)}>
                <option value="">—</option>
                <option value="portrait">portrait</option>
                <option value="landscape">landscape</option>
              </select>
            </label>
            {CFG_FIELDS.map((f) => (
              <label key={f.key} className="muted" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {f.label}
                <input
                  type="number"
                  value={cfg[f.key] ?? ""}
                  onChange={(e) => setField(f.key, e.target.value)}
                />
              </label>
            ))}
          </div>
          <div className="muted" style={{ marginTop: 10 }}>
            {t("labels.previewNote")} {preview.note}
          </div>
          {preview.url && (
            <iframe
              title="preview"
              src={preview.url}
              style={{ width: "100%", height: 420, marginTop: 10, border: "1px solid var(--border)", borderRadius: 12, background: "#fff" }}
            />
          )}
        </div>
      )}

      {batch && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
          <ResultPane title="ShK" state={batch.shk} running={running} />
          <ResultPane title="BIG" state={batch.big} running={running} />
        </div>
      )}

      <div className="card">
        <h2>{t("labels.history")}</h2>
        {history.length === 0 ? (
          <div className="muted">{t("labels.historyEmpty")}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t("labels.date")}</th>
                <th>{t("labels.count")}</th>
                <th>ShK</th>
                <th>BIG</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={i}>
                  <td className="muted">{new Date(h.date).toLocaleString()}</td>
                  <td>{h.orders}</td>
                  <td><FileLink file={h.shk} /></td>
                  <td><FileLink file={h.big} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ResultPane({ title, state, running }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState(null);

  // Fayl `fetch` bilan olinadi (token sarlavhasi kerak), so'ng blob sifatida
  // ko'rsatiladi — `<iframe src>` sarlavha yubora olmaydi.
  useEffect(() => {
    let revoked = null;
    if (state?.status === "done" && state.fileName) {
      blobUrl(`/labels/files/${encodeURIComponent(state.fileName)}`)
        .then((u) => {
          revoked = u;
          setUrl(u);
        })
        .catch(() => setUrl(null));
    } else {
      setUrl(null);
    }
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [state?.status, state?.fileName]);

  return (
    <div className="card">
      <h2>{title}</h2>
      {!state || state.status === "pending" ? (
        <div className="muted">{running ? t("labels.working") : "—"}</div>
      ) : state.status === "error" ? (
        <div className="error">{state.error || "?"}</div>
      ) : (
        <>
          <div className="muted">
            {state.orders} → {state.pages ? `${state.pages} ${t("labels.pages")}` : `${state.merged} ${t("labels.files")}`}
            {state.skipped ? ` (skip ${state.skipped})` : ""}
          </div>
          {url && (
            <>
              <a href={url} download={state.fileName}>{state.fileName} ⬇</a>
              <iframe
                title={title}
                src={url}
                style={{ width: "100%", height: 420, marginTop: 10, border: "1px solid var(--border)", borderRadius: 12, background: "#fff" }}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

function FileLink({ file }) {
  const [url, setUrl] = useState(null);
  if (!file?.fileName) return <span className="muted">—</span>;
  if (!url) {
    return (
      <button
        className="ghost"
        onClick={() =>
          blobUrl(`/labels/files/${encodeURIComponent(file.fileName)}`).then((u) => {
            setUrl(u);
            window.open(u, "_blank");
          })
        }
      >
        {file.fileName}
      </button>
    );
  }
  return <a href={url} target="_blank" rel="noreferrer">{file.fileName}</a>;
}
