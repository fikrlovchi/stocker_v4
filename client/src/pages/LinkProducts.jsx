import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";

// Tovar bog'lamalari (v3 dagi `link_product`).
//
// Bu jadvalning nusxasi emas: har qatorda **hisoblangan** qiymatlar ham
// ko'rinadi — MoySklad qoldig'i (`fact`) va Uzumga ketadigan son (`amount`).
// Shundagina "nega bu tovarga 0 ketdi" degan savolga shu yerda javob
// topiladi, terminalda emas.
const PAGE = 50;

export default function LinkProducts() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);

  const load = useCallback(async () => {
    try {
      setData(await api.linkProducts({ search: query, limit: PAGE, offset }));
    } catch (e) {
      setError(e.message);
    }
  }, [query, offset]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn, okNote) => {
    setError("");
    setNote("");
    try {
      await fn();
      if (okNote) setNote(okNote);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const submitSearch = () => {
    setOffset(0);
    setQuery(search.trim());
  };

  return (
    <div className="content">
      <h1>{t("lp.title")}</h1>
      <p className="page-sub">{t("lp.sub")}</p>

      {error && <div className="card error">{error}</div>}
      {note && <div className="card muted">{note}</div>}

      <div className="row" style={{ marginBottom: 12 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submitSearch()}
          placeholder={t("lp.searchHint")}
          style={{ width: 320 }}
        />
        <button onClick={submitSearch}>{t("lp.search")}</button>
        {query && (
          <button className="ghost" onClick={() => { setSearch(""); setQuery(""); setOffset(0); }}>
            {t("lp.clear")}
          </button>
        )}
        {data && <span className="muted">{t("lp.found", { total: data.total })}</span>}
      </div>

      {!data ? (
        <div className="card muted">{t("app.loading")}</div>
      ) : data.items.length === 0 ? (
        <div className="card muted">{t("lp.empty")}</div>
      ) : (
        <>
          <div className="card" style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>skuId</th>
                  <th>{t("lp.skuTitle")}</th>
                  <th>{t("lp.shop")}</th>
                  <th>{t("lp.externalId")}</th>
                  <th title={t("lp.cardQuantityHint")}>{t("lp.cardQuantity")}</th>
                  <th title={t("lp.factHint")}>{t("lp.fact")}</th>
                  <th title={t("lp.amountHint")}>{t("lp.amount")}</th>
                  <th>{t("lp.stockUpdate")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <Row key={item.id} item={item} onRun={run} />
                ))}
              </tbody>
            </table>
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            <button className="ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
              ← {t("lp.prev")}
            </button>
            <span className="muted">
              {offset + 1}–{Math.min(offset + PAGE, data.total)} / {data.total}
            </span>
            <button className="ghost" disabled={offset + PAGE >= data.total} onClick={() => setOffset(offset + PAGE)}>
              {t("lp.next")} →
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Row({ item, onRun }) {
  const { t } = useTranslation();
  const initial = {
    mcExternalId: item.mcExternalId || "",
    cardQuantity: String(item.cardQuantity ?? ""),
  };
  const [draft, setDraft] = useState(initial);

  useEffect(() => {
    setDraft({ mcExternalId: item.mcExternalId || "", cardQuantity: String(item.cardQuantity ?? "") });
  }, [item]);

  const dirty = draft.mcExternalId !== initial.mcExternalId || draft.cardQuantity !== initial.cardQuantity;
  const set = (k, v) => setDraft((s) => ({ ...s, [k]: v }));

  // Qoldiq topilmagan qator — eng ko'p vaqt yo'qotadigan holat, shuning
  // uchun ko'zga tashlanib turishi kerak.
  const noStock = item.fact === null || item.fact === undefined;

  return (
    <tr className={item.stockUpdate ? "" : "muted"}>
      <td><code>{item.skuId ?? "—"}</code></td>
      <td>
        {item.skuTitle}
        {item.hasRule && <span className="badge off" style={{ marginLeft: 6 }} title={t("lp.hasRuleHint")}>{t("lp.hasRule")}</span>}
        <div className="muted">{item.productTitle}</div>
      </td>
      <td>
        {item.shopName || item.shopId || "—"}
        {item.cabinetName && <div className="muted">{item.cabinetName}</div>}
      </td>
      <td>
        <input
          value={draft.mcExternalId}
          onChange={(e) => set("mcExternalId", e.target.value)}
          style={{ width: 190, fontSize: 12 }}
        />
        {item.legacyDivisor !== 1 && (
          <div className="badge off" title={t("lp.legacyHint")}>÷{item.legacyDivisor}</div>
        )}
      </td>
      <td>
        <input
          value={draft.cardQuantity}
          onChange={(e) => set("cardQuantity", e.target.value)}
          style={{ width: 55 }}
        />
      </td>
      <td className={noStock ? "error" : ""}>{noStock ? t("lp.noStock") : item.fact}</td>
      <td><b>{item.amount ?? "—"}</b></td>
      <td>
        <input
          type="checkbox"
          checked={item.stockUpdate}
          onChange={(e) => onRun(() => api.editLinkProduct(item.id, { stockUpdate: e.target.checked }))}
        />
      </td>
      <td>
        <button
          disabled={!dirty}
          onClick={() =>
            onRun(
              () =>
                api.editLinkProduct(item.id, {
                  mcExternalId: draft.mcExternalId,
                  cardQuantity: Number(draft.cardQuantity),
                }),
              t("lp.saved")
            )
          }
        >
          {t("lp.save")}
        </button>
      </td>
    </tr>
  );
}
