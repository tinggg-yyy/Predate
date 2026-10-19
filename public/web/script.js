const socket = io();

let ranking = [];
let currentIdx = 0;
let cycleTimer = null;

function getHoroscope(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d)) return "";
  const m = d.getMonth() + 1, day = d.getDate();
  if ((m === 12 && day >= 22) || (m === 1 && day <= 19))  return "摩羯座 / Capricorn";
  if ((m === 1 && day >= 20) || (m === 2 && day <= 18))   return "水瓶座 / Aquarius";
  if ((m === 2 && day >= 19) || (m === 3 && day <= 20))   return "双鱼座 / Pisces";
  if ((m === 3 && day >= 21) || (m === 4 && day <= 19))   return "白羊座 / Aries";
  if ((m === 4 && day >= 20) || (m === 5 && day <= 20))   return "金牛座 / Taurus";
  if ((m === 5 && day >= 21) || (m === 6 && day <= 21))   return "双子座 / Gemini";
  if ((m === 6 && day >= 22) || (m === 7 && day <= 22))   return "巨蟹座 / Cancer";
  if ((m === 7 && day >= 23) || (m === 8 && day <= 22))   return "狮子座 / Leo";
  if ((m === 8 && day >= 23) || (m === 9 && day <= 22))   return "处女座 / Virgo";
  if ((m === 9 && day >= 23) || (m === 10 && day <= 23))  return "天秤座 / Libra";
  if ((m === 10 && day >= 24) || (m === 11 && day <= 21)) return "天蝎座 / Scorpio";
  return "射手座 / Sagittarius";
}

// ── 像素 emoji ────────────────────────────────────────

function getPixelHeartUrl() {
  if (getPixelHeartUrl._cache) return getPixelHeartUrl._cache;
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
  getPixelHeartUrl._cache = c.toDataURL();
  return getPixelHeartUrl._cache;
}

function getPixelVomitUrl() {
  if (getPixelVomitUrl._cache) return getPixelVomitUrl._cache;
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
  getPixelVomitUrl._cache = c.toDataURL();
  return getPixelVomitUrl._cache;
}

// ── 加载并展示排行 ──────────────────────────────────────

async function loadRanking() {
  const res = await fetch("/profiles");
  const data = await res.json();

  const calcScore = (p) => Math.max(0, (p.score ?? 60) - (p.skips?.length || 0));

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

  const v = (val) => val || "—";

  // Chinese-only: strip everything after the first " / " or "/"
  const zh = (val) => {
    if (!val || val === "—") return val || "—";
    if (val.includes(" / ")) return val.split(" / ")[0].trim();
    if (val.includes("/")) return val.split("/")[0].trim();
    return val;
  };

  function displayTerritory(hukou) {
    if (!hukou) return "—";
    if (!hukou.includes(" · ")) return displayBilingual(hukou);
    const parts = hukou.split(" · ");
    const zh = parts.map(p => p.split(" / ")[0].trim()).join("  ");
    const en = parts.map(p => { const s = p.split(" / "); return s.length > 1 ? s[1].trim() : ""; }).filter(Boolean).join("  ");
    return en ? `${zh}<br><small>${en}</small>` : zh;
  }

  function displayBilingual(val) {
    if (!val) return "—";
    if (val.includes(" · ")) {
      const parts = val.split(" · ");
      const zh = parts.map(p => p.split(" / ")[0].trim()).join("  ");
      const en = parts.map(p => { const s = p.split(" / "); return s.length > 1 ? s.slice(1).join(" / ").trim() : ""; }).filter(Boolean).join("  ");
      return en ? `${zh}<br><small>${en}</small>` : zh;
    }
    if (val.includes("/")) {
      const idx = val.indexOf("/");
      const zh = val.substring(0, idx).trim();
      const en = val.substring(idx + 1).replace(/·/g, "  ").trim();
      if (zh.length + en.length > 14) return `${zh}<br><small>${en}</small>`;
      return `${zh} ${en}`;
    }
    return val;
  }

  const baseScore = p.score ?? 60;
  const skipCount = p.skips ? p.skips.length : 0;
  const displayScore = Math.max(0, baseScore - skipCount);
  const _sd = p.date ? new Date(p.date) : null;
  const stampDate = _sd
    ? `${_sd.getFullYear()}.${String(_sd.getMonth()+1).padStart(2,"0")}.${String(_sd.getDate()).padStart(2,"0")}`
    : "";
  const stampColorClass = displayScore < 60 ? "stamp-red" : "";

  const avatarHTML = p.grid
    ? `<img class="avatar" src="${renderGridAsAvatar(p.grid, p.gridText)}" alt="${p.name}" />`
    : `<div class="avatar-placeholder">${getEmoji(p.breed)}</div>`;

  function breedOnly(val) {
    if (!val) return null;
    const parts = val.split(" · ");
    const species = parts.length > 1 ? parts.slice(1).join(" · ") : parts[0];
    return displayBilingual(species);
  }

  function breedZhEn(val) {
    if (!val) return { zh: "", en: "" };
    const parts = val.split(" · ");
    const species = parts.length > 1 ? parts.slice(1).join(" · ") : parts[0];
    const segs = species.split(" / ");
    return { zh: segs[0].trim(), en: segs[1]?.trim() || "" };
  }

  const breedDisplay = p.mixed && p.breed2
    ? (() => {
        const a = breedZhEn(p.breed);
        const b = breedZhEn(p.breed2);
        const zh = `${a.zh} × ${b.zh}`;
        const en = [a.en, b.en].filter(Boolean).join(" × ");
        return en ? `${zh}<br><small>${en}</small>` : zh;
      })()
    : breedOnly(p.breed);

  const likesCount = p.likes?.length || 0;
  const skipsCount = p.skips?.length || 0;
  const heartImg = getPixelHeartUrl();
  const vomitImg = getPixelVomitUrl();
  const heartsHTML = likesCount === 0
    ? '<span class="stat-empty">—</span>'
    : Array(Math.min(likesCount, 60)).fill(`<img src="${heartImg}" class="pixel-emoji">`).join("");
  const skipsHTML = skipsCount === 0
    ? '<span class="stat-empty">—</span>'
    : Array(Math.min(skipsCount, 60)).fill(`<img src="${vomitImg}" class="pixel-emoji pixel-emoji-skip">`).join("");

  const rel = p.relationship || {};

  document.getElementById("spotlight").innerHTML = `
    <div class="s-rank-bar">
      <div class="s-rank">No.${idx + 1}</div>
    </div>

    <div class="profile-score-stamp ${stampColorClass}">
      <span class="stamp-date">${stampDate}</span>
      <span class="stamp-num">${displayScore}</span>
      <span class="stamp-lines"><span></span><span></span></span>
    </div>

    <div class="avatar-row">
      <div class="avatar-meta-left">
        <div class="avatar-name-display">${v(p.name)}</div>
        <div class="avatar-breed-display">${breedDisplay}</div>
      </div>
      <div class="avatar-wrap">
        ${avatarHTML}
      </div>
      <div class="avatar-stats-right">
        <div class="avatar-stats-likes">${heartsHTML}</div>
        <div class="avatar-stats-skips">${skipsHTML}</div>
      </div>
    </div>

    <div class="card">
      <div class="grid-3">
        <div class="cell" data-field="gender"><span class="label">性别<br><small>Gender</small></span><span class="value">${displayBilingual(p.gender)}</span></div>
        <div class="cell" data-field="age"><span class="label">年龄<br><small>Age</small></span><span class="value">${v(p.age)}</span></div>
        <div class="cell" data-field="height"><span class="label">身高<br><small>Height</small></span><span class="value">${v(p.height)}</span></div>
      </div>

      <div class="grid-2">
        <div class="cell" data-field="orientation"><span class="label">性取向<br><small>Orientation</small></span><span class="value">${displayBilingual(p.orientation)}</span></div>
        <div class="cell" data-field="sterilized"><span class="label">婚育状况<br><small>Status</small></span><span class="value">${displayBilingual(p.sterilized || rel.status)}</span></div>
      </div>

      <div class="grid-2">
        <div class="cell" data-field="mbti"><span class="label">MBTI</span><span class="value">${v(p.mbti)}</span></div>
        <div class="cell" data-field="horoscope"><span class="label">星座<br><small>Horoscope</small></span><span class="value">${displayBilingual(p.horoscope || getHoroscope(p.birth))}</span></div>
      </div>

      <div class="row-2x">
        <div class="section" data-field="hukou">
          <span class="label">领地 <small>Territory</small></span>
          <span class="value">${displayTerritory(p.hukou)}</span>
        </div>
        <div class="section" data-field="vehicle">
          <span class="label">车辆 <small>Vehicles</small></span>
          <span class="value">${displayBilingual([
            p.vehicle?.types?.length ? p.vehicle.types.join(' ') : null,
            p.vehicle?.model || null,
            p.vehicle?.count || null,
            p.vehicle?.price || null,
          ].filter(Boolean).join(' ') || '—')}</span>
        </div>
      </div>

      <div class="grid-3">
        <div class="cell cell-sm" data-field="edu"><span class="label">学历<br><small>Education</small></span><span class="value">${displayBilingual(p.edu)}</span></div>
        <div class="cell cell-sm" data-field="occupation"><span class="label">职业<br><small>Job</small></span><span class="value">${displayBilingual(p.occupation)}</span></div>
        <div class="cell cell-sm" data-field="income"><span class="label">月收入<br><small>Income</small></span><span class="value">${displayBilingual(p.income)}</span></div>
      </div>

      <div class="grid-2">
        <div class="cell cell-sm" data-field="datingPurpose"><span class="label">来这里的目的<br><small>Here For</small></span><span class="value">${displayBilingual(rel.datingPurpose)}</span></div>
        <div class="cell cell-sm" data-field="relationshipGoal"><span class="label">期望关系<br><small>Looking For</small></span><span class="value">${displayBilingual(rel.relationshipGoal)}</span></div>
      </div>

      <div class="grid-3">
        <div class="cell cell-sm" data-field="currentPartner"><span class="label">目前伴侣<br><small>Partner</small></span><span class="value">${displayBilingual(rel.currentPartner)}</span></div>
        <div class="cell cell-sm" data-field="partnerCount"><span class="label">伴侣数量<br><small># Partners</small></span><span class="value">${displayBilingual(rel.partnerCount)}</span></div>
        <div class="cell cell-sm" data-field="kids"><span class="label">子女<br><small>Kids</small></span><span class="value">${displayBilingual(rel.kids)}</span></div>
      </div>

      <div class="grid-3">
        <div class="cell cell-sm" data-field="crush"><span class="label">暗恋<br><small>Crush</small></span><span class="value">${displayBilingual(rel.crush)}</span></div>
        <div class="cell cell-sm" data-field="ambiguous"><span class="label">暧昧<br><small>Ambiguous</small></span><span class="value">${displayBilingual(rel.ambiguous)}</span></div>
        <div class="cell cell-sm" data-field="secretPartner"><span class="label">秘密伴侣<br><small>Secret</small></span><span class="value">${displayBilingual(rel.secretPartner)}</span></div>
      </div>

      <div class="grid-3">
        <div class="cell cell-sm" data-field="foreignPartner"><span class="label">境外伴侣<br><small>Foreign</small></span><span class="value">${displayBilingual(rel.foreignPartner)}</span></div>
        <div class="cell cell-sm" data-field="otherCityPartner"><span class="label">异地伴侣<br><small>Long Dist</small></span><span class="value">${displayBilingual(rel.otherCityPartner)}</span></div>
        <div class="cell cell-sm" data-field="whiteMoonlight"><span class="label">白月光<br><small>Moonlight</small></span><span class="value">${displayBilingual(rel.whiteMoonlight)}</span></div>
      </div>

      <div class="grid-3">
        <div class="cell cell-sm" data-field="pastRelCount"><span class="label">谈过<br><small>Past Rels</small></span><span class="value">${displayBilingual(rel.pastRelCount)}</span></div>
        <div class="cell cell-sm" data-field="exContact"><span class="label">前任联系<br><small>Ex Contact</small></span><span class="value">${displayBilingual(rel.exContact)}</span></div>
        <div class="cell cell-sm" data-field="stillLoveEx"><span class="label">还爱前任<br><small>Still Love Ex</small></span><span class="value">${displayBilingual(rel.stillLoveEx)}</span></div>
      </div>

      <div class="section" data-field="hobby">
        <span class="label">兴趣爱好 <small>Hobbies</small></span>
        <span class="value">${displayBilingual(v(p.hobby))}</span>
      </div>

      <div class="section" data-field="parents">
        <span class="label">家庭状况 <small>Family</small></span>
        <span class="value">${displayBilingual([
          p.parents?.status || null,
          p.parents?.relationship || null,
          p.parents?.fatherOrigin ? '父(Dad) ' + p.parents.fatherOrigin : null,
          p.parents?.motherOrigin ? '母(Mom) ' + p.parents.motherOrigin : null,
          (() => {
            const cnt = p.parents?.siblingCount;
            if (!cnt) return null;
            if (cnt === "独生/Only Child") return "独生 / Only Child";
            const wMap = {"经济困难":"Struggling","普通":"Average","小康":"Comfortable","富裕":"Wealthy","富裕✨":"Very Wealthy ✨"};
            const w = p.parents?.siblingWealth;
            const wEn = wMap[w] || "";
            const cntEn = cnt.split("/")[1] || "";
            return w ? `${cnt.split("/")[0]} / ${cntEn} · ${w} / ${wEn}` : `${cnt.split("/")[0]} / ${cntEn}`;
          })(),
        ].filter(Boolean).join(' · ') || '—')}</span>
      </div>

      ${p.standards ? `<div class="section" data-field="standards">
        <span class="label">择偶标准 <small>Looking For</small></span>
        <span class="value">${displayBilingual(p.standards)}</span>
      </div>` : ""}
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
      if (interp.agrees > 0) b.style.fontSize = 44 + interp.agrees * 10 + 'px';
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

// ── 30s 轮播 ──────────────────────────────────────────

function startCycle() {
  if (cycleTimer) clearInterval(cycleTimer);
  cycleTimer = setInterval(() => {
    const next = (currentIdx + 1) % ranking.length;
    showSpotlight(next);
  }, 30000);
}

const calcScore = (p) => Math.max(0, (p.score ?? 60) - (p.skips?.length || 0));

// Snapshot of counts from previous refresh, used to detect new activity
const _prevCounts = {}; // username -> { likes, skips, interps }

async function refreshRanking(thenShowUsername) {
  try {
    const res = await fetch("/profiles");
    const data = await res.json();

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
          spawnDanmaku(`有人对 ${fresh.name} 上头了 / Someone fell for "${fresh.name}"`, "like");
        }
        for (let i = 0; i < addedSkips; i++) {
          spawnDanmaku(`有人划走了 ${fresh.name} / Someone skipped "${fresh.name}"`, "skip");
        }
        if (addedInterps > 0) {
          spawnDanmaku(`${fresh.name} 的档案有新评价 / New comment on "${fresh.name}"`, "comment");
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
  bar.classList.remove("running");
  void bar.offsetWidth;
  bar.classList.add("running");
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
  // 婚恋 Status / 绝育
  "婚恋状态不符合预期 / relationship status mismatch",
  "绝育状况没达到预期 / sterilization status wasn't expected",
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
  "暗恋那栏有点在线 / crush section was a red flag",
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
  "好像见过面不太合拍 / vibe check failed",
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
const _COMMENT_TEMPLATES_ZH = [
  (a, b, tag, adj) => `「${a}」评论了「${b}」的[${tag}]标签：有点${adj}`,
  (a, b, tag, adj) => `「${a}」看了「${b}」的[${tag}]，觉得有点${adj}`,
  (a, b, tag, adj) => `「${a}」对「${b}」的[${tag}]留下印象：${adj}`,
  (a, b, tag, adj) => `「${a}」评价「${b}」的[${tag}]：确实有点${adj}`,
  (a, b, tag, adj) => `「${a}」看到「${b}」写了[${tag}]，评价说：${adj}`,
];
const _COMMENT_TEMPLATES_EN = [
  (a, b, tag, adj) => `"${a}" on "${b}"'s [${tag}]: kinda ${adj}`,
  (a, b, tag, adj) => `"${a}" saw [${tag}], thought: ${adj}`,
  (a, b, tag, adj) => `"${a}" was struck by "${b}"'s [${tag}]: ${adj}`,
  (a, b, tag, adj) => `"${a}" rates "${b}"'s [${tag}]: genuinely ${adj}`,
  (a, b, tag, adj) => `"${a}" read [${tag}] on "${b}"'s profile: ${adj}`,
];
const _LIKE_TEMPLATES_ZH = [
  (a, b, r) => `「${a}」喜欢了「${b}」  ${r}`,
  (a, b, r) => `「${a}」对「${b}」上头`,
  (a, b, r) => `「${a}」给「${b}」点了喜欢  ${r}`,
  (a, b, r) => `「${a}」→「${b}」✓  ${r}`,
  (a, b, r) => `「${a}」[心]「${b}」  ${r}`,
];
const _LIKE_TEMPLATES_EN = [
  (a, b, r) => `"${a}" liked "${b}"  ${r}`,
  (a, b, r) => `"${a}" fell for "${b}"`,
  (a, b, r) => `"${a}" liked "${b}"  ${r}`,
  (a, b, r) => `"${a}" chose "${b}"  ${r}`,
  (a, b, r) => `"${a}" hearts "${b}"  ${r}`,
];
const _SKIP_TEMPLATES_ZH = [
  (a, b, r) => `「${a}」跳过了「${b}」  ${r}`,
  (a, b, r) => `「${a}」划走了「${b}」  ${r}`,
  (a, b, r) => `「${a}」→「${b}」✗  ${r}`,
  (a, b, r) => `「${a}」跳过「${b}」  ${r}`,
  (a, b, r) => `「${a}」没有选择「${b}」  ${r}`,
];
const _SKIP_TEMPLATES_EN = [
  (a, b, r) => `"${a}" skipped "${b}"  ${r}`,
  (a, b, r) => `"${a}" swiped past "${b}"  ${r}`,
  (a, b, r) => `"${a}" passed on "${b}"  ${r}`,
  (a, b, r) => `"${a}" skipped "${b}"  ${r}`,
  (a, b, r) => `"${a}" didn't pick "${b}"  ${r}`,
];

function _bi(s) {
  const idx = s.indexOf(' / ');
  if (idx === -1) return { zh: s, en: s };
  return { zh: s.slice(0, idx).trim(), en: s.slice(idx + 3).trim() };
}

function _rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function _extractTags(p) {
  const tags = [];
  if (p.hobby) {
    p.hobby.split(/[,，、\s]+/).filter(Boolean).forEach((t) => tags.push(t.trim()));
  }
  if (p.mbti) tags.push(`MBTI ${p.mbti}`);
  if (p.breed) tags.push(p.breed.split(" · ").pop().split(" / ")[0].trim());
  if (p.occupation) tags.push(p.occupation);
  if (p.edu) tags.push(p.edu.split("/")[0].trim());
  return tags.filter((t) => t.length > 0 && t.length < 12);
}

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

      // like — one zh, one en
      const likeReason = _bi(_rnd(_LIKE_REASONS));
      const likeIdx = Math.floor(Math.random() * _LIKE_TEMPLATES_ZH.length);
      pool.push({ text: _LIKE_TEMPLATES_ZH[likeIdx](aName, bName, likeReason.zh), type: "like" });
      pool.push({ text: _LIKE_TEMPLATES_EN[likeIdx](aName, bName, likeReason.en), type: "like" });

      // skip — one zh, one en
      const skipReason = _bi(_rnd(_SKIP_REASONS));
      const skipIdx = Math.floor(Math.random() * _SKIP_TEMPLATES_ZH.length);
      pool.push({ text: _SKIP_TEMPLATES_ZH[skipIdx](aName, bName, skipReason.zh), type: "skip" });
      pool.push({ text: _SKIP_TEMPLATES_EN[skipIdx](aName, bName, skipReason.en), type: "skip" });

      // comment — one zh, one en
      const tags = _extractTags(b);
      if (tags.length > 0) {
        const tag = _rnd(tags);
        const adj = _bi(_rnd(_ADJ));
        const tplIdx = Math.floor(Math.random() * _COMMENT_TEMPLATES_ZH.length);
        pool.push({ text: _COMMENT_TEMPLATES_ZH[tplIdx](aName, bName, tag, adj.zh), type: "comment" });
        pool.push({ text: _COMMENT_TEMPLATES_EN[tplIdx](aName, bName, tag, adj.en), type: "comment" });
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

function _buildCondition(p) {
  const parts = [];
  if (p.mbti) parts.push(p.mbti);
  if (p.occupation) parts.push(p.occupation.split("/")[0].trim());
  if (p.height) parts.push(p.height);
  if (p.edu) parts.push(p.edu.split("/")[0].trim());
  if (p.breed) parts.push(p.breed.split(" · ").pop().split("/")[0].trim());
  const pick = parts.sort(() => Math.random() - 0.5).slice(0, 2);
  return pick.length ? pick.join("、") : "优质";
}

function generateTickerMessages(profiles) {
  const msgs = [];

  profiles.forEach((p) => {
    const name = p.name || p.username || "某兽";
    const score = Math.max(0, (p.score ?? 60) - (p.skips?.length || 0));
    const cond = _buildCondition(p);
    const seeking = _rnd(_AD_SEEKING);
    const suffix = _rnd(_AD_SUFFIX);
    const rel = p.relationship || {};

    msgs.push({
      text: `>> ${cond}的「${name}」正在寻觅${seeking}  ${suffix}`,
      type: "info",
    });

    if (p.hobby) {
      const hobbyTag = p.hobby.split(/[,，、\s]+/)[0];
      msgs.push({
        text: `${hobbyTag}的「${name}」在线求偶中 seeking connection`,
        type: "info",
      });
    }
    if (rel.datingPurpose) {
      msgs.push({
        text: ` 「${name}」来这里是为了：${rel.datingPurpose} Here for: ${rel.datingPurpose.split("/").slice(1).join("/").trim() || rel.datingPurpose}`,
        type: "info",
      });
    }
    if (p.likes && p.likes.length >= 5) {
      msgs.push({
        text: `「${name}」已收获 ${p.likes.length} 个心动 ${p.likes.length} admirers and counting`,
        type: "like",
      });
    }
    if (score >= 80) {
      msgs.push({
        text: `高分优质用户「${name}」评分 ${score}分 Premium profile Score: ${score}`,
        type: "alert",
      });
    }
    if (p.mixed && p.breed2) {
      msgs.push({
        text: `混血珍稀品种「${name}」${p.breed} x ${p.breed2} Mixed-heritage Rare find!`,
        type: "info",
      });
    }
    if (isNonMammal(p.breed)) {
      msgs.push({
        text: `非哺乳类稀有物种「${name}」寻缘中 Non-mammal rarity seeking their match`,
        type: "info",
      });
    }
    if (isNonStraight(p.orientation)) {
      msgs.push({
        text: `「${name}」${p.orientation}，寻觅同频的你 Seeking like-minded souls`,
        type: "info",
      });
    }
  });

  if (msgs.length === 0) {
    msgs.push({ text: "优质兽人正在加载中  Loading quality anthros  Please stand by", type: "neutral" });
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
    .map((m) => `<span class="ticker-item ticker-item-${m.type}">${m.text}</span>`)
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
  const zhReason = data.label && data.reason ? `  因为[${data.label}]觉得：${data.reason}` : "";
  const enReason = data.label && data.reason ? `  because [${data.label}]: ${data.reason}` : "";
  spawnDanmaku(`${data.by} 对 ${data.name} 上头了${zhReason}`, "like");
  spawnDanmaku(`"${data.by}" fell for "${data.name}"${enReason}`, "like");

  const profile = ranking.find((p) => p.name === data.name);
  if (data.likesCount !== undefined) {
    if (profile) {
      profile.likes = new Array(data.likesCount);
      if (ranking[currentIdx]?.name === data.name) {
        const box = document.querySelector(".avatar-stats-likes");
        if (box) {
          const h = getPixelHeartUrl();
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
    pushTickerMessage(`「${data.name}」累计收到 ${data.likesCount} 个喜欢  "${data.name}" has ${data.likesCount} likes and counting`, "like");
  }
});

socket.on("skip-event", (data) => {
  const zhReason = data.label && data.reason ? `  因为[${data.label}]：${data.reason}` : "";
  const enReason = data.label && data.reason ? `  [${data.label}]: ${data.reason}` : "";
  spawnDanmaku(`${data.by} 划走了 ${data.name}${zhReason}`, "skip");
  spawnDanmaku(`"${data.by}" skipped "${data.name}"${enReason}`, "skip");
});

socket.on("interpretation-event", (data) => {
  // Danmaku always fires regardless of which profile is on spotlight
  const targetIdx = ranking.findIndex(p => p.username === data.profileUsername);
  const targetProfile = targetIdx >= 0 ? ranking[targetIdx] : null;
  const tName = targetProfile?.name || data.profileUsername;
  spawnDanmaku(`${data.addedBy} 评价了 ${tName} 的[${data.field}]`, "comment");
  spawnDanmaku(`"${data.addedBy}" commented on "${tName}"'s [${data.field}]`, "comment");

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

  bubble.style.fontSize = 44 + data.agrees * 10 + 'px';
});

// ── 工具函数 ──────────────────────────────────────────

function getEmoji(breed) {
  if (!breed) return "?";
  const b = breed.toLowerCase();
  if (b.includes("dog") || b.includes("狗")) return "DOG";
  if (b.includes("cat") || b.includes("猫")) return "CAT";
  if (b.includes("rabbit") || b.includes("兔")) return "BUNNY";
  if (b.includes("fox") || b.includes("狐")) return "FOX";
  if (b.includes("wolf") || b.includes("狼")) return "WOLF";
  if (b.includes("bear") || b.includes("熊")) return "BEAR";
  if (b.includes("bird") || b.includes("鸟")) return "BIRD";
  if (b.includes("dragon") || b.includes("龙")) return "DRAGON";
  return breed.split(/[\s·\/]/)[0].slice(0, 6).toUpperCase();
}

// ── Grid 渲染 ─────────────────────────────────────────

const CELL_ALPHA_WEB = { 1: 0.25, 2: 0.49, 3: 0.75, 4: 1, "pixel": 1, "text": 1, "#": 1,
  "#1": 0.25, "#2": 0.49, "#3": 0.75, "#4": 1 };

function cellAlphaWeb(cell) {
  if (Array.isArray(cell)) return cell[1];
  return CELL_ALPHA_WEB[cell] ?? 1;
}

function renderGridAsAvatar(grid, gridText) {
  const canvas = document.createElement("canvas");
  const size = 840;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#a9b0a2";
  ctx.fillRect(0, 0, size, size);

  const cellSize = size / 32;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${cellSize}px monospace`;

  ctx.shadowColor = "rgba(40,56,24,0.60)";
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  ctx.shadowBlur = 0;

  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const cell = grid[y][x];
      if (cell === null || cell === "/") continue;

      if (Array.isArray(cell)) {
        ctx.fillStyle = `rgba(40,56,24,${cell[1]})`;
        ctx.fillText(cell[0], x * cellSize + cellSize / 2, y * cellSize + cellSize / 2);
      } else if (cell === "pixel") {
        ctx.fillStyle = "rgb(40, 56, 24)";
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      } else if (typeof cell === "string" && cell.startsWith("#")) {
        const alpha = CELL_ALPHA_WEB[cell] ?? 1;
        ctx.fillStyle = `rgba(40,56,24,${alpha})`;
        ctx.fillText(gridText || "", x * cellSize + cellSize / 2, y * cellSize + cellSize / 2);
      } else if (cell === "text") {
        ctx.fillStyle = "rgb(40, 56, 24)";
        ctx.fillText(gridText || "", x * cellSize + cellSize / 2, y * cellSize + cellSize / 2);
      } else if (typeof cell === "number") {
        const alpha = CELL_ALPHA_WEB[cell] ?? 1;
        ctx.fillStyle = `rgba(40,56,24,${alpha})`;
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      } else {
        ctx.fillStyle = "rgb(40, 56, 24)";
        ctx.fillText(cell, x * cellSize + cellSize / 2, y * cellSize + cellSize / 2);
      }
    }
  }

  return canvas.toDataURL();
}

// ── 启动 ─────────────────────────────────────────────

loadRanking();
