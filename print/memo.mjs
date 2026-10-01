// Памятка для форума: npm run memo → print/out/forum-memo.pdf (2 страницы A4).
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import cfg from "../site.config.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "print/out");
mkdirSync(out, { recursive: true });

const font = (p) => `data:font/woff2;base64,${readFileSync(join(root, "node_modules", p)).toString("base64")}`;
const fonts = `
@font-face { font-family: Onest; src: url("${font("@fontsource-variable/onest/files/onest-cyrillic-wght-normal.woff2")}") format("woff2"); font-weight: 100 900; unicode-range: U+0400-045F, U+2116; }
@font-face { font-family: Onest; src: url("${font("@fontsource-variable/onest/files/onest-latin-wght-normal.woff2")}") format("woff2"); font-weight: 100 900; unicode-range: U+0000-00FF, U+2000-206F, U+2190-21FF; }
@font-face { font-family: JBM; src: url("${font("@fontsource/jetbrains-mono/files/jetbrains-mono-cyrillic-400-normal.woff2")}") format("woff2"); unicode-range: U+0400-045F; }
@font-face { font-family: JBM; src: url("${font("@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2")}") format("woff2"); unicode-range: U+0000-00FF, U+2000-206F; }
@font-face { font-family: JBM; font-weight: 700; src: url("${font("@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff2")}") format("woff2"); }`;

const html = readFileSync(join(root, "print/memo.html"), "utf8")
  .replace("/*FONTS*/", fonts)
  .replaceAll("{{SITE}}", cfg.siteUrl.replace(/^https?:\/\//, ""))
  .replaceAll("{{TG}}", cfg.developer.telegram);

const executablePath = process.env.CHROME_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch({ executablePath }).catch(() => chromium.launch({ channel: "chrome" }));
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: join(out, "forum-memo.pdf"), format: "A4", printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
await browser.close();
console.log("Готово: print/out/forum-memo.pdf");
