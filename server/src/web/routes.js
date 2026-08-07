// Veb interfeys (React SPA) uchun API — konsolidatsiya 3-bosqichi.
//
// Mobil API'dan (`/api/*`) ataylab ajratilgan:
//   • kirish `mobile` bayrog'isiz ham mumkin, lekin hisob `users` da bo'lishi shart
//   • har so'rov bo'lim ruxsati bo'yicha tekshiriladi
//
// Menyuni yashirish himoya EMAS — shuning uchun ruxsat serverda, har
// endpointda tekshiriladi.
import express from "express";
import { login, logout, resolveToken } from "../auth/operators.js";
import { FLAGS, SECTIONS } from "../auth/sections.js";
import * as users from "../auth/users.js";
import * as batches from "../packing/batches.js";
import { labelsRouter } from "./labels.js";
import { projectsRouter } from "./projects.js";
import { variablesRouter } from "./variables.js";
import { telegramRouter } from "./telegram.js";
import { moyskladRouter } from "./moysklad.js";
import logger from "../logger.js";

function bearer(req) {
  const header = req.header("Authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

// Veb tokeni bilan kelgan foydalanuvchini aniqlaydi.
function requireWeb(req, res, next) {
  const session = resolveToken(bearer(req));
  if (!session || session.scope !== "web") {
    return res.status(401).json({ error: "Kirish kerak", code: "auth_required" });
  }
  req.user = users.getUserByLogin(session.login);
  if (!req.user || !req.user.isActive) {
    return res.status(401).json({ error: "Hisob faol emas", code: "inactive" });
  }
  next();
}

// Bo'lim ruxsati. Superadmin har doim o'tadi (users.can shuni hisobga oladi).
function requireSection(section) {
  return (req, res, next) => {
    if (!users.can(req.user, section)) {
      return res.status(403).json({ error: "Bu bo'limga ruxsat yo'q", code: "forbidden", section });
    }
    next();
  };
}

const publicUser = (u) => ({
  id: u.id,
  login: u.login,
  displayName: u.displayName,
  isActive: u.isActive,
  isSuperadmin: u.isSuperadmin,
  sections: u.sections,
  flags: u.flags,
  createdAt: u.createdAt,
  lastLoginAt: u.lastLoginAt,
});

export function webRouter() {
  const router = express.Router();

  /* ---------- kirish ---------- */

  router.post("/auth/login", (req, res) => {
    const { login: rawLogin, password } = req.body || {};
    if (!rawLogin || !password) return res.status(400).json({ error: "login va parol kerak" });

    const result = login({
      login: rawLogin,
      password,
      ip: req.ip,
      device: (req.header("User-Agent") || "web").slice(0, 120),
      scope: "web",
    });
    if (result.error) return res.status(401).json(result);

    const user = users.getUserByLogin(result.login);
    res.json({ token: result.token, user: publicUser(user) });
  });

  router.post("/auth/logout", (req, res) => {
    const token = bearer(req);
    res.json({ ok: token ? logout(token) : false });
  });

  // Ilova ochilganda: token yaroqlimi va menyuda nima ko'rinadi.
  router.get("/auth/me", requireWeb, (req, res) => {
    res.json({ user: publicUser(req.user), sections: SECTIONS, flags: FLAGS });
  });

  /* ---------- foydalanuvchilar va ruxsatlar ---------- */

  router.get("/users", requireWeb, requireSection("users"), (req, res) => {
    res.json({ users: users.listUsers().map(publicUser), sections: SECTIONS, flags: FLAGS });
  });

  router.post("/users", requireWeb, requireSection("users"), (req, res) => {
    const { login: l, displayName, password, sections, flags, isSuperadmin } = req.body || {};
    try {
      // Superadmin yaratishga faqat superadmin haqli — aks holda oddiy
      // "users" ruxsati bilan o'zini superadmin qilib olish mumkin bo'lardi.
      if (isSuperadmin && !req.user.isSuperadmin) {
        return res.status(403).json({ error: "Superadmin yaratishga ruxsat yo'q" });
      }
      const created = users.createUser({
        login: l, displayName, password,
        isSuperadmin: Boolean(isSuperadmin) && req.user.isSuperadmin,
        sections, flags,
      });
      logger.info(`Foydalanuvchi yaratildi: ${created.login} (${req.user.login} tomonidan)`);
      res.json({ user: publicUser(created) });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.patch("/users/:id", requireWeb, requireSection("users"), (req, res) => {
    const id = Number(req.params.id);
    const target = users.getUserById(id);
    if (!target) return res.status(404).json({ error: "Foydalanuvchi topilmadi" });

    const { displayName, password, sections, flags, isActive } = req.body || {};
    try {
      if (displayName !== undefined) users.rename(id, displayName);
      if (password) users.setPassword(id, password);
      if (sections !== undefined) users.setSections(id, sections);
      if (flags !== undefined) users.setFlags(id, flags);
      if (isActive !== undefined) users.setActive(id, Boolean(isActive));
      res.json({ user: publicUser(users.getUserById(id)) });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.delete("/users/:id", requireWeb, requireSection("users"), (req, res) => {
    const id = Number(req.params.id);
    // O'zini o'chirib qo'yish — keyin kirish yo'li yopilishi mumkin.
    if (req.user.id === id) return res.status(400).json({ error: "O'zingizni o'chira olmaysiz" });
    try {
      users.removeUser(id);
      logger.info(`Foydalanuvchi o'chirildi: #${id} (${req.user.login} tomonidan)`);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  /* ---------- yig'ish: partiyalar ---------- */

  const packing = [requireWeb, requireSection("packing")];

  router.get("/batches", ...packing, (req, res) => {
    res.json({ batches: batches.listBatches(), open: batches.openBatch() });
  });

  router.post("/batches", ...packing, (req, res) => {
    const { name, orders } = req.body || {};
    try {
      const orderIds = batches.parseOrderIds(orders);
      // Javobda faqat "yaratildi" emas, nima bo'lgani ham qaytadi: qaysi
      // ID keshda topilmadi, qaysi biri boshqa partiyada qolib ketdi.
      res.json(batches.createBatch({ name, orderIds, createdBy: req.user.login }));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.get("/batches/:id", ...packing, (req, res) => {
    const id = Number(req.params.id);
    const batch = batches.getBatch(id);
    if (!batch) return res.status(404).json({ error: "Partiya topilmadi" });
    res.json({
      batch,
      shops: batches.batchShops(id),
      orders: batches.batchOrders(id, { shopId: req.query.shop || null }),
    });
  });

  router.post("/batches/:id/close", ...packing, (req, res) => {
    res.json({ batch: batches.closeBatch(Number(req.params.id)) });
  });

  router.post("/batches/:id/reopen", ...packing, (req, res) => {
    try {
      res.json({ batch: batches.reopenBatch(Number(req.params.id)) });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  router.delete("/batches/:id", ...packing, (req, res) => {
    batches.removeBatch(Number(req.params.id));
    res.json({ ok: true });
  });

  router.delete("/batches/:id/orders/:orderId", ...packing, (req, res) => {
    batches.removeOrderFromBatch(Number(req.params.id), req.params.orderId);
    res.json({ ok: true });
  });

  /* ---------- loyihalar (Uzum order to MC va boshqalar) ---------- */

  router.use("/projects", requireWeb, requireSection("orders_to_mc"), projectsRouter());

  /* ---------- Konfiguratsiya ---------- */

  // Bu yerdagi hamma narsa tokenlar bilan ishlaydi — `settings` ruxsati
  // talab qilinadi, `orders_to_mc` emas.
  router.use("/variables", requireWeb, requireSection("settings"), variablesRouter());
  router.use("/telegram", requireWeb, requireSection("settings"), telegramRouter());
  router.use("/moysklad", requireWeb, requireSection("settings"), moyskladRouter());

  /* ---------- yorliqlar (uzumPDFs) ---------- */

  // Butun bo'lim `labels` ruxsati bilan yopiladi; ichkarisi labels.js da.
  router.use("/labels", requireWeb, requireSection("labels"), labelsRouter());

  return router;
}

export { requireSection, requireWeb };
