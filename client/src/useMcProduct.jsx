import { useEffect, useRef, useState } from "react";
import { api } from "./api";

// "MC External ID" maydonining sharti — v3 dagi AppSheet `valid_if`:
//
//   ISNOTBLANK([mc_product])
//
// Ya'ni External ID MoySklad tovariga bog'lanmasa qiymatni saqlab bo'lmaydi.
// Shu shart interfeysga chiqarilgan: foydalanuvchi yozayotganda tovar
// izlanadi va NOMI ko'rsatiladi. "Saqlash" tugmasi tovar topilmaguncha
// bloklanadi.
//
// Nega hook: bir xil mantiq ikki joyda kerak — qo'shish formasida va umumiy
// ro'yxatdagi qatorni tahrirlashda. Ikki nusxa yozilsa biri eskirib qolardi.

const DEBOUNCE_MS = 400;

/**
 * @param {string} externalId  maydonning joriy qiymati
 * @param {boolean} enabled    tekshirish kerakmi (ro'yxatda faqat qiymat
 *   o'zgargan qatorda tekshiriladi — 50 qatorga 50 so'rov ketmasin)
 * @returns {{ state: "idle"|"checking"|"found"|"missing"|"error", product, reason }}
 */
export function useMcProduct(externalId, enabled = true) {
  const [result, setResult] = useState({ state: "idle" });
  // So'rovlar tartibsiz qaytishi mumkin — faqat oxirgisining javobi qabul
  // qilinadi, aks holda eski javob yangisini bosib ketardi.
  const seq = useRef(0);

  useEffect(() => {
    const value = String(externalId || "").trim();
    if (!enabled || !value) {
      setResult({ state: "idle" });
      return;
    }

    const mine = ++seq.current;
    setResult({ state: "checking" });

    const timer = setTimeout(async () => {
      try {
        const r = await api.mcProduct(value);
        if (seq.current !== mine) return;
        setResult(r.found ? { state: "found", product: r } : { state: "missing", reason: r.reason });
      } catch (e) {
        if (seq.current !== mine) return;
        setResult({ state: "error", reason: e.message });
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [externalId, enabled]);

  return result;
}

/** Maydon ostidagi izoh — forma va ro'yxatda bir xil ko'rinsin. */
export function McProductHint({ result, t }) {
  if (result.state === "idle") return null;
  if (result.state === "checking") return <span className="muted">{t("lp.mcChecking")}</span>;
  if (result.state === "found") {
    return (
      <span>
        <span className="badge on">{result.product.entityType}</span> {result.product.name}
        {result.product.ambiguous && <span className="error"> · {t("lp.mcAmbiguous")}</span>}
      </span>
    );
  }
  return <span className="error">{result.reason || t("lp.mcMissing")}</span>;
}
