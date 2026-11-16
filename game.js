// 森土地家屋調査士事務所 — ゲーム本体（素のJavaScript、ビルド不要）
// データは data/game.json（scripts/build_app_data.py が作る）。画像は img/web/ だけを使う。
"use strict";

// テスト用の切り替え：index.html?test=1 で開くと、台詞のある事件だけで章・節のクリアを判定し、
// 試験モードも台詞のある事件の肢だけで出題する。記録は本番とは別に保存する
const TEST = new URLSearchParams(location.search).has("test");
const SAVE_KEY = "chosashi_save_v1" + (TEST ? "_test" : "");
const EXP = { correct: 10, wrong: 3, solve: 20, perfect: 10 };   // 経験値は各肢・各事件の初回だけ
const TYPE_MS = 32;                                               // 台詞の1文字あたりの表示時間
const BRANCH_ORDER = "アイウエオ";

// 立ち絵の名前ラベルの色分け
const NAME_CLASS = { mori: "mori", robin: "robin", taka: "taka" };
// ロビンの事件解決コメント（正解数で選ぶ。法律の中身には触れない）
const RESULT_COMMENT = [
  [5, "全問正解ね。……べつに驚いてないわよ。次もこの調子でいきなさい。"],
  [4, "あと一つ。外した肢の解説、今夜もう一度読んでおきなさい。"],
  [3, "半分は越えたわね。迷った肢こそ伸びしろよ。"],
  [0, "今日は解説を読み込む日ね。大丈夫、先生も最初はそうだったらしいわ。"],
];

let G = null;        // game.json
let save = null;     // 進行状況
let play = null;     // 遊んでいる事件の状態

// ---------- 保存（localStorage は使えない環境もあるので必ず try/catch） ----------
function emptySave() {
  // exam：節ごとの試験モードの記録 {節番号: {best, passed, tries}}
  // events：見た章クリアの物語イベント {章番号: true}／album：手に入れた一枚絵 {章番号: 日付}
  return { v: 1, exp: 0, answers: {}, solved: {}, progress: {}, exam: {}, events: {}, album: {} };
}
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.v === 1) return Object.assign(emptySave(), s);
    }
  } catch (e) { /* 読めなければ新しい記録で始める */ }
  return emptySave();
}
function writeSave() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); }
  catch (e) { /* 保存できなくても遊べるようにする */ }
}

// ---------- 小道具 ----------
const $ = (id) => document.getElementById(id);
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function show(screenId) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === screenId));
}
function preload(urls) {
  urls.forEach((u) => { const i = new Image(); i.src = u; });
}

// ---------- 肩書と章の進み具合 ----------
function caseSolved(caseId) { return !!save.solved[caseId]; }
// 本番：節・章の全事件（台詞が未収録の事件を含む）を解決したらクリア
// テスト（?test=1）：台詞のある事件だけで判定する
function allSolved(cases, total) {
  if (!cases.length) return false;
  if (!TEST && cases.length !== total) return false;
  return cases.every((c) => caseSolved(c.case_id));
}
function chapterCleared(ch) { return allSolved(ch.cases, ch.total_cases); }
function sectionCleared(sec) { return allSolved(sec.cases, sec.total_cases); }
function sectionPassed(sec) { return !!(save.exam[sec.no] && save.exam[sec.no].passed); }
function chapterAllPassed(ch) {
  // 一枚絵の条件：その章の全節の試験モードに合格（テストでは台詞のある事件がある節だけ）
  const secs = TEST ? ch.sections.filter((s) => s.cases.length) : ch.sections;
  return secs.length > 0 && secs.every(sectionPassed);
}
function chapterOfCase(caseId) { return G.chapters.find((ch) => ch.cases.some((c) => c.case_id === caseId)); }
// 端末の日付（toISOString は UTC のため、日本の朝9時前は前の日になっていた。2026-11-16 修正）
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function currentChapterIndex() {
  const i = G.chapters.findIndex((ch) => !chapterCleared(ch));
  return i === -1 ? G.chapters.length : i;
}
function currentRank() {
  const i = currentChapterIndex();
  return i >= G.chapters.length ? G.final_rank : G.chapters[i].rank;
}
function nextRankText() {
  const i = currentChapterIndex();
  if (i >= G.chapters.length) return "すべての章を解決しました！";
  const ch = G.chapters[i];
  const solved = ch.cases.filter((c) => caseSolved(c.case_id)).length;
  const next = i + 1 < G.chapters.length ? G.chapters[i + 1].rank : G.final_rank;
  const total = TEST ? ch.cases.length : ch.total_cases;
  return `次の肩書「${next}」まで：第${ch.no}章をあと ${total - solved} 事件`;
}

// ---------- タイトル ----------
function renderTitle() {
  const answered = Object.keys(save.answers).length;
  $("title-rank").textContent = answered
    ? `タカ：${currentRank()}　経験値 ${save.exp}`
    : "新人アルバイト・タカの初出勤";
  $("btn-start").textContent = answered ? "つづきから" : "はじめる";
  $("title-note").textContent = TEST ? "テスト用：台詞のある事件だけで判定・出題（記録は本番と別）" : "";
  $("btn-album").textContent = `アルバム（${Object.keys(save.album).length} / ${G.chapters.length}）`;
  resetArmed = false;
  $("btn-reset").textContent = "記録を消す";
  $("btn-reset").classList.remove("danger");
  show("screen-title");
}
let resetArmed = false;
function onReset() {
  if (!resetArmed) {   // ブラウザの確認ダイアログは使わず、2回押しで消す
    resetArmed = true;
    $("btn-reset").textContent = "本当に消す？（もう一度押す）";
    $("btn-reset").classList.add("danger");
    return;
  }
  save = emptySave();
  writeSave();
  renderTitle();
  $("title-note").textContent = "記録を消しました";
}

// ---------- 事件ファイル一覧 ----------
function renderCases() {
  $("cases-status").textContent = `タカ：${currentRank()}　経験値 ${save.exp}`;
  const list = $("cases-list");
  list.replaceChildren();
  const cur = currentChapterIndex();

  if (TEST) list.append(el("div", "test-note", "テスト用：台詞のある事件だけで判定・出題しています（?test=1）"));
  G.chapters.forEach((ch, i) => {
    const box = el("section", "chapter" + (i > cur ? " locked" : ""));
    const solved = ch.cases.filter((c) => caseSolved(c.case_id)).length;
    const head = el("h3", null, `第${ch.no}章　${ch.title}`);
    if (chapterCleared(ch)) head.append(el("span", "chip clear", "章クリア"));
    if (save.album[ch.no]) head.append(el("span", "chip album", "一枚絵"));
    box.append(head);
    box.append(el("p", "chapter-sub", `肩書：${ch.rank}　解決 ${solved} / ${ch.total_cases} 事件`));
    if (i === cur) box.append(el("p", "chapter-sub", nextRankText()));

    if (!ch.cases.length) {
      box.append(el("div", "empty-note", "この章の事件は準備中です"));
    } else if (i > cur) {
      box.append(el("div", "empty-note", "前の章を解決すると開きます"));
    } else {
      ch.sections.forEach((s) => box.append(sectionBlock(s)));
    }
    list.append(box);
  });
  show("screen-cases");
}
function sectionBlock(s) {
  const wrap = el("div", "section-block");
  const head = el("div", "section-head");
  head.append(el("h4", null, `${s.no}　${s.title}`));
  if (sectionPassed(s)) head.append(el("span", "chip pass", "合格"));
  wrap.append(head);
  const solved = s.cases.filter((c) => caseSolved(c.case_id)).length;
  const rec = save.exam[s.no];
  const nq = examBranches(s).length;
  let sub = `解決 ${solved} / ${s.total_cases} 事件`;
  if (rec) sub += `　試験の最高記録 ${rec.best} / ${nq} 問`;
  wrap.append(el("p", "chapter-sub", sub));
  s.cases.forEach((c) => wrap.append(caseCard(c)));
  const rest = s.total_cases - s.cases.length;
  if (rest > 0) wrap.append(el("div", "empty-note", s.cases.length ? `ほかの ${rest} 事件は準備中です` : "この節の事件は準備中です"));
  // 試験モード：節の全事件を解決すると開く
  const open = sectionCleared(s);
  const btn = el("button", "btn small exam-btn" + (open ? " open" : ""),
                 open ? `試験モードに挑戦（全 ${nq} 問・1問でも間違えたら終了）` : "試験モード：この節の全事件を解決すると開きます");
  btn.disabled = !open;
  if (open) btn.addEventListener("click", () => startExam(s));
  wrap.append(btn);
  return wrap;
}
function caseCard(c) {
  const done = caseSolved(c.case_id);
  const prog = save.progress[c.case_id];
  const card = el("button", "case-card" + (done ? " solved" : ""));
  const state = done ? "解決済み" : prog ? "つづきから" : "新しい依頼";
  card.append(el("span", "case-state", state));
  card.append(el("div", "case-name", c.title));
  card.append(el("div", "case-meta", `${c.year} 問${c.q_no}　全${c.branches.length}話`));
  const dots = el("div", "case-dots");
  c.branches.forEach((b) => {
    const a = save.answers[b];
    const d = el("span", "dot" + (a ? (a.last ? " ok" : " ng") : ""), b.slice(-1));
    dots.append(d);
  });
  card.append(dots);
  card.addEventListener("click", () => startCase(c));
  return card;
}

// ---------- 事件を遊ぶ ----------
function startCase(c) {
  // 途中から再開（解決済みの事件は最初から遊び直し）
  const prog = !caseSolved(c.case_id) && save.progress[c.case_id];
  play = {
    c,
    index: prog ? prog.index : 0,
    results: prog ? prog.results.slice() : [],
    expGained: prog ? prog.expGained : 0,
  };
  const urls = new Set();
  c.branches.forEach((b) => {
    const s = G.stories[b];
    urls.add(G.backgrounds[s.bg]);
    ["intro", "on_correct", "on_wrong", "outro"].forEach((k) => s[k].forEach((ln) => {
      if (ln.bg) urls.add(G.backgrounds[ln.bg]);   // 行の途中で切り替える背景
      const ch = G.characters[ln.who];
      if (ch && ch.img) urls.add(portraitSrc(ch, ln.face).src);
    }));
  });
  preload([...urls]);
  show("screen-play");
  startBranch();
}

function currentBranch() { return play.c.branches[play.index]; }

function startBranch() {
  const id = currentBranch();
  const s = G.stories[id];
  setBackground(s.bg);
  $("play-title").textContent = `${play.c.title}｜${s.title}`;
  $("play-count").textContent = `${play.index + 1} / ${play.c.branches.length}`;
  hidePanels();
  runLines(s.intro, showQuestion);
}

function setBackground(bg) {
  $("bg").style.backgroundImage = `url(${G.backgrounds[bg]})`;
  // イベントCG（人物入り）のときは立ち絵を重ねない
  $("stage").classList.toggle("cg", bg.startsWith("cg_"));
}
function isCG() { return $("stage").classList.contains("cg"); }

// 画像のある表情はその画像、ない表情は normal（先読み用）
function portraitSrc(ch, face) {
  return { src: `img/web/${ch.img}_${ch.faces.includes(face) ? face : "normal"}.webp` };
}

// 表情・漫符・画面の演出は fx.js（FX）に任せる
function fxCtx() {
  return { stage: $("stage"), box: $("portrait-box"), img: $("portrait"),
           markHost: $("mark-host"), floatHost: $("dialog-mark") };
}

// ---------- 台詞 ----------
let lineQueue = [], lineDone = null, typing = null, typingText = "";

function runLines(lines, done) {
  lineQueue = lines.slice();
  lineDone = done;
  $("dialog").classList.add("show");
  nextLine();
}
function nextLine() {
  if (!lineQueue.length) {
    $("dialog").classList.remove("show");
    clearPortrait();
    const d = lineDone; lineDone = null;
    if (d) d();
    return;
  }
  const ln = lineQueue.shift();
  if (ln.bg) setBackground(ln.bg);      // 行に bg があれば、その行から背景を切り替える（本編の話・物語イベント共通。なければ前の背景のまま）
  const ch = G.characters[ln.who] || { img: null, faces: [] };
  const name = $("dialog-name");
  name.textContent = ln.who;
  name.className = "dialog-name " + (NAME_CLASS[ch.img] || "guest");
  showPortrait(ch, ln);
  typeText(ln.text);
}
function typeText(text) {
  const box = $("dialog"), t = $("dialog-text");
  box.classList.remove("done");
  clearInterval(typing);
  let i = 0;
  t.textContent = "";
  typing = setInterval(() => {
    i += 1;
    t.textContent = text.slice(0, i);
    if (i >= text.length) finishTyping(text);
  }, TYPE_MS);
  typingText = text;
}
function finishTyping(text) {
  clearInterval(typing);
  typing = null;
  $("dialog-text").textContent = text;
  $("dialog").classList.add("done");
}
function onStageTap() {
  if (!$("dialog").classList.contains("show")) return;
  if (typing) finishTyping(typingText);    // 1回目のタップは全文表示
  else nextLine();
}

function showPortrait(ch, ln) {
  // イベントCG（人物入り）のときは立ち絵を重ねない。漫符は名前札の横に出す
  FX.show(fxCtx(), { img: ch.img, faces: ch.faces, face: ln.face, fx: ln.fx, cg: isCG() });
}
function clearPortrait() {
  const ctx = fxCtx();
  FX.clear(ctx);
  ctx.box.classList.remove("show");
}

// ---------- 肢 ----------
function hidePanels() {
  $("panel-question").classList.remove("show");
  $("panel-explain").classList.remove("show");
}
function showQuestion() {
  const q = G.questions[currentBranch()];
  $("q-label").textContent = `${q.year} 問${q.q_no}　肢${q.branch}`;
  $("q-statement").textContent = q.statement;
  const fig = $("q-figure");
  if (q.figure) { fig.src = `img/web/figures/${q.figure}`; fig.classList.add("show"); }
  else { fig.removeAttribute("src"); fig.classList.remove("show"); }
  document.querySelectorAll(".answer").forEach((b) => { b.disabled = false; });
  $("panel-question").querySelector(".panel-body").scrollTop = 0;
  $("panel-question").classList.add("show");
}
function onAnswer(e) {
  const btn = e.target.closest(".answer");
  if (!btn || btn.disabled) return;
  document.querySelectorAll(".answer").forEach((b) => { b.disabled = true; });
  const id = currentBranch();
  const q = G.questions[id];
  const correct = (btn.dataset.answer === "true") === q.answer;

  // 記録：初回だけ経験値。last は直近の結果（復習モードで使う）
  const prev = save.answers[id];
  if (!prev) {
    const gain = correct ? EXP.correct : EXP.wrong;
    save.exp += gain;
    play.expGained += gain;
    save.answers[id] = { first: correct, last: correct, tries: 1 };
  } else {
    prev.last = correct;
    prev.tries += 1;
  }
  play.results[play.index] = correct;
  writeSave();

  $("panel-question").classList.remove("show");
  const s = G.stories[id];
  runLines(correct ? s.on_correct : s.on_wrong, () => showExplain(correct));
}

// ---------- 解説 ----------
function showExplain(correct) {
  const q = G.questions[currentBranch()];
  const v = $("ex-verdict");
  v.textContent = correct ? "正解！" : "不正解…";
  v.className = "verdict " + (correct ? "ok" : "ng");
  $("ex-answer").textContent = `この肢の答え：${q.answer ? "○" : "×"}`;
  $("ex-badge").classList.toggle("hide", !!q.explanation_checked);
  // 法改正で今の結論と変わりうる肢（出題時の答えのまま出し、注意を添える）
  $("ex-law-change").classList.toggle("hide", !q.law_change_note);
  $("ex-law-note").classList.toggle("hide", !q.law_change_note);
  $("ex-law-note").textContent = q.law_change_note ? `改正注意：${q.law_change_note}` : "";
  $("ex-text").textContent = q.explanation;
  $("panel-explain").querySelector(".panel-body").scrollTop = 0;
  $("panel-explain").classList.add("show");
}
function onExplainNext() {
  $("panel-explain").classList.remove("show");
  const s = G.stories[currentBranch()];
  runLines(s.outro, finishBranch);
}
function finishBranch() {
  play.index += 1;
  const cid = play.c.case_id;
  if (play.index < play.c.branches.length) {
    save.progress[cid] = { index: play.index, results: play.results, expGained: play.expGained };
    writeSave();
    startBranch();
    return;
  }
  delete save.progress[cid];
  showResult();
}

// ---------- 事件解決 ----------
function showResult() {
  const c = play.c, cid = c.case_id;
  const total = c.branches.length;
  const score = play.results.filter(Boolean).length;
  const before = currentRank();
  const ch = chapterOfCase(cid);
  const wasCleared = chapterCleared(ch);
  if (!save.solved[cid]) {
    save.exp += EXP.solve;
    play.expGained += EXP.solve;
    if (score === total) { save.exp += EXP.perfect; play.expGained += EXP.perfect; }
  }
  save.solved[cid] = { best: Math.max(score, (save.solved[cid] || {}).best || 0), total };
  writeSave();
  const after = currentRank();

  $("r-title").textContent = c.title;
  $("r-score").textContent = `${score} / ${total} 正解`;
  const marks = $("r-marks");
  marks.replaceChildren();
  c.branches.forEach((b, i) => marks.append(el("span", "dot " + (play.results[i] ? "ok" : "ng"), b.slice(-1))));
  $("r-exp").textContent = play.expGained ? `+${play.expGained}` : "+0（遊び直し）";
  $("r-total").textContent = String(save.exp);
  $("r-rank").textContent = before === after ? after : `${before} → ${after}（昇進！）`;
  $("r-next").textContent = nextRankText();
  // 章の全事件を解決した最初の1回は、章クリアの物語イベントへ進む
  pendingEvent = !wasCleared && chapterCleared(ch) && !save.events[ch.no] ? ch.no : null;
  $("btn-result-ok").textContent = pendingEvent ? `第${ch.no}章クリア！物語イベントへ` : "事件ファイルへ";
  if (pendingEvent) $("r-next").textContent = `第${ch.no}章の全事件を解決しました。節ごとの試験モードも開いています。`;
  const rate = Math.round((score / total) * 5);
  const comment = RESULT_COMMENT.find(([min]) => rate >= min)[1];
  $("r-comment").textContent = `ロビン「${comment}」`;
  show("screen-result");
}

// ---------- 起動 ----------
function bind() {
  $("btn-start").addEventListener("click", renderCases);
  $("btn-reset").addEventListener("click", onReset);
  $("btn-cases-back").addEventListener("click", renderTitle);
  $("btn-play-back").addEventListener("click", (e) => {
    e.stopPropagation();
    clearInterval(typing); typing = null;
    lineQueue = []; lineDone = null;
    renderCases();     // 途中の肢は保存しない（終えた肢までは保存済み）
  });
  $("stage").addEventListener("click", onStageTap);
  $("dialog").addEventListener("click", onStageTap);
  $("panel-question").addEventListener("click", onAnswer);
  $("btn-ex-next").addEventListener("click", onExplainNext);
  $("btn-result-ok").addEventListener("click", () => {
    if (pendingEvent) { const n = pendingEvent; pendingEvent = null; playEvent(n); }
    else renderCases();
  });
  $("btn-album").addEventListener("click", renderAlbum);
  $("btn-album-back").addEventListener("click", renderTitle);
  $("btn-exam-back").addEventListener("click", renderCases);
  $("exam-answers").addEventListener("click", onExamAnswer);
  $("btn-exam-retry").addEventListener("click", () => startExam(exam.sec));
  $("btn-exam-close").addEventListener("click", renderCases);
  $("viewer").addEventListener("click", () => $("viewer").classList.remove("show"));
  // 問題の図はタップで拡大（アルバムと同じ表示を使う）
  ["q-figure", "exam-figure"].forEach((id) => $(id).addEventListener("click", (e) => {
    e.stopPropagation();
    $("viewer-img").src = $(id).src;
    $("viewer").classList.add("show");
  }));
  window.addEventListener("resize", () => FX.fitBox(fxCtx()));
}

async function boot() {
  save = loadSave();
  bind();
  try {
    const res = await fetch("data/game.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status);
    G = await res.json();
  } catch (e) {
    $("loading").textContent = "データを読み込めませんでした。python -m http.server で開いてください。";
    return;
  }
  // 章の事件の一覧（節の順）を作り、肢の並び順をそろえる（念のため）
  G.chapters.forEach((ch) => {
    ch.cases = ch.sections.flatMap((s) => s.cases);
    ch.cases.forEach((c) =>
      c.branches.sort((a, b) => BRANCH_ORDER.indexOf(a.slice(-1)) - BRANCH_ORDER.indexOf(b.slice(-1))));
  });
  $("loading").classList.add("hide");
  renderTitle();
}

// ---------- 章クリアの物語イベント（data/events/<章番号>_clear.json） ----------
let pendingEvent = null;
function playEvent(no) {
  const ch = G.chapters.find((c) => c.no === no);
  // まだ台詞がない章は「準備中」の知らせだけ出す（物語の中身はアンチグラビティが書く）
  const ev = G.events[String(no)] || { title: "準備中", bg: "office",
    lines: [{ who: "お知らせ", face: "normal", text: `第${no}章「${ch.title}」の物語イベントは準備中です。` }] };
  save.events[no] = true;
  writeSave();
  play = null;
  show("screen-play");
  hidePanels();
  setBackground(ev.bg);
  $("play-title").textContent = `第${no}章クリア｜${ev.title}`;
  $("play-count").textContent = "";
  runLines(ev.lines, renderCases);
}

// ---------- 節ごとの試験モード ----------
// 台詞なし・節の全肢を通しで出題（シャッフル）・1問でも間違えたら終了・最高記録（連続正解数）を保存
let exam = null;
function examBranches(sec) { return sec.cases.flatMap((c) => c.branches); }
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function startExam(sec) {
  exam = { sec, list: shuffle(examBranches(sec).slice()), i: 0 };
  $("exam-title").textContent = `試験モード｜${sec.no} ${sec.title}`;
  $("exam-end").classList.remove("show");
  show("screen-exam");
  showExamQuestion();
}
function showExamQuestion() {
  const id = exam.list[exam.i];
  const q = G.questions[id];
  $("exam-count").textContent = `${exam.i + 1} / ${exam.list.length}`;
  const rec = save.exam[exam.sec.no];
  $("exam-streak").textContent = `連続正解 ${exam.i}　（最高記録 ${rec ? rec.best : 0}）`;
  $("exam-label").textContent = `${q.year} 問${q.q_no}　肢${q.branch}`;
  $("exam-statement").textContent = q.statement;
  const fig = $("exam-figure");
  if (q.figure) { fig.src = `img/web/figures/${q.figure}`; fig.classList.add("show"); }
  else { fig.removeAttribute("src"); fig.classList.remove("show"); }
  $("exam-q").scrollTop = 0;
  $("exam-q").classList.remove("ok");
  document.querySelectorAll("#exam-answers .answer").forEach((b) => { b.disabled = false; });
}
function onExamAnswer(e) {
  const btn = e.target.closest(".answer");
  if (!btn || btn.disabled || !exam) return;
  document.querySelectorAll("#exam-answers .answer").forEach((b) => { b.disabled = true; });
  const id = exam.list[exam.i];
  const q = G.questions[id];
  const correct = (btn.dataset.answer === "true") === q.answer;
  if (!correct) { endExam(false, id); return; }
  exam.i += 1;
  $("exam-q").classList.add("ok");                 // 正解の合図（緑に光る）
  setTimeout(() => (exam.i >= exam.list.length ? endExam(true) : showExamQuestion()), 450);
}
function endExam(passed, missedId) {
  const sec = exam.sec, ch = G.chapters.find((c) => c.sections.includes(sec));
  const rec = save.exam[sec.no] || { best: 0, passed: false, tries: 0 };
  const isBest = exam.i > rec.best;
  rec.best = Math.max(rec.best, exam.i);
  rec.tries += 1;
  let reward = false;
  if (passed) {
    rec.passed = true;
    rec.passed_on = rec.passed_on || today();
  }
  save.exam[sec.no] = rec;
  if (passed && !save.album[ch.no] && chapterAllPassed(ch)) { save.album[ch.no] = today(); reward = true; }
  writeSave();

  $("exam-end-verdict").textContent = passed ? "合格！" : "ここで終了";
  $("exam-end-verdict").className = "verdict " + (passed ? "ok" : "ng");
  const total = exam.list.length;
  const lines = [passed ? `全 ${total} 問を通しで正解しました。事件ファイルに「合格」の印が付きます。`
                        : `連続正解 ${exam.i} / ${total} 問${isBest ? "（最高記録を更新！）" : `（最高記録 ${rec.best} 問）`}`];
  if (reward) lines.push(`第${ch.no}章の全節に合格！ご褒美の一枚絵を手に入れました。タイトル画面の「アルバム」で見られます。`);
  $("exam-end-text").textContent = lines.join("\n");
  const miss = $("exam-end-miss");
  miss.classList.toggle("show", !passed);
  if (!passed) {
    const q = G.questions[missedId];
    $("exam-miss-label").textContent = `${q.year} 問${q.q_no}　肢${q.branch}　答え：${q.answer ? "○" : "×"}`;
    $("exam-miss-statement").textContent = q.statement;
    $("exam-miss-ex").textContent = q.explanation;
  }
  $("btn-exam-retry").textContent = passed ? "もう一度解く" : "最初からやり直す";
  $("exam-end").classList.add("show");
  $("exam-end").scrollTop = 0;
}

// ---------- アルバム（章のご褒美の一枚絵） ----------
function renderAlbum() {
  const list = $("album-list");
  list.replaceChildren();
  if (TEST) list.append(el("div", "test-note", "テスト用の記録で表示しています（?test=1）"));
  G.chapters.forEach((ch) => {
    const card = el("div", "album-card");
    card.append(el("h3", null, `第${ch.no}章　${ch.title}`));
    const got = save.album[ch.no];
    const src = G.rewards[String(ch.no)];
    if (got && src) {
      const img = el("img", "album-img");
      img.src = src;
      img.alt = `第${ch.no}章のご褒美の一枚絵`;
      img.addEventListener("click", () => { $("viewer-img").src = src; $("viewer").classList.add("show"); });
      const note = el("p", "album-note", `${got} に入手`);
      // 一枚絵のファイルがないとき（本人の写真を使った絵は GitHub に上げないため、公開版にはない）は「準備中」にする
      img.addEventListener("error", () => {
        img.replaceWith(el("div", "album-empty", "準備中"));
        note.textContent = `${got} に入手（絵は準備中です）`;
      });
      card.append(img);
      card.append(note);
    } else if (got) {
      card.append(el("div", "album-empty", "準備中"));
      card.append(el("p", "album-note", `${got} に入手（絵は準備中です）`));
    } else {
      card.append(el("div", "album-empty locked", "？"));
      const n = (TEST ? ch.sections.filter((s) => s.cases.length) : ch.sections).filter(sectionPassed).length;
      const all = (TEST ? ch.sections.filter((s) => s.cases.length) : ch.sections).length;
      card.append(el("p", "album-note", `第${ch.no}章の全節の試験モードに合格すると手に入ります（合格 ${n} / ${all} 節）`));
    }
    if (save.events[ch.no]) {
      const b = el("button", "btn ghost small", "章クリアの物語イベントをもう一度見る");
      b.addEventListener("click", () => playEvent(ch.no));
      card.append(b);
    }
    list.append(card);
  });
  show("screen-album");
}

boot();
