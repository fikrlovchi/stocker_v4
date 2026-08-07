import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api";
import { useSection, SectionBody, AddForm } from "./common";

// Google Sheets katalogi. v3 bazasi serverga ko'chgach bu ro'yxat zaxira
// nusxa manzillari uchun qoladi (docs/V3-MIGRATION.md).
export default function SheetsConfig() {
  const { t } = useTranslation();
  const fetcher = useCallback(() => api.variables(), []);
  const { data, error, note, run } = useSection(fetcher);

  return (
    <SectionBody data={data} error={error} note={note}>
      <div className="card">
        <h2>Google Sheets</h2>
        {data?.sheets.map((sheet) => (
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
    </SectionBody>
  );
}
