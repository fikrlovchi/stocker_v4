const express = require("express");
const projects = require("../db/queries/projects");
const runs = require("../db/queries/runs");
const logEvents = require("../db/queries/logEvents");
const manageableUnits = require("../config/manageable-units");
const systemdControl = require("../services/systemdControl");
const { formatTashkent } = require("../utils/formatDate");

const router = express.Router();

router.get("/", (req, res) => {
  const list = projects.listAll().map((p) => {
    const latestRun = runs.latestForProject(p.id);
    const latestError = logEvents.latestErrorForProject(p.id);
    const intervalSeconds = systemdControl.getConfiguredIntervalSeconds(p.slug);

    let stale = false;
    if (latestRun && intervalSeconds) {
      const ageMs = Date.now() - new Date(latestRun.started_at).getTime();
      stale = ageMs > intervalSeconds * 3 * 1000;
    }

    return {
      ...p,
      latestRun,
      latestError,
      stale,
      isManaged: Boolean(manageableUnits[p.slug]),
    };
  });

  res.render("dashboard", { projects: list, actionMessage: req.query.ok, errorMessage: req.query.error, formatTashkent });
});

module.exports = router;
