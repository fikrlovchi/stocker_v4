const runs = require("../db/queries/runs");
const logEvents = require("../db/queries/logEvents");

const DAY_MS = 24 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = DAY_MS;

function isoCutoff(days) {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

function pruneOnce() {
  const logDays = Number(process.env.LOG_RETENTION_DAYS) || 30;
  const runDays = Number(process.env.RUN_RETENTION_DAYS) || 90;

  const deletedLogs = logEvents.deleteOlderThan(isoCutoff(logDays));
  const deletedRuns = runs.deleteOlderThan(isoCutoff(runDays));

  if (deletedLogs || deletedRuns) {
    console.log(`[pruning] o'chirildi: ${deletedLogs} log, ${deletedRuns} run`);
  }
}

function startPruningJob() {
  pruneOnce();
  setInterval(pruneOnce, CHECK_INTERVAL_MS).unref();
}

module.exports = { startPruningJob, pruneOnce };
