import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api";
import { useSection, SectionBody, AddForm } from "./common";

// Uzum kabinetlari (token) va ularning do'konlari.
//
// Ikki narsa "sozlama" dan ko'ra ko'proq:
//   • do'kon nomi mobil ilovada operator ekranida ko'rinadi;
//   • MoySklad havolalari buyurtmani MoySklad'ga yozishda ishlatiladi —
//     kabinetniki yuridik shaxs, do'konniki sotuv kanali (v3 dagi "MC href").
export default function UzumConfig() {
  const { t } = useTranslation();
  const fetcher = useCallback(() => api.variables(), []);
  const { data, error, note, run } = useSection(fetcher);

  return (
    <SectionBody data={data} error={error} note={note}>
      <div className="card">
        <h2>{t("vars.uzum")}</h2>
        <p className="muted" style={{ marginTop: 0 }}>{t("vars.uzumHint")}</p>

        {data?.cabinets.map((cab) => (
          <Cabinet key={cab.id} cab={cab} run={run} />
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
    </SectionBody>
  );
}

function Cabinet({ cab, run }) {
  const { t } = useTranslation();
  const [org, setOrg] = useState(cab.mc_organization_href || "");

  useEffect(() => setOrg(cab.mc_organization_href || ""), [cab.mc_organization_href]);

  return (
    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, marginTop: 12 }}>
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

      <div className="row" style={{ marginTop: 8 }}>
        <span className="muted" style={{ minWidth: 150 }}>{t("vars.mcOrganization")}</span>
        <input
          value={org}
          onChange={(e) => setOrg(e.target.value)}
          placeholder="https://api.moysklad.ru/…/organization/…"
          style={{ width: 420, fontSize: 13 }}
        />
        <button
          disabled={org === (cab.mc_organization_href || "")}
          onClick={() => run(() => api.editCabinet(cab.id, { mcOrganizationHref: org }), t("vars.saved"))}
        >
          {t("vars.save")}
        </button>
      </div>

      {cab.shops.length === 0 ? (
        <div className="muted" style={{ marginTop: 8 }}>{t("vars.noShops")}</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t("vars.shopName")}</th>
              <th>shop_id</th>
              <th>{t("vars.skuCode")}</th>
              <th>{t("vars.mcSaleschannel")}</th>
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
  );
}

function ShopRow({ shop, onRun }) {
  const { t } = useTranslation();
  const initial = {
    name: shop.name || "",
    skuCode: shop.sku_code || "",
    mcSaleschannelHref: shop.mc_saleschannel_href || "",
  };
  const [draft, setDraft] = useState(initial);

  useEffect(() => {
    setDraft({
      name: shop.name || "",
      skuCode: shop.sku_code || "",
      mcSaleschannelHref: shop.mc_saleschannel_href || "",
    });
  }, [shop]);

  const set = (k, v) => setDraft((s) => ({ ...s, [k]: v }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  return (
    <tr>
      <td>
        <input value={draft.name} onChange={(e) => set("name", e.target.value)} style={{ width: 160 }} />
      </td>
      <td><code>{shop.shop_id}</code></td>
      <td>
        <input value={draft.skuCode} onChange={(e) => set("skuCode", e.target.value)} style={{ width: 80 }} />
      </td>
      <td>
        <input
          value={draft.mcSaleschannelHref}
          onChange={(e) => set("mcSaleschannelHref", e.target.value)}
          placeholder="—"
          style={{ width: 260, fontSize: 12 }}
        />
      </td>
      <td>
        <div className="row">
          <button disabled={!dirty || !draft.name.trim()} onClick={() => onRun(() => api.editShop(shop.id, draft), t("vars.saved"))}>
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
