import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import StockFlows from "./StockFlows";
import SkuLog from "./SkuLog";

// Menyuda "Uzum order to MC" deb turadi, lekin ekran loyihaga bog'lanmagan:
// yuqoridagi tanlovdan `cancel-uzum-order`, `mc-stock-to-uzum` va `stocker`
// ham ochiladi. Panel o'chgach ular boshqaruvsiz qolmasligi uchun.
const DEFAULT_SLUG = "uzum-order-to-mc";

// Loyiha slug'i emas — tanlov qatoridagi "Qoldiq oqimlari" varag'i.
// Ikki nuqta bilan boshlanadi, shuning uchun haqiqiy slug bilan
// to'qnashmaydi.
const STOCK_SLUG = "::stock";
const SKULOG_SLUG = "::sku-log";

export default function Projects() {
  const { t } = useTranslation();
  const [list, setList] = useState([]);
  const [slug, setSlug] = useState(DEFAULT_SLUG);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [interval, setIntervalValue] = useState("");

  const loadList = () => api.listProjects().then((r) => setList(r.projects)).catch((e) => setError(e.message));
  const loadOne = (s) =>
    api
      .getProject(s)
      .then((r) => {
        setData(r);
        setIntervalValue(r.intervalSeconds ?? "");
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    loadList();
  }, []);

  useEffect(() => {
    setData(null);
    // Qoldiq oqimlari varag'i loyiha emas — `/projects/::stock` so'ralmasin.
    if (slug !== STOCK_SLUG && slug !== SKULOG_SLUG) loadOne(slug);
  }, [slug]);

  const act = async (fn) => {
    setError("");
    try {
      await fn();
      await loadOne(slug);
      await loadList();
    } catch (e) {
      setError(e.message);
    }
  };

  const project = data?.project;
  const status = data?.status;

  // Qoldiq oqimlari systemd loyihasi emas — ular server ichida ishlaydi.
  // Lekin foydalanuvchi uchun bu ham "integratsiya", shuning uchun shu
  // yerda, o'sha tanlov qatoridan ochiladi.
  const stockTab = slug === STOCK_SLUG;
  const skuLogTab = slug === SKULOG_SLUG;

  return (
    <div className="content">
      <h1>
        {stockTab ? t("flows.title") : skuLogTab ? t("skuLog.title") : project?.displayName || t("projects.title")}
      </h1>
      <p className="page-sub">
        {stockTab ? t("flows.sub") : skuLogTab ? t("skuLog.sub") : t("projects.sub")}
      </p>

      {error && <div className="card error">{error}</div>}

      <div className="row" style={{ marginBottom: 16 }}>
        {list.map((p) => (
          <button
            key={p.slug}
            className={p.slug === slug ? "" : "ghost"}
            onClick={() => setSlug(p.slug)}
          >
            {p.displayName}
            {p.lastError ? " ⚠" : ""}
          </button>
        ))}
        <button className={stockTab ? "" : "ghost"} onClick={() => setSlug(STOCK_SLUG)}>
          {t("flows.title")}
        </button>
        <button className={skuLogTab ? "" : "ghost"} onClick={() => setSlug(SKULOG_SLUG)}>
          {t("skuLog.title")}
        </button>
      </div>

      {stockTab ? (
        <StockFlows />
      ) : skuLogTab ? (
        <SkuLog />
      ) : !data ? (
        <div className="card muted">{t("app.loading")}</div>
      ) : (
        <>
          {project.managed && (
            <div className="card">
              <h2>{t("projects.control")}</h2>
              <div className="row">
                {status?.hasTimer && (
                  <>
                    <input
                      type="number"
                      min="10"
                      max="86400"
                      value={interval}
                      onChange={(e) => setIntervalValue(e.target.value)}
                      style={{ width: 110 }}
                    />
                    <span className="muted">{t("projects.seconds")}</span>
                    <button
                      disabled={!interval}
                      onClick={() => act(() => api.projectInterval(slug, Number(interval)))}
                    >
                      {t("projects.saveInterval")}
                    </button>
                  </>
                )}
                <button
                  className="ghost"
                  onClick={() => act(() => (project.isPaused ? api.projectResume(slug) : api.projectPause(slug)))}
                >
                  {project.isPaused ? t("projects.resume") : t("projects.pause")}
                </button>
                <button className="ghost" onClick={() => act(() => api.projectRunNow(slug))}>
                  {status?.hasTimer ? t("projects.runNow") : t("projects.restart")}
                </button>
              </div>

              {status?.error ? (
                <div className="error">{status.error}</div>
              ) : (
                <div className="muted">
                  Service: {status?.service?.ActiveState}/{status?.service?.SubState}
                  {status?.hasTimer && ` · Timer: ${status?.timer?.ActiveState}/${status?.timer?.SubState}`}
                </div>
              )}
            </div>
          )}

          {data.holdWindow && (
            <HoldWindow
              value={data.holdWindow}
              onSave={(start, end) => act(() => api.projectHoldWindow(slug, start, end))}
            />
          )}

          {data.sheetsWrite && (
            <SheetsWrite
              value={data.sheetsWrite}
              onToggle={(enabled) => act(() => api.projectSheetsWrite(slug, enabled))}
            />
          )}

          {data.envBindings.length > 0 && (
            <div className="card">
              <h2>{t("projects.env")}</h2>
              <table>
                <thead>
                  <tr>
                    <th>ENV</th>
                    <th>{t("projects.source")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.envBindings.map((b) => (
                    <tr key={b.id}>
                      <td><code>{b.env_key}</code></td>
                      <td className="muted">{b.source_type} #{b.source_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="card">
            <h2>{t("projects.runs")} <span className="muted">({data.totalRuns})</span></h2>
            {data.runs.length === 0 ? (
              <div className="muted">{t("projects.noRuns")}</div>
            ) : (
              data.runs.map((r) => <Run key={r.id} run={r} />)
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Kutish oynasi — Toshkent vaqti.
 *
 * Shu oraliqda tushgan buyurtma "Yangi" bo'lib turadi va Uzum'da darhol
 * tasdiqlanmaydi; oyna tugagach ishlanadi. Ilgari qiymat faqat `.env` da
 * edi — o'zgartirish uchun SSH kerak edi.
 */
function HoldWindow({ value, onSave }) {
  const { t } = useTranslation();
  const [start, setStart] = useState(value.start);
  const [end, setEnd] = useState(value.end);

  useEffect(() => {
    setStart(value.start);
    setEnd(value.end);
  }, [value.start, value.end]);

  const dirty = start !== value.start || end !== value.end;

  return (
    <div className="card">
      <h2>{t("projects.holdWindow")}</h2>
      <div className="muted" style={{ marginBottom: 8 }}>{t("projects.holdWindowHint")}</div>

      {value.error && <div className="error">{value.error}</div>}

      <div className="row">
        <input type="time" value={start} onChange={(e) => setStart(e.target.value)} style={{ width: 120 }} />
        <span className="muted">—</span>
        <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} style={{ width: 120 }} />
        <button disabled={!dirty} onClick={() => onSave(start, end)}>{t("projects.saveHoldWindow")}</button>
        {!dirty && (
          <span className="muted">
            {t("projects.holdWindowDefault", { start: value.defaults.start, end: value.defaults.end })}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Google Sheets'ga yozish — ko'chish davrining OXIRGI kaliti.
 *
 * O'chirilsa integratsiya tsikli UMUMAN bajarilmaydi: uning butun holati
 * jadvalda (Q·S·T·U·V). Yarim ishlash bo'lsa har tsiklda o'sha buyurtmalarni
 * qaytadan yaratardi. Shuning uchun o'chirishdan oldin tasdiq so'raladi.
 */
function SheetsWrite({ value, onToggle }) {
  const { t } = useTranslation();

  return (
    <div className={`card ${value.enabled ? "" : "error"}`}>
      <h2>{t("projects.sheetsWrite")}</h2>
      <div className="muted" style={{ marginBottom: 8 }}>{t("projects.sheetsWriteHint")}</div>

      {value.error && <div className="error">{value.error}</div>}

      <div className="row">
        <span className={`badge ${value.enabled ? "on" : "danger"}`}>
          {value.enabled ? t("projects.sheetsWriteOn") : t("projects.sheetsWriteOff")}
        </span>
        <button
          className="ghost"
          onClick={() => {
            if (value.enabled && !confirm(t("projects.sheetsWriteConfirm"))) return;
            onToggle(!value.enabled);
          }}
        >
          {value.enabled ? t("projects.sheetsWriteDisable") : t("projects.sheetsWriteEnable")}
        </button>
      </div>
    </div>
  );
}

function Run({ run }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const bad = run.status === "error" || run.error_count > 0;

  return (
    <div style={{ borderTop: "1px solid var(--border)", padding: "10px 0" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="row">
          <span className={`badge ${bad ? "off" : "on"}`}>{run.status}</span>
          <span className="muted">{new Date(run.started_at).toLocaleString()}</span>
          <span className="muted">
            ✓ {run.success_count} · ✗ {run.error_count}
          </span>
          {run.summary && <span>{run.summary}</span>}
        </div>
        {run.logs.length > 0 && (
          <button className="ghost" onClick={() => setOpen((v) => !v)}>
            {open ? "−" : `${run.logs.length} ${t("projects.logs")}`}
          </button>
        )}
      </div>

      {open && (
        <div
          style={{
            marginTop: 8,
            padding: 10,
            borderRadius: 10,
            background: "var(--bg)",
            fontFamily: "ui-monospace, Consolas, monospace",
            fontSize: 12,
            maxHeight: 320,
            overflow: "auto",
          }}
        >
          {run.logs.map((l, i) => (
            <div key={i} style={{ color: l.level === "ERROR" ? "var(--danger)" : "var(--muted)" }}>
              {l.logged_at?.slice(11, 19)} {l.level} {l.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
