// Вебхук Telegram-бота предзаписи.
// Переменные окружения (Vercel → Settings → Environment Variables):
//   TELEGRAM_BOT_TOKEN       — токен от @BotFather
//   TELEGRAM_WEBHOOK_SECRET  — любая длинная случайная строка (её же передаёт scripts/set-telegram-webhook.mjs)
//   ADMIN_TG_IDS             — ID админов через запятую (уведомления о записях, /stats, /broadcast)
//   KV_REST_API_URL, KV_REST_API_TOKEN — Upstash Redis (подключается в Vercel → Storage)
import { addSub, getSub, removeSub, countSubs, listSubIds, storeReady, firstTime } from "../lib/store.js";
import { texts, buttons, links, cleanSource, escapeHtml } from "../lib/bot-texts.js";

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

const send = (chat_id, text, reply_markup) =>
  tg("sendMessage", { chat_id, text, parse_mode: "HTML", disable_web_page_preview: true, ...(reply_markup && { reply_markup }) });

const keyboard = (withJoin) => ({
  inline_keyboard: [
    ...(withJoin ? [[{ text: `✅ ${buttons.join}`, callback_data: "join" }]] : []),
    [{ text: buttons.dev, url: links.dev }],
    [{ text: buttons.site, url: links.site }],
  ],
});

async function notifyAdmins(text) {
  await Promise.all(ADMINS.map((id) => send(id, text)));
}

async function join(chatId, source) {
  try {
    const { sub, isNew } = await addSub("tg", chatId, source);
    await send(chatId, isNew ? texts.joined(sub.n) : texts.already(sub.n), keyboard(false));
    if (isNew) await notifyAdmins(texts.adminNew("tg", sub.n, sub.src));
  } catch (e) {
    console.error(e);
    // Хранилище недоступно — не теряем человека: ID уходит админам.
    await notifyAdmins(texts.adminStoreDown("tg", chatId));
    await send(chatId, texts.storeDown(), keyboard(false));
  }
}

async function broadcast(fromId, text) {
  const ids = await listSubIds("tg");
  let ok = 0, gone = 0, fail = 0;
  for (const id of ids) {
    const r = await tg("sendMessage", { chat_id: id, text, parse_mode: "HTML", disable_web_page_preview: true });
    if (r.ok) ok++;
    else if (r.error_code === 403) { gone++; await removeSub("tg", id); } // бот заблокирован
    else fail++;
    await new Promise((res) => setTimeout(res, 40)); // не больше ~25 сообщений в секунду
  }
  await send(fromId, `Рассылка: доставлено ${ok}, заблокировали бота ${gone} (удалены), ошибок ${fail}.`);
}

async function onMessage(msg) {
  const chatId = msg.chat?.id;
  if (!chatId || msg.chat.type !== "private") return;
  const text = (msg.text || "").trim();
  const isAdmin = ADMINS.includes(String(msg.from?.id));

  if (text.startsWith("/start")) {
    const source = cleanSource(text.split(/\s+/)[1]);
    const existing = storeReady ? await getSub("tg", chatId).catch(() => null) : null;
    if (existing) return send(chatId, texts.already(existing.n), keyboard(false));
    // Пришёл с QR форума — запоминаем источник в кнопке, чтобы записать его при нажатии.
    const kb = keyboard(true);
    if (source) kb.inline_keyboard[0][0].callback_data = `join:${source}`;
    return send(chatId, texts.hello(), kb);
  }
  if (text === "/stop") {
    const removed = await removeSub("tg", chatId).catch(() => false);
    return send(chatId, removed ? texts.stopped() : texts.notSubscribed());
  }
  if (text === "/status") {
    const sub = await getSub("tg", chatId).catch(() => null);
    return send(chatId, sub ? texts.already(sub.n) : texts.notSubscribed());
  }
  if (isAdmin && text === "/stats") {
    const [t, m] = await Promise.all([countSubs("tg"), countSubs("max")]);
    return send(chatId, `Предзапись: Telegram — ${t}, MAX — ${m}.`);
  }
  if (isAdmin && text.startsWith("/broadcast")) {
    const body = text.replace(/^\/broadcast(@\w+)?\s*/, "");
    if (!body) return send(chatId, "Формат: /broadcast текст сообщения (HTML: &lt;b&gt;, &lt;i&gt;, ссылки).");
    return broadcast(chatId, body);
  }
  if (text === "/myid") return send(chatId, `Ваш ID: ${escapeHtml(chatId)}`);
  return send(chatId, texts.help(), keyboard(false));
}

async function onCallback(cb) {
  const chatId = cb.message?.chat?.id || cb.from?.id;
  await tg("answerCallbackQuery", { callback_query_id: cb.id });
  if (cb.data === "join" || cb.data?.startsWith("join:")) {
    // Убираем кнопку из приветствия, чтобы не нажимали повторно.
    if (cb.message) {
      await tg("editMessageReplyMarkup", { chat_id: chatId, message_id: cb.message.message_id, reply_markup: keyboard(false) });
    }
    return join(chatId, cleanSource(cb.data.split(":")[1]) || "start");
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("Валькирия: Telegram webhook");
  if (!TOKEN) return res.status(500).send("TELEGRAM_BOT_TOKEN не задан");
  if (SECRET && req.headers["x-telegram-bot-api-secret-token"] !== SECRET) return res.status(401).send("bad secret");

  const update = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  try {
    // Telegram повторяет обновление, если ответ задержался (например, долгая рассылка) — обрабатываем один раз.
    if (update.update_id && !(await firstTime(`tg:${update.update_id}`))) return res.status(200).json({ ok: true });
    if (update.message) await onMessage(update.message);
    else if (update.callback_query) await onCallback(update.callback_query);
  } catch (e) {
    console.error(e);
  }
  // Всегда 200, иначе Telegram будет повторять одно и то же обновление.
  res.status(200).json({ ok: true });
}
