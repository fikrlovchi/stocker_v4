require("dotenv").config();
require("./db"); // applies migrations on boot

const path = require("path");
const express = require("express");
const session = require("express-session");

const { requireAuth } = require("./middleware/auth");
const authRoutes = require("./routes/auth");
const dashboardRoutes = require("./routes/dashboard");
const projectDetailRoutes = require("./routes/projectDetail");
const projectControlRoutes = require("./routes/projectControl");
const accountRoutes = require("./routes/account");
const variablesRoutes = require("./routes/variables");
const projectUsersRoutes = require("./routes/projectUsers");
const ingestRoutes = require("./routes/ingest");
const { startPruningJob } = require("./services/pruning");

const app = express();

// nginx TLS'ni tugatib, 127.0.0.1:3000ga oddiy HTTP orqali uzatadi — shuning
// uchun Express'ga proxy'dan kelgan X-Forwarded-Proto'ga ishonishni aytish
// kerak, aks holda COOKIE_SECURE=true bilan session cookie hech qachon
// o'rnatilmaydi (req.secure doim false bo'lib qoladi).
app.set("trust proxy", 1);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "..", "public")));

app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: false }));

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.COOKIE_SECURE === "true",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

app.get("/health", (req, res) => res.json({ ok: true }));

// nginx `auth_request` uchun: stocker.uz/pdf/ (uzumPDFs) shu yerdan
// panel sessiyasini so'raydi, shunda ikkinchi parol kerak bo'lmaydi —
// bitta dastur, bitta kirish. Faqat 200/401 qaytaradi, tana yo'q.
// Redirect QILMAYDI: auth_request faqat status kodga qaraydi.
app.get("/internal/session-check", (req, res) => {
  if (req.session && req.session.isAdmin) return res.sendStatus(200);
  return res.sendStatus(401);
});

// Ingest API authenticates projects via their own API key, not the admin session.
app.use("/api/ingest", ingestRoutes);

app.use(authRoutes);
app.use(requireAuth, dashboardRoutes);
app.use(requireAuth, projectDetailRoutes);
app.use(requireAuth, projectControlRoutes);
app.use(requireAuth, accountRoutes);
app.use(requireAuth, variablesRoutes);
app.use(requireAuth, projectUsersRoutes);

startPruningJob();

const port = process.env.PORT || 3000;
app.listen(port, "127.0.0.1", () => {
  console.log(`fikrlovchi-panel ${port}-portda ishga tushdi`);
});
