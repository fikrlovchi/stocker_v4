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
    // Kutish oynasi (Toshkent vaqti) — interfeysdan tahrirlanadi.
    holdWindow: true,
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

/* ---------- kutish oynasi (.env: WINDOW_HOLD_START/END) ---------- */

const HOLD_KEYS = { start: "WINDOW_HOLD_START", end: "WINDOW_HOLD_END" };
// Standart qiymatlar `uzum-order-to-mc/src/orderStatusSync.js` dagi bilan
// bir xil bo'lishi SHART: .env da satr bo'lmasa aynan shular ishlaydi.
const HOLD_DEFAULTS = { start: "06:10", end: "11:00" };

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const toMinutes = (v) => {
  const m = HHMM.exec(String(v || "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

function readEnvValue(text, key) {
  const m = new RegExp(`^${key}=(.*)$`, "m").exec(text);
  return m ? m[1].trim() : null;
}

// Bor satrni almashtiradi, yo'q bo'lsa oxiriga qo'shadi — qolgan satrlarga
// TEGMAYDI (fayl ichida tokenlar bor).
function withEnvValue(text, key, value) {
  const line = `${key}=${value}`;
  if (new RegExp(`^${key}=`, "m").test(text)) {
    return text.replace(new RegExp(`^${key}=.*$`, "m"), line);
  }
  return `${text}${text.endsWith("\n") || text === "" ? "" : "\n"}${line}\n`;
}

function holdWindow(slug) {
  const unit = UNITS[slug];
  if (!unit?.holdWindow || !unit.envPath) return null;
  try {
    const text = fs.readFileSync(unit.envPath, "utf8");
    return {
      start: readEnvValue(text, HOLD_KEYS.start) || HOLD_DEFAULTS.start,
      end: readEnvValue(text, HOLD_KEYS.end) || HOLD_DEFAULTS.end,
      defaults: HOLD_DEFAULTS,
    };
  } catch (e) {
    return { ...HOLD_DEFAULTS, defaults: HOLD_DEFAULTS, error: e.message };
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
      holdWindow: holdWindow(row.slug),
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

  /**
   * Kutish oynasi — Toshkent vaqti, `HH:mm`.
   *
   * Ilgari faqat `.env` da edi, ya'ni o'zgartirish uchun SSH kerak edi.
   * Buyurtma statusi butunlay shu oraliqqa tayanadi (6:10–11:00 orasida
   * tushgani "Yangi", 11:01 dan keyin ishlanadi), shuning uchun uni
   * interfeysdan boshqarish kerak.
   *
   * Servis timer bilan ishlaydi va har ishga tushishda `.env` ni qaytadan
   * o'qiydi — restart shart emas, yangi qiymat keyingi tsikldan amal qiladi.
   */
  router.put("/:slug/hold-window", (req, res) => {
    const unit = unitOr404(req, res);
    if (!unit) return;
    if (!unit.holdWindow || !unit.envPath) {
      return res.status(400).json({ error: "Bu loyihada kutish oynasi yo'q" });
    }

    const start = String(req.body?.start || "").trim();
    const end = String(req.body?.end || "").trim();
    const startMin = toMinutes(start);
    const endMin = toMinutes(end);
    if (startMin === null || endMin === null) {
      return res.status(400).json({ error: "Vaqt HH:mm ko'rinishida bo'lishi kerak (masalan 06:10)" });
    }
    // `isInHoldWindow` yarim tunni kesib o'tuvchi oraliqni qo'llamaydi —
    // shart shu yerda ham tekshiriladi, aks holda servis har tsiklda yiqilardi.
    if (endMin <= startMin) {
      return res.status(400).json({ error: "Tugash vaqti boshlanish vaqtidan katta bo'lishi kerak" });
    }

    try {
      const text = fs.readFileSync(unit.envPath, "utf8");
      let next = withEnvValue(text, HOLD_KEYS.start, start);
      next = withEnvValue(next, HOLD_KEYS.end, end);

      // Vaqtinchalik faylga yozib almashtiramiz: yozish yarmida uzilsa .env
      // (ichida tokenlar bor) buzilib qolmasin — interval endpoint'i bilan
      // bir xil tartib.
      const tmp = `${unit.envPath}.tmp`;
      fs.writeFileSync(tmp, next, { mode: 0o600 });
      fs.renameSync(tmp, unit.envPath);

      logger.info(`Kutish oynasi o'zgardi: ${req.params.slug} → ${start}–${end} (${req.user.login})`);
      res.json({ ok: true, start, end });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}

export { UNITS, withEnvValue, readEnvValue };
