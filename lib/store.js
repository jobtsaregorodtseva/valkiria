// Хранилище подписчиков бота — Upstash Redis через REST (без зависимостей).
// Vercel → Storage → Upstash Redis сам добавляет KV_REST_API_URL и KV_REST_API_TOKEN.
// Храним только числовой ID мессенджера, номер в списке, время и метку источника.

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

export async function removeSub(platform, id) {
  return (await redis("HDEL", key(platform), String(id))) === 1;
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
