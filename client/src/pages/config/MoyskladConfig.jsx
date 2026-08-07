import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api";
import { useSection, SectionBody } from "./common";

// MoySklad tokeni. Ilgari faqat serverdagi `.env` da edi — endi shu yerdan
// boshqariladi (v3 dagi `mc_token!A2` ning o'rni).
export default function MoyskladConfig() {
  const { t } = useTranslation();
  const fetcher = useCallback(() => api.moysklad(), []);
  const { data, error, note, run } = useSection(fetcher);
  const [token, setToken] = useState("");
  const [test, setTest] = useState(null);

  const runTest = async () => {
    setTest(null);
    try {
      setTest(await api.testMc());
    } catch (e) {
      setTest({ ok: false, error: e.message });
    }
  };

  return (
    <SectionBody data={data} error={error} note={note}>
      <div className="card">
        <h2>MoySklad</h2>
        <p className="muted" style={{ marginTop: 0 }}>{t("cfg.mcHint")}</p>

        <table>
          <tbody>
            <tr>
              <td>{t("cfg.mcToken")}</td>
              <td>{data?.hasToken ? <code>{data.masked}</code> : <span className="muted">{t("cfg.mcNoToken")}</span>}</td>
            </tr>
            <tr>
              <td>{t("cfg.mcSource")}</td>
              <td>
                {data?.source === "db" && <span className="badge on">{t("cfg.mcSourceDb")}</span>}
                {data?.source === "env" && <span className="badge off">.env</span>}
                {data?.source === "none" && <span className="muted">—</span>}
                {data?.updatedAt && <span className="muted"> · {data.updatedAt} {data.updatedBy}</span>}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="row" style={{ marginTop: 14 }}>
          <input
            type="password"
            placeholder={t("cfg.mcNewToken")}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            style={{ width: 320 }}
          />
          <button
            disabled={!token.trim()}
            onClick={() => run(() => api.setMcToken(token), t("vars.saved")).then(() => setToken(""))}
          >
            {t("vars.save")}
          </button>
          <button className="ghost" onClick={runTest}>🔌 {t("cfg.test")}</button>
          {data?.source === "db" && (
            <button className="link" onClick={() => confirm(t("cfg.mcClearConfirm")) && run(() => api.clearMcToken())}>
              {t("cfg.mcClear")}
            </button>
          )}
        </div>

        {test && (
          <div className={`badge ${test.ok ? "on" : "off"}`} style={{ marginTop: 10 }}>
            {test.ok ? `✓ ${test.name}${test.email ? ` (${test.email})` : ""}` : `✕ ${test.error}`}
          </div>
        )}
      </div>
    </SectionBody>
  );
}
