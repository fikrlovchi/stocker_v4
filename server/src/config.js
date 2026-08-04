// config.json (git'da bor) + .env (git'da yo'q) — ikkalasi shu yerdan tarqaladi.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(here, "..");

dotenv.config({ path: path.join(ROOT, ".env") });

export const config = JSON.parse(fs.readFileSync(path.join(ROOT, "config.json"), "utf8"));

export const env = {
  moyskladToken: process.env.MOYSKLAD_TOKEN || "",
  oauthFile: process.env.OAUTH_FILE || path.join(ROOT, "oauth.json"),
  dbFile: process.env.DB_FILE || path.join(ROOT, "data", "stocker.db"),
  serviceToken: process.env.SERVICE_TOKEN || "",
  host: process.env.HOST || config.server.host,
  port: Number(process.env.PORT) || config.server.port,
  panel: {
    ingestUrl: process.env.PANEL_INGEST_URL || "",
    slug: process.env.PANEL_PROJECT_SLUG || "",
    apiKey: process.env.PANEL_API_KEY || "",
    // Odatda PANEL_INGEST_URL'dan hosil qilinadi (.../runs → .../project-users),
    // faqat panel boshqa manzilda bo'lsa qo'lda beriladi.
    usersUrl: process.env.PANEL_USERS_URL || "",
  },
};
