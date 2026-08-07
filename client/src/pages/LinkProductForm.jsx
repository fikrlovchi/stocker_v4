import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";

// Yangi tovar bog'lamasi qo'shish — v3 dagi AppSheet formasining o'rni.
// Maydonlar aynan o'sha: skuTitle · MC External ID · Do'kon · Kartochka
// miqdori · Qoldiqni yangilash · Order import.
//
// Saqlangandan keyin server IKKI amalni bajaradi: Uzum'dan SKU ma'lumotini
// oladi va barcode'ni MoySklad'ga qo'shadi. Natija shu yerda ko'rsatiladi —
// forma yopilib ketmaydi, aks holda "qo'shildi, lekin Uzum topmadi" degan
// muhim xabar ko'rinmay qolardi.
const EMPTY = { skuTitle: "", mcExternalId: "", shopId: "", cardQuantity: "1", stockUpdate: true, orderImport: true };

export default function LinkProductForm({ onClose, onCreated }) {
  const { t } = useTranslation();
  const [shops, setShops] = useState([]);
  const [form, setForm] = useState(EMPTY);
  // Do'konni foydalanuvchi o'zi tanlagan bo'lsa prefiks uni bosib
  // o'tmasligi kerak.
  const [shopTouched, setShopTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    api.linkProductShops().then((r) => setShops(r.shops)).catch((e) => setError(e.message));
  }, []);

  // Do'kon SKU nomidan topiladi — v3 dagi AppSheet "initial value"
  // formulasining aynan o'zi:
  //
  //   LOOKUP(INDEX(SPLIT(TRIM([skuTitle]), "-"), 1), "uzum_shop", "SKU code", "ID")
  //
  // `-` gacha bo'lgan birinchi bo'lak `SKU code` bilan AYNAN solishtiriladi.
  // "Shu bilan boshlanadi" degan moslik emas: `UZONX-1` uchun `UZON` mos
  // kelmasligi kerak, aks holda tovar boshqa do'konga biriktirilardi.
  useEffect(() => {
    if (shopTouched || !form.skuTitle.trim() || !shops.length) return;
    const prefix = form.skuTitle.trim().split("-")[0].trim().toUpperCase();
    if (!prefix) return;
    const match = shops.find((s) => String(s.skuCode || "").trim().toUpperCase() === prefix);
    if (match && match.shopId !== form.shopId) setForm((f) => ({ ...f, shopId: match.shopId }));
  }, [form.skuTitle, shops, shopTouched, form.shopId]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const filled =
    form.skuTitle.trim() && form.mcExternalId.trim() && form.shopId && Number(form.cardQuantity) >= 1;

  const submit = async () => {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const r = await api.addLinkProduct({ ...form, cardQuantity: Number(form.cardQuantity) });
      setResult(r);
      onCreated?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const again = () => {
    // skuTitle va External ID tozalanadi, do'kon qoladi: ketma-ket bir
    // do'konga bir nechta SKU qo'shish odatiy holat.
    setForm((f) => ({ ...EMPTY, shopId: f.shopId }));
    setShopTouched(true);
    setResult(null);
  };

  return (
    <div className="card" style={{ borderColor: "var(--accent)" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>{t("lp.addTitle")}</h2>
        <button className="ghost" onClick={onClose}>{t("lp.close")}</button>
      </div>

      {error && <div className="card error">{error}</div>}

      {result ? (
        <Result result={result} onAgain={again} onClose={onClose} />
      ) : (
        <div style={{ maxWidth: 460 }}>
          <Field label="skuTitle" required>
            <input
              value={form.skuTitle}
              onChange={(e) => set("skuTitle", e.target.value)}
              placeholder="UZON-0400082"
              autoFocus
            />
          </Field>

          <Field label={t("lp.externalId")} required hint={t("lp.externalIdHint")}>
            <input value={form.mcExternalId} onChange={(e) => set("mcExternalId", e.target.value)} />
          </Field>

          <Field label={t("lp.shop")} required hint={t("lp.shopHint")}>
            <select
              value={form.shopId}
              onChange={(e) => {
                setShopTouched(true);
                set("shopId", e.target.value);
              }}
            >
              <option value="">—</option>
              {shops.map((s) => (
                <option key={s.shopId} value={s.shopId}>
                  {s.name} {s.skuCode ? `(${s.skuCode})` : ""} · {s.cabinetName}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t("lp.cardQuantityFull")} required hint={t("lp.cardQuantityHint")}>
            <div className="row">
              <button
                className="ghost"
                onClick={() => set("cardQuantity", String(Math.max(1, Number(form.cardQuantity) - 1)))}
              >
                −
              </button>
              <input
                value={form.cardQuantity}
                onChange={(e) => set("cardQuantity", e.target.value)}
                style={{ width: 70, textAlign: "center" }}
              />
              <button className="ghost" onClick={() => set("cardQuantity", String(Number(form.cardQuantity) + 1))}>
                +
              </button>
            </div>
          </Field>

          <Field label={t("lp.stockUpdateFull")} required>
            <Toggle value={form.stockUpdate} onChange={(v) => set("stockUpdate", v)} />
          </Field>

          <Field label={t("lp.orderImport")} required>
            <Toggle value={form.orderImport} onChange={(v) => set("orderImport", v)} />
          </Field>

          <div className="row" style={{ marginTop: 14 }}>
            <button disabled={!filled || busy} onClick={submit}>
              {busy ? t("lp.adding") : t("lp.add")}
            </button>
            <span className="muted">{t("lp.addHint")}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, required, hint, children }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 13, marginBottom: 4 }}>
        {label}
        {required && <span style={{ color: "var(--danger)" }}> *</span>}
      </div>
      {children}
      {hint && <div className="muted" style={{ marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

function Toggle({ value, onChange }) {
  const { t } = useTranslation();
  return (
    <div className="row">
      <button className={value ? "ghost" : ""} onClick={() => onChange(false)} style={{ minWidth: 70 }}>
        {t("lp.no")}
      </button>
      <button className={value ? "" : "ghost"} onClick={() => onChange(true)} style={{ minWidth: 70 }}>
        {t("lp.yes")}
      </button>
    </div>
  );
}

const STATUS_CLASS = { success: "on", skipped: "off", error: "off" };

// Ikki amalning natijasi. Xato bo'lsa ham qator SAQLANGAN — buni aytib
// qo'yish kerak, aks holda foydalanuvchi qaytadan qo'shishga urinadi.
function Result({ result, onAgain, onClose }) {
  const { t } = useTranslation();
  const failed = result.uzumFetch.status === "error" || result.mcBarcode.status === "error";

  return (
    <div style={{ marginTop: 8 }}>
      <div className="badge on">{t("lp.created")}</div>

      <table style={{ marginTop: 10 }}>
        <tbody>
          <tr>
            <td>{t("lp.uzumFetch")}</td>
            <td>
              <span className={`badge ${STATUS_CLASS[result.uzumFetch.status]}`}>
                {t(`lp.status.${result.uzumFetch.status}`)}
              </span>{" "}
              {result.uzumFetch.message}
            </td>
          </tr>
          <tr>
            <td>{t("lp.mcBarcode")}</td>
            <td>
              <span className={`badge ${STATUS_CLASS[result.mcBarcode.status]}`}>
                {t(`lp.status.${result.mcBarcode.status}`)}
              </span>{" "}
              {result.mcBarcode.message}
            </td>
          </tr>
        </tbody>
      </table>

      {failed && <p className="muted">{t("lp.retryHint")}</p>}

      <div className="row" style={{ marginTop: 12 }}>
        <button onClick={onAgain}>{t("lp.addAnother")}</button>
        <button className="ghost" onClick={onClose}>{t("lp.close")}</button>
      </div>
    </div>
  );
}
