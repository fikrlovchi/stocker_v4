const db = require("../index");

const stmts = {
  insert: db.prepare(`
    INSERT INTO runs (project_id, started_at, finished_at, status, success_count, error_count, summary)
    VALUES (@projectId, @startedAt, @finishedAt, @status, @successCount, @errorCount, @summary)
  `),
  listForProject: db.prepare(`
    SELECT * FROM runs WHERE project_id = ? ORDER BY started_at DESC LIMIT ? OFFSET ?
  `),
  countForProject: db.prepare("SELECT COUNT(*) AS n FROM runs WHERE project_id = ?"),
  latestForProject: db.prepare(`
    SELECT * FROM runs WHERE project_id = ? ORDER BY started_at DESC LIMIT 1
  `),
  deleteOlderThan: db.prepare("DELETE FROM runs WHERE started_at < ?"),
};

function insert({ projectId, startedAt, finishedAt, status, successCount, errorCount, summary }) {
  const result = stmts.insert.run({
    projectId,
    startedAt,
    finishedAt,
    status,
    successCount,
    errorCount,
    summary: summary || null,
  });
  return result.lastInsertRowid;
}

function listForProject(projectId, { limit = 50, offset = 0 } = {}) {
  return stmts.listForProject.all(projectId, limit, offset);
}

function countForProject(projectId) {
  return stmts.countForProject.get(projectId).n;
}

function latestForProject(projectId) {
  return stmts.latestForProject.get(projectId);
}

function deleteOlderThan(isoCutoff) {
  return stmts.deleteOlderThan.run(isoCutoff).changes;
}

module.exports = { insert, listForProject, countForProject, latestForProject, deleteOlderThan };
