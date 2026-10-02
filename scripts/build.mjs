// Сборка статического сайта в dist/:
//   src/index.html + site.config.js    -> dist/index.html
//   content/updates/*.md               -> блок на главной, dist/updates/index.html, dist/updates/rss.xml
//   страница dist/privacy/index.html, шрифты, favicon, QR-код.
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, copyFileSync, existsSync, cpSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import QRCode from "qrcode";
import cfg from "../site.config.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

// Переменные окружения Vercel перекрывают конфиг (можно поменять без коммита).
const siteUrl = (process.env.SITE_URL || cfg.siteUrl).replace(/\/$/, "");
const botTg = process.env.PUBLIC_TELEGRAM_BOT || cfg.bots.telegram;
const mgr = cfg.manager;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

// ---------- обновления ----------
function parseUpdate(file) {
  const raw = readFileSync(join(root, "content/updates", file), "utf8").replace(/\r\n/g, "\n");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: нет блока --- title/date/tag --- в начале файла`);
  const meta = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  if (!meta.title || !meta.date) throw new Error(`${file}: нужны поля title и date`);
  const [d, t = "00:00"] = meta.date.split(/\s+/);
  const date = new Date(`${d}T${t}:00+07:00`); // время Новосибирска
  if (isNaN(date)) throw new Error(`${file}: не разобрать дату «${meta.date}» (формат 2026-10-01 или 2026-10-01 18:30)`);
  const [y, mo, day] = d.split("-").map(Number);
  return {
    slug: file.replace(/\.md$/, ""),
    title: meta.title,
    tag: meta.tag || "",
    date,
    dateIso: d,
    dateHuman: `${day} ${MONTHS[mo - 1]} ${y}`,
    html: marked.parse(m[2].trim()),
  };
}

const updates = readdirSync(join(root, "content/updates"))
  .filter((f) => f.endsWith(".md") && !f.startsWith("_"))
  .map(parseUpdate)
  .sort((a, b) => b.date - a.date || b.slug.localeCompare(a.slug));

const renderUpdate = (u) => `
      <article class="update" id="${esc(u.slug)}">
        <div class="update__meta">
          <time class="update__date" datetime="${u.dateIso}">${u.dateHuman}</time>
          ${u.tag ? `<span class="tag tag--blue">${esc(u.tag)}</span>` : ""}
        </div>
        <div>
          <h3>${esc(u.title)}</h3>
          <div class="update__body">${u.html}</div>
        </div>
      </article>`;

// ---------- подстановки ----------
const mgrTgUrl = `https://t.me/${mgr.telegram}`;
const botTgHref = botTg ? `https://t.me/${botTg}?start=site` : mgrTgUrl;
const botTgLabel = botTg ? "Записаться в Telegram-боте" : "Записаться через Telegram";
const waDigits = (mgr.whatsapp || "").replace(/\D/g, "");
const waUrl = waDigits ? `https://wa.me/${waDigits}${mgr.whatsappText ? `?text=${encodeURIComponent(mgr.whatsappText)}` : ""}` : "";
const phoneDigits = (mgr.phone || "").replace(/[^\d+]/g, "");

const vars = {
  SITE_URL: siteUrl,
  BUILD_ID: Date.now().toString(36),
  YEAR: String(new Date().getFullYear()),
  FORUM_NAME: esc(cfg.forum.name),
  FORUM_PLACE: esc(cfg.forum.place),
  FORUM_DATES: esc(cfg.forum.dates),
  MGR_TG_URL: mgrTgUrl,
  MGR_TG: esc(mgr.telegram),
  MGR_NAME: esc(mgr.name),
  MGR_ROLE: esc(mgr.role),
  MGR_INITIAL: esc(mgr.name.slice(0, 1)),
  MGR_WA_BUTTON: waUrl ? `<a class="btn btn--ghost" href="${esc(waUrl)}" target="_blank" rel="noopener">WhatsApp · ${esc(mgr.whatsapp)}</a>` : "",
  MGR_PHONE_BUTTON: phoneDigits ? `<a class="btn btn--ghost" href="tel:${phoneDigits}">${esc(mgr.phone)}</a>` : "",
  BOT_TG_HREF: botTgHref,
  BOT_TG_LABEL: botTgLabel,
};
const fill = (tpl) => tpl.replace(/\{\{([A-Z_]+)\}\}/g, (_, k) => {
  if (!(k in vars)) throw new Error(`Неизвестная подстановка {{${k}}}`);
  return vars[k];
});

// ---------- общий каркас внутренних страниц ----------
const index = readFileSync(join(root, "src/index.html"), "utf8");
const headEnd = index.indexOf("</head>");
const navStart = index.indexOf('<header class="nav"');
const navEnd = index.indexOf("</header>") + "</header>".length;
const footStart = index.indexOf('<footer class="footer">');
const footEnd = index.indexOf("</footer>") + "</footer>".length;

function page({ title, description, path, body }) {
  let head = index.slice(0, headEnd)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(description)}">`)
    .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="{{SITE_URL}}${path}">`)
    .replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="{{SITE_URL}}${path}">`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(title)}">`)
    .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(description)}">`);
  // На внутренних страницах якоря меню ведут на главную.
  const nav = index.slice(navStart, navEnd).replace(/href="#/g, 'href="/#');
  const foot = index.slice(footStart, footEnd);
  return fill(`${head}</head>\n<body>\n${nav}\n<main class="page">\n<div class="wrap">\n${body}\n</div>\n</main>\n${foot}\n</body>\n</html>\n`);
}

// ---------- запись ----------
rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, "updates"), { recursive: true });
mkdirSync(join(dist, "privacy"), { recursive: true });
mkdirSync(join(dist, "fonts"), { recursive: true });

const latest = updates.slice(0, 3).map(renderUpdate).join("\n");
writeFileSync(join(dist, "index.html"), fill(index.replace("<!--UPDATES_LATEST-->", latest)));

writeFileSync(join(dist, "updates/index.html"), page({
  title: "Журнал разработки — Валькирия",
  description: "Обновления Валькирии — голосового ИИ-диспетчера для охранных служб.",
  path: "/updates/",
  body: `<a class="page__back" href="/">← На главную</a>
<p class="eyebrow">Журнал разработки</p>
<h1>Обновления Валькирии</h1>
<p class="page__lead">Что изменилось в программе — по датам, от новых к старым. Подписаться: <a href="/updates/rss.xml">RSS</a>${botTg ? ` или <a href="https://t.me/${esc(botTg)}?start=updates" target="_blank" rel="noopener">Telegram-бот</a>` : ""}.</p>
<div class="updates">${updates.map(renderUpdate).join("\n")}</div>`,
}));

const rssItems = updates.map((u) => `  <item>
    <title>${esc(u.title)}</title>
    <link>${siteUrl}/updates/#${u.slug}</link>
    <guid isPermaLink="false">${u.slug}</guid>
    <pubDate>${u.date.toUTCString()}</pubDate>
    <description>${esc(u.html)}</description>
  </item>`).join("\n");
writeFileSync(join(dist, "updates/rss.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>Валькирия — журнал разработки</title>
  <link>${siteUrl}/updates/</link>
  <description>Обновления голосового ИИ-диспетчера для охранных служб</description>
  <language>ru</language>
${rssItems}
</channel>
</rss>
`);

writeFileSync(join(dist, "privacy/index.html"), page({
  title: "Данные в боте предзаписи — Валькирия",
  description: "Какие данные сохраняет бот предзаписи Валькирии и как их удалить.",
  path: "/privacy",
  body: `<a class="page__back" href="/">← На главную</a>
<p class="eyebrow">Бот предзаписи</p>
<h1>Какие данные сохраняет бот</h1>
<div class="prose">
<p>На сайте нет форм: мы не просим имя, телефон или почту. Предзапись идёт через бота в Telegram.</p>
<h2>Что сохраняется</h2>
<ul>
<li>ваш числовой идентификатор в Telegram (Telegram ID) — чтобы бот мог прислать сообщение;</li>
<li>название вашей организации, если вы его укажете;</li>
<li>ответы на вопросы-кнопки: тип организации, число объектов, как ведёте журнал, какая телефония, когда хотите попробовать;</li>
<li>дата и время записи, откуда вы пришли (например, «форум» или «сайт») и номер в списке.</li>
</ul>
<p>Имя, юзернейм, номер телефона и переписку бот не сохраняет.</p>
<h2>Зачем</h2>
<p>Чтобы закрепить за вами условия для участников ПРОбезопасность 2026, подготовить предложение под вашу организацию и написать, когда откроем подключение. Рекламных рассылок не будет — только сообщения о Валькирии, и нечасто.</p>
<h2>Как удалить</h2>
<p>Отправьте боту команду <code>/stop</code> — запись удаляется сразу. Если вы удалите чат с ботом, сообщения от нас приходить перестанут.</p>
<h2>Связь</h2>
<p>Вопросы о данных — менеджеру в Telegram: <a href="${mgrTgUrl}" target="_blank" rel="noopener">@${esc(mgr.telegram)}</a>.</p>
</div>`,
}));

// шрифты
const fonts = [
  ["@fontsource-variable/onest/files/onest-cyrillic-wght-normal.woff2", "onest-cyrillic.woff2"],
  ["@fontsource-variable/onest/files/onest-latin-wght-normal.woff2", "onest-latin.woff2"],
  ["@fontsource/jetbrains-mono/files/jetbrains-mono-cyrillic-400-normal.woff2", "jbm-cyrillic-400.woff2"],
  ["@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2", "jbm-latin-400.woff2"],
  ["@fontsource/jetbrains-mono/files/jetbrains-mono-cyrillic-700-normal.woff2", "jbm-cyrillic-700.woff2"],
  ["@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff2", "jbm-latin-700.woff2"],
];
for (const [from, to] of fonts) copyFileSync(join(root, "node_modules", from), join(dist, "fonts", to));

copyFileSync(join(root, "src/styles.css"), join(dist, "styles.css"));
copyFileSync(join(root, "src/main.js"), join(dist, "main.js"));
if (existsSync(join(root, "public"))) cpSync(join(root, "public"), dist, { recursive: true });

// QR на сайт (метка ?from=qr, чтобы отличать переходы с форума)
const qrUrl = `${siteUrl}/?from=qr`;
writeFileSync(join(dist, "qr.svg"), await QRCode.toString(qrUrl, { type: "svg", margin: 2, errorCorrectionLevel: "M", color: { dark: "#0b0b0a", light: "#ffffff" } }));
await QRCode.toFile(join(dist, "qr.png"), qrUrl, { width: 1200, margin: 2, errorCorrectionLevel: "M" });

console.log(`Готово: dist/ · обновлений: ${updates.length} · бот TG: ${botTg || "не задан"} · QR → ${qrUrl}`);
