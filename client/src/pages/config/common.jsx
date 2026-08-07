import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Konfiguratsiya tablari uchun umumiy yuklash mantiqi.
 *
 * Muhim nuqta: xato bo'lganda ham NIMADIR chiziladi. Ilgari O'zgaruvchilar
 * sahifasi `if (!data) return <Yuklanmoqda/>` qilardi va so'rov yiqilsa
 * bo'lim abadiy "Yuklanmoqda..." da qotib qolardi — sabab ekranga chiqmasdi.
 */
export function useSection(fetcher) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await fetcher());
    } catch (e) {
      setError(e.message);
    }
  }, [fetcher]);

  useEffect(() => {
    load();
  }, [load]);

  // Amal bajarib, natijani qayta yuklaydi. `warning` — amal o'tdi, lekin
  // e'tibor kerak (masalan Uzum API javob bermadi).
  const run = async (fn, okNote) => {
    setError("");
    setNote("");
    try {
      const r = await fn();
      if (r?.warning) setError(r.warning);
      else if (okNote) setNote(okNote);
      await load();
      return r;
    } catch (e) {
      setError(e.message);
      return null;
    }
  };

  return { data, error, note, run, reload: load, setError, setNote };
}

/** Xato/izoh kartalari + yuklanish holati — har tabda bir xil ko'rinsin. */
export function SectionBody({ data, error, note, children }) {
  const { t } = useTranslation();
  return (
    <>
      {error && <div className="card error">{error}</div>}
      {note && <div className="card muted">{note}</div>}
      {!data ? (!error && <div className="card muted">{t("app.loading")}</div>) : children}
    </>
  );
}

/** Kichik universal qo'shish formasi — har katalog uchun alohida yozilmasin. */
export function AddForm({ fields, label, onSubmit, small = false }) {
  const [values, setValues] = useState({});
  const filled = fields.every((f) => f.optional || (values[f.key] || "").trim());

  return (
    <div className="row" style={{ marginTop: small ? 8 : 14, marginLeft: small ? 16 : 0 }}>
      {fields.map((f) =>
        f.options ? (
          <select
            key={f.key}
            value={values[f.key] || f.options[0].value}
            onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
            style={{ width: small ? 150 : 200 }}
          >
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            key={f.key}
            type={f.type || "text"}
            placeholder={f.placeholder}
            value={values[f.key] || ""}
            onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
            style={{ width: small ? 150 : 200, fontSize: small ? 13 : 14 }}
          />
        )
      )}
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
