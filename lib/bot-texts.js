// Тексты ботов предзаписи — общие для Telegram и MAX.
// Форматирование — HTML (поддерживают оба мессенджера).
import cfg from "../site.config.js";

const site = (process.env.SITE_URL || cfg.siteUrl).replace(/\/$/, "");
export const links = {
  site,
  dev: `https://t.me/${cfg.developer.telegram}`,
  privacy: `${site}/privacy`,
};

export const buttons = {
  join: "Записаться",
  dev: "Написать разработчику",
  site: "Сайт Валькирии",
};

export const texts = {
  hello: () =>
    `Здравствуйте! Это бот <b>Валькирии</b> — голосового ИИ-диспетчера для охранных служб.\n\n` +
    `Участникам <b>${cfg.forum.name}</b> — особые условия на подключение. Размер скидки объявим в ближайшее время.\n\n` +
    `Нажмите «${buttons.join}», чтобы закрепить условия за собой. Когда откроем подключение, бот пришлёт сообщение.\n\n` +
    `<i>Сохраним только ваш числовой ID в мессенджере — без имени и телефона. Удалить запись: /stop. Подробнее: ${links.privacy}</i>`,

  joined: (n) =>
    `Готово, вы в списке предзаписи под номером <b>${pad(n)}</b>.\n\n` +
    `Условия для участников форума закреплены за вами. Напишем, когда откроем подключение, и сообщим размер скидки.\n\n` +
    `Хотите посмотреть Валю в работе раньше — напишите разработчику.`,

  already: (n) =>
    `Вы уже в списке предзаписи под номером <b>${pad(n)}</b>. Условия форума за вами.\n\nУдалить запись: /stop.`,

  stopped: () => `Удалили вашу запись. Сообщений от бота больше не будет.\n\nПередумаете — /start.`,
  notSubscribed: () => `Вас нет в списке предзаписи. Записаться — /start.`,

  storeDown: () =>
    `Записали вас вручную — разработчик получил уведомление. Если хотите, напишите ему напрямую.`,

  help: () =>
    `Команды:\n/start — записаться\n/status — проверить запись\n/stop — удалить запись\n\nВопросы о Валькирии — разработчику.`,

  adminNew: (platform, n, src) => `Новая предзапись №${pad(n)} · ${platform === "tg" ? "Telegram" : "MAX"}${src ? ` · ${src}` : ""}`,
  adminStoreDown: (platform, id) =>
    `⚠️ Хранилище недоступно. Запись не сохранена в базе — сохраните вручную: ${platform} ID ${id}`,
};

export const pad = (n) => String(n).padStart(3, "0");

// /start <метка> — откуда пришёл человек (qr, site, updates…)
export function cleanSource(s) {
  const v = String(s || "").trim().toLowerCase();
  return /^[a-z0-9_-]{1,32}$/.test(v) ? v : "";
}

export const escapeHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
