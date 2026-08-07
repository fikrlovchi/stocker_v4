import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api";
import { useSection, SectionBody, AddForm } from "./common";

// Uzum kabinetlari (token) va ularning do'konlari.
// Do'kon nomi mobil ilovada ham ko'rinadi — bu yer faqat "sozlama" emas.
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
    </SectionBody>
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
