import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";

// Qoldiq oqimlari — Integratsiyalar bo'limi ichida.
//
// Ikkita oqim: MoySklad'dan o'qish va Uzumga yuborish. Har biri uchun
// holat, jadval sozlamasi, qo'lda ishga tushirish va tarix.
//
// "Barcode → MoySklad" bu yerda YO'Q: u yangi tovar bog'lamasi qo'shilganda
// bajariladi (v3 dagi AppSheet automation'i kabi), jadval bo'yicha
// takrorlanmaydi. Natijasi "Barcode va SKU jurnali" bo'limida.
//
// Muhim: "Yuborish" tugmasi ATAYLAB ikki qadamli. Dry-run — bir bosishda,
// haqiqiy yuborish esa tasdiqlash bilan: bu tashqi natijaga olib keladi
// (Uzumda tovar sotuvdan chiqishi mumkin).
const FLOWS = ["sync", "push"];

export default function StockFlows() {
  const { t } = useTranslation();
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState({});

  const load = useCallback(async () => {
    try {
      setStatus(await api.stockStatus());
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runFlow = async (kind, body, label) => {
    setError("");
    setBusy(kind);
    setResult((s) => ({ ...s, [kind]: null }));
    try {
      const r = await api.stockRun(kind, body);
      setResult((s) => ({ ...s, [kind]: { ...r.run, label } }));
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const saveSchedule = async (kind, patch) => {
    setError("");
    try {
      await api.stockSchedule({ [kind]: patch });
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  if (!status) {
    return (
      <>
        {error && <div className="card error">{error}</div>}
        {!error && <div className="card muted">{t("app.loading")}</div>}
      </>
    );
  }

  return (
    <>
      {error && <div className="card error">{error}</div>}

      <CacheCard cache={status.cache} log={status.stockLog} />

      {FLOWS.map((kind) => (
        <FlowCard
          key={kind}
          kind={kind}
          schedule={status.schedule[kind]}
          last={status.last[kind]}
          busy={busy === kind}
          result={result[kind]}
          onRun={runFlow}
          onSchedule={saveSchedule}
        />
      ))}
    </>
  );
}

// Qoldiq keshining holati. Bu karta birinchi turadi, chunki 2026-08-07 da
// aynan bo'sh kesh 20 ta SKU'ni Uzumda nolga tushirgan.
function CacheCard({ cache, log }) {
  const { t } = useTranslation();
  const empty = !cache.stockRows;

  return (
    <div className="card">
      <h2>{t("flows.cache")}</h2>
      <table>
        <tbody>
          <tr>
            <td>{t("flows.stockRows")}</td>
            <td className={empty ? "error" : ""}>
              <b>{cache.stockRows}</b>
              {empty && ` — ${t("flows.cacheEmpty")}`}
            </td>
          </tr>
          <tr>
            <td>{t("flows.stockSyncedAt")}</td>
            <td>{cache.stockSyncedAt || <span className="muted">{t("flows.never")}</span>}</td>
          </tr>
          <tr>
            <td>{t("flows.productRows")}</td>
            <td>{cache.productRows}</td>
          </tr>
          <tr>
            <td>{t("flows.linkRows")}</td>
            <td>{cache.linkRows}</td>
          </tr>
        </tbody>
      </table>

      {log?.runs > 0 && (
        <p className="muted" style={{ marginBottom: 0 }}>
          {t("flows.logSummary", {
            runs: log.runs,
            rejected: log.rejected,
            restored: log.restoredTotal,
            zeroed: log.zeroedTotal,
          })}
        </p>
      )}
    </div>
  );
}

function FlowCard({ kind, schedule, last, busy, result, onRun, onSchedule }) {
  const { t } = useTranslation();
  const [interval, setInterval] = useState(String(schedule.intervalMinutes));
  const [confirmSend, setConfirmSend] = useState(false);

  useEffect(() => setInterval(String(schedule.intervalMinutes)), [schedule.intervalMinutes]);

  // `sync` tashqariga yozmaydi (faqat MoySklad'dan o'qiydi), shuning uchun
  // unda tasdiqlash kerak emas.
  const writes = kind !== "sync";

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>{t(`flows.${kind}.title`)}</h2>
        <span className={`badge ${schedule.enabled ? "on" : "off"}`}>
          {schedule.enabled ? t("flows.scheduleOn", { n: schedule.intervalMinutes }) : t("flows.scheduleOff")}
        </span>
      </div>
      <p className="muted" style={{ marginTop: 4 }}>{t(`flows.${kind}.hint`)}</p>

      <div className="row">
        <button disabled={busy} onClick={() => onRun(kind, { dryRun: true }, t("flows.dryRun"))}>
          {busy ? t("flows.running") : t("flows.dryRun")}
        </button>

        {writes &&
          (confirmSend ? (
            <>
              <button
                disabled={busy}
                onClick={() => {
                  setConfirmSend(false);
                  onRun(kind, { dryRun: false }, t("flows.realRun"));
                }}
              >
                {t("flows.confirmSend")}
              </button>
              <button className="ghost" onClick={() => setConfirmSend(false)}>{t("flows.cancel")}</button>
            </>
          ) : (
            <button className="ghost" disabled={busy} onClick={() => setConfirmSend(true)}>
              {t("flows.realRun")}
            </button>
          ))}
        {!writes && (
          <button disabled={busy} onClick={() => onRun(kind, { dryRun: false }, t("flows.realRun"))}>
            {t("flows.syncNow")}
          </button>
        )}
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <label className="row" style={{ gap: 6 }}>
          <input
            type="checkbox"
            checked={schedule.enabled}
            onChange={(e) => onSchedule(kind, { enabled: e.target.checked })}
          />
          {t("flows.autoRun")}
        </label>
        <input value={interval} onChange={(e) => setInterval(e.target.value)} style={{ width: 70 }} />
        <span className="muted">{t("flows.minutes")}</span>
        <button
          className="ghost"
          disabled={interval === String(schedule.intervalMinutes)}
          onClick={() => onSchedule(kind, { intervalMinutes: Number(interval) })}
        >
          {t("flows.saveInterval")}
        </button>
      </div>

      {result && <RunResult run={result} />}
      {last && !result && <RunSummary run={last} prefix={t("flows.lastRun")} />}
      <History kind={kind} />
    </div>
  );
}

const STATUS_CLASS = { success: "on", partial: "off", error: "off", blocked: "off", running: "off" };

function RunResult({ run }) {
  const { t } = useTranslation();
  const s = run.summary || {};

  return (
    <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
      <div className="row">
        <span className={`badge ${STATUS_CLASS[run.status] || "off"}`}>{t(`flows.status.${run.status}`)}</span>
        <span className="muted">{run.label}</span>
      </div>

      {/* Himoya to'xtatgan bo'lsa sabab birinchi o'rinda ko'rinishi kerak. */}
      {s.safety && !s.safety.ok && (
        <div className="card error" style={{ marginTop: 8 }}>
          <b>{t("flows.blocked")}</b>
          <ul style={{ margin: "6px 0 0 18px" }}>
            {s.safety.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {run.error && <div className="card error" style={{ marginTop: 8 }}>{run.error}</div>}
      <RunSummary run={run} />
    </div>
  );
}

function RunSummary({ run, prefix }) {
  const { t } = useTranslation();
  const s = run.summary || {};
  const bits = [];

  if (s.toSend !== undefined) bits.push(`${t("flows.toSend")}: ${s.toSend}`);
  if (s.zeros !== undefined) bits.push(`${t("flows.zeros")}: ${s.zeros}`);
  if (s.sent !== undefined) bits.push(`${t("flows.sent")}: ${s.sent}/${s.total}`);
  if (s.failed) bits.push(`${t("flows.failed")}: ${s.failed}`);
  if (s.stock) bits.push(`${t("flows.stockRows")}: ${s.stock.total ?? s.stock.stored ?? "—"}`);
  if (s.products) bits.push(`mc_product: ${s.products.total}`);
  if (s.added !== undefined) bits.push(`${t("flows.added")}: ${s.added}`);
  if (s.pending !== undefined) bits.push(`${t("flows.pending")}: ${s.pending}`);

  if (!bits.length && !prefix) return null;

  return (
    <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
      {prefix && `${prefix} (${run.started_at}) · `}
      {bits.join(" · ")}
    </p>
  );
}

function History({ kind }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [runs, setRuns] = useState(null);

  const load = async () => {
    try {
      setRuns((await api.stockRuns(kind, 15)).runs);
    } catch {
      setRuns([]);
    }
  };

  const toggle = () => {
    setOpen(!open);
    if (!open && !runs) load();
  };

  return (
    <div style={{ marginTop: 10 }}>
      <button className="ghost" onClick={toggle}>
        {open ? t("flows.hideHistory") : t("flows.showHistory")}
      </button>

      {open && (
        <table style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>{t("flows.startedAt")}</th>
              <th>{t("flows.status.title")}</th>
              <th>{t("flows.trigger")}</th>
              <th>{t("flows.who")}</th>
              <th>{t("flows.details")}</th>
            </tr>
          </thead>
          <tbody>
            {!runs && (
              <tr><td colSpan="5" className="muted">{t("app.loading")}</td></tr>
            )}
            {runs?.length === 0 && (
              <tr><td colSpan="5" className="muted">{t("flows.noRuns")}</td></tr>
            )}
            {runs?.map((r) => (
              <tr key={r.id}>
                <td>{r.started_at}</td>
                <td>
                  <span className={`badge ${STATUS_CLASS[r.status] || "off"}`}>{t(`flows.status.${r.status}`)}</span>
                  {r.dry_run && <span className="badge off" style={{ marginLeft: 4 }}>{t("flows.dryRun")}</span>}
                </td>
                <td>{t(`flows.trigger_${r.trigger}`, r.trigger)}</td>
                <td>{r.started_by || "—"}</td>
                <td className="muted">{r.error || summaryLine(r.summary)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function summaryLine(s) {
  if (!s) return "—";
  if (s.sent !== undefined) return `${s.sent}/${s.total}`;
  if (s.safety && !s.safety.ok) return s.safety.problems.join("; ");
  if (s.toSend !== undefined) return `${s.toSend} SKU, ${s.zeros} nol`;
  if (s.added !== undefined) return `+${s.added}, ${s.already} bor edi`;
  if (s.stock) return `mc_stock ${s.stock.total ?? "—"}`;
  return "—";
}
