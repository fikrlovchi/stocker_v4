const db = require("../index");

const stmts = {
  listSheetLinksForProject: db.prepare("SELECT * FROM project_sheet_links WHERE project_id = ?"),
  addSheetLink: db.prepare(
    "INSERT OR IGNORE INTO project_sheet_links (project_id, sheet_id, list_id) VALUES (?, ?, ?)"
  ),
  deleteSheetLinksForProject: db.prepare("DELETE FROM project_sheet_links WHERE project_id = ?"),

  projectsForSheet: db.prepare(`
    SELECT DISTINCT p.slug, p.display_name FROM project_sheet_links l
    JOIN projects p ON p.id = l.project_id
    WHERE l.sheet_id = ?
    ORDER BY p.display_name
  `),
  projectsForList: db.prepare(`
    SELECT p.slug, p.display_name FROM project_sheet_links l
    JOIN projects p ON p.id = l.project_id
    WHERE l.list_id = ?
    ORDER BY p.display_name
  `),
};

function listSheetLinksForProject(projectId) {
  return stmts.listSheetLinksForProject.all(projectId);
}
function setSheetLinks(projectId, links) {
  const tx = db.transaction((rows) => {
    stmts.deleteSheetLinksForProject.run(projectId);
    for (const { sheetId, listId } of rows) {
      stmts.addSheetLink.run(projectId, sheetId, listId || null);
    }
  });
  tx(links);
}

function getProjectsLinkedToSheet(sheetId) {
  return stmts.projectsForSheet.all(sheetId);
}
function getProjectsLinkedToList(listId) {
  return stmts.projectsForList.all(listId);
}

module.exports = {
  listSheetLinksForProject,
  setSheetLinks,
  getProjectsLinkedToSheet,
  getProjectsLinkedToList,
};
