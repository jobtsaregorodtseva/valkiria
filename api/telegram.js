// Вебхук Telegram-бота предзаписи.
// Переменные окружения (Vercel → Settings → Environment Variables):
//   TELEGRAM_BOT_TOKEN       — токен от @BotFather
//   TELEGRAM_WEBHOOK_SECRET  — любая длинная случайная строка (её же проверяет /api/setup)
//   ADMIN_TG_IDS             — ID админов через запятую (уведомления, /stats, /export, /broadcast)
//   KV_REST_API_URL, KV_REST_API_TOKEN — Upstash Redis (подключается в Vercel → Storage)
import { listSubs, removeSub, firstTime } from "../lib/store.js";
import { texts, escapeHtml, pad } from "../lib/bot-texts.js";
import { QUESTIONS, answerLabel } from "../lib/questions.js";
import { onStart, onButton, onText, onStop, onStatus, sweepPending } from "../lib/flow.js";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const ADMINS = (process.env.ADMIN_TG_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);

async function tg(method, payload) {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({ ok: false }));
  if (!data.ok) console.error(`telegram ${method}:`, data.description || r.status);
  return data;
}

// Ряды кнопок сценария → inline_keyboard Telegram.
const markup = (rows) =>
  rows && rows.length
    ? { inline_keyboard: rows.map((row) => row.map((b) => (b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.data }))) }
    : undefined;

const send = (chat_id, text, rows) =>
  tg("sendMessage", { chat_id, text, parse_mode: "HTML", disable_web_page_preview: true, ...(rows && { reply_markup: markup(rows) }) });

const notifyAdmins = (text) => Promise.all(ADMINS.map((id) => send(id, text)));

function io(chatId, message) {
  return {
    platform: "tg",
    send: (text, rows) => send(chatId, text, rows),
    notifyAdmins,
    // Нажали кнопку — вопрос превращается в «✓ ответ», кнопки исчезают.
    answered: message
      ? (text) => tg("editMessageText", { chat_id: chatId, message_id: message.message_id, text, parse_mode: "HTML" })
      : null,
  };
}

// ---------- команды админов ----------

const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

async function exportCsv(chatId) {
  const rows = [...(await listSubs("tg")).map((s) => ({ ...s, pf: "Telegram" })), ...(await listSubs("max")).map((s) => ({ ...s, pf: "MAX" }))]
    .sort((a, b) => a.n - b.n);
  const head = ["№", "Дата", "Организация", ...QUESTIONS.map((q) => q.title), "Анкета", "Мессенджер", "Источник"];
  const lines = rows.map((s) => [
    pad(s.n),
    new Date(s.at).toLocaleString("ru-RU", { timeZone: "Asia/Novosibirsk" }),
    s.company || "",
    ...QUESTIONS.map((q) => answerLabel(q.id, s.answers?.[q.id])),
    s.done ? "заполнена" : s.company ? "не до конца" : "только запись",
    s.pf,
    s.src || "",
  ].map(csvCell).join(";"));
  // BOM и «;» — чтобы Excel открыл кириллицу и колонки без настройки.
  const csv = "﻿" + [head.map(csvCell).join(";"), ...lines].join("\r\n");
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("caption", `Предзапись: ${rows.length}`);
  form.append("document", new Blob([csv], { type: "text/csv" }), `valkiria-predzapis-${new Date().toISOString().slice(0, 10)}.csv`);
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendDocument`, { method: "POST", body: form });
  if (!r.ok) console.error("telegram sendDocument:", r.status, await r.text());
}

async function stats(chatId) {
  const [t, m] = await Promise.all([listSubs("tg"), listSubs("max")]);
  const all = [...t, ...m];
  const done = all.filter((s) => s.done).length;
  const bare = all.filter((s) => !s.company).length;
  const hot = all.filter((s) => s.answers?.when === "now").length;
  return send(chatId, `Предзапись: <b>${all.length}</b> (Telegram ${t.length}, MAX ${m.length})\nАнкету заполнили: ${done}\nТолько нажали «Записаться»: ${bare}\nГотовы к пилоту сейчас: ${hot}\n\nТаблица: /export`);
}

async function broadcast(fromId, text) {
  const subs = await listSubs("tg");
  let ok = 0, gone = 0, fail = 0;
  for (const { id } of subs) {
    const r = await tg("sendMessage", { chat_id: id, text, parse_mode: "HTML", disable_web_page_preview: true });
    if (r.ok) ok++;
    else if (r.error_code === 403) { gone++; await removeSub("tg", id); } // бот заблокирован
    else fail++;
    await new Promise((res) => setTimeout(res, 40)); // не больше ~25 сообщений в секунду
  }
  await send(fromId, `Рассылка: доставлено ${ok}, заблокировали бота ${gone} (удалены), ошибок ${fail}.`);
}

// ---------- обработка ----------

async function onMessage(msg) {
  const chatId = msg.chat?.id;
  if (!chatId || msg.chat.type !== "private") return;
  const text = (msg.text || "").trim();
  const isAdmin = ADMINS.includes(String(msg.from?.id));
  const x = io(chatId);

  if (text.startsWith("/start")) return onStart(x, chatId, text.split(/\s+/)[1]);
  if (text === "/stop") return onStop(x, chatId);
  if (text === "/status") return onStatus(x, chatId);
  if (text === "/myid") return send(chatId, `Ваш ID: ${escapeHtml(chatId)}`);
  if (isAdmin && text === "/stats") return stats(chatId);
  if (isAdmin && text === "/export") return exportCsv(chatId);
  if (isAdmin && text.startsWith("/broadcast")) {
    const body = text.replace(/^\/broadcast(@\w+)?\s*/, "");
    if (!body) return send(chatId, "Формат: /broadcast текст сообщения (HTML: &lt;b&gt;, &lt;i&gt;, ссылки).");
    return broadcast(chatId, body);
  }
  if (!text) return;
  return onText(x, chatId, text);
}

async function onCallback(cb) {
  const chatId = cb.message?.chat?.id || cb.from?.id;
  await tg("answerCallbackQuery", { callback_query_id: cb.id });
  if (!cb.data) return;
  const x = io(chatId, cb.message);
  // У приветствия убираем кнопку «Записаться», ссылки оставляем.
  if (cb.data.startsWith("join") && cb.message) {
    const rows = (cb.message.reply_markup?.inline_keyboard || []).filter((row) => !row.some((b) => b.callback_data));
    await tg("editMessageReplyMarkup", { chat_id: chatId, message_id: cb.message.message_id, reply_markup: { inline_keyboard: rows } });
  }
  return onButton(x, chatId, cb.data);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("Валькирия: Telegram webhook");
  if (!TOKEN) return res.status(500).send("TELEGRAM_BOT_TOKEN не задан");
  if (SECRET && req.headers["x-telegram-bot-api-secret-token"] !== SECRET) return res.status(401).send("bad secret");

  const update = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const chatId = update.message?.chat?.id || update.callback_query?.from?.id;
  try {
    // Telegram повторяет обновление, если ответ задержался (например, долгая рассылка) — обрабатываем один раз.
    if (update.update_id && !(await firstTime(`tg:${update.update_id}`))) return res.status(200).json({ ok: true });
    if (update.message) await onMessage(update.message);
    else if (update.callback_query) await onCallback(update.callback_query);
    await sweepPending("tg", (id) => io(id));
  } catch (e) {
    console.error(e);
    // Хранилище или Telegram недоступны — не теряем человека: ID уходит админам.
    if (chatId && !ADMINS.includes(String(chatId))) {
      await notifyAdmins(texts.adminStoreDown("tg", chatId)).catch(() => {});
      await send(chatId, texts.storeDown()).catch(() => {});
    }
  }
  // Всегда 200, иначе Telegram будет повторять одно и то же обновление.
  res.status(200).json({ ok: true });
}
