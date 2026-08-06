// Loyihalar bo'limi — panel'dan ko'chirilgan (konsolidatsiya 3-bosqichi).
//
// Menyuda "Uzum order to MC" deb turadi, lekin ekran LOYIHAGA BOG'LANMAGAN:
// `mc-stock-to-uzum` va `stocker` ham shu yerdan boshqariladi. Aks holda
// panel o'chgach ular boshqaruvsiz qolardi.
//
// Ma'lumot bir xil bazada (2-bosqich birlashtirishi) — panel'dagi jadvallar
// shundoq o'qiladi: projects, runs, log_events, project_env_bindings.
import { execFile } from "node:child_process";
import fs from "node:fs";
import { promisify } from "node:util";
import express from "express";
import { db } from "../db/index.js";
import logger from "../logger.js";

const execFileAsync = promisify(execFile);
const SYSTEMCTL = "/usr/bin/systemctl";
const EXEC_TIMEOUT_MS = 5000;

// Systemd orqali boshqariladigan loyihalar — QATTIQ KODLANGAN ro'yxat.
//
// `cancel-uzum-order` (Uzum CANCELED → MoySklad) 2026-08-06 da olib tashlandi:
// loyiha faol emas edi. O'chirish skripti: deploy/remove-cancel-uzum-order.sh
// Bazadan olinmaydi: sessiya o'g'irlansa ham hujumchi ixtiyoriy unit'ni
// boshqara olmasin (panel'dagi manageable-units.js bilan bir xil tamoyil).
const UNITS = {
  "uzum-order-to-mc": {
    serviceUnit: "uzum-order.service",
    timerUnit: "uzum-order.timer",
    timerUnitPath: "/etc/systemd/system/uzum-order.timer",
    envPath: "/root/stocker/uzum-order-to-mc/.env",
  },
  "mc-stock-to-uzum": {
    serviceUnit: "mc-stock.service",
    timerUnit: "mc-stock.timer",
    timerUnitPath: "/etc/systemd/system/mc-stock.timer",
    envPath: "/root/stockerMC_Stock/.env",
  },
  stocker: {
    serviceUnit: "stocker-server.service",
    timerUnit: null,
    timerUnitPath: null,
    envPath: "/root/stocker/server/.env",
  },
};

const run = (args) => execFileAsync(SYSTEMCTL, args, { timeout: EXEC_TIMEOUT_MS });

function parseProps(stdout) {
  const out = {};
  for (const line of String(stdout).split("\n")) {
    const i = line.indexOf("=");
    if (i > 0) out[line.slice(0, i)] = line.slice(i + 1);
  }
  return out;
}

async function unitStatus(slug) {
  const unit = UNITS[slug];
  if (!unit) return null;
  const props = "--property=ActiveState,SubState,Result";
  try {
    const [svc, timer] = await Promise.all([
      unit.serviceUnit ? run(["show", unit.serviceUnit, props]) : Promise.resolve({ stdout: "" }),
      unit.timerUnit ? run(["show", unit.timerUnit, props]) : Promise.resolve({ stdout: "" }),
    ]);
    return { service: parseProps(svc.stdout), timer: parseProps(timer.stdout), hasTimer: Boolean(unit.timerUnit) };
  } catch (e) {
    return { error: e.message, hasTimer: Boolean(unit.timerUnit) };
  }
}

// Timer faylidagi interval — panel'dagi kabi OnUnitActiveSec dan o'qiladi.
function intervalSeconds(slug) {
  const path = UNITS[slug]?.timerUnitPath;
  if (!path) return null;
  try {
    const m = fs.readFileSync(path, "utf8").match(/^OnUnitActiveSec=(\d+)\s*$/m);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

const shapeProject = (row) => ({
  id: row.id,
  slug: row.slug,
  displayName: row.display_name,
  isPaused: row.is_paused === 1,
  lastSeenAt: row.last_seen_at,
  managed: Boolean(UNITS[row.slug]),
});

export function projectsRouter() {
  const router = express.Router();

  router.get("/", (req, res) => {
    const rows = db.prepare("SELECT * FROM projects ORDER BY display_name").all();
    // Har loyiha yonida oxirgi ishga tushish va oxirgi xato — ro'yxatda
    // darhol ko'rinsin, ichiga kirmasdan.
    const last = db.prepare("SELECT * FROM runs WHERE project_id = ? ORDER BY started_at DESC LIMIT 1");
    const lastError = db.prepare(
      "SELECT message, logged_at FROM log_events WHERE project_id = ? AND level = 'ERROR' ORDER BY logged_at DESC LIMIT 1"
    );
    res.json({
      projects: rows.map((r) => ({
        ...shapeProject(r),
        lastRun: last.get(r.id) || null,
        lastError: lastError.get(r.id) || null,
      })),
    });
  });

  router.get("/:slug", async (req, res) => {
    const row = db.prepare("SELECT * FROM projects WHERE slug = ?").get(req.params.slug);
    if (!row) return res.status(404).json({ error: "Loyiha topilmadi" });

    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const runs = db
      .prepare("SELECT * FROM runs WHERE project_id = ? ORDER BY started_at DESC LIMIT ?")
      .all(row.id, limit);

    const logsOf = db.prepare("SELECT level, message, logged_at FROM log_events WHERE run_id = ? ORDER BY logged_at");
    const bindings = db
      .prepare(
        `SELECT b.id, b.env_key, b.source_type, b.source_id FROM project_env_bindings b
         WHERE b.project_id = ? ORDER BY b.env_key`
      )
      .all(row.id);

    res.json({
      project: shapeProject(row),
      runs: runs.map((r) => ({ ...r, logs: logsOf.all(r.id) })),
      totalRuns: db.prepare("SELECT COUNT(*) AS n FROM runs WHERE project_id = ?").get(row.id).n,
      status: await unitStatus(row.slug),
      intervalSeconds: intervalSeconds(row.slug),
      envBindings: bindings,
    });
  });

  /* ---------- boshqaruv ---------- */

  // Boshqaruv faqat ro'yxatdagi loyihalarga; noma'lum slug bilan systemd'ga
  // hech narsa uzatilmaydi.
  function unitOr404(req, res) {
    const unit = UNITS[req.params.slug];
    if (!unit) {
      res.status(400).json({ error: "Bu loyiha systemd orqali boshqarilmaydi" });
      return null;
    }
    return unit;
  }

  const setPaused = (slug, paused) =>
    db.prepare("UPDATE projects SET is_paused = ? WHERE slug = ?").run(paused ? 1 : 0, slug);

  router.post("/:slug/pause", async (req, res) => {
    const unit = unitOr404(req, res);
    if (!unit) return;
    try {
      // Timer'siz loyihada (stocker) servisning o'zi to'xtatiladi.
      await run(["stop", unit.timerUnit || unit.serviceUnit]);
      setPaused(req.params.slug, true);
      logger.info(`Loyiha to'xtatildi: ${req.params.slug} (${req.user.login})`);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post("/:slug/resume", async (req, res) => {
    const unit = unitOr404(req, res);
    if (!unit) return;
    try {
      await run(["start", unit.timerUnit || unit.serviceUnit]);
      setPaused(req.params.slug, false);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post("/:slug/run-now", async (req, res) => {
    const unit = unitOr404(req, res);
    if (!unit?.serviceUnit) return;
    try {
      await run([unit.timerUnit ? "start" : "restart", unit.serviceUnit]);
      logger.info(`Loyiha ishga tushirildi: ${req.params.slug} (${req.user.login})`);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post("/:slug/interval", async (req, res) => {
    const unit = unitOr404(req, res);
    if (!unit) return;
    const seconds = Number(req.body?.seconds);
    if (!Number.isInteger(seconds) || seconds < 10 || seconds > 86400) {
      return res.status(400).json({ error: "Interval 10 soniyadan 24 soatgacha butun son bo'lishi kerak" });
    }
    if (!unit.timerUnit || !unit.timerUnitPath) {
      return res.status(400).json({ error: "Bu loyiha doimiy ishlaydi — interval yo'q" });
    }
    try {
      const content = fs.readFileSync(unit.timerUnitPath, "utf8");
      if (!/^OnUnitActiveSec=/m.test(content)) throw new Error("Timer faylida OnUnitActiveSec= yo'q");
      // Vaqtinchalik faylga yozib almashtiramiz: yozish yarmida uzilsa
      // timer fayli buzilib qolmasin.
      const tmp = `${unit.timerUnitPath}.tmp`;
      fs.writeFileSync(tmp, content.replace(/^OnUnitActiveSec=.*$/m, `OnUnitActiveSec=${seconds}`));
      fs.renameSync(tmp, unit.timerUnitPath);
      await run(["daemon-reload"]);
      await run(["restart", unit.timerUnit]);
      logger.info(`Interval o'zgardi: ${req.params.slug} → ${seconds}s (${req.user.login})`);
      res.json({ ok: true, seconds });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}

export { UNITS };
