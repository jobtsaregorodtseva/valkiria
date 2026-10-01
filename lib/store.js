// Хранилище подписчиков бота — Upstash Redis через REST (без зависимостей).
// Vercel → Storage → Upstash Redis сам добавляет KV_REST_API_URL и KV_REST_API_TOKEN.
// Храним числовой ID мессенджера, номер в списке, время, метку источника,
// название организации и ответы на вопросы-кнопки. Имя, юзернейм, телефон — не храним.

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const storeReady = Boolean(URL_ && TOKEN);

async function redis(...cmd) {
  if (!storeReady) throw new Error("Хранилище не подключено (нет KV_REST_API_URL / KV_REST_API_TOKEN)");
  const r = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const data = await r.json();
  if (data.error) throw new Error(`Redis: ${data.error}`);
  return data.result;
}

// platform: "tg" | "max"
const key = (platform) => `subs:${platform}`;

export async function getSub(platform, id) {
  const raw = await redis("HGET", key(platform), String(id));
  return raw ? JSON.parse(raw) : null;
}

// Возвращает { sub, isNew }. Номер общий для обоих мессенджеров.
export async function addSub(platform, id, source) {
  const existing = await getSub(platform, id);
  if (existing) return { sub: existing, isNew: false };
  const n = await redis("INCR", "subs:seq");
  const sub = { n, at: new Date().toISOString(), src: source || "" };
  // HSETNX: если два запроса пришли одновременно, выиграет первый.
  const created = await redis("HSETNX", key(platform), String(id), JSON.stringify(sub));
  if (!created) return { sub: await getSub(platform, id), isNew: false };
  return { sub, isNew: true };
}

// Дописать поля в запись (название организации, ответы).
export async function updateSub(platform, id, patch) {
  const sub = await getSub(platform, id);
  if (!sub) return null;
  const next = { ...sub, ...patch, answers: { ...(sub.answers || {}), ...(patch.answers || {}) } };
  await redis("HSET", key(platform), String(id), JSON.stringify(next));
  return next;
}

export async function removeSub(platform, id) {
  await clearState(platform, id);
  return (await redis("HDEL", key(platform), String(id))) === 1;
}

// Все записи платформы: [{ id, ...sub }]
export async function listSubs(platform) {
  const flat = (await redis("HGETALL", key(platform))) || [];
  const out = [];
  for (let i = 0; i < flat.length; i += 2) out.push({ id: flat[i], ...JSON.parse(flat[i + 1]) });
  return out.sort((a, b) => a.n - b.n);
}

// Состояние диалога (какой вопрос ждём). Живёт 7 дней.
const stateKey = (platform, id) => `state:${platform}:${id}`;
export async function getState(platform, id) {
  const raw = await redis("GET", stateKey(platform, id));
  return raw ? JSON.parse(raw) : null;
}
export async function setState(platform, id, state) {
  await redis("SET", stateKey(platform, id), JSON.stringify(state), "EX", "604800");
}
export async function clearState(platform, id) {
  await redis("DEL", stateKey(platform, id));
}

export async function countSubs(platform) {
  return redis("HLEN", key(platform));
}

export async function listSubIds(platform) {
  return redis("HKEYS", key(platform));
}

// true, если ключ встречается впервые (защита от повторной доставки вебхука). Без хранилища — всегда true.
export async function firstTime(id) {
  if (!storeReady) return true;
  try {
    return (await redis("SET", `seen:${id}`, "1", "NX", "EX", "86400")) === "OK";
  } catch {
    return true;
  }
}

// Нажали «Записаться», но не назвали организацию: ждём 5 минут, потом напоминаем (см. sweepPending в flow.js).
export async function addPending(platform, id) {
  await redis("ZADD", `pending:${platform}`, String(Date.now()), String(id));
}
export async function removePending(platform, id) {
  return (await redis("ZREM", `pending:${platform}`, String(id))) === 1;
}
export async function duePending(platform, olderThanMs) {
  return (await redis("ZRANGEBYSCORE", `pending:${platform}`, "-inf", String(Date.now() - olderThanMs), "LIMIT", "0", "20")) || [];
}
