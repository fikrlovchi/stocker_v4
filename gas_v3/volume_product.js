function importMoySkladShort() {
  /* ===== CONFIG ===== */
  const TOKEN = "token"; 
  const SHEET_ID = "1LxViEilC7MvJeF79GRBmyzteHEHYtH4NPifocD3FILw";
  const BASE_URL = "https://api.moysklad.ru/api/remap/1.2/entity";
  const LIMIT = 1000;
  /* ================== */

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName("Product");

  const entityMap = {
    product: "product",
    variant: "variant",
    service: "service",
    bundle: "bundle"
  };

  const allRows = []; // faqat ma'lumotlar

  const fetchOptions = {
    method: "get",
    headers: {
      Authorization: "Bearer " + TOKEN,
      "Accept-Encoding": "gzip"
    }
  };

  for (const entity in entityMap) {
    let offset = 0;

    while (true) {
      const url = `${BASE_URL}/${entity}?limit=${LIMIT}&offset=${offset}`;
      const response = UrlFetchApp.fetch(url, fetchOptions);

      if (response.getResponseCode() !== 200) {
        throw new Error("API error: " + response.getContentText());
      }

      const data = JSON.parse(response.getContentText());
      const rows = data.rows || [];

      if (!rows.length) break;

      for (let i = 0; i < rows.length; i++) {
        const item = rows[i];

        allRows.push([
          item.pathName || "",
          item.id || "",
          entityMap[entity],
          item.code || "",
          item.name || "",
          item.externalCode || "",
          item.article || ""
        ]);
      }

      if (rows.length < LIMIT) break;
      offset += LIMIT;
    }
  }

  /* ===== CLEAR OLD DATA (A2:G) + WRITE NEW DATA ===== */
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).clearContent();
  }

  if (allRows.length) {
    sheet.getRange(2, 1, allRows.length, 7).setValues(allRows);
  }
}