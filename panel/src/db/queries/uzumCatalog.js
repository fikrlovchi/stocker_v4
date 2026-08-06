const db = require("../index");

const stmts = {
  listCabinets: db.prepare("SELECT * FROM uzum_cabinets ORDER BY name"),
  getCabinet: db.prepare("SELECT * FROM uzum_cabinets WHERE id = ?"),
  createCabinet: db.prepare("INSERT INTO uzum_cabinets (name, token) VALUES (?, ?)"),
  deleteCabinet: db.prepare("DELETE FROM uzum_cabinets WHERE id = ?"),

  listShopsByCabinet: db.prepare("SELECT * FROM uzum_shops WHERE cabinet_id = ? ORDER BY name"),
  listAllShops: db.prepare("SELECT * FROM uzum_shops ORDER BY name"),
  getShop: db.prepare("SELECT * FROM uzum_shops WHERE id = ?"),
  createShop: db.prepare("INSERT INTO uzum_shops (cabinet_id, name, shop_id) VALUES (?, ?, ?)"),
  upsertShop: db.prepare(`
    INSERT INTO uzum_shops (cabinet_id, name, shop_id) VALUES (?, ?, ?)
    ON CONFLICT(cabinet_id, shop_id) DO UPDATE SET name = excluded.name
  `),
  deleteShop: db.prepare("DELETE FROM uzum_shops WHERE id = ?"),
};

function listCabinets() {
  return stmts.listCabinets.all();
}
function getCabinet(id) {
  return stmts.getCabinet.get(id);
}
function createCabinet(name, token) {
  return stmts.createCabinet.run(name, token).lastInsertRowid;
}
function deleteCabinet(id) {
  stmts.deleteCabinet.run(id);
}

function listShopsByCabinet(cabinetId) {
  return stmts.listShopsByCabinet.all(cabinetId);
}
function getShop(id) {
  return stmts.getShop.get(id);
}
function createShop(cabinetId, name, shopId) {
  return stmts.createShop.run(cabinetId, name, shopId).lastInsertRowid;
}
// Uzum API'dan avtomatik sinxronlashda ishlatiladi — bir xil do'kon qayta
// qo'shilmaydi, faqat nomi yangilanadi.
function upsertShop(cabinetId, name, shopId) {
  stmts.upsertShop.run(cabinetId, name, shopId);
}
function deleteShop(id) {
  stmts.deleteShop.run(id);
}

// /variables sahifasi uchun: har bir kabinet o'z do'konlari bilan.
function listCabinetsWithShops() {
  const shops = stmts.listAllShops.all();
  return listCabinets().map((cabinet) => ({
    ...cabinet,
    shops: shops.filter((s) => s.cabinet_id === cabinet.id),
  }));
}

// Loyiha sahifasidagi "Manba elementi" select'ini to'ldirish uchun tekis ro'yxat.
function listFlatShopsWithCabinet() {
  return stmts.listAllShops.all().map((shop) => ({
    ...shop,
    cabinet: getCabinet(shop.cabinet_id),
  }));
}

module.exports = {
  listCabinets,
  getCabinet,
  createCabinet,
  deleteCabinet,
  listShopsByCabinet,
  getShop,
  createShop,
  upsertShop,
  deleteShop,
  listCabinetsWithShops,
  listFlatShopsWithCabinet,
};
