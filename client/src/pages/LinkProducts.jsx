import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import LinkProductForm from "./LinkProductForm";
import { useMcProduct, McProductHint } from "../useMcProduct";

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
  const [unlinked, setUnlinked] = useState(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [adding, setAdding] = useState(false);
  // Bog'lanmagan SKU ro'yxatidan "Bog'lash" bosilganda forma shu nom bilan
  // ochiladi — nomni qo'lda ko'chirib yozish shart bo'lmasin.
  const [prefill, setPrefill] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await api.linkProducts({ search: query, limit: PAGE, offset }));
    } catch (e) {
      setError(e.message);
    }
  }, [query, offset]);

  // Bog'lanmagan SKU'lar qidiruvdan/sahifadan mustaqil: ular butun ro'yxat
  // bo'yicha hisoblanadi va har doim ko'rinib turishi kerak.
  const loadUnlinked = useCallback(async () => {
    try {
      setUnlinked(await api.unlinkedSkus());
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadUnlinked();
  }, [loadUnlinked]);

  const run = async (fn, okNote) => {
    setError("");
    setNote("");
    try {
      await fn();
      if (okNote) setNote(okNote);
      await load();
      // Bog'lama to'ldirilgan bo'lishi mumkin — ro'yxat eskirmasin.
      await loadUnlinked();
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

      <Unlinked
        data={unlinked}
        onLink={(skuTitle) => {
          setPrefill(skuTitle);
          setAdding(true);
        }}
        onSearch={(skuTitle) => {
          setSearch(skuTitle);
          setQuery(skuTitle);
          setOffset(0);
        }}
      />

      <div className="row" style={{ marginBottom: 12 }}>
        <button onClick={() => { setPrefill(""); setAdding(true); }}>+ {t("lp.add")}</button>
      </div>

      {adding && (
        <LinkProductForm
          // Forma ochiq turganda boshqa SKU tanlansa qaytadan yasalsin —
          // aks holda maydonlar oldingi nom bilan qolib ketardi.
          key={prefill || "new"}
          initialSkuTitle={prefill}
          onClose={() => { setAdding(false); setPrefill(""); }}
          onCreated={() => { load(); loadUnlinked(); }}
        />
      )}

      <div className="row" style={{ marginBottom: 12, marginTop: 12 }}>
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
                  <th title={t("lp.stockUpdateHint")}>{t("lp.stockUpdate")}</th>
                  <th title={t("lp.orderImportHint")}>{t("lp.orderImport")}</th>
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

/**
 * Buyurtmada tushgan, lekin MoySklad tovariga ulanmagan SKU'lar.
 *
 * Bunday SKU tufayli buyurtma MoySklad'ga UMUMAN o'tmaydi, ya'ni yig'ishga
 * ham chiqmaydi. Ilgari bu faqat Telegram'ga xabar bo'lib ketardi — xabar
 * o'qilmasa iz qolmasdi. Shuning uchun ro'yxat ish bajariladigan joyda,
 * jadvalning TEPASIDA turadi.
 *
 * Hech narsa yo'q bo'lsa karta ham chizilmaydi: "bo'sh ro'yxat" ham joy
 * egallab, muhim holatni ko'zdan yashiradi.
 */
function Unlinked({ data, onLink, onSearch }) {
  const { t } = useTranslation();
  if (!data || data.total === 0) return null;

  return (
    <div className="card error" style={{ marginBottom: 12 }}>
      <b>{t("lp.unlinkedTitle", { total: data.total })}</b>
      <div className="muted" style={{ marginTop: 2 }}>{t("lp.unlinkedHint")}</div>

      <table style={{ marginTop: 10 }}>
        <thead>
          <tr>
            <th>{t("lp.skuTitle")}</th>
            <th>{t("lp.shop")}</th>
            <th>{t("lp.unlinkedOrders")}</th>
            <th>{t("lp.unlinkedReason")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.items.map((it) => (
            <tr key={it.skuTitle}>
              <td>
                <code>{it.skuTitle}</code>
                {it.barcode && <div className="muted">{it.barcode}</div>}
              </td>
              <td>{it.shopName || it.shopId || "—"}</td>
              <td>{it.orderCount}</td>
              <td>
                {it.reason === "no_link_row" ? t("lp.unlinkedNoRow") : t("lp.unlinkedNoProduct")}
              </td>
              <td>
                {/* Qator yo'q bo'lsa — qo'shish formasi; bor bo'lsa jadvaldan
                    External ID ni to'ldirish kerak, shuning uchun qidiruv. */}
                {it.reason === "no_link_row" ? (
                  <button onClick={() => onLink(it.skuTitle)}>{t("lp.unlinkedLink")}</button>
                ) : (
                  <button className="ghost" onClick={() => onSearch(it.skuTitle)}>
                    {t("lp.unlinkedOpen")}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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

  const set = (k, v) => setDraft((s) => ({ ...s, [k]: v }));

  const externalChanged = draft.mcExternalId !== initial.mcExternalId;
  const dirty = externalChanged || draft.cardQuantity !== initial.cardQuantity;

  // Tekshirish FAQAT qiymat o'zgarganda: aks holda ro'yxat ochilishida
  // 50 qator uchun 50 so'rov ketardi. Saqlangan qiymatning tovar nomi
  // allaqachon javobda bor (`mcProductName`).
  const mc = useMcProduct(draft.mcExternalId, externalChanged);
  // v3 dagi `valid_if`: tovar topilmasa saqlanmaydi.
  const externalValid = !externalChanged || mc.state === "found";

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
          style={{
            width: 190,
            fontSize: 12,
            borderColor: mc.state === "missing" ? "var(--danger)" : undefined,
          }}
        />
        {/* O'zgartirilgan bo'lsa yangi tovar nomi, aks holda joriysi. */}
        <div style={{ fontSize: 12, marginTop: 2 }}>
          {externalChanged ? (
            <McProductHint result={mc} t={t} />
          ) : item.mcProductName ? (
            <span className="muted">{item.mcProductName}</span>
          ) : (
            <span className="error">{t("lp.mcMissing")}</span>
          )}
        </div>
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
        {/* Buyurtma importi — bu qator MoySklad'ga buyurtmaga tushadimi. */}
        <input
          type="checkbox"
          checked={item.orderImport}
          onChange={(e) => onRun(() => api.editLinkProduct(item.id, { orderImport: e.target.checked }))}
        />
      </td>
      <td>
        <div className="row">
          <button
            disabled={!dirty || !externalValid}
            title={!externalValid ? t("lp.mcRequired") : ""}
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
          {/* skuId bo'sh — Uzum'dan ma'lumot kelmagan. Qayta urinish
              Uzum qidiruvini va barcode qo'shishni takrorlaydi. */}
          {!item.skuId && (
            <button className="ghost" onClick={() => onRun(() => api.retryLinkProduct(item.id), t("lp.retried"))}>
              {t("lp.retry")}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
