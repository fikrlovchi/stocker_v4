// Google Sheets — uzbuyo@gmail.com OAuth2 akkaunti nomidan (uzumOrderToMC va
// uzumPDFs bilan bir xil oauth.json: {client_id, client_secret, refresh_token}).
// Service account ishlatilmaydi.
import fs from "node:fs";
import { google } from "googleapis";
import { env } from "../config.js";

let cached = null;

export function getSheetsClient() {
  if (cached) return cached;

  if (!fs.existsSync(env.oauthFile)) {
    throw new Error(`oauth.json topilmadi: ${env.oauthFile} (uzumPDFs loyihasidan nusxalang)`);
  }

  const creds = JSON.parse(fs.readFileSync(env.oauthFile, "utf8"));
  if (!creds.client_id || !creds.client_secret || !creds.refresh_token) {
    throw new Error("oauth.json to'liq emas: client_id/client_secret/refresh_token kerak");
  }

  const auth = new google.auth.OAuth2(
    creds.client_id,
    creds.client_secret,
    "https://developers.google.com/oauthplayground"
  );
  auth.setCredentials({ refresh_token: creds.refresh_token });

  cached = google.sheets({ version: "v4", auth });
  return cached;
}
