const express = require("express");
const telegramCatalog = require("../db/queries/telegramCatalog");
const sheetsCatalog = require("../db/queries/sheetsCatalog");
const apiTokens = require("../db/queries/apiTokens");
const uzumCatalog = require("../db/queries/uzumCatalog");
const variableLinks = require("../db/queries/variableLinks");
const envBindings = require("../db/queries/envBindings");
const envFileEditor = require("../services/envFileEditor");
const uzumApi = require("../services/uzumApi");
const { recordAdminAction } = require("../services/auditLog");
const { ensureCsrfToken, verifyCsrf } = require("../middleware/csrf");

const router = express.Router();

function redirectBack(res, ok, error) {
  const qs = ok ? `ok=${encodeURIComponent(ok)}` : `error=${encodeURIComponent(error)}`;
  res.redirect(`/variables?${qs}`);
}

router.get("/variables", (req, res) => {
  const telegramBots = telegramCatalog.listBots().map((bot) => ({
    ...bot,
    botTokenMasked: envFileEditor.maskSecret(bot.bot_token),
    linkedProjects: envBindings.getProjectsForSource("telegram_bot", bot.id),
  }));

  const telegramChats = telegramCatalog.listChatsWithTopics().map((chat) => ({
    ...chat,
    linkedProjects: envBindings.getProjectsForSource("telegram_chat", chat.id),
    topics: chat.topics.map((topic) => ({
      ...topic,
      linkedProjects: envBindings.getProjectsForSource("telegram_topic", topic.id),
    })),
  }));

  const sheets = sheetsCatalog.listAllForCatalog().map((sheet) => ({
    ...sheet,
    linkedProjects: variableLinks.getProjectsLinkedToSheet(sheet.id),
    lists: sheet.lists.map((list) => ({
      ...list,
      linkedProjects: variableLinks.getProjectsLinkedToList(list.id),
    })),
  }));

  const tokens = apiTokens.list().map((token) => ({
    ...token,
    tokenMasked: envFileEditor.maskSecret(token.token),
    linkedProjects: envBindings.getProjectsForSource("api_token", token.id),
  }));

  const uzumCabinets = uzumCatalog.listCabinetsWithShops().map((cabinet) => ({
    ...cabinet,
    tokenMasked: envFileEditor.maskSecret(cabinet.token),
    linkedProjects: envBindings.getProjectsForSource("uzum_cabinet", cabinet.id),
    shops: cabinet.shops.map((shop) => ({
      ...shop,
      linkedProjects: envBindings.getProjectsForSource("uzum_shop", shop.id),
    })),
  }));

  res.render("variables", {
    telegramBots,
    telegramChats,
    sheets,
    tokens,
    uzumCabinets,
    csrfToken: ensureCsrfToken(req),
    actionMessage: req.query.ok,
    errorMessage: req.query.error,
  });
});

router.post("/variables/telegram/bots", verifyCsrf, (req, res) => {
  const name = (req.body.name || "").trim();
  const botToken = (req.body.botToken || "").trim();
  if (!name || !botToken) return redirectBack(res, null, "Nom va bot token to'ldirilishi shart");
  telegramCatalog.createBot(name, botToken);
  recordAdminAction("variable_create", "telegram_bot", name);
  redirectBack(res, "Bot qo'shildi");
});

router.post("/variables/telegram/bots/:id/delete", verifyCsrf, (req, res) => {
  telegramCatalog.deleteBot(req.params.id);
  recordAdminAction("variable_delete", "telegram_bot", req.params.id);
  redirectBack(res, "Bot o'chirildi");
});

router.post("/variables/telegram/chats", verifyCsrf, (req, res) => {
  const { botId, name, chatId } = req.body;
  if (!botId || !name || !chatId) return redirectBack(res, null, "Barcha maydonlar to'ldirilishi shart");
  telegramCatalog.createChat(botId, name.trim(), chatId.trim());
  recordAdminAction("variable_create", "telegram_chat", name);
  redirectBack(res, "Chat qo'shildi");
});

router.post("/variables/telegram/chats/:id/delete", verifyCsrf, (req, res) => {
  telegramCatalog.deleteChat(req.params.id);
  recordAdminAction("variable_delete", "telegram_chat", req.params.id);
  redirectBack(res, "Chat o'chirildi");
});

router.post("/variables/telegram/topics", verifyCsrf, (req, res) => {
  const { chatId, name, topicId } = req.body;
  if (!chatId || !name || !topicId) return redirectBack(res, null, "Barcha maydonlar to'ldirilishi shart");
  telegramCatalog.createTopic(chatId, name.trim(), topicId.trim());
  recordAdminAction("variable_create", "telegram_topic", name);
  redirectBack(res, "Topic qo'shildi");
});

router.post("/variables/telegram/topics/:id/delete", verifyCsrf, (req, res) => {
  telegramCatalog.deleteTopic(req.params.id);
  recordAdminAction("variable_delete", "telegram_topic", req.params.id);
  redirectBack(res, "Topic o'chirildi");
});

router.post("/variables/sheets", verifyCsrf, (req, res) => {
  const name = (req.body.name || "").trim();
  const sheetId = (req.body.sheetId || "").trim();
  if (!name || !sheetId) return redirectBack(res, null, "Nom va Sheet ID to'ldirilishi shart");
  sheetsCatalog.createSheet(name, sheetId);
  recordAdminAction("variable_create", "google_sheet", name);
  redirectBack(res, "Sheet qo'shildi");
});

router.post("/variables/sheets/:id/delete", verifyCsrf, (req, res) => {
  sheetsCatalog.deleteSheet(req.params.id);
  recordAdminAction("variable_delete", "google_sheet", req.params.id);
  redirectBack(res, "Sheet o'chirildi");
});

router.post("/variables/sheets/lists", verifyCsrf, (req, res) => {
  const { sheetId, name } = req.body;
  if (!sheetId || !name) return redirectBack(res, null, "Barcha maydonlar to'ldirilishi shart");
  sheetsCatalog.createList(sheetId, name.trim());
  recordAdminAction("variable_create", "sheet_list", name);
  redirectBack(res, "List qo'shildi");
});

router.post("/variables/sheets/lists/:id/delete", verifyCsrf, (req, res) => {
  sheetsCatalog.deleteList(req.params.id);
  recordAdminAction("variable_delete", "sheet_list", req.params.id);
  redirectBack(res, "List o'chirildi");
});

router.post("/variables/tokens", verifyCsrf, (req, res) => {
  const name = (req.body.name || "").trim();
  const token = (req.body.token || "").trim();
  if (!name || !token) return redirectBack(res, null, "Nom va token to'ldirilishi shart");
  apiTokens.create(name, token);
  recordAdminAction("variable_create", "api_token", name);
  redirectBack(res, "Token qo'shildi");
});

router.post("/variables/tokens/:id/delete", verifyCsrf, (req, res) => {
  apiTokens.deleteToken(req.params.id);
  recordAdminAction("variable_delete", "api_token", req.params.id);
  redirectBack(res, "Token o'chirildi");
});

async function syncShopsFromUzum(cabinetId, token) {
  const shops = await uzumApi.fetchShops(token);
  for (const shop of shops) {
    uzumCatalog.upsertShop(cabinetId, shop.name, shop.shopId);
  }
  return shops.length;
}

router.post("/variables/uzum/cabinets", verifyCsrf, async (req, res) => {
  const name = (req.body.name || "").trim();
  const token = (req.body.token || "").trim();
  if (!name || !token) return redirectBack(res, null, "Nom va token to'ldirilishi shart");

  const cabinetId = uzumCatalog.createCabinet(name, token);
  recordAdminAction("variable_create", "uzum_cabinet", name);

  try {
    const count = await syncShopsFromUzum(cabinetId, token);
    recordAdminAction("uzum_shops_sync", name, `${count} ta do'kon`);
    redirectBack(res, `Kabinet qo'shildi, Uzum'dan ${count} ta do'kon olindi`);
  } catch (e) {
    redirectBack(res, null, `Kabinet qo'shildi, lekin do'konlarni olishda xato: ${e.message}`);
  }
});

router.post("/variables/uzum/cabinets/:id/delete", verifyCsrf, (req, res) => {
  uzumCatalog.deleteCabinet(req.params.id);
  recordAdminAction("variable_delete", "uzum_cabinet", req.params.id);
  redirectBack(res, "Kabinet o'chirildi");
});

router.post("/variables/uzum/cabinets/:id/sync-shops", verifyCsrf, async (req, res) => {
  const cabinet = uzumCatalog.getCabinet(req.params.id);
  if (!cabinet) return redirectBack(res, null, "Kabinet topilmadi");

  try {
    const count = await syncShopsFromUzum(cabinet.id, cabinet.token);
    recordAdminAction("uzum_shops_sync", cabinet.name, `${count} ta do'kon`);
    redirectBack(res, `Uzum'dan ${count} ta do'kon yangilandi`);
  } catch (e) {
    redirectBack(res, null, `Do'konlarni olishda xato: ${e.message}`);
  }
});

router.post("/variables/uzum/shops", verifyCsrf, (req, res) => {
  const { cabinetId, name, shopId } = req.body;
  if (!cabinetId || !name || !shopId) return redirectBack(res, null, "Barcha maydonlar to'ldirilishi shart");
  uzumCatalog.createShop(cabinetId, name.trim(), shopId.trim());
  recordAdminAction("variable_create", "uzum_shop", name);
  redirectBack(res, "Do'kon qo'shildi");
});

router.post("/variables/uzum/shops/:id/delete", verifyCsrf, (req, res) => {
  uzumCatalog.deleteShop(req.params.id);
  recordAdminAction("variable_delete", "uzum_shop", req.params.id);
  redirectBack(res, "Do'kon o'chirildi");
});

module.exports = router;
