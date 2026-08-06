const db = require("../index");

const stmts = {
  insert: db.prepare(`
    INSERT INTO log_events (run_id, project_id, level, message, logged_at)
    VALUES (@runId, @projectId, @level, @message, @loggedAt)
  `),
  latestErrorForProject: db.prepare(`
    SELECT * FROM log_events WHERE project_id = ? AND level = 'ERROR' ORDER BY logged_at DESC LIMIT 1
  `),
  listForRun: db.prepare("SELECT * FROM log_events WHERE run_id = ? ORDER BY logged_at ASC"),
  deleteOlderThan: db.prepare("DELETE FROM log_events WHERE logged_at < ?"),
};

const insertManyTxn = db.transaction((runId, projectId, events) => {
  for (const e of events) {
    stmts.insert.run({
      runId,
      projectId,
      level: e.level,
      message: e.message,
      loggedAt: e.loggedAt,
    });
  }
});

function insertMany(runId, projectId, events) {
  if (events.length === 0) return;
  insertManyTxn(runId, projectId, events);
}

function latestErrorForProject(projectId) {
  return stmts.latestErrorForProject.get(projectId);
}

function listForRun(runId) {
  return stmts.listForRun.all(runId);
}

function deleteOlderThan(isoCutoff) {
  return stmts.deleteOlderThan.run(isoCutoff).changes;
}

module.exports = { insertMany, latestErrorForProject, listForRun, deleteOlderThan };
