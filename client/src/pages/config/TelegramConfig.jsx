import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api";
import { useSection, SectionBody, AddForm } from "./common";

// Telegram — DMS v8 dagidek: bot va chat alohida katalog, integratsiya esa
// shu ikkovidan tanlab oladi. Shuning uchun xabar yuboruvchi kod chat_id va
// mavzu ID sini bilmaydi — integratsiya kalitini beradi, xolos.
export default function TelegramConfig() {
  const { t } = useTranslation();
  const fetcher = useCallback(() => api.telegram(), []);
  const { data, error, note, run } = useSection(fetcher);

  return (
    <SectionBody data={data} error={error} note={note}>
      <Bots data={data} run={run} />
      <Chats data={data} run={run} />
      <Bindings data={data} run={run} />
    </SectionBody>
  );
}

const mask = (tok) => (tok ? `${tok.slice(0, 6)}…${tok.slice(-4)}` : "—");

function Bots({ data, run }) {
  const { t } = useTranslation();
  const [test, setTest] = useState({});

  const runTest = async (id) => {
    setTest((s) => ({ ...s, [id]: null }));
    try {
      const r = await api.testTgBot(id);
      setTest((s) => ({ ...s, [id]: r }));
    } catch (e) {
      setTest((s) => ({ ...s, [id]: { ok: false, error: e.message } }));
    }
  };

  return (
    <div className="card">
      <h2>{t("tg.bots")}</h2>
      {data.bots.length === 0 ? (
        <div className="muted">{t("tg.noBots")}</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t("tg.botName")}</th>
              <th>{t("vars.token")}</th>
              <th>{t("tg.active")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.bots.map((b) => (
              <tr key={b.id} className={b.is_active ? "" : "muted"}>
                <td>{b.name}</td>
                <td><code>{mask(b.token)}</code></td>
                <td>
                  <input
                    type="checkbox"
                    checked={Boolean(b.is_active)}
                    onChange={(e) => run(() => api.editTgBot(b.id, { isActive: e.target.checked }))}
                  />
                </td>
                <td>
                  <div className="row">
                    <button className="ghost" onClick={() => runTest(b.id)}>🔌 {t("cfg.test")}</button>
                    {test[b.id] && (
                      <span className={`badge ${test[b.id].ok ? "on" : "off"}`}>
                        {test[b.id].ok ? `✓ @${test[b.id].username}` : `✕ ${test[b.id].error}`}
                      </span>
                    )}
                    <button className="link" onClick={() => confirm(`${b.name} — ${t("vars.confirmRemove")}`) && run(() => api.deleteTgBot(b.id))}>
                      {t("vars.remove")}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <AddForm
        fields={[
          { key: "name", placeholder: t("tg.botName") },
          { key: "token", placeholder: "123456:ABC-DEF…", type: "password" },
        ]}
        label={t("tg.addBot")}
        onSubmit={(v) => run(() => api.addTgBot({ name: v.name, token: v.token }), t("vars.added"))}
      />
    </div>
  );
}

function Chats({ data, run }) {
  const { t } = useTranslation();

  return (
    <div className="card">
      <h2>{t("tg.chats")}</h2>
      <p className="muted" style={{ marginTop: 0 }}>{t("tg.chatsHint")}</p>

      {data.chats.length === 0 ? (
        <div className="muted">{t("tg.noChats")}</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t("tg.chatName")}</th>
              <th>chat_id</th>
              <th>{t("tg.type")}</th>
              <th>{t("tg.topic")}</th>
              <th>{t("tg.active")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.chats.map((c) => (
              <tr key={c.id} className={c.is_active ? "" : "muted"}>
                <td>{c.name}</td>
                <td><code>{c.chat_id}</code></td>
                <td>{t(`tg.type_${c.type}`)}</td>
                <td>{c.topic_id ? <code>{c.topic_id}</code> : <span className="muted">—</span>}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={Boolean(c.is_active)}
                    onChange={(e) => run(() => api.editTgChat(c.id, { isActive: e.target.checked }))}
                  />
                </td>
                <td>
                  <button className="link" onClick={() => confirm(`${c.name} — ${t("vars.confirmRemove")}`) && run(() => api.deleteTgChat(c.id))}>
                    {t("vars.remove")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <AddForm
        fields={[
          { key: "name", placeholder: t("tg.chatName") },
          { key: "chatId", placeholder: "-1001234567890" },
          { key: "type", options: data.chatTypes.map((v) => ({ value: v, label: t(`tg.type_${v}`) })) },
          { key: "topicId", placeholder: t("tg.topicOptional"), optional: true },
        ]}
        label={t("tg.addChat")}
        onSubmit={(v) =>
          run(
            () => api.addTgChat({ name: v.name, chatId: v.chatId, type: v.type || "group", topicId: v.topicId }),
            t("vars.added")
          )
        }
      />
    </div>
  );
}

// Integratsiyaga biriktirish — v8 dagi `RefundRequestConfig` bilan bir xil
// mantiq: tanlanishi bilan darhol saqlanadi, alohida "Saqlash" tugmasi yo'q.
function Bindings({ data, run }) {
  const { t } = useTranslation();
  const [test, setTest] = useState({});

  const runTest = async (key) => {
    setTest((s) => ({ ...s, [key]: null }));
    try {
      const r = await api.testTgBinding(key);
      setTest((s) => ({ ...s, [key]: r }));
    } catch (e) {
      setTest((s) => ({ ...s, [key]: { sent: false, reason: e.message } }));
    }
  };

  return (
    <div className="card">
      <h2>{t("tg.bindings")}</h2>
      <p className="muted" style={{ marginTop: 0 }}>{t("tg.bindingsHint")}</p>

      <table>
        <thead>
          <tr>
            <th>{t("tg.integration")}</th>
            <th>{t("tg.bot")}</th>
            <th>{t("tg.chat")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.integrations.map((i) => (
            <tr key={i.key}>
              <td>{i.label}</td>
              <td>
                <select
                  value={i.bot_id || ""}
                  onChange={(e) => run(() => api.bindTg(i.key, e.target.value || null, i.chat_id))}
                >
                  <option value="">—</option>
                  {data.bots.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </td>
              <td>
                <select
                  value={i.chat_id || ""}
                  onChange={(e) => run(() => api.bindTg(i.key, i.bot_id, e.target.value || null))}
                >
                  <option value="">—</option>
                  {data.chats.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </td>
              <td>
                <div className="row">
                  <button className="ghost" disabled={!i.bot_id || !i.chat_id} onClick={() => runTest(i.key)}>
                    {t("tg.sendTest")}
                  </button>
                  {test[i.key] && (
                    <span className={`badge ${test[i.key].sent ? "on" : "off"}`}>
                      {test[i.key].sent ? `✓ ${t("tg.sent")}` : `✕ ${test[i.key].reason}`}
                    </span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
