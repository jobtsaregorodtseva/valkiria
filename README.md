# Валькирия — лендинг и бот предзаписи

Статический сайт (без фреймворка) + функции Vercel для Telegram-бота.

```
src/                 вёрстка: index.html, styles.css, main.js
content/updates/     журнал обновлений — по файлу на запись
site.config.js       контакты менеджера, форум, имя бота
api/telegram.js      бот предзаписи в Telegram
api/setup.js         разовая привязка вебхука
lib/                 тексты бота, сценарий и хранилище (Upstash Redis)
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
2. Адрес сайта — `valkiria-gamma.vercel.app` (на него ведёт QR на напечатанных визитках — проект не удалять). Когда заработает `valkiriasecure.ru` (REG.RU, см. ниже), поменять `siteUrl` в `site.config.js` — от него зависят QR, ссылки и кнопки бота.
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

## Хостинг на REG.RU

Сайт статический — можно держать на обычном хостинге REG.RU. Бот при этом остаётся на Vercel:
ему нужен сервер для вебхука, а на сайте только ссылка на него.

1. Имя бота (`bots.telegram`) задано в `site.config.js`.
2. `npm install`, затем сборка с адресом домена: `SITE_URL=https://valkiriasecure.ru npm run build`
   (Windows: `set SITE_URL=https://valkiriasecure.ru && npm run build`) — готовый сайт в `dist/`.
3. Заархивировать **содержимое** `dist/` (не саму папку) в zip.
4. ISPmanager REG.RU → «Менеджер файлов» → папка сайта (обычно `www/<домен>/`) → загрузить zip → «Извлечь».
   В папке должны оказаться `index.html`, `.htaccess`, `styles.css`, `fonts/` и т. д.

`.htaccess` из `public/` включает https и кэш шрифтов (на Vercel то же задаёт `vercel.json`).

## QR-код

Собирается при каждой сборке: `/qr.svg` (для печати) и `/qr.png`. Ведёт на `siteUrl/?from=qr` —
метка доходит до бота, и в уведомлении о записи видно, что человек пришёл с форума.

## Визитка

`npm run card` → `print/out/`: визитка 90×50 мм с QR на сайт (`?from=card`) и полем для имени и телефона от руки.
- `card-dark-print.pdf`, `card-light-print.pdf` — для типографии, 94×54 мм с вылетами по 2 мм.
- `card-dark-a4.pdf`, `card-light-a4.pdf` — 10 штук на A4 с метками реза, печатать в масштабе 100%.

QR строится из `siteUrl` в `site.config.js` — поменяли адрес сайта, пересоберите визитку.
На Windows нужен Chrome или Edge: `set CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe`.
