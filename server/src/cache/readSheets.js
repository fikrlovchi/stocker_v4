// Google Sheets'dan xom qatorlarni o'qiydi.
//
// Ikki xil valueRenderOption ataylab ishlatilgan:
//  • uzum_order    -> UNFORMATTED_VALUE. `W`/`C` sana ustunlari serial son
//    bo'lishi mumkin, parseSheetTimeToEpochMs aynan shuni kutadi
//    (uzumOrderToMC ham shunday o'qiydi).
//  • uzum_order_detail -> FORMATTED_VALUE. Barcode ustuni (`B`) matn bo'lib
//    qolishi kerak: UNFORMATTED bo'lsa bosh nollar yo'qoladi. Bu uzumPDFs
//    ning o'qish rejimi bilan ham bir xil (sheetData.js default render
//    option'dan foydalanadi), ya'ni indeksdagi barcode ShK'ga chiqadigan
//    barcode bilan aynan bir xil bo'ladi.
import { config } from "../config.js";
import { getSheetsClient } from "../google/sheetsClient.js";
import logger from "../logger.js";

export async function readSheets() {
  const sheets = getSheetsClient();
  const { spreadsheetId } = config;
  const { orders, details, packing } = config.sheets;

  const ordersResp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${orders}!A:W`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  // uzum_packing hali yaratilmagan bo'lishi mumkin (9-fazada paydo bo'ladi) —
  // bunda batchGet butunlay 400 qaytaradi, shuning uchun tushib qolishga tayyor.
  let detailRows = [];
  let packingRows = [];
  try {
    const resp = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges: [`${details}!A:L`, `${packing}!A:L`],
      valueRenderOption: "FORMATTED_VALUE",
    });
    detailRows = resp.data.valueRanges[0].values || [];
    packingRows = resp.data.valueRanges[1].values || [];
  } catch (e) {
    logger.warn(`${packing} varag'i o'qilmadi (hali yaratilmagan bo'lishi mumkin): ${e.message}`);
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${details}!A:L`,
      valueRenderOption: "FORMATTED_VALUE",
    });
    detailRows = resp.data.values || [];
  }

  return {
    orderRows: ordersResp.data.values || [],
    detailRows,
    packingRows,
  };
}
