// Вебхук бота предзаписи в MAX. Сценарий общий с Telegram (lib/flow.js).
// Включается после верификации на платформе «MAX для партнёров» и модерации бота.
// Переменные окружения:
//   MAX_BOT_TOKEN       — токен бота
//   MAX_WEBHOOK_SECRET  — секрет, переданный при подписке (/api/setup)
//   MAX_API_BASE        — по умолчанию https://platform-api2.max.ru
// Уведомления о новых записях уходят админам в Telegram (TELEGRAM_BOT_TOKEN + ADMIN_TG_IDS).
// Не проверено на живом боте: перед запуском пройти /start → «Записаться» → анкета → /stop.
import { firstTime } from "../lib/store.js";
import { onStart, onButton, onText, onStop, onStatus } from "../lib/flow.js";

const TOKEN = process.env.MAX_BOT_TOKEN;
const SECRET = process.env.MAX_WEBHOOK_SECRET;
const API = (process.env.MAX_API_BASE || "https://platform-api2.max.ru").replace(/\/$/, "");
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMINS = (process.env.ADMIN_TG_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);

async function max(method, path, params, body) {
  const qs = new URLSearchParams(params).toString();
  const r = await fetch(`${API}${path}${qs ? `?${qs}` : ""}`, {
    method,
    headers: { Authorization: TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) console.error(`max ${method} ${path}:`, r.status, data);
  return data;
}

const keyboard = (rows) => ({
  type: "inline_keyboard",
  payload: {
    buttons: rows.map((row) => row.map((b) => (b.url ? { type: "link", text: b.text, url: b.url } : { type: "callback", text: b.text, payload: b.data }))),
  },
});

const send = (userId, text, rows) =>
  max("POST", "/messages", { user_id: userId }, { text, format: "html", ...(rows?.length && { attachments: [keyboard(rows)] }) });

async function notifyAdmins(text) {
  if (!TG_TOKEN) return;
  await Promise.all(ADMINS.map((chat_id) =>
    fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id, text, parse_mode: "HTML" }),
    })));
}

function io(userId, mid) {
  return {
    platform: "max",
    send: (text, rows) => send(userId, text, rows),
    notifyAdmins,
    // Нажали кнопку — заменяем вопрос на «✓ ответ» без кнопок.
    answered: mid ? (text) => max("PUT", "/messages", { message_id: mid }, { text, format: "html", attachments: [] }) : null,
  };
}

async function onUpdate(u) {
  switch (u.update_type) {
    case "bot_started":
      return onStart(io(u.user?.user_id), u.user?.user_id, u.payload);

    case "message_created": {
      const m = u.message;
      if (m?.recipient?.chat_type && m.recipient.chat_type !== "dialog") return;
      const userId = m?.sender?.user_id;
      const text = (m?.body?.text || "").trim();
      if (!userId || !text) return;
      const x = io(userId);
      if (text.startsWith("/start")) return onStart(x, userId, text.split(/\s+/)[1]);
      if (text === "/stop") return onStop(x, userId);
      if (text === "/status") return onStatus(x, userId);
      return onText(x, userId, text);
    }

    case "message_callback": {
      const cb = u.callback;
      const userId = cb?.user?.user_id;
      if (!userId || !cb.payload) return;
      await max("POST", "/answers", { callback_id: cb.callback_id }, { notification: "Принято" });
      return onButton(io(userId, u.message?.body?.mid), userId, cb.payload);
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("Валькирия: MAX webhook");
  if (!TOKEN) return res.status(500).send("MAX_BOT_TOKEN не задан");
  if (SECRET && req.headers["x-max-bot-api-secret"] !== SECRET) return res.status(401).send("bad secret");

  const update = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  try {
    const key = `max:${update.update_type}:${update.timestamp}:${update.user?.user_id || update.message?.body?.mid || update.callback?.callback_id || ""}`;
    if (await firstTime(key)) await onUpdate(update);
  } catch (e) {
    console.error(e);
  }
  res.status(200).json({ ok: true });
}
