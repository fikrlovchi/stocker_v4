import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { useAuth } from "../auth";

// Foydalanuvchilar va ruxsatlar bitta ekranda: alohida "Ruxsatlar" sahifasi
// qilinmadi, chunki ruxsat har doim aniq foydalanuvchiga beriladi — ikki
// ekran orasida sakrash ortiqcha qadam bo'lardi.
export default function Users() {
  const { t } = useTranslation();
  const { user: me } = useAuth();
  const [state, setState] = useState({ users: [], sections: [], flags: [] });
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const load = () =>
    api
      .listUsers()
      .then(setState)
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const run = async (fn) => {
    setError("");
    setNote("");
    try {
      await fn();
      await load();
      setNote(t("users.saved"));
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="content">
      <h1>{t("users.title")}</h1>
      <p className="page-sub">{t("users.sub")}</p>

      {error && <div className="card error">{error}</div>}
      {note && <div className="card muted">{note}</div>}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>{t("users.login")}</th>
              <th>{t("users.name")}</th>
              <th>{t("users.telegramId")}</th>
              <th>{t("users.sections")}</th>
              <th>{t("users.status")}</th>
              <th>{t("users.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {state.users.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                me={me}
                sections={state.sections}
                flags={state.flags}
                onRun={run}
              />
            ))}
          </tbody>
        </table>
      </div>

      <NewUser sections={state.sections} flags={state.flags} onRun={run} canMakeSuperadmin={me?.isSuperadmin} />
    </div>
  );
}

function PermissionPicker({ sections, flags, value, onChange, disabled }) {
  const { t } = useTranslation();
  const toggle = (list, key) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

  return (
    <div className="perms">
      {sections.map((s) => (
        <label key={s.key}>
          <input
            type="checkbox"
            disabled={disabled}
            checked={value.sections.includes(s.key)}
            onChange={() => onChange({ ...value, sections: toggle(value.sections, s.key) })}
          />
          {t(`section.${s.key}`, s.label)}
        </label>
      ))}
      {flags.map((f) => (
        <label key={f.key}>
          <input
            type="checkbox"
            disabled={disabled}
            checked={value.flags.includes(f.key)}
            onChange={() => onChange({ ...value, flags: toggle(value.flags, f.key) })}
          />
          {t(`flag.${f.key}`, f.label)}
        </label>
      ))}
    </div>
  );
}

function UserRow({ user, me, sections, flags, onRun }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState({ sections: user.sections, flags: user.flags });
  const [name, setName] = useState(user.displayName);
  const [telegramId, setTelegramId] = useState(user.telegramId || "");
  const [password, setPassword] = useState("");

  // Server javobi kelgach qatordagi qoralama yangilanadi.
  useEffect(() => {
    setDraft({ sections: user.sections, flags: user.flags });
    setName(user.displayName);
    setTelegramId(user.telegramId || "");
  }, [user]);

  const dirty =
    name !== user.displayName ||
    telegramId !== (user.telegramId || "") ||
    JSON.stringify([...draft.sections].sort()) !== JSON.stringify([...user.sections].sort()) ||
    JSON.stringify([...draft.flags].sort()) !== JSON.stringify([...user.flags].sort());

  return (
    <tr>
      <td>
        <code>{user.login}</code>
        {user.isSuperadmin && <div className="badge on" style={{ marginTop: 4 }}>{t("users.superadmin")}</div>}
      </td>
      <td>
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: 170 }} />
      </td>
      <td>
        {/* Telegram xabarida odamni belgilash uchun — v3 dagi `user` listidan. */}
        <input
          value={telegramId}
          onChange={(e) => setTelegramId(e.target.value)}
          placeholder="—"
          style={{ width: 110 }}
        />
      </td>
      <td>
        {user.isSuperadmin ? (
          <span className="muted">{t("users.superadminHint")}</span>
        ) : (
          <PermissionPicker sections={sections} flags={flags} value={draft} onChange={setDraft} />
        )}
      </td>
      <td>
        <span className={`badge ${user.isActive ? "on" : "off"}`}>
          {user.isActive ? t("users.active") : t("users.inactive")}
        </span>
      </td>
      <td>
        <div className="row" style={{ gap: 8 }}>
          <button
            disabled={!dirty}
            onClick={() =>
              onRun(() =>
                api.updateUser(user.id, {
                  displayName: name,
                  telegramId,
                  ...(user.isSuperadmin ? {} : { sections: draft.sections, flags: draft.flags }),
                })
              )
            }
          >
            {t("users.save")}
          </button>

          <input
            type="password"
            placeholder={t("users.newPassword")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: 130 }}
          />
          <button
            className="ghost"
            disabled={password.length < 4}
            onClick={() => onRun(() => api.updateUser(user.id, { password }).then(() => setPassword("")))}
          >
            {t("users.resetPassword")}
          </button>

          {!user.isSuperadmin && (
            <>
              <button className="ghost" onClick={() => onRun(() => api.updateUser(user.id, { isActive: !user.isActive }))}>
                {user.isActive ? t("users.disable") : t("users.enable")}
              </button>
              {user.id !== me?.id && (
                <button
                  className="link"
                  onClick={() => {
                    if (confirm(`${user.login} ${t("users.confirmRemove")}`)) onRun(() => api.deleteUser(user.id));
                  }}
                >
                  {t("users.remove")}
                </button>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function NewUser({ sections, flags, onRun, canMakeSuperadmin }) {
  const { t } = useTranslation();
  const empty = { login: "", displayName: "", password: "", sections: [], flags: [], isSuperadmin: false };
  const [form, setForm] = useState(empty);

  return (
    <div className="card">
      <h2>{t("users.add")}</h2>
      <div className="row" style={{ marginBottom: 12 }}>
        <input
          placeholder={t("users.login")}
          value={form.login}
          onChange={(e) => setForm({ ...form, login: e.target.value })}
        />
        <input
          placeholder={t("users.name")}
          value={form.displayName}
          onChange={(e) => setForm({ ...form, displayName: e.target.value })}
        />
        <input
          type="password"
          placeholder={t("users.password")}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        {canMakeSuperadmin && (
          <label className="muted" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={form.isSuperadmin}
              onChange={(e) => setForm({ ...form, isSuperadmin: e.target.checked })}
            />
            {t("users.superadmin")}
          </label>
        )}
      </div>

      {!form.isSuperadmin && (
        <PermissionPicker
          sections={sections}
          flags={flags}
          value={form}
          onChange={(v) => setForm({ ...form, ...v })}
        />
      )}

      <div style={{ marginTop: 14 }}>
        <button
          disabled={!form.login || !form.displayName || form.password.length < 4}
          onClick={() => onRun(() => api.createUser(form).then(() => setForm(empty)))}
        >
          {t("users.add")}
        </button>
      </div>
    </div>
  );
}
