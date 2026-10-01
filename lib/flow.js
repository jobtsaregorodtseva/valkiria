// Сценарий бота предзаписи — общий для Telegram и MAX.
// «Записаться» → название организации (обязательно) → номер в списке → 5 вопросов кнопками.
// Платформу описывает объект io:
//   io.platform              — "tg" | "max"
//   io.send(text, rows)      — отправить сообщение; rows — ряды кнопок [{ text, data } | { text, url }]
//   io.answered(text)        — (необязательно) заменить вопрос на «✓ ответ» и убрать кнопки
//   io.notifyAdmins(text)    — уведомить админов
import { addSub, getSub, updateSub, removeSub, getState, setState, clearState } from "./store.js";
import { texts, links, buttons, cleanSource, escapeHtml } from "./bot-texts.js";
import { QUESTIONS, answerLabel } from "./questions.js";

const linkRows = () => [[{ text: buttons.dev, url: links.dev }], [{ text: buttons.site, url: links.site }]];

function questionRows(q) {
  const cols = q.cols || 1;
  const rows = [];
  for (let i = 0; i < q.options.length; i += cols) {
    rows.push(q.options.slice(i, i + cols).map(([code, label]) => ({ text: label, data: `a:${q.id}:${code}` })));
  }
  return rows;
}

const nextQuestion = (answers = {}) => QUESTIONS.find((q) => !answers[q.id]);

async function ask(io, id, q, idx) {
  await setState(io.platform, id, { step: q.id });
  return io.send(texts.question(idx + 1, QUESTIONS.length, q.text), questionRows(q));
}

async function askNextOrFinish(io, id, sub) {
  const q = nextQuestion(sub.answers);
  if (q) return ask(io, id, q, QUESTIONS.indexOf(q));
  await clearState(io.platform, id);
  if (!sub.done) {
    await updateSub(io.platform, id, { done: true });
    await io.notifyAdmins(texts.adminCard(io.platform, sub));
  }
  return io.send(texts.finished(sub.n), linkRows());
}

// ---------- входы ----------

export async function onStart(io, id, rawSource) {
  const sub = await getSub(io.platform, id);
  if (sub && !sub.company) return askCompany(io, id, sub.src);
  if (sub) {
    await io.send(texts.already(sub.n), linkRows());
    if (nextQuestion(sub.answers)) return askNextOrFinish(io, id, sub);
    return;
  }
  const src = cleanSource(rawSource);
  return io.send(texts.hello(), [[{ text: `✅ ${buttons.join}`, data: src ? `join:${src}` : "join" }], ...linkRows()]);
}

async function askCompany(io, id, src) {
  await setState(io.platform, id, { step: "company", src: src || "" });
  return io.send(texts.askCompany());
}

export async function onButton(io, id, data) {
  if (data === "join" || data.startsWith("join:")) {
    const sub = await getSub(io.platform, id);
    if (sub?.company) return onStart(io, id);
    return askCompany(io, id, cleanSource(data.split(":")[1]) || sub?.src || "start");
  }
  const m = /^a:(\w+):(\w+)$/.exec(data);
  if (!m) return;
  const [, qid, code] = m;
  const label = answerLabel(qid, code);
  if (!label) return;
  const sub = await getSub(io.platform, id);
  if (!sub) return onStart(io, id);
  if (io.answered) await io.answered(`${QUESTIONS.find((q) => q.id === qid).text}\n<b>✓ ${escapeHtml(label)}</b>`);
  const next = await updateSub(io.platform, id, { answers: { [qid]: code } });
  return askNextOrFinish(io, id, next);
}

export async function onText(io, id, text) {
  const state = await getState(io.platform, id);
  if (state?.step === "company") {
    const company = text.replace(/\s+/g, " ").trim();
    if (company.length < 2 || company.length > 120 || company.startsWith("/")) return io.send(texts.companyInvalid());
    const before = await getSub(io.platform, id);
    await addSub(io.platform, id, state.src);
    const sub = await updateSub(io.platform, id, { company });
    await io.send(texts.joined(sub.n));
    if (!before?.company) await io.notifyAdmins(texts.adminNew(io.platform, sub));
    return askNextOrFinish(io, id, sub);
  }
  if (state?.step) {
    // Ждём ответ кнопкой — напоминаем вопрос.
    const q = QUESTIONS.find((x) => x.id === state.step);
    if (q) return ask(io, id, q, QUESTIONS.indexOf(q));
  }
  return io.send(texts.help(), linkRows());
}

export async function onStop(io, id) {
  const removed = await removeSub(io.platform, id);
  return io.send(removed ? texts.stopped() : texts.notSubscribed());
}

export async function onStatus(io, id) {
  const sub = await getSub(io.platform, id);
  if (!sub) return io.send(texts.notSubscribed());
  return io.send(texts.status(sub));
}
