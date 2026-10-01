// Разовая настройка ботов: открыть в браузере
//   https://<адрес-сайта>/api/setup?key=<TELEGRAM_WEBHOOK_SECRET>
// Привязывает вебхуки к этому адресу, задаёт команды и описание бота. Повторный запуск безопасен.
const TG = process.env.TELEGRAM_BOT_TOKEN;
const TG_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const MAX = process.env.MAX_BOT_TOKEN;
const MAX_SECRET = process.env.MAX_WEBHOOK_SECRET;
const MAX_API = (process.env.MAX_API_BASE || "https://platform-api2.max.ru").replace(/\/$/, "");

async function tg(method, payload) {
  const r = await fetch(`https://api.telegram.org/bot${TG}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const d = await r.json().catch(() => ({}));
  return `${method}: ${d.ok ? "ok" : `ошибка — ${d.description || r.status}`}`;
}

export default async function handler(req, res) {
  const key = new URL(req.url, "http://x").searchParams.get("key");
  if (!TG_SECRET || key !== TG_SECRET) return res.status(401).send("Нужен ?key=<TELEGRAM_WEBHOOK_SECRET>");

  const base = `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
  const out = [`Адрес: ${base}`];

  if (TG) {
    out.push(await tg("setWebhook", {
      url: `${base}/api/telegram`,
      secret_token: TG_SECRET,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: true,
    }));
    out.push(await tg("setMyCommands", {
      commands: [
        { command: "start", description: "Записаться на особые условия" },
        { command: "status", description: "Моя запись" },
        { command: "stop", description: "Удалить запись" },
      ],
    }));
    out.push(await tg("setMyShortDescription", {
      short_description: "Предзапись на Валькирию — голосового ИИ-диспетчера для охранных служб. 30 секунд, без имени и телефона.",
    }));
    out.push(await tg("setMyDescription", {
      description: "Валькирия — голосовой ИИ-диспетчер для охранных служб.\n\nУчастникам ПРОбезопасность 2026 — особые условия на подключение. Нажмите «Старт», укажите организацию и ответьте на 5 вопросов кнопками — условия закрепятся за вами. Имя и телефон не спрашиваем.",
    }));
  } else {
    out.push("Telegram: TELEGRAM_BOT_TOKEN не задан — пропущено");
  }

  if (MAX) {
    const r = await fetch(`${MAX_API}/subscriptions`, {
      method: "POST",
      headers: { Authorization: MAX, "Content-Type": "application/json" },
      body: JSON.stringify({
        url: `${base}/api/max`,
        update_types: ["bot_started", "message_created", "message_callback"],
        ...(MAX_SECRET && { secret: MAX_SECRET }),
      }),
    });
    out.push(`MAX subscriptions: ${r.status} ${await r.text()}`);
  } else {
    out.push("MAX: MAX_BOT_TOKEN не задан — пропущено");
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.status(200).send(out.join("\n"));
}
