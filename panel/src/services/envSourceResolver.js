const telegramCatalog = require("../db/queries/telegramCatalog");
const apiTokens = require("../db/queries/apiTokens");
const uzumCatalog = require("../db/queries/uzumCatalog");

const SOURCES = {
  telegram_bot: {
    label: "Telegram bot",
    get: (id) => telegramCatalog.getBot(id),
    value: (row) => row.bot_token,
    name: (row) => row.name,
  },
  telegram_chat: {
    label: "Telegram chat",
    get: (id) => telegramCatalog.getChat(id),
    value: (row) => row.chat_id,
    name: (row) => row.name,
  },
  telegram_topic: {
    label: "Telegram topic",
    get: (id) => telegramCatalog.getTopic(id),
    value: (row) => row.topic_id,
    name: (row) => row.name,
  },
  api_token: {
    label: "Token",
    get: (id) => apiTokens.get(id),
    value: (row) => row.token,
    name: (row) => row.name,
  },
  uzum_cabinet: {
    label: "Uzum kabinet",
    get: (id) => uzumCatalog.getCabinet(id),
    value: (row) => row.token,
    name: (row) => row.name,
  },
  uzum_shop: {
    label: "Uzum do'kon",
    get: (id) => uzumCatalog.getShop(id),
    value: (row) => row.shop_id,
    name: (row) => row.name,
  },
};

function resolveValue(sourceType, sourceId) {
  const source = SOURCES[sourceType];
  if (!source) return null;
  const row = source.get(sourceId);
  return row ? source.value(row) : null;
}

function sourceLabel(sourceType, sourceId) {
  const source = SOURCES[sourceType];
  if (!source) return `${sourceType}#${sourceId}`;
  const row = source.get(sourceId);
  return row ? `${source.label}: ${source.name(row)}` : `${source.label}: (o'chirilgan)`;
}

module.exports = { SOURCES, resolveValue, sourceLabel };
