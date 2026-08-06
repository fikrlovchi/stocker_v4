const db = require("../index");

const stmts = {
  listForProject: db.prepare("SELECT * FROM project_env_bindings WHERE project_id = ? ORDER BY env_key"),
  getById: db.prepare("SELECT * FROM project_env_bindings WHERE id = ?"),
  upsert: db.prepare(`
    INSERT INTO project_env_bindings (project_id, env_key, source_type, source_id) VALUES (?, ?, ?, ?)
    ON CONFLICT(project_id, env_key) DO UPDATE SET source_type = excluded.source_type, source_id = excluded.source_id
  `),
  remove: db.prepare("DELETE FROM project_env_bindings WHERE id = ?"),
  projectsForSource: db.prepare(`
    SELECT DISTINCT p.slug, p.display_name FROM project_env_bindings b
    JOIN projects p ON p.id = b.project_id
    WHERE b.source_type = ? AND b.source_id = ?
    ORDER BY p.display_name
  `),
};

function listForProject(projectId) {
  return stmts.listForProject.all(projectId);
}
function getById(id) {
  return stmts.getById.get(id);
}
function upsert(projectId, envKey, sourceType, sourceId) {
  stmts.upsert.run(projectId, envKey, sourceType, sourceId);
}
function remove(id) {
  stmts.remove.run(id);
}
function getProjectsForSource(sourceType, sourceId) {
  return stmts.projectsForSource.all(sourceType, sourceId);
}

module.exports = { listForProject, getById, upsert, remove, getProjectsForSource };
