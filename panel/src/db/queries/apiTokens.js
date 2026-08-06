const db = require("../index");

const stmts = {
  list: db.prepare("SELECT * FROM api_tokens ORDER BY name"),
  get: db.prepare("SELECT * FROM api_tokens WHERE id = ?"),
  create: db.prepare("INSERT INTO api_tokens (name, token) VALUES (?, ?)"),
  delete: db.prepare("DELETE FROM api_tokens WHERE id = ?"),
};

function list() {
  return stmts.list.all();
}
function get(id) {
  return stmts.get.get(id);
}
function create(name, token) {
  return stmts.create.run(name, token).lastInsertRowid;
}
function deleteToken(id) {
  stmts.delete.run(id);
}

module.exports = { list, get, create, deleteToken };
