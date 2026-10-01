// Тексты ботов предзаписи — общие для Telegram и MAX.
// Форматирование — HTML (поддерживают оба мессенджера).
import cfg from "../site.config.js";
import { QUESTIONS, answerLabel } from "./questions.js";

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

const SRC = { qr: "QR форума", card: "визитка", site: "сайт", start: "бот", updates: "обновления" };
const PF = { tg: "Telegram", max: "MAX" };

function answersBlock(sub) {
  return QUESTIONS.map((q) => {
    const v = sub.answers?.[q.id];
    return `${q.title}: ${v ? escapeHtml(answerLabel(q.id, v)) : "—"}`;
  }).join("\n");
}

export const texts = {
  hello: () =>
    `Здравствуйте! Это бот <b>Валькирии</b> — голосового ИИ-диспетчера для охранных служб.\n\n` +
    `Участникам <b>${cfg.forum.name}</b> — особые условия на подключение. Размер скидки объявим в ближайшее время.\n\n` +
    `Нажмите «${buttons.join}»: укажете название организации и ответите на 5 вопросов кнопками — это 30 секунд. Так мы подготовим условия под вас.\n\n` +
    `<i>Имя и телефон не спрашиваем. Удалить запись: /stop. Подробнее: ${links.privacy}</i>`,

  askCompany: () => `Как называется ваша организация?\n\n<i>Напишите название одним сообщением.</i>`,
  companyInvalid: () => `Напишите, пожалуйста, название организации — от 2 до 120 символов.`,

  joined: (n) => `Записали: вы <b>№${pad(n)}</b> в списке предзаписи, условия форума закреплены за вами.\n\nЕщё 5 коротких вопросов — по кнопкам.`,

  question: (i, total, text) => `<b>${i}/${total}.</b> ${text}`,

  finished: (n) =>
    `Спасибо! Вы <b>№${pad(n)}</b> в списке предзаписи.\n\n` +
    `Напишем, когда откроем подключение, и сообщим размер скидки. Хотите посмотреть Валю в работе раньше — напишите разработчику.`,

  lateSaved: (n) =>
    `Записали вас в список предзаписи: <b>№${pad(n)}</b>. Оповестим, когда откроем подключение, и сообщим размер скидки.\n\n` +
    `Чтобы мы подготовили условия под вас, напишите название организации — и ответьте на 5 вопросов кнопками.`,

  already: (n) => `Вы уже в списке предзаписи: <b>№${pad(n)}</b>. Условия форума за вами.`,

  status: (sub) =>
    `Вы <b>№${pad(sub.n)}</b> в списке предзаписи.\n` +
    `Организация: ${sub.company ? escapeHtml(sub.company) : "—"}\n${answersBlock(sub)}\n\nУдалить запись: /stop.`,

  stopped: () => `Удалили вашу запись. Сообщений от бота больше не будет.\n\nПередумаете — /start.`,
  notSubscribed: () => `Вас нет в списке предзаписи. Записаться — /start.`,

  storeDown: () => `Не получилось сохранить запись — разработчик получил уведомление. Напишите ему напрямую, пожалуйста.`,

  help: () =>
    `Команды:\n/start — записаться\n/status — моя запись\n/stop — удалить запись\n\nВопросы о Валькирии — разработчику.`,

  adminNew: (platform, sub) =>
    `🆕 Предзапись №${pad(sub.n)} · ${escapeHtml(sub.company || "—")}\n${PF[platform]} · ${SRC[sub.src] || sub.src || "—"} · отвечает на вопросы…`,

  adminCard: (platform, sub) =>
    `✅ Анкета №${pad(sub.n)} · <b>${escapeHtml(sub.company || "—")}</b>\n${answersBlock(sub)}\n${PF[platform]} · ${SRC[sub.src] || sub.src || "—"}`,

  adminLate: (platform, sub) =>
    `⏳ Предзапись №${pad(sub.n)} · без названия организации\n${PF[platform]} · ${SRC[sub.src] || sub.src || "—"} · нажал «Записаться», на вопросы не ответил`,

  adminStoreDown: (platform, id) =>
    `⚠️ Хранилище недоступно. Запись не сохранена — сохраните вручную: ${platform} ID ${id}`,
};

export const pad = (n) => String(n).padStart(3, "0");

// /start <метка> — откуда пришёл человек (qr, site, updates…)
export function cleanSource(s) {
  const v = String(s || "").trim().toLowerCase();
  return /^[a-z0-9_-]{1,32}$/.test(v) ? v : "";
}

export const escapeHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
