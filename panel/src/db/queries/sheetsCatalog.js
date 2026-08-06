const db = require("../index");

const stmts = {
  listSheets: db.prepare("SELECT * FROM google_sheets ORDER BY name"),
  getSheet: db.prepare("SELECT * FROM google_sheets WHERE id = ?"),
  createSheet: db.prepare("INSERT INTO google_sheets (name, sheet_id) VALUES (?, ?)"),
  deleteSheet: db.prepare("DELETE FROM google_sheets WHERE id = ?"),

  listListsBySheet: db.prepare("SELECT * FROM sheet_lists WHERE sheet_id = ? ORDER BY name"),
  listAllLists: db.prepare("SELECT * FROM sheet_lists ORDER BY name"),
  getList: db.prepare("SELECT * FROM sheet_lists WHERE id = ?"),
  createList: db.prepare("INSERT INTO sheet_lists (sheet_id, name) VALUES (?, ?)"),
  deleteList: db.prepare("DELETE FROM sheet_lists WHERE id = ?"),
};

function listSheets() {
  return stmts.listSheets.all();
}
function getSheet(id) {
  return stmts.getSheet.get(id);
}
function createSheet(name, sheetId) {
  return stmts.createSheet.run(name, sheetId).lastInsertRowid;
}
function deleteSheet(id) {
  stmts.deleteSheet.run(id);
}

function listListsBySheet(sheetId) {
  return stmts.listListsBySheet.all(sheetId);
}
function getList(id) {
  return stmts.getList.get(id);
}
function createList(sheetId, name) {
  return stmts.createList.run(sheetId, name).lastInsertRowid;
}
function deleteList(id) {
  stmts.deleteList.run(id);
}

function listAllForCatalog() {
  const sheets = stmts.listSheets.all();
  const lists = stmts.listAllLists.all();
  return sheets.map((sheet) => ({
    ...sheet,
    lists: lists.filter((l) => l.sheet_id === sheet.id),
  }));
}

function listFlatListsWithSheet() {
  return stmts.listAllLists.all().map((list) => ({
    ...list,
    sheet: getSheet(list.sheet_id),
  }));
}

module.exports = {
  listSheets,
  getSheet,
  createSheet,
  deleteSheet,
  listListsBySheet,
  getList,
  createList,
  deleteList,
  listAllForCatalog,
  listFlatListsWithSheet,
};
