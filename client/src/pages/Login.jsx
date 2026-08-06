import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth";

export default function Login() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [form, setForm] = useState({ login: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.login.trim() || !form.password) return setError(t("login.empty"));
    setBusy(true);
    setError("");
    try {
      await login(form.login.trim().toLowerCase(), form.password);
    } catch (err) {
      setError(err.message || t("login.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <form className="card login-card" onSubmit={submit}>
        <img className="wordmark" src="/logo-wordmark.png" alt="Stocker" />
        <div className="sub">{t("login.sub")}</div>

        <label htmlFor="login">{t("login.login")}</label>
        <input
          id="login"
          autoFocus
          autoComplete="username"
          value={form.login}
          onChange={(e) => setForm({ ...form, login: e.target.value })}
        />

        <label htmlFor="password">{t("login.password")}</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />

        {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}
        <button type="submit" disabled={busy}>{busy ? "…" : t("login.submit")}</button>
      </form>
    </div>
  );
}
