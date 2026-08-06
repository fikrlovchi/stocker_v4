const db = require("../db");

const insertStmt = db.prepare("INSERT INTO admin_actions (action, project_slug, detail) VALUES (?, ?, ?)");

function recordAdminAction(action, projectSlug, detail) {
  insertStmt.run(action, projectSlug, detail || null);
}

module.exports = { recordAdminAction };
