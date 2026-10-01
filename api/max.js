// Вебхук бота предзаписи в MAX. Логика та же, что у Telegram-бота.
// Включается после верификации на платформе «MAX для партнёров» и модерации бота.
// Переменные окружения:
//   MAX_BOT_TOKEN       — токен бота
//   MAX_WEBHOOK_SECRET  — секрет, переданный при подписке (scripts/set-max-webhook.mjs)
//   MAX_API_BASE        — по умолчанию https://platform-api2.max.ru
// Уведомления о новых записях уходят админам в Telegram (TELEGRAM_BOT_TOKEN + ADMIN_TG_IDS).
// Не проверено на живом боте: перед запуском прогнать /start, запись и /stop.
import { addSub, getSub, removeSub, firstTime } from "../lib/store.js";
import { texts, buttons, links, cleanSource } from "../lib/bot-texts.js";

const TOKEN = process.env.MAX_BOT_TOKEN;
const SECRET = process.env.MAX_WEBHOOK_SECRET;
const API = (process.env.MAX_API_BASE || "https://platform-api2.max.ru").replace(/\/$/, "");
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMINS = (process.env.ADMIN_TG_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);

async function max(path, params, body) {
  const qs = new URLSearchParams(params).toString();
  const r = await fetch(`${API}${path}${qs ? `?${qs}` : ""}`, {
    method: "POST",
    headers: { Authorization: TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) console.error(`max ${path}:`, r.status, data);
  return data;
}

const keyboard = (joinPayload) => ({
  type: "inline_keyboard",
  payload: {
    buttons: [
      ...(joinPayload ? [[{ type: "callback", text: `✅ ${buttons.join}`, payload: joinPayload }]] : []),
      [{ type: "link", text: buttons.dev, url: links.dev }],
      [{ type: "link", text: buttons.site, url: links.site }],
    ],
  },
});

const send = (userId, text, joinPayload) =>
  max("/messages", { user_id: userId }, { text, format: "html", attachments: [keyboard(joinPayload)] });

async function notifyAdmins(text) {
  if (!TG_TOKEN) return;
  await Promise.all(ADMINS.map((chat_id) =>
    fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id, text }),
    })));
}

async function hello(userId, source) {
  const existing = await getSub("max", userId).catch(() => null);
  if (existing) return send(userId, texts.already(existing.n));
  return send(userId, texts.hello(), source ? `join:${source}` : "join");
}

async function join(userId, source) {
  try {
    const { sub, isNew } = await addSub("max", userId, source);
    await send(userId, isNew ? texts.joined(sub.n) : texts.already(sub.n));
    if (isNew) await notifyAdmins(texts.adminNew("max", sub.n, sub.src));
  } catch (e) {
    console.error(e);
    await notifyAdmins(texts.adminStoreDown("max", userId));
    await send(userId, texts.storeDown());
  }
}

async function onUpdate(u) {
  switch (u.update_type) {
    case "bot_started":
      return hello(u.user?.user_id, cleanSource(u.payload));

    case "message_created": {
      const m = u.message;
      if (m?.recipient?.chat_type && m.recipient.chat_type !== "dialog") return;
      const userId = m?.sender?.user_id;
      const text = (m?.body?.text || "").trim();
      if (!userId) return;
      if (text.startsWith("/start")) return hello(userId, cleanSource(text.split(/\s+/)[1]));
      if (text === "/stop") {
        const removed = await removeSub("max", userId).catch(() => false);
        return send(userId, removed ? texts.stopped() : texts.notSubscribed());
      }
      if (text === "/status") {
        const sub = await getSub("max", userId).catch(() => null);
        return send(userId, sub ? texts.already(sub.n) : texts.notSubscribed());
      }
      return send(userId, texts.help());
    }

    case "message_callback": {
      const cb = u.callback;
      const userId = cb?.user?.user_id;
      if (!userId) return;
      await max("/answers", { callback_id: cb.callback_id }, { notification: "Записываем…" });
      if (cb.payload === "join" || cb.payload?.startsWith("join:")) {
        return join(userId, cleanSource(cb.payload.split(":")[1]) || "start");
      }
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
