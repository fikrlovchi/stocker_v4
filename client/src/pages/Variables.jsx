import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";

// O'zgaruvchilar katalogi: loyihalarning `.env` fayllariga bog'lanadigan
// qiymatlar. Do'kon nomlari ham shu yerda — ular mobil ilovada ko'rinadi,
// ya'ni bu bo'lim faqat "sozlama" emas.
export default function Variables() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const load = () => api.variables().then(setData).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const run = async (fn, okNote) => {
    setError("");
    setNote("");
    try {
      const r = await fn();
      if (r?.warning) setError(r.warning);
      else if (okNote) setNote(okNote);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  if (!data) return <div className="content muted">{t("app.loading")}</div>;

  return (
    <div className="content">
      <h1>{t("vars.title")}</h1>
      <p className="page-sub">{t("vars.sub")}</p>

      {error && <div className="card error">{error}</div>}
      {note && <div className="card muted">{note}</div>}

      {/* --- Uzum: kabinetlar va do'konlar --- */}
      <div className="card">
        <h2>{t("vars.uzum")}</h2>
        <p className="muted" style={{ marginTop: 0 }}>{t("vars.uzumHint")}</p>

        {data.cabinets.map((cab) => (
          <div key={cab.id} style={{ borderTop: "1px solid var(--border)", paddingTop: 12, marginTop: 12 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <b>{cab.name}</b>
              <div className="row">
                <button className="ghost" onClick={() => run(() => api.syncUzumShops(cab.id), t("vars.synced"))}>
                  {t("vars.sync")}
                </button>
                <button
                  className="link"
                  onClick={() => confirm(`${cab.name} — ${t("vars.confirmRemove")}`) && run(() => api.deleteVar("cabinet", cab.id))}
                >
                  {t("vars.remove")}
                </button>
              </div>
            </div>

            {cab.shops.length === 0 ? (
              <div className="muted">{t("vars.noShops")}</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>{t("vars.shopName")}</th>
                    <th>shop_id</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {cab.shops.map((shop) => (
                    <ShopRow key={shop.id} shop={shop} onRun={run} />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}

        <AddForm
          fields={[
            { key: "name", placeholder: t("vars.cabinetName") },
            { key: "token", placeholder: t("vars.token"), type: "password" },
          ]}
          label={t("vars.addCabinet")}
          onSubmit={(v) => run(() => api.addCabinet(v.name, v.token), t("vars.added"))}
        />
      </div>

      {/* --- Telegram --- */}
      <div className="card">
        <h2>Telegram</h2>
        {data.telegramBots.map((bot) => (
          <div key={bot.id} style={{ borderTop: "1px solid var(--border)", paddingTop: 12, marginTop: 12 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <b>{bot.name}</b>
              <button className="link" onClick={() => run(() => api.deleteVar("bot", bot.id))}>
                {t("vars.remove")}
              </button>
            </div>

            {bot.chats.map((chat) => (
              <div key={chat.id} style={{ marginLeft: 16, marginTop: 8 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span>
                    {chat.name} <code>{chat.chat_id}</code>
                  </span>
                  <button className="link" onClick={() => run(() => api.deleteVar("chat", chat.id))}>
                    {t("vars.remove")}
                  </button>
                </div>
                {chat.topics.map((topic) => (
                  <div key={topic.id} className="row" style={{ marginLeft: 16, justifyContent: "space-between" }}>
                    <span className="muted">
                      {topic.name} <code>{topic.topic_id}</code>
                    </span>
                    <button className="link" onClick={() => run(() => api.deleteVar("topic", topic.id))}>
                      {t("vars.remove")}
                    </button>
                  </div>
                ))}
                <AddForm
                  small
                  fields={[
                    { key: "name", placeholder: t("vars.topicName") },
                    { key: "topicId", placeholder: "topic id" },
                  ]}
                  label={t("vars.addTopic")}
                  onSubmit={(v) => run(() => api.addTopic(chat.id, v.name, v.topicId))}
                />
              </div>
            ))}

            <AddForm
              small
              fields={[
                { key: "name", placeholder: t("vars.chatName") },
                { key: "chatId", placeholder: "chat id" },
              ]}
              label={t("vars.addChat")}
              onSubmit={(v) => run(() => api.addChat(bot.id, v.name, v.chatId))}
            />
          </div>
        ))}

        <AddForm
          fields={[
            { key: "name", placeholder: t("vars.botName") },
            { key: "token", placeholder: t("vars.token"), type: "password" },
          ]}
          label={t("vars.addBot")}
          onSubmit={(v) => run(() => api.addBot(v.name, v.token), t("vars.added"))}
        />
      </div>

      {/* --- Google Sheets --- */}
      <div className="card">
        <h2>Google Sheets</h2>
        {data.sheets.map((sheet) => (
          <div key={sheet.id} style={{ borderTop: "1px solid var(--border)", paddingTop: 12, marginTop: 12 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span>
                <b>{sheet.name}</b> <code>{sheet.sheet_id}</code>
              </span>
              <button className="link" onClick={() => run(() => api.deleteVar("sheet", sheet.id))}>
                {t("vars.remove")}
              </button>
            </div>
            <div className="row" style={{ marginLeft: 16 }}>
              {sheet.lists.map((list) => (
                <span key={list.id} className="badge off">
                  {list.name}{" "}
                  <button className="link" onClick={() => run(() => api.deleteVar("list", list.id))}>
                    ×
                  </button>
                </span>
              ))}
            </div>
            <AddForm
              small
              fields={[{ key: "name", placeholder: t("vars.listName") }]}
              label={t("vars.addList")}
              onSubmit={(v) => run(() => api.addSheetList(sheet.id, v.name))}
            />
          </div>
        ))}

        <AddForm
          fields={[
            { key: "name", placeholder: t("vars.sheetName") },
            { key: "sheetId", placeholder: "spreadsheet id" },
          ]}
          label={t("vars.addSheet")}
          onSubmit={(v) => run(() => api.addSheet(v.name, v.sheetId), t("vars.added"))}
        />
      </div>
    </div>
  );
}

function ShopRow({ shop, onRun }) {
  const { t } = useTranslation();
  const [name, setName] = useState(shop.name);

  useEffect(() => setName(shop.name), [shop.name]);

  return (
    <tr>
      <td>
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: 200 }} />
      </td>
      <td><code>{shop.shop_id}</code></td>
      <td>
        <div className="row">
          <button
            disabled={name === shop.name || !name.trim()}
            onClick={() => onRun(() => api.renameShop(shop.id, name), t("vars.saved"))}
          >
            {t("vars.save")}
          </button>
          <button className="link" onClick={() => onRun(() => api.deleteVar("shop", shop.id))}>
            {t("vars.remove")}
          </button>
        </div>
      </td>
    </tr>
  );
}

// Kichik universal qo'shish formasi — har katalog uchun alohida komponent
// yozish o'rniga.
function AddForm({ fields, label, onSubmit, small = false }) {
  const [values, setValues] = useState({});
  const filled = fields.every((f) => (values[f.key] || "").trim());

  return (
    <div className="row" style={{ marginTop: small ? 8 : 14, marginLeft: small ? 16 : 0 }}>
      {fields.map((f) => (
        <input
          key={f.key}
          type={f.type || "text"}
          placeholder={f.placeholder}
          value={values[f.key] || ""}
          onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
          style={{ width: small ? 150 : 200, fontSize: small ? 13 : 14 }}
        />
      ))}
      <button
        className={small ? "ghost" : ""}
        disabled={!filled}
        onClick={() => {
          onSubmit(values);
          setValues({});
        }}
      >
        {label}
      </button>
    </div>
  );
}
