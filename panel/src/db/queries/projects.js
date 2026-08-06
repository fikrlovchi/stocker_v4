const db = require("../index");

const stmts = {
  getBySlug: db.prepare("SELECT * FROM projects WHERE slug = ?"),
  listAll: db.prepare("SELECT * FROM projects ORDER BY display_name"),
  insert: db.prepare(`
    INSERT INTO projects (slug, display_name, api_key_hash, systemd_service, systemd_timer)
    VALUES (@slug, @displayName, @apiKeyHash, @systemdService, @systemdTimer)
  `),
  setPaused: db.prepare("UPDATE projects SET is_paused = ? WHERE slug = ?"),
  updateDisplayName: db.prepare("UPDATE projects SET display_name = ? WHERE slug = ?"),
};

function getBySlug(slug) {
  return stmts.getBySlug.get(slug);
}

function listAll() {
  return stmts.listAll.all();
}

function create({ slug, displayName, apiKeyHash, systemdService = null, systemdTimer = null }) {
  const result = stmts.insert.run({ slug, displayName, apiKeyHash, systemdService, systemdTimer });
  return getBySlug(slug) || { id: result.lastInsertRowid };
}

function setPaused(slug, isPaused) {
  stmts.setPaused.run(isPaused ? 1 : 0, slug);
}

function updateDisplayName(slug, displayName) {
  stmts.updateDisplayName.run(displayName, slug);
}

module.exports = { getBySlug, listAll, create, setPaused, updateDisplayName };
