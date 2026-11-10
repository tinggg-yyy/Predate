const socket = io({ path: PREDATE_BASE + "/socket.io" });

let ranking = [];
let currentIdx = 0;
let cycleTimer = null;

// ── 像素 emoji（大屏用的大号版本；app 用 shared 里的小号 getPixelHeartUrl）──

function webHeartUrl() {
  if (webHeartUrl._cache) return webHeartUrl._cache;
  const pattern = [
    [0,1,1,0,1,1,0],
    [1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1],
    [0,1,1,1,1,1,0],
    [0,0,1,1,1,0,0],
    [0,0,0,1,0,0,0],
  ];
  const px = 20;
  const c = document.createElement("canvas");
  c.width = 7 * px; c.height = 6 * px;
  const ctx = c.getContext("2d");
  ctx.shadowColor = "rgba(40,48,35,0.75)";
  ctx.shadowOffsetX = 8;
  ctx.shadowOffsetY = 8;
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgb(40,48,35)";
  pattern.forEach((row, ry) => row.forEach((v, rx) => { if (v) ctx.fillRect(rx*px, ry*px, px, px); }));
  webHeartUrl._cache = c.toDataURL();
  return webHeartUrl._cache;
}

function webVomitUrl() {
  if (webVomitUrl._cache) return webVomitUrl._cache;
  const pattern = [
    [0,1,1,1,1,1,0],
    [1,0,1,0,1,0,1],
    [1,1,0,1,0,1,1],
    [1,1,1,1,1,1,1],
    [1,0,0,0,0,0,1],
    [0,1,1,1,1,1,0],
    [0,0,1,1,1,0,0],
    [0,1,1,1,1,1,0],
    [1,1,1,1,1,1,1],
  ];
  const px = 20;
  const c = document.createElement("canvas");
  c.width = 7 * px; c.height = 9 * px;
  const ctx = c.getContext("2d");
  ctx.shadowColor = "rgba(40,48,35,0.75)";
  ctx.shadowOffsetX = 8;
  ctx.shadowOffsetY = 8;
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgb(40,48,35)";
  pattern.forEach((row, ry) => row.forEach((v, rx) => { if (v) ctx.fillRect(rx*px, ry*px, px, px); }));
  webVomitUrl._cache = c.toDataURL();
  return webVomitUrl._cache;
}

// ── 加载并展示排行 ──────────────────────────────────────

// 完整档案缓存（username → 档案）。只在打开页面时下载一次全部档案，
// 之后每 10 秒只拉轻量的 /profiles/activity（like / skip / 印象 / 分数），新进前十的人再单独取完整档案
const _full = new Map();

async function loadRanking() {
  const res = await fetch(PREDATE_BASE + "/profiles");
  const data = await res.json();
  data.forEach((p) => _full.set(p.username, p));

  const calcScore = (p) => (p.score ?? 60) - (p.skips?.length || 0);

  ranking = data
    .filter((p) => p.name)
    .sort((a, b) => calcScore(b) - calcScore(a))
    .slice(0, 10);

  if (ranking.length === 0) return;

  showSpotlight(0);
  startCycle();
  const namedProfiles = data.filter((p) => p.name);
  initTicker(namedProfiles);
  startFakeDanmaku(namedProfiles);
}

function showSpotlight(idx) {
  currentIdx = idx;
  const p = ranking[idx];
  // 每一栏的内容和 app 档案卡一模一样：都来自 shared/card-data.js 的 cardValues
  // 大屏：整栏的内容都放在一行（一行中文 + 一行英文），不像 app 那样分排
  const c = cardValues(p, { perRow: Infinity });

  // 一栏的值：「中文 / English」拆成中文一行 + 英文一行（fmtBI 已经转义过用户输入）
  const val = (text) => `<span class="value">${fmtBI(text)}</span>`;
  const cell = (zh, en, field, text, extra = "") =>
    `<div class="cell ${extra}" data-field="${field}"><span class="label">${zh}${en ? `<br><small>${en}</small>` : ""}</span>${val(text)}</div>`;
  // 整栏（领地、车辆、爱好、家庭…）：全部放一行中文 + 一行英文
  const section = (zh, en, field, text) =>
    `<div class="section" data-field="${field}"><span class="label">${zh} <small>${en}</small></span>${val(String(text).replace(/\n/g, " · "))}</div>`;
  const row = (cells) => `<div class="grid-${cells.length}">${cells.join("")}</div>`;

  const stampColorClass = c.score < 60 ? "stamp-red" : "";
  const heartImg = webHeartUrl();
  const vomitImg = webVomitUrl();
  const pixels = (n, img, cls) =>
    n === 0 ? '<span class="stat-empty">—</span>' : Array(Math.min(n, 60)).fill(`<img src="${img}" class="${cls}">`).join("");

  document.getElementById("spotlight").innerHTML = `
    <div class="s-rank-bar">
      <div class="s-rank">No.${idx + 1}</div>
    </div>

    <div class="profile-score-stamp ${stampColorClass}">
      <span class="stamp-date">${c.stampDate}</span>
      <span class="stamp-num${String(c.score).length > 3 ? " stamp-num-long" : ""}">${c.score}</span>
      <span class="stamp-lines"><span></span><span></span></span>
    </div>

    <div class="avatar-row">
      <div class="avatar-meta-left">
        <div class="avatar-name-display">${escapeHtml(c.name || "—")}</div>
        <div class="avatar-breed-display">${fmtBI(c.breed)}</div>
      </div>
      <div class="avatar-wrap">
        <!-- 总资产等级写在头像上方 -->
        <div class="avatar-assets" data-field="assets">${escapeHtml(c.assets)}</div>
        <img class="avatar" src="${c.avatar}" alt="${escapeHtml(c.name || "")}" />
      </div>
      <div class="avatar-stats-right">
        <div class="avatar-stats-likes">${pixels(c.likes, heartImg, "pixel-emoji")}</div>
        <div class="avatar-stats-skips">${pixels(c.skips, vomitImg, "pixel-emoji pixel-emoji-skip")}</div>
      </div>
    </div>

    <div class="card">
      ${row([cell("性别", "Gender", "gender", c.gender), cell("年龄", "Age", "age", c.age), cell("身高", "Height", "height", c.height)])}
      ${row([cell("性取向", "Orientation", "orientation", c.orientation), cell("婚恋", "Status", "sterilized", c.status), ...(c.neutered ? [cell("绝育", "Sterilized", "neutered", c.neutered)] : [])])}
      ${c.ships ? section("其他关系", "Other Ships", "ships", c.ships) : ""}
      ${row([cell("MBTI", "", "mbti", c.mbti), cell("星座", "Horoscope", "horoscope", c.horoscope)])}

      ${section("领地", "Territory", "hukou", c.territory)}
      ${section("车辆", "Vehicles", "vehicle", c.vehicle)}

      ${row([cell("学历", "Education", "edu", c.edu, "cell-sm"), cell("职业", "Job", "occupation", c.occupation, "cell-sm"), cell("月收入", "Income", "income", c.income, "cell-sm")])}
      ${row([cell("目的", "Here For", "datingPurpose", c.datingPurpose, "cell-sm"), cell("期望关系", "Looking For", "relationshipGoal", c.relationshipGoal, "cell-sm")])}
      ${c.relRows.map((r) => row(r.map(([zh, en, key, text]) => cell(zh, en, key, text, "cell-sm")))).join("")}

      ${section("兴趣爱好", "Hobbies", "hobby", c.hobby)}
      ${section("家庭状况", "Family", "parents", c.family)}
      ${c.standards ? section("择偶标准", "Standards", "standards", c.standards) : ""}
    </div>
  `;

  // ── Inject interpretation bubbles into their specific cells ──────────
  const interps = p.interpretations || {};
  document.querySelectorAll('#spotlight [data-field]').forEach(el => {
    const field = el.dataset.field;
    const raw = interps[field];
    if (!raw) return;
    const list = Array.isArray(raw) ? raw : [raw];
    el.classList.add('has-web-bubbles');
    list.forEach((interp, i) => {
      if (!interp || !interp.text) return;
      const b = document.createElement('span');
      b.className = 'web-interp-bubble';
      b.dataset.interpIndex = i;
      b.textContent = interp.text;
      if (interp.agrees > 0) b.style.fontSize = 44 + Math.min(interp.agrees, 6) * 10 + 'px'; // 赞到 6 个就不再变大（和 app 一样）
      const n = list.length;
      const angle = (i / Math.max(n, 1)) * 2 * Math.PI;
      const ringR = Math.max(140, n * 70);
      const sx = Math.cos(angle) * ringR * 0.6 + (Math.random() - 0.5) * 20;
      const sy = Math.sin(angle) * ringR * 0.35 + (Math.random() - 0.5) * 12;
      const fAngle = angle + 0.25 * (Math.random() - 0.5);
      const fDist = Math.max(110, n * 55);
      const fx = Math.cos(fAngle) * fDist * 0.7;
      const fy = Math.sin(fAngle) * fDist * 0.38;
      const dx = (Math.random() - 0.5) * 28;
      const dy = (Math.random() - 0.5) * 18;
      b.style.setProperty('--sx', sx + 'px');
      b.style.setProperty('--sy', sy + 'px');
      b.style.setProperty('--fx', fx + 'px');
      b.style.setProperty('--fy', fy + 'px');
      b.style.setProperty('--dx', dx + 'px');
      b.style.setProperty('--dy', dy + 'px');
      b.style.animationDelay = `${i * 80}ms, ${900 + i * 80}ms`;
      el.appendChild(b);
    });
  });

  resetProgress();
}

// ── 轮播：每一名展示多久（底下的进度条也跟着这个时长走）──────────
const CYCLE_MS = 20000;

function startCycle() {
  if (cycleTimer) clearInterval(cycleTimer);
  cycleTimer = setInterval(() => {
    const next = (currentIdx + 1) % ranking.length;
    showSpotlight(next);
  }, CYCLE_MS);
}

const calcScore = (p) => (p.score ?? 60) - (p.skips?.length || 0);

// Snapshot of counts from previous refresh, used to detect new activity
const _prevCounts = {}; // username -> { likes, skips, interps }

async function refreshRanking(thenShowUsername) {
  try {
    const res = await fetch(PREDATE_BASE + "/profiles/activity");
    const activity = await res.json();

    // 新出现的人（比如刚注册）先取完整档案；已有的人把最新的 like / skip / 印象合进缓存
    await Promise.all(activity.filter((a) => !_full.has(a.username)).map(async (a) => {
      const r = await fetch(`${PREDATE_BASE}/profiles/${encodeURIComponent(a.username)}`);
      if (r.ok) _full.set(a.username, await r.json());
    }));
    activity.forEach((a) => {
      const p = _full.get(a.username);
      if (p) Object.assign(p, a);
    });
    _cardCache.clear(); // 档案内容可能变了，弹幕用的缓存重算
    const data = activity.map((a) => _full.get(a.username)).filter(Boolean);

    const newRanking = data
      .filter((p) => p.name)
      .sort((a, b) => calcScore(b) - calcScore(a))
      .slice(0, 10);

    // Detect changes vs previous snapshot → spawn danmaku as fallback
    newRanking.forEach(fresh => {
      const prev = _prevCounts[fresh.username];
      const newLikes = fresh.likes?.length || 0;
      const newSkips = fresh.skips?.length || 0;
      const newInterps = Object.values(fresh.interpretations || {}).reduce((s, a) => s + (Array.isArray(a) ? a.length : 1), 0);
      if (prev) {
        const addedLikes = newLikes - prev.likes;
        const addedSkips = newSkips - prev.skips;
        const addedInterps = newInterps - prev.interps;
        for (let i = 0; i < addedLikes; i++) {
          spawnDanmaku(`有人喜欢上了 ${fresh.name}`, "like");
          spawnDanmaku(`Someone liked ${fresh.name}`, "like");
        }
        for (let i = 0; i < addedSkips; i++) {
          spawnDanmaku(`有人划走了 ${fresh.name}`, "skip");
          spawnDanmaku(`Someone swiped past ${fresh.name}`, "skip");
        }
        if (addedInterps > 0) {
          spawnDanmaku(`有人评价了 ${fresh.name} 的档案`, "comment");
          spawnDanmaku(`Someone commented on ${fresh.name}'s profile`, "comment");
          // Also update in-memory interps for spotlight re-render
          const inRanking = ranking.find(p => p.username === fresh.username);
          if (inRanking) inRanking.interpretations = fresh.interpretations || {};
        }
        // Re-render spotlight if this is the currently shown profile and anything changed
        if (ranking[currentIdx]?.username === fresh.username && (addedLikes || addedSkips || addedInterps)) {
          _spotlightNeedsRedraw = true;
        }
      }
      _prevCounts[fresh.username] = { likes: newLikes, skips: newSkips, interps: newInterps };
    });

    const currentUsername = ranking[currentIdx]?.username;
    const newIdx = newRanking.findIndex(p => p.username === currentUsername);

    ranking.length = 0;
    newRanking.forEach(p => ranking.push(p));

    currentIdx = newIdx >= 0 ? newIdx : Math.min(currentIdx, ranking.length - 1);

    // Re-render the spotlight if data changed for the current profile
    if (_spotlightNeedsRedraw && !thenShowUsername) {
      _spotlightNeedsRedraw = false;
      showSpotlight(currentIdx);
    }

    // If a specific profile triggered this refresh, jump to it now
    if (thenShowUsername) {
      const jumpIdx = ranking.findIndex(p => p.username === thenShowUsername);
      if (jumpIdx >= 0) {
        showSpotlight(jumpIdx);
        startCycle();
      }
    }
  } catch (_) {}
}

let _spotlightNeedsRedraw = false;

// Re-rank every 10s — also serves as polling fallback when socket events are missed
setInterval(() => refreshRanking(), 10000);

function resetProgress() {
  const bar = document.getElementById("progressBar");
  bar.style.animationDuration = `${CYCLE_MS / 1000}s`;
  bar.classList.remove("running");
  void bar.offsetWidth;
  bar.classList.add("running");
}

// ── 弹幕文案：每条只用一种语言，写清楚「谁 → 谁 → 哪一栏是什么」 ─────────

// 档案上的每一栏：字段代号 → 中文名、英文名、cardValues 里对应的值
const _DM_FIELDS = {
  name: ["名字", "name", "name"],
  breed: ["物种", "species", "breed"],
  gender: ["性别", "gender", "gender"],
  age: ["年龄", "age", "age"],
  height: ["身高", "height", "height"],
  orientation: ["性取向", "orientation", "orientation"],
  sterilized: ["婚恋状态", "relationship status", "status"],
  neutered: ["绝育状况", "sterilization", "neutered"],
  ships: ["其他关系", "other ships", "ships"],
  mbti: ["MBTI", "MBTI", "mbti"],
  horoscope: ["星座", "star sign", "horoscope"],
  hukou: ["领地", "territory", "territory"],
  vehicle: ["车", "vehicle", "vehicle"],
  edu: ["学历", "education", "edu"],
  occupation: ["职业", "job", "occupation"],
  income: ["月收入", "income", "income"],
  assets: ["总资产", "total assets", "assets"],
  datingPurpose: ["交友目的", "dating purpose", "datingPurpose"],
  relationshipGoal: ["期望关系", "relationship goal", "relationshipGoal"],
  pastRelCount: ["谈过几段", "past relationships", null],
  exContact: ["和前任的联系", "ex contact", null],
  stillLoveEx: ["还爱不爱前任", "feelings for their ex", null],
  whiteMoonlight: ["白月光", "lost love", null],
  kids: ["子女", "kids", null],
  crush: ["暗恋", "crush", null],
  currentPartner: ["目前伴侣", "current partner", null],
  partnerCount: ["伴侣数量", "number of partners", null],
  ambiguous: ["暧昧对象", "situationships", null],
  secretPartner: ["秘密伴侣", "secret partner", null],
  foreignPartner: ["境外伴侣", "partner abroad", null],
  otherCityPartner: ["异地伴侣", "long-distance partner", null],
  hobby: ["爱好", "hobbies", "hobby"],
  parents: ["家庭状况", "family", "family"],
  standards: ["择偶标准", "standards", "standards"],
};
// app 里跳过理由的标签（「物种/Species」「车/Vehicle」…）取中文那半，对到字段代号
const _DM_LABEL_ALIAS = { 绝育: "neutered", 车: "vehicle", 领地: "hukou", 婚恋: "sterilized", 目的: "datingPurpose", 谈过: "pastRelCount", 前任联系: "exContact", 还爱前任: "stillLoveEx", 暧昧: "ambiguous", 境外伴侣: "foreignPartner", 异地伴侣: "otherCityPartner" };
function _dmFieldOfLabel(label) {
  const zh = String(label || "").split("/")[0].trim();
  if (_DM_LABEL_ALIAS[zh]) return _DM_LABEL_ALIAS[zh];
  return Object.keys(_DM_FIELDS).find((k) => _DM_FIELDS[k][0] === zh || k === zh.toLowerCase()) || null;
}

// 「中文 / English」格式的内容拆成纯中文、纯英文（多项最多取 3 项）
function _dmSplit(text) {
  const segs = String(text || "")
    .split(/\s*(?:\n|·)\s*/)
    .map((t) => t.trim())
    .filter(Boolean);
  const parts = segs.map((seg) => {
    const i = seg.search(/\s*\/\s*/);
    if (i < 0) return { zh: seg, en: seg };
    const m = seg.match(/^(.*?)\s*\/\s*(.*)$/);
    return { zh: m[1].trim(), en: m[2].trim() || m[1].trim() };
  });
  const more = parts.length > 3;
  const top = parts.slice(0, 3);
  return {
    zh: top.map((p) => p.zh).join("、") + (more ? "等" : ""),
    en: top.map((p) => p.en).join(", ") + (more ? ", etc." : ""),
  };
}

// cardValues 很贵（每次都会把像素头像画成 1024×1024 再 toDataURL，约 10ms），
// 弹幕要对每个人的每一栏反复查，所以按人缓存一份；档案换了对象或者 refreshRanking 合进新数据时清掉
const _cardCache = new Map();
function _cardOf(p) {
  let c = _cardCache.get(p.username);
  if (!c || c._src !== p) {
    c = cardValues(p, { perRow: Infinity });
    c._src = p;
    _cardCache.set(p.username, c);
  }
  return c;
}

// 某人某一栏现在填的内容（拆好中英）；查不到返回 null
function _dmValue(username, field) {
  const p = _full.get(username);
  const f = _DM_FIELDS[field];
  if (!p || !f) return null;
  const c = _cardOf(p);
  let v = f[2] ? c[f[2]] : c.relRows.flat().find((it) => it[2] === field)?.[3];
  if (!v || v === "—") return null;
  v = String(v);
  if (field === "age" && /^\d+$/.test(v)) return { zh: `${v}岁`, en: `${v} years old` };
  if (field === "height" && /^\d+$/.test(v)) return { zh: `${v}cm`, en: `${v}cm` };
  const out = _dmSplit(v);
  // 没有英文的内容（比如自定义城市名）：英文弹幕里不写内容，只说哪一栏
  if (_dmHasZh(out.en)) out.en = null;
  return out;
}

const _dmHasZh = (t) => /[\u3400-\u9fff]/.test(t);
// 用户自己写的一句话（理由、看法）只有一种语言：只放进同一种语言的弹幕，另一条就不写这句
// 也可以直接传 { zh, en }（假弹幕里中英都有）
function _dmUserText(t) {
  if (!t) return { zh: "", en: "" };
  if (typeof t === "object") return t;
  return _dmHasZh(t) ? { zh: t, en: "" } : { zh: "", en: t };
}

// 「小红 的MBTI是「ENFP」」/「小红's MBTI: "ENFP"」；查不到内容就只说哪一栏
function _dmAbout(name, username, field) {
  const f = _DM_FIELDS[field];
  if (!f) return null;
  const v = _dmValue(username, field);
  return {
    zh: v ? `${name} 的${f[0]}是「${v.zh}」` : `${name} 的${f[0]}`,
    en: v?.en ? `${name}'s ${f[1]} being "${v.en}"` : `${name}'s ${f[1]}`,
  };
}

// 喜欢 / 跳过 / 评价 → [中文一条, 英文一条]
function _dmLike(by, name, username, label, reason) {
  const field = _dmFieldOfLabel(label);
  if (field) {
    const a = _dmAbout(name, username, field);
    const why = _dmReason(reason);
    return [`${by} 很喜欢 ${a.zh}${why.zh}`, `${by} loves ${a.en}${why.en}`];
  }
  // 喜欢都是带开场白发的：reason 是「中文 / English」双语全文
  if (reason) {
    const o = _dmSplit(reason);
    return [
      _dmHasZh(o.zh) ? `${by} 喜欢上了 ${name}，开场白：「${o.zh}」` : `${by} 喜欢上了 ${name}`,
      _dmHasZh(o.en) ? `${by} liked ${name}` : `${by} liked ${name} and opened with "${o.en}"`,
    ];
  }
  return [`${by} 喜欢上了 ${name}`, `${by} liked ${name}`];
}
function _dmSkip(by, name, username, label, reason) {
  const field = _dmFieldOfLabel(label);
  const why = _dmReason(reason);
  if (field) {
    const a = _dmAbout(name, username, field);
    return [`${by} 不太喜欢 ${a.zh}，划走了${why.zh}`, `${by} swiped past ${name}, not into ${a.en.replace(`${name}'s`, "their")}${why.en}`];
  }
  return [`${by} 划走了 ${name}${why.zh}`, `${by} swiped past ${name}${why.en}`];
}
function _dmReason(reason) {
  const r = _dmUserText(reason);
  return { zh: r.zh ? `，理由：${r.zh}` : "", en: r.en ? `. Reason: ${r.en}` : "" };
}
function _dmComment(by, name, username, field, text) {
  const f = _DM_FIELDS[field];
  const v = f && field !== "name" ? _dmValue(username, field) : null;
  const t = _dmUserText(text);
  const zhWhat = f ? `${name} 的${f[0]}${v ? `「${v.zh}」` : ""}` : name;
  const enWhat = f ? `${name}'s ${f[1]}${v?.en ? ` "${v.en}"` : ""}` : name;
  return [
    t.zh ? `${by} 评价 ${zhWhat}：${t.zh}` : `${by} 评价了 ${zhWhat}`,
    t.en ? `${by} on ${enWhat}: ${t.en}` : `${by} commented on ${enWhat}`,
  ];
}

// ── 假弹幕生成系统 ────────────────────────────────────────

const _ADJ = [
  "香 / fire", "屑 / sus", "迷 / intriguing", "可以 / solid", "抽象 / abstract",
  "在线 / online", "离谱 / wild", "真实 / real", "猛 / bold", "怪 / odd",
  "稳 / steady", "炸 / explosive", "秀 / impressive", "可疑 / sketchy", "上头 / hooked",
  "危险 / dangerous", "哲学 / philosophical", "清醒 / self-aware", "迷惑 / confusing",
  "敢说 / outspoken", "挺好 / pretty good", "有趣 / interesting", "一般 / mid",
  "不行 / not it", "震撼 / stunning", "高级 / premium", "接地气 / relatable",
  "有点东西 / got something", "说不清楚 / hard to place", "耐人寻味 / thought-provoking",
  "确实如此 / fair point", "不明觉厉 / impressive somehow",
];
const _SKIP_REASONS = [
  // 物种 Species
  "物种匹配率太低 / species compatibility too low",
  "看到物种就知道不合适了 / species said it all",
  "混血加分不够 / mixed heritage bonus wasn't enough",
  // 性别 / 性取向 Gender & Orientation
  "性取向不符 / orientation mismatch",
  "性别那栏看了一眼跳过 / gender tab, instant skip",
  // 年龄 Age
  "年龄差太大 / age gap too wide",
  "年龄那栏让它犹豫了 / age section gave it pause",
  // 身高 Height
  "身高那栏直接划走了 / height column, immediate pass",
  "身高差距有点大 / height difference too much",
  // 婚恋 Status
  "婚恋状态不符合预期 / relationship status mismatch",
  "婚恋那栏让它犹豫了 / relationship status gave it pause",
  // 绝育 Sterilization
  "绝育状况没达到预期 / sterilization status wasn't what it hoped",
  "绝育那栏让它犹豫了 / sterilization status gave it pause",
  // MBTI
  "MBTI感觉不合 / MBTI clash",
  "MBTI看了直接跳过 / MBTI, instant skip",
  // 星座 Horoscope
  "星座不合 / horoscope incompatibility",
  "星座那栏让它三思了 / horoscope made it reconsider",
  // 领地 Territory
  "领地距离有点远 / territory too far",
  "领地那栏直接劝退 / territory section was a dealbreaker",
  // 车辆 Vehicle
  "车辆那栏没到预期 / vehicle section underwhelmed",
  "车的情况让它犹豫了 / car situation gave it pause",
  // 学历 Education
  "学历那栏让它犹豫了 / edu section gave it pause",
  "学历差距有点大 / education gap too wide",
  // 职业 Job
  "职业方向差太多 / careers too different",
  "职业那栏一眼划走 / job tab, quick swipe",
  // 月收入 Income
  "收入那栏看了一眼就划走了 / income tab said goodbye",
  "收入没达到预期 / income didn't meet expectations",
  // 目的 / 期望关系 Dating Purpose & Goal
  "来这里的目的不一样 / different reasons for being here",
  "期望关系对不上 / relationship goals don't align",
  "感觉双方目标不一样 / different life goals",
  // 目前伴侣 / 伴侣数量 Current Partner & Count
  "目前伴侣情况太复杂 / current partner situation too complex",
  "伴侣数量那栏让它沉默了 / partner count made it go quiet",
  // 子女 Kids
  "子女那栏直接劝退 / kids section was a dealbreaker",
  "对孩子的态度不一致 / different views on kids",
  // 暗恋 / 暧昧 Crush & Ambiguous
  "暗恋那栏亮了红灯 / crush section was a red flag",
  "暧昧对象太多了 / too many ambiguous relationships",
  // 秘密伴侣 Secret Partner
  "秘密伴侣那栏直接再见 / secret partner section, instant goodbye",
  // 境外 / 异地伴侣 Foreign & Long Distance
  "还有境外伴侣 / there's a foreign partner",
  "异地恋情太多了 / too many long-distance situations",
  // 白月光 White Moonlight
  "白月光那栏让它想太多了 / moonlight section stirred up thoughts",
  "白月光情况有点复杂 / moonlight situation too complicated",
  // 谈过 / 前任联系 Past Rels & Ex Contact
  "谈过那栏看了心里没底 / past rels section left it uncertain",
  "还在和前任联系 / still in contact with ex",
  "说还爱前任那一刻就划走了 / the moment it said still loves ex",
  // 兴趣爱好 Hobbies
  "爱好完全不重合 / zero hobby overlap",
  "兴趣爱好差距太大 / hobbies worlds apart",
  // 家庭状况 Family
  "家庭状况那栏让它犹豫了 / family section gave it pause",
  "兄弟姐妹太多了 / too many siblings",
  // 综合 General
  "看了五秒感觉不是很合适 / 5 seconds, no spark",
  "第一印象太普通了 / first impression too plain",
  "直觉告诉它不行 / gut said no",
  "感觉气场不太合 / vibe check failed",
  "感觉对方不太在线 / they seem offline",
  "综合考量了一下算了 / considered it all, still passing",
  "头像看起来不太对味 / avatar wasn't its type",
  "想了想还是跳过 / thought about it, still no",
  "无法解释 就是没感觉 / can't explain, just no feeling",
];
const _LIKE_REASONS = [
  "物种加分项 / species bonus", "MBTI很对味 / MBTI match", "爱好高度重合 / hobbies aligned",
  "领地离得近 / territory nearby", "学历让它心动了 / edu was a vibe",
  "职业很加分 / career is a plus", "收入让它眼前一亮 / income caught its eye",
  "头像看起来很顺眼 / avatar check passed", "综合评分太高了没忍住 / score too high to resist",
  "感觉气场相符 / energy matches", "看了三秒就决定了 / decided in 3 seconds",
  "直觉说可以 / gut said yes", "某个爱好标签戳到它了 / a hobby tag got it",
  "无法解释 就是感觉对 / can't explain, just feels right",
  "感觉对方很有品味 / they seem to have taste", "档案写得很真实 / profile felt genuine",
];
function _bi(s) {
  const idx = s.indexOf(' / ');
  if (idx === -1) return { zh: s, en: s };
  return { zh: s.slice(0, idx).trim(), en: s.slice(idx + 3).trim() };
}

function _rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// 假弹幕里拿来说事的栏目（短、而且每个人基本都填了）
const _DM_FAKE_FIELDS = ["breed", "mbti", "horoscope", "occupation", "edu", "income", "hobby", "orientation", "height", "age"];

function buildFakeDanmakuPool(profiles) {
  if (profiles.length < 2) return [];
  const pool = [];
  const names = profiles.map((p) => p.name || p.username);

  for (let i = 0; i < profiles.length; i++) {
    const a = profiles[i];
    const aName = a.name || a.username;

    // 每个人随机对几个他人生成 like / skip / comment
    const others = profiles.filter((_, j) => j !== i);
    const picks = others.sort(() => Math.random() - 0.5).slice(0, Math.min(4, others.length));

    picks.forEach((b) => {
      const bName = b.name || b.username;
      const push = (type, [zh, en]) => pool.push({ text: zh, type }, { text: en, type });
      // 有内容的栏目里随机挑一栏
      const fields = _DM_FAKE_FIELDS.filter((f) => _dmValue(b.username, f));
      const field = fields.length ? _rnd(fields) : null;

      // like：喜欢的理由
      const likeReason = _bi(_rnd(_LIKE_REASONS));
      push("like", [`${aName} 喜欢上了 ${bName}：${likeReason.zh}`, `${aName} liked ${bName}: ${likeReason.en}`]);

      // skip：一半说具体哪一栏，一半说理由
      if (field && Math.random() < 0.5) push("skip", _dmSkip(aName, bName, b.username, _DM_FIELDS[field][0], ""));
      else {
        const skipReason = _bi(_rnd(_SKIP_REASONS));
        push("skip", [`${aName} 划走了 ${bName}：${skipReason.zh}`, `${aName} swiped past ${bName}: ${skipReason.en}`]);
      }

      // comment：评价某一栏
      if (field) {
        const adj = _bi(_rnd(_ADJ));
        push("comment", _dmComment(aName, bName, b.username, field, { zh: `有点${adj.zh}`, en: `kinda ${adj.en}` }));
      }
    });
  }

  // Shuffle
  return pool.sort(() => Math.random() - 0.5);
}

let _fakeDanmakuPool = [];
let _fakeDanmakuIdx = 0;
let _fakeDanmakuTimer = null;

function startFakeDanmaku(profiles) {
  _fakeDanmakuPool = buildFakeDanmakuPool(profiles);
  if (_fakeDanmakuPool.length === 0) return;

  function fire() {
    if (_fakeDanmakuPool.length === 0) return;
    const item = _fakeDanmakuPool[_fakeDanmakuIdx % _fakeDanmakuPool.length];
    _fakeDanmakuIdx++;
    spawnDanmaku(item.text, item.type);
    // 每条随机间隔 1.8~4.5s
    _fakeDanmakuTimer = setTimeout(fire, 1800 + Math.random() * 2700);
  }

  // 延迟 1s 开始，避免页面加载时爆发
  _fakeDanmakuTimer = setTimeout(fire, 1000);
}

// ── 弹幕 ──────────────────────────────────────────────

function spawnDanmaku(text, type = "like") {
  const layer = document.getElementById("danmaku-layer");
  const el = document.createElement("div");
  el.className = `danmaku danmaku-${type}`;
  el.textContent = text;

  el.style.top = 10 + Math.random() * 75 + "%";
  layer.appendChild(el);

  el.addEventListener("animationend", () => el.remove());
}

// ── 新闻滚动条（ticker）────────────────────────────────

const NON_MAMMAL_KEYWORDS = ["鸟", "爬", "鱼", "虫", "节肢", "两栖", "蛇", "龙", "蜥", "蛙", "鳄", "乌龟", "蝎", "蜘蛛", "螃蟹", "鲨", "鲸"];
const NON_STRAIGHT_ORIENTATIONS = ["同性恋", "双性恋", "泛性恋", "无性恋", "无浪漫", "流性恋", "酷儿"];

function isNonMammal(breed) {
  if (!breed) return false;
  return NON_MAMMAL_KEYWORDS.some((k) => breed.includes(k));
}

function isNonStraight(orientation) {
  if (!orientation) return false;
  return NON_STRAIGHT_ORIENTATIONS.some((k) => orientation.includes(k));
}

const _AD_SEEKING = [
  "灵魂伴侣 / a soulmate",
  "真命天雄/天雌 / the one",
  "有缘人 / destiny's partner",
  "命中注定的TA / the destined one",
  "对的那个人 / the right one",
  "同频的另一半 / a kindred spirit",
  "心动的感觉 / that special feeling",
  "认真的缘分 / a serious connection",
];
const _AD_SUFFIX = [
  "走过路过不要错过！/ Don't miss out!",
  "缘分天注定，今晚就是你！/ Fate brought you here!",
  "机不可失，失不再来！/ Now or never!",
  "你的另一半也许就在这里！/ Your match awaits!",
  "错过TA，后悔一辈子！/ You'll regret missing this!",
  "今晚注定相遇！/ Tonight is the night!",
];

// 档案里的值「中文/English」「中文 / English」拆成两半（最后一个斜杠后面是英文）；拆不出来的两边都用原文。
// 只有中文的值（学历「本科」这种）先用 disp 补上英文，和档案卡显示的一样
function _tickBi(v) {
  const s = String(disp(String(v || "").trim()) || "").trim();
  const m = s.match(/^(.*[\u4e00-\u9fff].*?)\s*\/\s*([^\u4e00-\u9fff]+)$/);
  return m ? { zh: m[1].trim(), en: m[2].trim() } : { zh: s, en: s };
}

// 随机挑两个条件（MBTI、职业、身高、学历、物种），中英文各一份
function _buildCondition(p) {
  const parts = [];
  if (p.mbti) parts.push({ zh: p.mbti, en: p.mbti });
  if (p.occupation) parts.push(_tickBi(p.occupation));
  // 身高有的存成「160cm」，有的只有数字
  if (p.height) { const h = /^\d+$/.test(p.height) ? `${p.height}cm` : String(p.height); parts.push({ zh: h, en: h }); }
  if (p.edu) parts.push(_tickBi(p.edu));
  if (p.breed) parts.push(_tickBi(p.breed.split(" · ").pop()));
  const pick = parts.sort(() => Math.random() - 0.5).slice(0, 2);
  if (!pick.length) return { zh: "优质", en: "Premium" };
  return { zh: pick.map((x) => x.zh).join("、"), en: pick.map((x) => x.en).join(", ") };
}

// 每条字幕都是「完整的中文句子 / 完整的英文句子」
function generateTickerMessages(profiles) {
  const msgs = [];
  const push = (zh, en, type = "info") => msgs.push({ text: `${zh} / ${en}`, type });

  profiles.forEach((p) => {
    const name = p.name || p.username || "某兽";
    const enName = p.name || p.username || "Someone";
    const score = (p.score ?? 60) - (p.skips?.length || 0);
    const cond = _buildCondition(p);
    const seeking = _tickBi(_rnd(_AD_SEEKING));
    const suffix = _tickBi(_rnd(_AD_SUFFIX));
    const rel = p.relationship || {};

    push(`>> ${cond.zh}的「${name}」正在寻觅${seeking.zh}，${suffix.zh}`,
      `"${enName}" (${cond.en}) is looking for ${seeking.en}. ${suffix.en}`);

    if (p.hobby) {
      const h = _tickBi(p.hobby.split(/\s*·\s*/)[0]);
      // 老档案的爱好只存了中文：到爱好表里查英文
      if (h.en === h.zh) h.en = HOBBY_CATEGORIES.flatMap((c) => c.tags).find((t) => t.zh === h.zh)?.en || h.en;
      push(`爱${h.zh}的「${name}」在线求偶中`, `"${enName}", into ${h.en}, is seeking a connection`);
    }
    if (rel.datingPurpose) {
      const d = _tickBi(rel.datingPurpose);
      push(`「${name}」来这里是为了：${d.zh}`, `"${enName}" is here for: ${d.en}`);
    }
    if (p.likes && p.likes.length >= 5) {
      push(`「${name}」已收获 ${p.likes.length} 个心动`, `"${enName}" has ${p.likes.length} admirers and counting`, "like");
    }
    if (score >= 80) {
      push(`高分优质用户「${name}」评分 ${score} 分`, `Premium profile "${enName}", score: ${score}`, "alert");
    }
    if (p.mixed && p.breed2) {
      const b1 = _tickBi(p.breed.split(" · ").pop()), b2 = _tickBi(p.breed2.split(" · ").pop());
      push(`混血珍稀品种「${name}」：${b1.zh} × ${b2.zh}`, `Rare mixed heritage "${enName}": ${b1.en} × ${b2.en}`);
    }
    if (isNonMammal(p.breed)) {
      push(`非哺乳类稀有物种「${name}」寻缘中`, `Non-mammal rarity "${enName}" is seeking their match`);
    }
    if (isNonStraight(p.orientation)) {
      const o = _tickBi(p.orientation);
      push(`「${name}」${o.zh}，寻觅同频的你`, `"${enName}" (${o.en}) is seeking like-minded souls`);
    }
  });

  if (msgs.length === 0) {
    msgs.push({ text: "优质兽人正在加载中 / Loading quality anthros, please stand by", type: "neutral" });
  }

  return msgs.sort(() => Math.random() - 0.5);
}

function initTicker(profiles) {
  const msgs = generateTickerMessages(profiles);
  const track = document.getElementById("ticker-content");
  if (!track) return;

  // Duplicate for seamless loop
  const full = [...msgs, ...msgs];
  track.innerHTML = full
    .map((m) => `<span class="ticker-item ticker-item-${m.type}">${escapeHtml(m.text)}</span>`)
    .join('<span class="ticker-sep">  </span>');

  // Calculate scroll duration based on content length
  const totalChars = full.reduce((s, m) => s + m.text.length, 0);
  const duration = Math.max(15, totalChars * 0.18);
  track.style.animationDuration = `${duration}s`;
}

function pushTickerMessage(text, type = "alert") {
  const track = document.getElementById("ticker-content");
  if (!track) return;
  const span = document.createElement("span");
  span.className = `ticker-item ticker-item-${type}`;
  span.textContent = text;
  const sep = document.createElement("span");
  sep.className = "ticker-sep";
  sep.textContent = "  ";
  track.prepend(sep);
  track.prepend(span);
}

// ── Socket.io 实时事件 ─────────────────────────────────

socket.on("like-event", (data) => {
  _dmLike(data.by, data.name, data.username, data.label, data.reason).forEach((t) => spawnDanmaku(t, "like"));

  const profile = ranking.find((p) => p.name === data.name);
  if (data.likesCount !== undefined) {
    if (profile) {
      profile.likes = new Array(data.likesCount);
      if (ranking[currentIdx]?.name === data.name) {
        const box = document.querySelector(".avatar-stats-likes");
        if (box) {
          const h = webHeartUrl();
          box.innerHTML = data.likesCount === 0
            ? '<span class="stat-empty">—</span>'
            : Array(Math.min(data.likesCount, 60)).fill(`<img src="${h}" class="pixel-emoji">`).join("");
        }
      }
    } else {
      // Profile not in ranking yet — re-rank immediately so it can enter top 10
      refreshRanking();
    }
  }

  if (data.likesCount && data.likesCount % 5 === 0) {
    pushTickerMessage(`「${data.name}」累计收到 ${data.likesCount} 个喜欢 / "${data.name}" has ${data.likesCount} likes and counting`, "like");
  }
});

socket.on("skip-event", (data) => {
  _dmSkip(data.by, data.name, data.username, data.label, data.reason).forEach((t) => spawnDanmaku(t, "skip"));
});

socket.on("interpretation-event", (data) => {
  // Danmaku always fires regardless of which profile is on spotlight
  const targetIdx = ranking.findIndex(p => p.username === data.profileUsername);
  const targetProfile = targetIdx >= 0 ? ranking[targetIdx] : null;
  const tName = targetProfile?.name || _full.get(data.profileUsername)?.name || data.profileUsername;
  _dmComment(data.addedBy, tName, data.profileUsername, data.field, data.text).forEach((t) => spawnDanmaku(t, "comment"));

  if (!targetProfile) {
    // Profile not in ranking yet — re-rank immediately, then jump to it
    refreshRanking(data.profileUsername);
    return;
  }

  // Save interpretation into the ranking data
  if (!targetProfile.interpretations) targetProfile.interpretations = {};
  if (!Array.isArray(targetProfile.interpretations[data.field])) {
    targetProfile.interpretations[data.field] = targetProfile.interpretations[data.field]
      ? [targetProfile.interpretations[data.field]]
      : [];
  }
  targetProfile.interpretations[data.field].push({ text: data.text, addedBy: data.addedBy });

  // If the target profile isn't on spotlight, jump to it — showSpotlight re-renders
  // all bubbles from the updated interpretations data, so we're done.
  if (currentIdx !== targetIdx) {
    showSpotlight(targetIdx);
    startCycle();
    return;
  }

  // Profile is already on spotlight — inject the new bubble directly
  const el = document.querySelector(`#spotlight [data-field="${data.field}"]`);
  if (!el) return;

  const existingBubbles = el.querySelectorAll('.web-interp-bubble');
  const i = existingBubbles.length;
  const n = i + 1;

  el.classList.add('has-web-bubbles');

  const b = document.createElement('span');
  b.className = 'web-interp-bubble';
  b.dataset.interpIndex = i;
  b.textContent = data.text;

  const angle = (i / Math.max(n, 1)) * 2 * Math.PI;
  const ringR = Math.max(140, n * 70);
  const sx = Math.cos(angle) * ringR * 0.6 + (Math.random() - 0.5) * 20;
  const sy = Math.sin(angle) * ringR * 0.35 + (Math.random() - 0.5) * 12;
  const fAngle = angle + 0.25 * (Math.random() - 0.5);
  const fDist = Math.max(110, n * 55);
  const fx = Math.cos(fAngle) * fDist * 0.7;
  const fy = Math.sin(fAngle) * fDist * 0.38;
  const dx = (Math.random() - 0.5) * 28;
  const dy = (Math.random() - 0.5) * 18;
  b.style.setProperty('--sx', sx + 'px');
  b.style.setProperty('--sy', sy + 'px');
  b.style.setProperty('--fx', fx + 'px');
  b.style.setProperty('--fy', fy + 'px');
  b.style.setProperty('--dx', dx + 'px');
  b.style.setProperty('--dy', dy + 'px');
  el.appendChild(b);
});

socket.on("interpretation-agree-event", (data) => {
  const current = ranking[currentIdx];
  if (!current || current.username !== data.profileUsername) return;

  const el = document.querySelector(`#spotlight [data-field="${data.field}"]`);
  if (!el) return;

  const bubble = el.querySelector(`.web-interp-bubble[data-interp-index="${data.interpIndex}"]`);
  if (!bubble) return;

  bubble.style.fontSize = 44 + Math.min(data.agrees, 6) * 10 + 'px';
});

// ── 启动 ─────────────────────────────────────────────

loadRanking();
