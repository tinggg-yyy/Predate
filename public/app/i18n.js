// ── 语言切换：中 / EN / 双语 ─────────────────────────────────
// app 里的文字本来都是双语写法：「中文 English」「中文 / English」「中文\nEnglish」。
// 这里不逐个改文字，而是自动把它们拆开，按当前语言只留一边：
//   - 页面上所有文字、placeholder / title / aria-label 都会处理
//   - 之后 JS 插进来的内容（弹窗、消息、标签……）由 MutationObserver 自动处理
//   - 写成 <span class="zh">…</span><span class="en">…</span> 的地方用 CSS 显示/隐藏
//   - 用户自己写的内容（名字、聊天、解读）放在 data-noi18n 里面，原样显示不拆
// 双语模式 = 原文不动。

const _LANG_KEY = "predate_lang";
const LANG_MODES = ["zh", "en", "both"];
let currentLang = "both";
try {
  const saved = localStorage.getItem(_LANG_KEY);
  if (LANG_MODES.includes(saved)) currentLang = saved;
} catch (_) {}
document.documentElement.dataset.lang = currentLang;

// 中文字符（含全角标点、「」）
const _CJK = /[　-〿㐀-鿿＀-￯]/;
const _LAT = /[A-Za-z]/;

// 把一段双语文字拆成 [中文, English]；拆不出来（只有一种语言）返回 null
function splitBi(s) {
  if (typeof s !== "string" || !_CJK.test(s) || !_LAT.test(s)) return null;

  // 1. 多行：「中文\nEnglish」，或者每一行各自是双语
  if (s.includes("\n")) {
    const lines = s.split("\n");
    const zh = lines.filter((l) => _CJK.test(l));
    const en = lines.filter((l) => l.trim() && !_CJK.test(l));
    if (zh.length && en.length) return [zh.join("\n"), en.join("\n")];
    const parts = lines.map((l) => splitBi(l) || [l, l]);
    return [parts.map((p) => p[0]).join("\n"), parts.map((p) => p[1]).join("\n")];
  }

  // 2. 用「 · 」连起来的好几对：「画画 / Drawing · 跑步 / Running」
  if (s.includes(" · ")) {
    const segs = s.split(" · ").map((x) => splitBi(x));
    if (segs.every(Boolean)) return [segs.map((p) => p[0]).join(" · "), segs.map((p) => p[1]).join(" · ")];
  }

  // 3. 斜杠：先找两边带空格的「 / 」，再找紧挨着的「/」；右边不能再有中文
  for (const re of [/\s\/\s/g, /\s?\/\s?/g]) {
    for (const m of s.matchAll(re)) {
      const left = s.slice(0, m.index);
      const right = s.slice(m.index + m[0].length);
      if (_CJK.test(left) && !_CJK.test(right) && _LAT.test(right)) return [left.trim(), right.trim()];
    }
  }

  // 4. 「中文 English」：最后一个中文字后面，隔着空格跟着英文
  let i = s.length - 1;
  while (i >= 0 && !_CJK.test(s[i])) i--;
  const rest = s.slice(i + 1);
  if (i >= 0 && /^\s/.test(rest) && _LAT.test(rest)) return [s.slice(0, i + 1).trim(), rest.trim()];
  return null;
}

// 按当前语言取一段双语文字里该显示的那部分
function pickLang(s, lang = currentLang) {
  if (lang === "both") return s;
  const p = splitBi(s);
  if (!p) return s;
  const lead = s.match(/^\s*/)[0];
  const tail = s.match(/\s*$/)[0];
  return lead + (lang === "zh" ? p[0] : p[1]) + tail;
}

// JS 里直接按语言给文字：L("确定", "OK")
function L(zh, en) {
  return currentLang === "zh" ? zh : currentLang === "en" ? en : `${zh} ${en}`;
}

// ── 自动处理页面上的文字 ──
const _origText = new WeakMap(); // 文字节点 → 原文（双语）
const _shownText = new WeakMap(); // 文字节点 → 我们改成的样子（用来认出是不是自己改的）
const _I18N_ATTRS = ["placeholder", "title", "aria-label"];

function _skip(el) {
  return !el || !!el.closest("[data-noi18n], script, style, textarea");
}

function _localizeText(node) {
  if (_skip(node.parentElement)) return;
  if (!_origText.has(node) || node.data !== _shownText.get(node)) _origText.set(node, node.data);
  const next = pickLang(_origText.get(node));
  _shownText.set(node, next);
  if (node.data !== next) node.data = next;
}

function _localizeAttrs(el) {
  if (_skip(el)) return;
  for (const a of _I18N_ATTRS) {
    if (!el.hasAttribute(a)) continue;
    const key = `i18n${a.replace(/-./g, (m) => m[1].toUpperCase())}`;
    const cur = el.getAttribute(a);
    if (el.dataset[key] === undefined || cur !== el.dataset[`${key}Shown`]) el.dataset[key] = cur;
    const next = pickLang(el.dataset[key]);
    el.dataset[`${key}Shown`] = next;
    if (cur !== next) el.setAttribute(a, next);
  }
}

function localizeTree(root) {
  if (!root) return;
  if (root.nodeType === 3) return _localizeText(root);
  if (root.nodeType !== 1) return;
  _localizeAttrs(root);
  root.querySelectorAll("[placeholder],[title],[aria-label]").forEach(_localizeAttrs);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) _localizeText(n);
}

const _i18nObserver = new MutationObserver((muts) => {
  for (const m of muts) {
    if (m.type === "childList") m.addedNodes.forEach(localizeTree);
    else if (m.type === "characterData") _localizeText(m.target);
    else if (m.type === "attributes") _localizeAttrs(m.target);
  }
});

function _startI18n() {
  localizeTree(document.body);
  _i18nObserver.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: _I18N_ATTRS,
  });
  _syncLangButtons();
}
if (document.body) _startI18n();
else document.addEventListener("DOMContentLoaded", _startI18n);

// ── 切换语言 ──
const _LANG_LABEL = { zh: "中", en: "EN", both: "中EN" };

function setLang(lang) {
  if (!LANG_MODES.includes(lang) || lang === currentLang) return;
  currentLang = lang;
  document.documentElement.dataset.lang = lang;
  document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
  try {
    localStorage.setItem(_LANG_KEY, lang);
  } catch (_) {}
  localizeTree(document.body);
  _syncLangButtons();
  document.dispatchEvent(new CustomEvent("langchange", { detail: lang }));
}

// 左下角按钮：中 → EN → 中EN → 中 …
function cycleLang() {
  setLang(LANG_MODES[(LANG_MODES.indexOf(currentLang) + 1) % LANG_MODES.length]);
}

function _syncLangButtons() {
  document.querySelectorAll(".lang-toggle").forEach((b) => {
    b.textContent = _LANG_LABEL[currentLang];
  });
  document.querySelectorAll("[data-lang-option]").forEach((b) => {
    b.classList.toggle("selected", b.dataset.langOption === currentLang);
  });
}

// 中英文分开写好的一句话 → HTML（各自转义）。用在句子里夹着用户名字的地方：
// 名字可能是中文，放进英文半句会让自动拆分认不出来，所以直接用 .zh / .en 标好，外层 data-noi18n
function biHtml(zh, en) {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<span data-noi18n><span class="zh">${esc(zh)}</span><span class="bi-sep"> / </span><span class="en">${esc(en)}</span></span>`;
}
