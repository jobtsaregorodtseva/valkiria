# Валькирия — лендинг и бот предзаписи

Статический сайт (без фреймворка) + функции Vercel для ботов.

```
src/                 вёрстка: index.html, styles.css, main.js
content/updates/     журнал обновлений — по файлу на запись
site.config.js       контакты, форум, имена ботов
api/telegram.js      бот предзаписи в Telegram
api/max.js           бот предзаписи в MAX (включить после верификации)
api/setup.js         разовая привязка вебхуков
lib/                 общие тексты ботов и хранилище (Upstash Redis)
scripts/build.mjs    сборка в dist/
```

## Локально

```
npm install
npm run dev        → http://localhost:3000
```

## Как опубликовать обновление

Создать файл `content/updates/ГГГГ-ММ-ДД-коротко.md`:

```
---
title: Заголовок
date: 2026-10-05
tag: Интерфейс
---
Текст в markdown. Списки, **жирный**, ссылки.
```

Закоммитить в `main` — Vercel пересоберёт сайт сам. Последние 3 записи показываются на главной,
все — на `/updates/`, плюс RSS `/updates/rss.xml`. Если в один день несколько записей, порядок задаёт время: `date: 2026-10-05 18:30`.

Разослать новость подписчикам бота: админ пишет боту `/broadcast текст`.

## Деплой на Vercel

1. vercel.com → Add New → Project → импортировать `valkiria`. Настройки сборки уже в `vercel.json`, ничего менять не нужно → Deploy.
2. Адрес проекта: Settings → Domains. Сейчас сайт на `valkiria-gamma.vercel.app`. Сменится адрес — поменять `siteUrl` в `site.config.js` (от него зависят QR и ссылки).
3. Хранилище: проект → Storage → Create → **Upstash for Redis** (бесплатный план) → Connect. Переменные `KV_REST_API_URL` и `KV_REST_API_TOKEN` добавятся сами.
4. Бот: в Telegram @BotFather → `/newbot` → получить токен.
5. Settings → Environment Variables:
   - `TELEGRAM_BOT_TOKEN` — токен бота
   - `TELEGRAM_WEBHOOK_SECRET` — любая длинная строка из латиницы и цифр
   - `ADMIN_TG_IDS` — ваш Telegram ID (узнать: написать боту `/myid` после шага 7), можно несколько через запятую
   - `PUBLIC_TELEGRAM_BOT` — имя бота без @ (кнопки на сайте начнут вести в бота)
6. Deployments → Redeploy (чтобы подхватились переменные).
7. Открыть в браузере `https://<адрес>/api/setup?key=<TELEGRAM_WEBHOOK_SECRET>` — бот привяжется к сайту.

Команды бота: `/start`, `/status`, `/stop`; для админов — `/stats`, `/export` (таблица CSV для Excel), `/broadcast текст`.

Сценарий: «Записаться» → номер в списке (контакт сохраняется сразу) → название организации → 5 вопросов кнопками (`lib/questions.js`). Админу приходят уведомление о записи и карточка с ответами. Не назвал организацию за 5 минут — бот пишет ему «вы записаны», админу — «нажал, но не ответил»; оповещение о готовности он всё равно получит.

### MAX

После верификации на платформе «MAX для партнёров» и модерации бота:
`MAX_BOT_TOKEN`, `MAX_WEBHOOK_SECRET`, `PUBLIC_MAX_BOT` → Redeploy → снова открыть `/api/setup?key=…`.
Обработчик написан по документации и библиотеке MAX, на живом боте не проверялся — перед запуском пройти `/start` → «Записаться» → `/stop`.

## QR-код

Собирается при каждой сборке: `/qr.svg` (для печати) и `/qr.png`. Ведёт на `siteUrl/?from=qr` —
метка доходит до бота, и в уведомлении о записи видно, что человек пришёл с форума.

## Визитка

`npm run card` → `print/out/`: визитка 90×50 мм с QR на сайт (`?from=card`) и полем для имени и телефона от руки.
- `card-dark-print.pdf`, `card-light-print.pdf` — для типографии, 94×54 мм с вылетами по 2 мм.
- `card-dark-a4.pdf`, `card-light-a4.pdf` — 10 штук на A4 с метками реза, печатать в масштабе 100%.

QR строится из `siteUrl` в `site.config.js` — поменяли адрес сайта, пересоберите визитку.
На Windows нужен Chrome или Edge: `set CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe`.
