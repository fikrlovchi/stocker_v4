/**
 * MoySklad'dan qoldiqlarni olib, mc_stock varag'iga yozadi
 * - mc_product!F dan External ID olinadi va mc_stock!E ga yoziladi
 * - mc_token!A2 dan token olinadi
 */
function MSStockSync() {
  const SHEET_ID = '18j8NDVJl9ZD-wuwlP3T1A1-sVoJlW_doFrwQrf-AvsE';
  const STORE_ID = 'a439adbf-97e3-11ed-0a80-0ca100976187';

  const ss = SpreadsheetApp.openById(SHEET_ID);

  // =========================================================================
  // 0-BOSQICH: mc_product dan External ID larni xotiraga olish
  // =========================================================================
  const productSheet = ss.getSheetByName('mc_product');
  const extIdMap = new Map();
  if (productSheet) {
    // A dan F gacha (6 ta ustun): B (index 1) = UUID, F (index 5) = External ID
    const productData = productSheet.getRange(2, 1, Math.max(1, productSheet.getLastRow() - 1), 6).getValues();
    for (const row of productData) {
      const uuid = String(row[1] || '').trim();
      const extId = String(row[5] || '').trim();
      if (uuid && extId) {
        extIdMap.set(uuid, extId);
      }
    }
  }

  // =========================================================================
  // 1-BOSQICH: MoySklad dan qoldiqlarni olish va mc_stock ga yozish
  // =========================================================================
  const tokenSheet = ss.getSheetByName('mc_token');
  if (!tokenSheet) {
    console.log("Xato: 'mc_token' varag'i topilmadi.");
    return;
  }

  const msToken = tokenSheet.getRange('A2').getValue();
  if (!msToken) {
    console.log("Xato: MoySklad tokeni topilmadi.");
    return;
  }

  const url = `https://api.moysklad.ru/api/remap/1.2/report/stock/all/current?filter=storeId=${STORE_ID}`;
  const response = UrlFetchApp.fetch(url, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${msToken}`, 'Accept-Encoding': 'gzip' },
    muteHttpExceptions: true
  });

  if (response.getResponseCode() !== 200) {
    console.log("MoySklad dan ma'lumot olishda xatolik. Kod: " + response.getResponseCode());
    return;
  }

  const reportData = JSON.parse(response.getContentText());
  const now = new Date();
  const sheetData = [];

  // mc_stock uchun ma'lumot: A=ID, B=Vaqt, C=UUID, D=Stock, E=External ID
  for (let i = 0; i < reportData.length; i++) {
    const uuid = reportData[i].assortmentId;
    const stock = reportData[i].stock;
    const extId = extIdMap.has(uuid) ? extIdMap.get(uuid) : "";
    sheetData.push([i + 1, now, uuid, stock, extId]);
  }

  if (sheetData.length > 0) {
    let stockSheet = ss.getSheetByName('mc_stock');
    if (!stockSheet) {
      stockSheet = ss.insertSheet('mc_stock');
      stockSheet.getRange('A1:E1').setValues([['ID', 'Vaqt', 'UUID', 'Stock', 'External ID']]).setFontWeight('bold');
      stockSheet.setFrozenRows(1);
    }

    const lastRowStock = stockSheet.getLastRow();
    if (lastRowStock > 1) stockSheet.getRange(2, 1, lastRowStock - 1, 5).clearContent();

    stockSheet.getRange(2, 1, sheetData.length, 5).setValues(sheetData);
    stockSheet.getRange(2, 2, sheetData.length, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');

    console.log(`✅ ${sheetData.length} ta qoldiq mc_stock ga yozildi.`);
  } else {
    console.log("MoySklad dan qoldiq topilmadi.");
  }
}