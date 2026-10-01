// Визитка Валькирии: 90×50 мм, QR на сайт и светлое поле для имени и телефона от руки.
//   npm run card
// Результат в print/out/:
//   card-dark-print.pdf   — одна визитка 94×54 мм (вылеты по 2 мм) для типографии
//   card-dark-a4.pdf      — 10 визиток на A4 с метками реза, для офисного принтера
//   card-light-*.pdf      — то же на белом фоне (экономит тонер, ровнее печатается дома)
//   card-*.png            — превью
// Браузер: Chromium из Playwright или Chrome/Edge (CHROME_PATH=путь\к\chrome.exe).
import { mkdirSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import { chromium } from "playwright-core";
import cfg from "../site.config.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "print/out");
mkdirSync(out, { recursive: true });

const siteUrl = (process.env.SITE_URL || cfg.siteUrl).replace(/\/$/, "");
const qrUrl = `${siteUrl}/?from=card`;
const shortUrl = siteUrl.replace(/^https?:\/\//, "");

// QR как SVG-пути — в PDF остаётся векторным.
const qrSvg = await QRCode.toString(qrUrl, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#0b0b0aff", light: "#00000000" } });

// Шрифты встраиваем в data:-URL — страница из setContent не может читать file://.
const font = (p) => `data:font/woff2;base64,${readFileSync(join(root, "node_modules", p)).toString("base64")}`;
const fontsCss = `
@font-face { font-family: Onest; src: url("${font("@fontsource-variable/onest/files/onest-cyrillic-wght-normal.woff2")}") format("woff2"); font-weight: 100 900; unicode-range: U+0400-045F, U+2116; }
@font-face { font-family: Onest; src: url("${font("@fontsource-variable/onest/files/onest-latin-wght-normal.woff2")}") format("woff2"); font-weight: 100 900; unicode-range: U+0000-00FF, U+2000-206F; }
@font-face { font-family: JBM; src: url("${font("@fontsource/jetbrains-mono/files/jetbrains-mono-cyrillic-400-normal.woff2")}") format("woff2"); unicode-range: U+0400-045F; }
@font-face { font-family: JBM; src: url("${font("@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2")}") format("woff2"); unicode-range: U+0000-00FF, U+2000-206F; }`;

const themes = {
  dark: { bg: "#0b0b0a", text: "#ecebe7", muted: "#9a978f", accent: "#f7b78f", field: "#f4f0ea", fieldLine: "#cfc8bd", fieldLabel: "#8d877d", qrBg: "#ffffff", border: "none" },
  light: { bg: "#ffffff", text: "#0b0b0a", muted: "#6c6a64", accent: "#e58f5c", field: "#f6f3ee", fieldLine: "#d8d1c6", fieldLabel: "#9a948a", qrBg: "#ffffff", border: "0.25mm solid #e3ddd3" },
};

// Одна визитка; bleed — вылет фона за линию реза.
function card(t, bleed) {
  return `<div class="card" style="--bleed:${bleed}mm">
  <div class="safe">
    <div class="brand">
      <svg viewBox="0 0 26 44" aria-hidden="true"><path d="M0 0h12v29h14v15H0z"/></svg>
      <span>Валькирия</span>
    </div>
    <p class="tagline">Голосовой ИИ-диспетчер<br>для охранных служб</p>
    <div class="field">
      <div class="row"><span>имя</span></div>
      <div class="row"><span>телефон</span></div>
    </div>
    <div class="qr">
      <div class="qr__box">${qrSvg}</div>
      <p class="qr__cap">Сайт и предзапись</p>
      <p class="qr__url">${shortUrl}</p>
    </div>
    <p class="forum">Особые условия<br>для участников<br>ПРОбезопасность</p>
  </div>
</div>`;
}

function css(t) {
  return `${fontsCss}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.card {
  position: relative;
  width: calc(90mm + 2 * var(--bleed)); height: calc(50mm + 2 * var(--bleed));
  background: ${t.bg}; color: ${t.text}; overflow: hidden;
  font-family: Onest, sans-serif;
}
/* всё содержимое — внутри безопасной зоны 4 мм от линии реза */
.safe { position: absolute; inset: calc(var(--bleed) + 4mm); }
.brand { display: flex; align-items: center; gap: 1.6mm; font-weight: 650; font-size: 10.5pt; letter-spacing: -0.01em; line-height: 1; }
.brand svg { width: 2.3mm; height: 3.9mm; fill: ${t.accent}; flex: none; }
.tagline { margin-top: 2.2mm; font: 400 6.3pt/1.35 JBM, monospace; text-transform: uppercase; letter-spacing: .06em; color: ${t.muted}; }
.field {
  position: absolute; left: 0; bottom: 0; width: 52mm; height: 21mm;
  background: ${t.field}; border-radius: 1.4mm; padding: 0 2.6mm;
  display: grid; grid-template-rows: 1fr 1fr;
}
.row { position: relative; border-bottom: 0.2mm dashed ${t.fieldLine}; }
.row:last-child { border-bottom: 0; }
.row span { position: absolute; left: 0; top: 1.1mm; font: 400 5.2pt/1 JBM, monospace; color: ${t.fieldLabel}; text-transform: uppercase; letter-spacing: .08em; }
.qr { position: absolute; right: 0; top: 0; width: 23mm; text-align: center; }
.qr__box { width: 23mm; height: 23mm; background: ${t.qrBg}; border-radius: 1.2mm; padding: 1.8mm; border: ${t.border}; }
.qr__box svg { display: block; width: 100%; height: 100%; }
.qr__cap { margin-top: 1.6mm; font-size: 6.3pt; font-weight: 600; line-height: 1.2; }
.qr__url { margin-top: .5mm; font: 400 5pt/1.2 JBM, monospace; color: ${t.muted}; }
.forum { position: absolute; right: 0; bottom: 0; width: 23mm; text-align: center; font-size: 5.6pt; line-height: 1.25; font-weight: 600; color: ${t.accent}; }
`;
}

const doc = (t, body, extra = "") =>
  `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>${css(t)}${extra}</style></head><body>${body}</body></html>`;

// Лист A4: 2 × 5 визиток встык, метки реза по краям.
function sheet(t) {
  const cols = 2, rows = 5, W = 90, H = 50;
  const left = (210 - cols * W) / 2, top = (297 - rows * H) / 2;
  let cards = "", marks = "";
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    cards += `<div style="position:absolute;left:${left + c * W}mm;top:${top + r * H}mm">${card(t, 0)}</div>`;
  }
  const L = 5, gap = 1.5; // длина метки и отступ от листа визиток
  for (let c = 0; c <= cols; c++) {
    const x = left + c * W;
    marks += `<i style="left:${x}mm;top:${top - gap - L}mm;width:0;height:${L}mm"></i><i style="left:${x}mm;top:${top + rows * H + gap}mm;width:0;height:${L}mm"></i>`;
  }
  for (let r = 0; r <= rows; r++) {
    const y = top + r * H;
    marks += `<i style="top:${y}mm;left:${left - gap - L}mm;height:0;width:${L}mm"></i><i style="top:${y}mm;left:${left + cols * W + gap}mm;height:0;width:${L}mm"></i>`;
  }
  const extra = `.sheet{position:relative;width:210mm;height:297mm}.sheet i{position:absolute;border-left:.2mm solid #000;border-top:.2mm solid #000}
.note{position:absolute;left:${left}mm;bottom:6mm;font:400 6pt JBM,monospace;color:#888}`;
  return doc(t, `<div class="sheet">${cards}${marks}<p class="note">Валькирия · визитки 90×50 мм · печать 100%, без масштабирования · QR → ${qrUrl}</p></div>`, extra);
}

const executablePath = process.env.CHROME_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
let browser;
try {
  browser = await chromium.launch({ executablePath });
} catch {
  browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch({ channel: "msedge" }));
}
const page = await browser.newPage({ deviceScaleFactor: 5 });

for (const [name, t] of Object.entries(themes)) {
  await page.setContent(doc(t, card(t, 2), `@page{size:94mm 54mm;margin:0} html,body{background:${t.bg}}`), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: join(out, `card-${name}-print.pdf`), width: "94mm", height: "54mm", printBackground: true, pageRanges: "1", margin: { top: 0, right: 0, bottom: 0, left: 0 } });

  // превью по линии реза, крупно
  await page.setContent(doc(t, card(t, 0)), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await (await page.$(".card")).screenshot({ path: join(out, `card-${name}.png`), scale: "device" });

  await page.setContent(sheet(t), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: join(out, `card-${name}-a4.pdf`), format: "A4", printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
}
await browser.close();
console.log(`Готово: print/out/ · QR → ${qrUrl}`);
