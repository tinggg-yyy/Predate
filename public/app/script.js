let currentUser = null;

// ── 登录状态：服务器发的令牌存在浏览器里，下次打开自动登录（不存密码）──
const _SESSION_KEY = "predate_session";
let _authToken = null;
try {
  _authToken = JSON.parse(localStorage.getItem(_SESSION_KEY) || "null")?.token || null;
} catch (_) {}

function _saveSession(token) {
  _authToken = token;
  try {
    localStorage.setItem(_SESSION_KEY, JSON.stringify({ token }));
  } catch (_) {}
}
function _clearSession() {
  _authToken = null;
  try {
    localStorage.removeItem(_SESSION_KEY);
  } catch (_) {}
}

// 教学的状态（教学代码在后面，这里先声明：api() 一加载就会被调用，要用到它）
let _tut = { active: false, step: null, agrees: 0, raf: 0 };

// 所有请求都走这里：自动带上令牌。令牌失效（401）时提示重新登录
let _authExpiredShown = false;
function api(url, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (_authToken) headers.Authorization = `Bearer ${_authToken}`;
  const fake = _tutFakeResponse(url, opts);
  if (fake) return fake;
  return fetch(url.startsWith("/") ? PREDATE_BASE + url : url, { ...opts, headers }).then((res) => {
    if (res.status === 401 && !/^\/(login|me)\b/.test(url) && currentUser && !_authExpiredShown) {
      _authExpiredShown = true;
      _clearSession();
      showAlert("登录已过期，请重新登录\nYour session expired, please log in again.");
      goTo("login");
    }
    return res;
  });
}

// 登录 / 注册成功：令牌存起来，其余是自己的档案
function _acceptLogin(data) {
  const { token, ...profile } = data;
  if (token) _saveSession(token);
  _authExpiredShown = false;
  currentUser = profile;
}

// 临时：测试新教学用，老用户登录后也先走一遍教学。测完改回 false
const _TUT_EVERY_LOGIN = true;

// 登录后进入浏览页（老用户跳过教学）
function _enterAfterLogin() {
  checkNotifications();
  startMessagePolling();
  createSwipeCard({ skipOnboarding: !_TUT_EVERY_LOGIN });
}

// 打开 app 时：浏览器记着令牌就直接登录
function _tryAutoLogin() {
  if (!_authToken) return;
  api("/me")
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (!data) return _clearSession();
      _acceptLogin(data);
      _enterAfterLogin();
    })
    .catch(() => {});
}

// 登出：令牌作废，回到开始页（语言、配色这些本机设置保留）
function logout() {
  api("/logout", { method: "POST" })
    .catch(() => {})
    .finally(() => {
      _clearSession();
      location.reload();
    });
}

// ── 真实屏幕高度 ──
// iOS 主屏幕模式 + 透明状态栏时，innerHeight / 100dvh 会少一个刘海高度，
// 所以 standalone 下直接用屏幕高度，写进 CSS 变量 --app-h
function _setAppHeight() {
  const standalone =
    window.navigator.standalone ||
    window.matchMedia("(display-mode: standalone)").matches;
  const landscape = window.innerWidth > window.innerHeight;
  const screenH = landscape
    ? Math.min(screen.width, screen.height)
    : Math.max(screen.width, screen.height);
  const h = standalone ? Math.max(screenH, window.innerHeight) : window.innerHeight;
  document.documentElement.style.setProperty("--app-h", h + "px");

  // 刘海高度：env(safe-area-inset-top) 在部分 iOS 主屏幕模式下读出来是 0，
  // 这时用「屏幕高度 - innerHeight」（正好是被少算的状态栏高度）兜底
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;top:0;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none;";
  document.documentElement.appendChild(probe);
  const envTop = probe.getBoundingClientRect().height;
  probe.remove();
  const gap = standalone ? Math.max(0, screenH - window.innerHeight) : 0;
  let safeTop = Math.max(envTop, landscape ? 0 : gap);
  // 两种都读不到时，按 iPhone 屏幕尺寸查状态栏高度
  if (!safeTop && standalone && !landscape) {
    const w = Math.min(screen.width, screen.height);
    const table = {
      "375x812": 44, "414x896": 48, "390x844": 47, "428x926": 47,
      "393x852": 59, "430x932": 59, "402x874": 62, "440x956": 62,
    };
    safeTop = table[`${w}x${screenH}`] || 0;
  }
  // 取 4 的倍数（格子间距 4px），刘海区和各层背景的格子才能严丝合缝对齐
  safeTop = Math.ceil(safeTop / 4) * 4;
  document.documentElement.style.setProperty("--safe-top", safeTop + "px");
}
_setAppHeight();
window.addEventListener("resize", _setAppHeight);

// ── 自定义标签：不能有标点符号 ──
// 只保留文字（中英文等）、数字和空格；标点、符号、表情都去掉
function _stripPunct(str) {
  return String(str ?? "").replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s{2,}/g, " ");
}

const _NO_PUNCT_INPUT_IDS = [
  "orientation-custom",
  "gender-custom",
  // 城市的自定义输入是 buildCitySelectors 动态生成的，在那里单独接上过滤
  "hobby-custom-input",
  // 种族每一级的自定义输入（主物种 + 混血第二物种）
  ...["", "2"].flatMap((s) =>
    ["petBreedClass", "petBreedSubgroup", "petBreedSubSubgroup", "petBreed"].map(
      (b) => `${b}${s}-custom`,
    ),
  ),
];
// 给输入框接上「打字时去掉标点」
function _attachNoPunct(input) {
  if (!input) return;
  const clean = () => {
    const v = _stripPunct(input.value);
    if (v !== input.value) input.value = v;
  };
  // 中文输入法拼字过程中（isComposing）不处理，选完字再过滤
  input.addEventListener("input", (e) => {
    if (!e.isComposing) clean();
  });
  input.addEventListener("compositionend", clean);
}
_NO_PUNCT_INPUT_IDS.forEach((id) => _attachNoPunct(document.getElementById(id)));
window.addEventListener("orientationchange", _setAppHeight);

// ── Socket.io real-time notifications (optional — won't crash if io missing) ──
function _refreshMyProfileCard() {
  const overlay = document.getElementById("profile-edit");
  const myCard = document.getElementById("my-profile-card-body");
  if (!myCard || overlay?.classList.contains("hidden")) return;
  myCard.innerHTML = renderCardHTML(currentUser);
  attachSectionDragScroll(myCard);
  currentProfileInterpretations = currentUser.interpretations || {};
  attachLabelHandlers(currentUser.username, myCard);
}

if (typeof io !== "undefined") {
  const _appSocket = io({ path: PREDATE_BASE + "/socket.io" });
  _appSocket.on("like-event", (data) => {
    if (!currentUser) return;
    if (data.username !== currentUser.username) return;
    currentUser.likes = new Array(data.likesCount);
    _showLikeBanner(data.likesCount);
    _refreshMyProfileCard();
  });
  _appSocket.on("skip-event", (data) => {
    if (!currentUser) return;
    if (data.username !== currentUser.username) return;
    currentUser.skips = new Array(data.skipsCount);
    _refreshMyProfileCard();
  });
}

// 密码框右侧的小眼睛：切换密码明文 / 隐藏
function togglePasswordVisible() {
  const input = document.getElementById("password");
  const btn = document.getElementById("pw-toggle");
  if (!input || !btn) return;
  const show = input.type === "password";
  input.type = show ? "text" : "password";
  btn.innerHTML = iconImg(show ? "pw_eye" : "pw_eye_closed", 2);
  btn.setAttribute("aria-label", show ? "隐藏密码 Hide password" : "显示密码 Show password");
}
// 页面加载完（图标数据已定义）后画上初始的眼睛图标
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("pw-toggle");
  if (btn) btn.innerHTML = iconImg("pw_eye_closed", 2);
});

// Login Function
function handleLogin() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!username) return showAlert("请输入用户名！\nPlease enter a username.");
  if (!password) return showAlert("请输入密码！\nPlease enter a password.");

  // 账号密码交给服务器比对，别人的密码不会发到手机上
  api("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  })
    .then((res) => res.json().then((data) => ({ status: res.status, data })))
    .then(({ status, data }) => {
      if (status === 200) {
        // 老用户 → 直接进入 swipe（跳过教学）
        _acceptLogin(data);
        _enterAfterLogin();
      } else if (status === 401) {
        // username 存在但密码错
        showAlert("密码错误 / Wrong password");
      } else if (status === 404) {
        // 新用户 → 走注册流程
        goTo("profile-name");
      } else {
        showAlert("登录失败，请稍后再试\nLogin failed, please try again.");
      }
    })
    .catch(() => showAlert("连接服务器失败，请稍后再试\nCannot reach server, please try again."));
}

// Page Navigation Function
const _setupPageOrder = [
  "profile-name",
  "profile-breed",
  "profile-gender",
  "profile-housing",
  "profile-vehicle",
  "profile-sterilized",
  "profile-intent",
  "profile-parents",
  "profile-mbti",
  "profile-edu",
  "profile-hobbies",
  "profile-standards",
  "profile-photo",
];
let _currentScore = 100;

function goTo(id) {
  const current = document.querySelector(".page.active")?.id;
  const currentIdx = _setupPageOrder.indexOf(current);
  const newIdx = _setupPageOrder.indexOf(id);

  if (newIdx > currentIdx && currentIdx >= 0) {
    const newTotal = getTotalProfileScore();
    const delta = newTotal - _currentScore;
    _currentScore = newTotal;
    if (delta !== 0) showScoreDelta(delta);
    const badge = document.getElementById("score-running-badge");
    if (badge) {
      badge.style.display = "block";
      badge.textContent = `SCORE: ${_currentScore}`;
    }
  }

  document.querySelectorAll(".page").forEach((p) => {
    p.classList.remove("active");
  });
  const target = document.getElementById(id);
  if (target) {
    target.classList.add("active");
    target.querySelectorAll(".dice-roll-btn").forEach((btn) => {
      if (!btn.innerHTML.trim()) btn.innerHTML = diceFaceImg(6, 4);
    });
  } else {
    console.error(`Element with id "${id}" not found.`);
  }
}

// ── Custom alert (replaces native alert()) ───────────────────
function showAlert(msg) {
  document.getElementById("custom-alert-msg").textContent = msg;
  document.getElementById("custom-alert-overlay").classList.remove("hidden");
}
function closeCustomAlert() {
  document.getElementById("custom-alert-overlay").classList.add("hidden");
}

// ── Per-page validation ──────────────────────────────────────
// Returns true if valid, calls showAlert and returns false if not.
function validatePage(pageId) {
  switch (pageId) {

    case "profile-name": {
      const name = (document.getElementById("petName")?.value || "").trim();
      if (!name) { showAlert("请填写你的名字！\nPlease enter your name."); return false; }
      return true;
    }

    case "profile-breed": {
      // 每一级（大类/细类/子类/物种）只要显示出来就必须选；选了自定义就必须填
      const checkBreedLevels = (s, prefixZh, prefixEn) => {
        const ids = _breedIds(s);
        const levels = [
          [ids.cls, null, "种族大类", "species class"],
          [ids.sg, ids.sgWrap, "细类", "subgroup"],
          [ids.ssg, ids.ssgWrap, "子类", "sub-group"],
          [ids.sp, ids.spWrap, "具体物种", "species"],
        ];
        for (const [selId, wrapId, zh, en] of levels) {
          if (wrapId && document.getElementById(wrapId)?.classList.contains("hidden")) continue;
          if (!_breedSel(selId)) {
            const isCustom = document.getElementById(selId)?.value === _BREED_CUSTOM;
            showAlert(isCustom
              ? `请填写自定义的${prefixZh}${zh}！\nPlease enter your custom ${prefixEn}${en}.`
              : `请选择${prefixZh}${zh}！\nPlease select ${prefixEn}${en}.`);
            return false;
          }
        }
        return true;
      };
      if (!checkBreedLevels("", "", "a ")) return false;
      const isMixed = document.getElementById("isMixed")?.checked;
      if (isMixed && !checkBreedLevels("2", "第二族裔", "the 2nd heritage ")) return false;
      const heightWrapper = document.getElementById("heightWrapper");
      if (heightWrapper && !heightWrapper.classList.contains("hidden")) {
        if (!document.getElementById("petHeight")?.value) {
          showAlert("请选择身高！\nPlease select your height."); return false;
        }
      }
      return true;
    }

    case "profile-gender": {
      const dp = document.getElementById("datePicker");
      if (dp && !dp.classList.contains("hidden")) {
        showAlert('请先点击"确定 OK"确认出生日期！\nPlease confirm your birth date first.'); return false;
      }
      if (!document.getElementById("birthDisplay")?.value) {
        showAlert("请选择出生日期！\nPlease select your birth date."); return false;
      }
      if (!document.getElementById("petGender")?.value) {
        showAlert("请选择性别！\nPlease select your gender."); return false;
      }
      if (document.getElementById("petGender").value === "自定义/Custom" &&
          !_stripPunct(document.getElementById("gender-custom")?.value).trim()) {
        showAlert("请填写自定义性别！\nPlease enter your custom gender."); return false;
      }
      if (!document.getElementById("petOrientation")?.value) {
        showAlert("请选择性取向！\nPlease select your orientation."); return false;
      }
      if (document.getElementById("petOrientation").value === "自定义/Custom" &&
          !_stripPunct(document.getElementById("orientation-custom")?.value).trim()) {
        showAlert("请填写自定义性取向！\nPlease enter your custom orientation."); return false;
      }
      return true;
    }

    case "profile-housing": {
      if (!getHousingCityValue("house")) {
        showAlert("请选择城市！\nPlease select a city."); return false;
      }
      // 按页面顺序，提示第一个还没摇的（包括别墅层数、楼层、产权、房贷这些只在特定情况出现的）
      const missing = _updateHouseSteps();
      if (missing) {
        showAlert(`请摇骰子选择「${missing.label}」！\nPlease roll the dice for "${missing.labelEn}" first.`); return false;
      }
      return true;
    }

    case "profile-vehicle": {
      if (!document.getElementById("vehicle-types-hidden")?.value) {
        showAlert("请摇骰子选择车辆类型！\nPlease roll for vehicle type."); return false;
      }
      if (/^(普通车|豪车)/.test(_val("vehicle-types-hidden")) && !_val("vehicle-model")) {
        showAlert("请摇骰子选择车辆品牌！\nPlease roll for car brand."); return false;
      }
      if (!_val("vehicle-count")) {
        showAlert("请摇骰子选择车辆数量！\nPlease roll for vehicle count."); return false;
      }
      if (!document.getElementById("vehicle-price")?.value) {
        showAlert("请摇骰子选择车辆价值！\nPlease roll for vehicle price."); return false;
      }
      return true;
    }

    case "profile-sterilized": {
      if (!document.getElementById("petSterilized")?.value) {
        showAlert("请选择婚恋状况！\nPlease select your relationship status."); return false;
      }
      // 按页面顺序找第一个还没摇的
      const missing = _updateRelSteps();
      if (missing) {
        showAlert(`请摇骰子选择「${missing.label}」！\nPlease roll the dice for "${missing.labelEn}" first.`); return false;
      }
      return true;
    }

    case "profile-intent": {
      if (!document.getElementById("rel-purpose")?.value) {
        showAlert("请摇骰子选择来这里的目的！\nPlease roll for dating purpose."); return false;
      }
      if (!document.getElementById("rel-goal")?.value) {
        showAlert("请摇骰子选择期望关系！\nPlease roll for relationship goal."); return false;
      }
      return true;
    }

    case "profile-parents": {
      const parentsStatus = document.getElementById("parents-status")?.value;
      if (!parentsStatus) {
        showAlert("请摇骰子选择父母状况！\nPlease roll for parents status."); return false;
      }
      const fatherAlive = parentsStatus === "都健在" || parentsStatus === "仅父亲健在";
      const motherAlive = parentsStatus === "都健在" || parentsStatus === "仅母亲健在";
      if (fatherAlive && !getHousingCityValue("parents-father")) {
        showAlert("请选择父亲来自哪里！\nPlease select your father's origin."); return false;
      }
      if (motherAlive && !getHousingCityValue("parents-mother")) {
        showAlert("请选择母亲来自哪里！\nPlease select your mother's origin."); return false;
      }
      const shown = (id) => !document.getElementById(id)?.classList.contains("hidden");
      if (shown("parents-rel-wrapper") && !_val("parents-relationship")) {
        showAlert("请摇骰子选择父母关系！\nPlease roll for parents' relationship."); return false;
      }
      if (!_val("parents-siblingCount")) {
        showAlert("请摇骰子选择兄弟姐妹！\nPlease roll for siblings."); return false;
      }
      if (shown("siblings-wealth-wrapper") && !_val("parents-siblingWealth")) {
        showAlert("请摇骰子选择兄弟姐妹状况！\nPlease roll for siblings' wealth."); return false;
      }
      return true;
    }

    case "profile-mbti": {
      const m = ["petMbti1","petMbti2","petMbti3","petMbti4"].map(id => document.getElementById(id)?.value || "");
      if (m.some(v => !v)) {
        showAlert("请完整填写 MBTI 四位！\nPlease fill in all 4 MBTI characters."); return false;
      }
      return true;
    }

    case "profile-edu": {
      if (!document.getElementById("petEdu")?.value) {
        showAlert("请摇骰子选择学历！\nPlease roll for education."); return false;
      }
      if (!document.getElementById("petOccupation")?.value) {
        showAlert("请摇骰子选择职业！\nPlease roll for occupation."); return false;
      }
      if (!document.getElementById("petIncome")?.value) {
        showAlert("请摇骰子选择月收入！\nPlease roll for income."); return false;
      }
      return true;
    }

    case "profile-hobbies": {
      const count = document.querySelectorAll("#hobby-tags .hobby-tag.selected").length;
      if (count < 1) {
        showAlert("请至少选择 1 个兴趣爱好！\nPlease select at least 1 hobby."); return false;
      }
      if (count > 5) {
        showAlert("兴趣爱好最多选 5 个！\nMax 5 hobbies."); return false;
      }
      return true;
    }

    case "profile-photo": {
      const word = (document.getElementById("text-input")?.value || "").trim();
      if (!word) {
        showAlert("给自己一个字/词形容一下自己！\nGive yourself one word that is you."); return false;
      }
      return true;
    }
  }
  return true;
}

function validateAndGoTo(fromPage, toPage) {
  if (validatePage(fromPage)) goTo(toPage);
}

function validateAndCreateCard() {
  // 正在保存时忽略重复点击，防止同一份档案被提交多次
  if (_pendingProfileSave) return;
  if (validatePage("profile-photo")) createCard();
}

// ── 城市发展程度加减分（房子所在城市）──
// 中国：按通行的城市分级（一线 / 新一线 / 二线 / 其他地级市 / 偏远自治州·地区·盟）
// 国外：按国家发展水平（大致参照世界银行收入分组）定基础分；全球一线城市、各国首都和最大城市另外加分
// 自定义城市 / 自定义国家：不加不减（0）
const CITY_DEV_CN = {
  10: ["北京", "上海", "广州", "深圳", "香港"],
  6: ["澳门", "台北"],
  5: ["成都", "杭州", "重庆", "武汉", "苏州", "西安", "南京", "长沙", "天津", "郑州", "东莞", "青岛", "昆明", "宁波", "合肥"],
  2: ["佛山", "沈阳", "无锡", "济南", "厦门", "福州", "温州", "哈尔滨", "石家庄", "大连", "南宁", "泉州", "金华", "贵阳",
      "常州", "长春", "南昌", "南通", "嘉兴", "徐州", "惠州", "太原", "台州", "绍兴", "保定", "中山", "潍坊", "临沂",
      "珠海", "烟台", "兰州", "乌鲁木齐", "呼和浩特", "海口", "三亚", "新北", "台中", "高雄", "桃园", "台南", "新竹"],
};
const CITY_DEV_CN_DEFAULT = -3; // 其他地级市（三四五线）
const CITY_DEV_CN_REMOTE = -6; // 自治州、地区、盟、林区
// 国家发展水平：A 发达/高收入 +3，B 中高收入 -2，C 中低收入 -6（没列出的默认 C），D 低收入 -10
const COUNTRY_DEV_TIER = {
  A: ["日本", "韩国", "新加坡", "以色列", "阿联酋", "卡塔尔", "科威特", "巴林", "沙特阿拉伯", "文莱", "阿曼", "塞浦路斯",
      "英国", "德国", "法国", "意大利", "西班牙", "爱尔兰", "葡萄牙", "荷兰", "比利时", "卢森堡", "瑞士", "奥地利",
      "列支敦士登", "摩纳哥", "安道尔", "圣马力诺", "梵蒂冈", "马耳他", "丹麦", "瑞典", "挪威", "芬兰", "冰岛",
      "爱沙尼亚", "拉脱维亚", "立陶宛", "波兰", "捷克", "斯洛伐克", "匈牙利", "斯洛文尼亚", "克罗地亚", "希腊", "罗马尼亚",
      "美国", "加拿大", "巴哈马", "巴巴多斯", "特立尼达和多巴哥", "圣基茨和尼维斯", "安提瓜和巴布达", "巴拿马",
      "智利", "乌拉圭", "圭亚那", "澳大利亚", "新西兰", "帕劳", "瑙鲁", "塞舌尔"],
  B: ["俄罗斯", "土耳其", "马来西亚", "泰国", "印度尼西亚", "哈萨克斯坦", "土库曼斯坦", "格鲁吉亚", "亚美尼亚", "阿塞拜疆",
      "伊拉克", "约旦", "马尔代夫", "保加利亚", "塞尔维亚", "黑山", "北马其顿", "阿尔巴尼亚", "波黑", "白俄罗斯", "摩尔多瓦",
      "乌克兰", "墨西哥", "巴西", "阿根廷", "哥伦比亚", "秘鲁", "厄瓜多尔", "巴拉圭", "委内瑞拉", "哥斯达黎加", "多米尼加",
      "古巴", "牙买加", "伯利兹", "危地马拉", "萨尔瓦多", "格林纳达", "圣卢西亚", "圣文森特和格林纳丁斯", "多米尼克",
      "苏里南", "南非", "博茨瓦纳", "纳米比亚", "加蓬", "赤道几内亚", "毛里求斯", "利比亚", "阿尔及利亚",
      "斐济", "汤加", "萨摩亚", "图瓦卢", "马绍尔群岛"],
  D: ["阿富汗", "朝鲜", "也门", "叙利亚", "索马里", "南苏丹", "苏丹", "埃塞俄比亚", "厄立特里亚", "乌干达", "卢旺达",
      "布隆迪", "刚果民主共和国", "中非", "乍得", "尼日尔", "马里", "布基纳法索", "几内亚", "几内亚比绍", "塞拉利昂",
      "利比里亚", "冈比亚", "多哥", "马达加斯加", "马拉维", "莫桑比克", "海地"],
};
const COUNTRY_DEV_BASE = { A: 3, B: -2, C: -6, D: -10 };
// 全球一线城市：+8（摩纳哥 +10）
const CITY_DEV_GLOBAL = {
  美国: ["纽约", "洛杉矶", "旧金山", "芝加哥", "波士顿", "西雅图", "华盛顿", "圣何塞", "帕洛阿尔托", "迈阿密"],
  加拿大: ["多伦多", "温哥华", "蒙特利尔"], 英国: ["伦敦"], 法国: ["巴黎"], 德国: ["柏林", "慕尼黑", "法兰克福", "汉堡"],
  日本: ["东京", "大阪", "京都", "横滨"], 韩国: ["首尔"], 新加坡: ["新加坡"], 澳大利亚: ["悉尼", "墨尔本"],
  瑞士: ["苏黎世", "日内瓦"], 阿联酋: ["迪拜", "阿布扎比"], 荷兰: ["阿姆斯特丹"], 意大利: ["米兰", "罗马"],
  西班牙: ["马德里", "巴塞罗那"], 瑞典: ["斯德哥尔摩"], 丹麦: ["哥本哈根"], 奥地利: ["维也纳"], 卢森堡: ["卢森堡"],
  爱尔兰: ["都柏林"], 挪威: ["奥斯陆"], 卡塔尔: ["多哈"], 以色列: ["特拉维夫"], 新西兰: ["奥克兰"],
};
const CITY_DEV_MONACO = 10;
// 有省/州这一层的国家：首都和最大城市单独列出（同样在国家基础分上 +4）
const CITY_DEV_MAJOR = {
  俄罗斯: ["莫斯科", "圣彼得堡"], 巴西: ["圣保罗", "里约热内卢", "巴西利亚"], 墨西哥: ["墨西哥城", "蒙特雷", "瓜达拉哈拉"],
  印度: ["孟买", "新德里", "班加罗尔"],
};

// prefix：house（房子所在城市）/ parents-father / parents-mother（父母籍贯）
function getCityScore(prefix = "house") {
  const city = getHousingCityValue(prefix);
  if (!city) return 0;
  const country = getHousingCountry(prefix);
  if (!country || country === "其他") return 0; // 自定义国家/城市（包括别人自定义后加进「其他」里的）：不加不减
  const custom = document.getElementById(`${prefix}-city-custom`);
  if (custom && !custom.classList.contains("hidden")) return 0;

  if (country === "中国") {
    for (const [score, list] of Object.entries(CITY_DEV_CN)) if (list.includes(city)) return Number(score);
    if (/自治州|地区|盟|林区/.test(city)) return CITY_DEV_CN_REMOTE;
    return CITY_DEV_CN_DEFAULT;
  }
  if (country === "摩纳哥") return CITY_DEV_MONACO;
  if (CITY_DEV_GLOBAL[country]?.includes(city)) return 8;

  const tier = Object.keys(COUNTRY_DEV_TIER).find((t) => COUNTRY_DEV_TIER[t].includes(country)) || "C";
  const base = COUNTRY_DEV_BASE[tier];
  // 首都 / 最大城市（城市列表里的第一个）：在国家基础分上 +4
  const citySel = document.getElementById(`${prefix}-city-select`);
  const firstCity = citySel?.options[1]?.value;
  const hasDivision = !document.getElementById(`${prefix}-division-wrap`)?.classList.contains("hidden");
  if (CITY_DEV_MAJOR[country]?.includes(city) || (!hasDivision && city === firstCity)) return base + 4;
  return base;
}

// ── 新加项目的加减分：婚恋经历、交友意向、父母关系/籍贯、房子细节、车辆数量、身高、星座、择偶标准 ──
// 同一个值（比如「有/Yes」「0」）在不同问题里分数不同，所以按问题分开写
const FIELD_SCORES = {
  // 和前任联系
  "rel-exContact": {
    "完全断联/No Contact": +3, "偶尔联系/Occasional": 0, "还是朋友/Still Friends": -2,
    "暧昧未清/Unresolved": -5, "藕断丝连/On & Off": -8,
  },
  // 还爱前任
  "rel-stillLoveEx": {
    "完全放下/Moved On": +3, "不确定/Not Sure": -2, "有一点/A Little": -3, "还爱/Still Love": -6, "深爱/Still Deeply": -10,
  },
  // 白月光
  "rel-whiteMoon": { "没有/None": +2, "可能有/Maybe": -2, "有/Yes": -4, "一直有/Always": -6 },
  // 暗恋
  "rel-crush": { "没有/None": 0, "可能/Maybe": -1, "有/Yes": -3, "暗恋中/Secretly": -3, "强烈迷恋/Intensely": -6 },
  // 来 App 的原因
  "rel-purpose": {
    "想认真恋爱/Looking for Love": +5, "探索一下/Just Exploring": 0, "被朋友安利/Friend's Rec": 0,
    "好玩/Just for Fun": -1, "打发时间/Killing Time": -1, "孤独/Lonely": -2, "刚分手/Just Broke Up": -3,
    "炮友/FWB": -5, "一夜情/ONS": -6, "三人行/Threesome": -8, "和伴侣吵架了/Fight w/ Partner": -10,
  },
  // 想发展的关系
  "rel-goal": {
    "严肃恋爱/Serious Relationship": +5, "结婚对象/Marriage": +5, "雌雄伴侣 / Dating": +3, "灵魂伴侣/Soulmate": +3, "柏拉图/Platonic": +2,
    "结交朋友/Make Friends": +1, "饭搭子/Food Buddy": +1, "搭子/Buddy": 0,
    "随缘/Whatever": -2, "网恋/Online Romance": -2, "短期交友/Short-term Fling": -2, "唇友/Kissing Friend": -3,
    "床搭子/Bed Buddy": -4, "长期固炮/Regular FWB": -5, "长期炮友/Long-term FWB": -5,
  },
  // 父母关系
  "parents-relationship": {
    "离婚/Divorced": -5, "冷战/Cold War": -3, "普通/Ordinary": 0, "和睦/Harmonious": +2, "恩爱/Loving": +3,
    "神仙眷侣/Perfect Couple ✨": +5,
  },
  // 房子：区域
  "house-district": {
    郊区: -4, 老城区: -1, 新区: 0, 学区: +2, 科技园区: +2, 市中心: +3, 滨水区: +3, CBD: +5, 豪华住宅区: +8,
  },
  // 别墅层数
  "house-villa-floors": { "1层独栋": 0, "2层别墅": +1, "3层别墅": +2, "4层及以上": +4 },
  // 住在第几层
  "house-apt-floor": { "1-5层": -2, "6-10层": 0, "11-20层": +1, "21-30层": +1, "31-40层": +2, "40层以上": +3 },
  // 一共几层（老破小扣分）
  "house-apt-total": { "6层以下": -2, "10层": 0, "18层": 0, "28层": 0, "35层": 0, "50层以上": +2 },
  // 车辆数量
  "vehicle-count": { "1": 0, "2": +2, "3": +3, "4+": +5 },
  // 性别：非二元、自定义扣分
  "petGender": { "雄/Male": 0, "雌/Female": 0, "非二元/Non-binary": -4, "自定义/Custom": -5 },
  // 车辆类型：豪车加分，越寒酸扣越多
  "vehicle-types-hidden": {
    "自行车 / Bicycle": -6, "单轮车 / Unicycle": -8, "三轮车 / Tricycle": -7, "电瓶车 / E-Bike": -4,
    "摩托车 / Motorcycle": -1, "普通车 / Regular Car": 0, "豪车 / Luxury Car": +8,
  },
};

// 车辆品牌：按品牌在 carModelsRegular / carModelsLuxury 里的档次算
const CAR_MODEL_TIER_SCORES = {
  carModelsRegular: { 1: -2, 2: -1, 3: 0, 4: +1, 5: +2, 6: +3 },
  carModelsLuxury: { 1: +1, 2: +2, 3: +3, 4: +4, 5: +6, 6: +8 },
};
function getCarModelScore() {
  const model = _shownVal("vehicle-model");
  if (!model) return 0;
  for (const [group, scores] of Object.entries(CAR_MODEL_TIER_SCORES)) {
    for (const [tier, list] of Object.entries(HOUSING_TIERS[group])) {
      if (list.includes(model)) return scores[tier];
    }
  }
  return 0;
}

// 谈过几次：0 次 -3（没经验）、1-2 次 +2、3-4 次 0、5-6 次 -2、7-10 次 -4、11 次以上 -6
function _pastRelScore(n) {
  if (n === 0) return -3;
  if (n <= 2) return +2;
  if (n <= 4) return 0;
  if (n <= 6) return -2;
  if (n <= 10) return -4;
  return -6;
}

// 星座歧视链（网络刻板印象）
const HOROSCOPE_SCORES = {
  天秤座: +2, 金牛座: +2, 巨蟹座: +2, 狮子座: +1, 摩羯座: +1, 白羊座: 0, 双鱼座: 0,
  水瓶座: -1, 射手座: -1, 天蝎座: -2, 双子座: -2, 处女座: -3,
};

// 择偶标准：挑物质条件的扣分（拜金/挑剔），挑人品的加分，其他不加不减
const STANDARD_SCORES = {
  // 挑物质条件、挑外貌、挑家庭：扣分
  有稳定收入: -3, 有房: -3, 有车: -3, 高学历: -3, 颜值在线: -3, 身高要求: -3, 领地宽阔: -3, 领地稳固: -2,
  软萌: -1, 尾巴好看: -2, 体型相近: -1, 觅食能力强: -2, 筑巢技能满: -2, 家庭关系简单: -2,
  有钱就行: -8, 富二代: -5, 可以养我: -6, 父母双亡: -6,
  // 物种 / 食性歧视、玄学：扣分
  同物种优先: -3, 食肉优先: -2, 食草优先: -2, MBTI对盘: -2, 星座相合: -2,
  // 控制欲、挑剔：扣分
  无幼崽: -2, 已绝育: -3, 无前任联系: -1, 不打游戏: -1, 不用见家长: -2, 秒回消息: -2, 能查手机: -4,
  // 包容、看人品：加分
  专一: +2, 体贴: +2, 情绪稳定: +2, 三观相合: +2, 不啃老: +2, 经济独立: +2, 幽默感: +1, 爱干净: +1, 会做饭: +1,
  不介意杂交: +3, 换毛期可接受: +2, 水栖友好: +2, 接受前任: +2, 愿意见家长: +2,
  无浓烈异味: +1, 毛发整洁: +1, 爪子干净: +1, 不挑食: +1, 独立性强: +1, 不咬人: +1, 杂食可接受: +1,
  不催婚催生: +1, 不抽烟: +1, 愿意异地: +1, 不看星座: +1,
  // 怪癖、越界：扣分
  有怪癖: -2, 黏人: -1, 接受多伴侣: -4,
  接受SM: -4, 已婚: -8, 怀孕中: -5, 接受开放关系: -5, 接受出轨: -10, 接受三人行: -6, 只约不恋: -6,
  愿意当备胎: -6, 刚离婚: -3, 带着幼崽: -2, 有前科: -6, 恋足癖: -3, 戴项圈: -3, 想被圈养: -4,
  愿意当饲主: -4, 发情期同步: -2, 会咬人: -3, 不洗澡也行: -3, 前任是我朋友: -4, 有毛就行: -2,
  恋爱脑: -2, 年上: -1, 年下: -1,
};

// 身高歧视链：按这个物种的身高范围算，越高越加分
// 最矮 20% -8，20-40% -4，40-60% 0，60-80% +3，最高 20% +6
function getHeightScore() {
  const h = parseInt(_shownVal("petHeight"), 10);
  if (!h) return 0;
  const [min, max] = getHeightRange(_breedSel("petBreed"), _breedSel("petBreedClass"));
  const pos = max > min ? (h - min) / (max - min) : 0.5;
  if (pos < 0.2) return -8;
  if (pos < 0.4) return -4;
  if (pos < 0.6) return 0;
  if (pos < 0.8) return +3;
  return +6;
}

function getExtraScore() {
  let s = 0;
  for (const [id, table] of Object.entries(FIELD_SCORES)) {
    const v = _shownVal(id);
    if (v && table[v] !== undefined) s += table[v];
  }
  // 从自定义库里选的性别（别人自定义过的）也按「自定义」扣分
  const gender = _shownVal("petGender");
  if (gender && FIELD_SCORES.petGender[gender] === undefined) s += FIELD_SCORES.petGender["自定义/Custom"];
  // 谈过几次、孩子、其他关系的个数（都是数字）
  const past = _shownVal("rel-pastCount");
  if (past !== "") s += _pastRelScore(parseInt(past, 10) || 0);
  const kids = parseInt(_shownVal("rel-kids"), 10) || 0;
  s += kids === 0 ? 0 : kids === 1 ? -5 : kids === 2 ? -8 : -12;
  const ships = _shownVal("rel-shipCount");
  if (ships !== "") s += (parseInt(ships, 10) || 0) === 0 ? +3 : -2 * parseInt(ships, 10);
  // 父母籍贯：每位按所在城市的发展程度算一半
  for (const who of ["father", "mother"]) {
    if (!document.getElementById(`parents-${who}-wrapper`)?.classList.contains("hidden")) {
      s += Math.round(getCityScore(`parents-${who}`) / 2);
    }
  }
  s += getHeightScore();
  s += getCarModelScore();
  // 星座
  const horo = getHoroscope(document.getElementById("birthDisplay")?.value).split(" / ")[0];
  s += HOROSCOPE_SCORES[horo] || 0;
  // 择偶标准
  document.querySelectorAll("#standards-tags .hobby-tag.selected").forEach((el) => {
    s += STANDARD_SCORES[el.dataset.zh] || 0;
  });
  return s;
}

// 只取「现在显示着」的填空的值：重摇后被隐藏起来的旧答案不算分、也不存进档案
function _shownVal(id) {
  const el = document.getElementById(id);
  if (!el || el.closest(".hidden")) return "";
  return (el.value || "").trim();
}

function getTotalProfileScore() {
  let score = 100;
  const ids = [
    "house-type",
    "house-garden",
    "house-area",
    "house-tenure",
    "house-ownership",
    "house-mortgage",
    "house-price",
    "petIncome",
    "petEdu",
    "petOccupation",
    "petSterilized",
    "petBreedClass",
    "petOrientation",
    "vehicle-price",
    "parents-status",
    "parents-siblingCount",
    "parents-siblingWealth",
  ];
  ids.forEach((id) => {
    const val = _shownVal(id);
    if (val && SCORE_DEDUCTIONS[val] !== undefined)
      score += SCORE_DEDUCTIONS[val];
  });
  // 从自定义库里选的性取向也按「自定义」扣分
  const orientation = _shownVal("petOrientation");
  if (orientation && SCORE_DEDUCTIONS[orientation] === undefined) score += SCORE_DEDUCTIONS["自定义/Custom"];
  score += getHobbyScore();
  // 婚恋经历、交友意向、家庭、房子细节、车辆数量、身高、星座、择偶标准
  score += getExtraScore();
  // 房子所在城市的发展程度
  score += getCityScore();
  // 开放关系：在恋爱中/已婚(-5) 的基础上再 -3，和原来「开放关系 -8」一致
  if ((document.getElementById("rel-ships")?.value || "").includes(REL_SHIP_OPEN[0])) score -= 3;
  if (document.getElementById("isMixed")?.checked) score -= 10;
  const mbti = ["petMbti1","petMbti2","petMbti3","petMbti4"]
    .map(id => document.getElementById(id)?.value || "").join("");
  if (mbti.length === 4 && MBTI_SCORES[mbti] !== undefined) score += MBTI_SCORES[mbti];
  return Math.max(0, score);
}

function showScoreDelta(delta) {
  const el = document.createElement("div");
  el.className = "score-delta-pop" + (delta < 0 ? " negative" : "");
  el.textContent = (delta > 0 ? "+" : "") + delta;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1600);
}

function animateSettlement(finalScore) {
  const overlay = document.getElementById("score-settlement");
  if (!overlay) return;
  const numEl = overlay.querySelector(".settle-number");
  overlay.classList.add("active");
  let current = finalScore + 30;
  const iv = setInterval(() => {
    current = Math.max(finalScore, current - 1);
    numEl.textContent = current;
    if (current <= finalScore) {
      clearInterval(iv);
      setTimeout(() => overlay.classList.remove("active"), 2200);
    }
  }, 28);
}

// ── MBTI Custom Picker ──────────────────────────────────────────────────────
const MBTI_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ?!*~@&+−=^%$#/|.,()[]{}";

function toggleMbtiPicker(id, e) {
  // 这次点击不要冒泡到页面上的「点外面就收起」，否则刚打开就被关掉
  e?.stopPropagation();
  const self = document.getElementById(id + "-picker");
  // 已经打开 → 再点一下就收起
  if (self && !self.classList.contains("hidden")) {
    self.classList.add("hidden");
    return;
  }
  // close all other open pickers first
  document.querySelectorAll(".mbti-char-picker:not(.hidden)").forEach((el) => {
    if (el.id !== id + "-picker") el.classList.add("hidden");
  });

  const picker = document.getElementById(id + "-picker");
  if (!picker) return;

  if (!picker.children.length) {
    const current = document.getElementById(id)?.value;
    MBTI_CHARS.split("").forEach((ch) => {
      const btn = document.createElement("button");
      btn.className = "mbti-char-btn" + (ch === current ? " active" : "");
      btn.textContent = ch;
      btn.onclick = (e) => { e.stopPropagation(); selectMbtiChar(id, ch); };
      picker.appendChild(btn);
    });
  } else {
    // update active state
    const current = document.getElementById(id)?.value;
    picker.querySelectorAll(".mbti-char-btn").forEach((b) => {
      b.classList.toggle("active", b.textContent === current);
    });
  }
  picker.classList.remove("hidden");
}

function selectMbtiChar(id, ch) {
  const input = document.getElementById(id);
  const display = document.getElementById(id + "-display");
  if (input) input.value = ch;
  if (display) display.textContent = ch;
  document.getElementById(id + "-picker")?.classList.add("hidden");
  // highlight the matching opt-btn, clear others in the same slot
  document.querySelectorAll(`[id^="${id}-"]`).forEach((btn) => {
    if (btn.classList.contains("mbti-opt-btn")) {
      btn.classList.toggle("selected", btn.id === `${id}-${ch}`);
    }
  });
}

// close pickers when clicking outside
document.addEventListener("click", () => {
  document.querySelectorAll(".mbti-char-picker:not(.hidden)").forEach((el) => {
    el.classList.add("hidden");
  });
});

function rollGenericTierDice(btnId, displayId, inputId, tierMap, onRoll) {
  const btn = document.getElementById(btnId);
  const display = document.getElementById(displayId);
  if (!btn || !display) return;
  const rolls = parseInt(btn.dataset.rolls || "0", 10);
  if (rolls >= MAX_HOUSING_ROLLS) return;
  btn.dataset.rolls = rolls + 1;
  btn.disabled = true;
  let count = 0;
  const iv = setInterval(() => {
    btn.innerHTML = diceFaceImg(Math.floor(Math.random() * 6) + 1, 4);
    count++;
    if (count >= 16) {
      clearInterval(iv);
      const roll = Math.floor(Math.random() * 6) + 1;
      btn.innerHTML = diceFaceImg(roll, 4);
      const remaining = MAX_HOUSING_ROLLS - parseInt(btn.dataset.rolls, 10);
      btn.disabled = remaining <= 0;
      if (remaining <= 0) btn.classList.add("dice-exhausted");
      else btn.title = `还可摇 ${remaining} 次 / ${remaining} rolls left`;
      const raw = tierMap[roll];
      const value = Array.isArray(raw) ? raw[Math.floor(Math.random() * raw.length)] : raw;
      if (inputId) document.getElementById(inputId).value = value;
      display.textContent = disp(value);
      if (onRoll) onRoll(value);
    }
  }, 70);
}

// ── 婚恋状况 → 其他关系 ship（可多选）──
// [中文, English, 说明, 英文说明]
const REL_SHIPS = [
  ["正式对象", "relationship", "能发朋友圈、见家长那种", "the post-it-online, meet-the-parents kind"],
  ["暧昧拉扯", "situationship", "说不清，但就是舍不得删", "undefined, but you can't bring yourself to delete them"],
  ["通勤点头之交", "station-ship", "每天地铁偶遇的「熟悉陌生人」", "the familiar stranger you see on the subway every day"],
  ["旅途限定", "vacationship", "一起浪过，回城就删好友", "wild on the trip, unfriended back home"],
  ["聊天搭子", "conversationship", "天天聊天，却从不约出来", "chat every day, never meet up"],
  ["工位搭子", "workationship", "公司CP，离职就散场", "office couple, over when someone quits"],
  ["等他回复", "waitationship", "一直等他表态的那位「备胎」", "the backup still waiting for them to commit"],
  ["异地备胎", "locationship", "地图距离=心的距离", "map distance = heart distance"],
  ["教学型绑定", "educationship", "他讲我听，不一定是老师", "they teach, you listen, not necessarily a teacher"],
  ["拖着不谈", "procrastinationship", "谁都不说破，就这么耗着", "nobody says it out loud, so it just drags on"],
  ["幻想对象", "imaginationship", "对方可能连你是谁都不知道", "they may not even know who you are"],
  ["相亲第一轮", "navigationship", "正在摸底，考虑要不要发展", "still sizing each other up"],
  ["超心累关系", "frustrationship", "喜欢又走不近，离不开又不快乐", "can't get closer, can't leave, not happy"],
  ["精神恋人", "appreciationship", "互相欣赏，心动但不动手", "mutual admiration, all feelings, no moves"],
  ["资讯搭子", "informationship", "只分享链接不聊人生", "only send each other links, never talk about life"],
  ["保质期恋", "expirationship", "开始就知道会结束", "knew it would end from day one"],
  ["乱七八糟", "complicationship", "谁是谁都说不清的局", "a mess where no one knows who's with whom"],
  ["慢慢试探", "investigationship", "正在考察能不能当对象", "testing whether they're partner material"],
  ["将就过", "accommodationship", "不合适但不想重新开始", "not right, but too tired to start over"],
  ["局上限定互动", "celebrationship", "局内熟，局外不回消息", "close at parties, ghost outside them"],
  ["功利型绑定", "destination-ship", "为目标而凑合一起", "together for a goal, not for love"],
  ["想起来才联系", "rotationship", "时间表型朋友", "a friend on a schedule"],
  ["社媒营业CP", "insta-presentationship", "只存在社交媒体里", "only exists on social media"],
  ["差点就在一起了", "approximationship", "没表白、没捅破，就没了", "never confessed, never said it, then it was gone"],
  ["只发信息不见面", "textationship", "微信聊不停，但从不约出来", "texting nonstop, never meeting"],
  ["滤镜互动型", "snaplationship", "限时自拍点个火就断线", "streak selfies, then silence"],
  ["顺路熟人", "mationship", "合车搭子，聊完就散", "carpool buddy, gone after the ride"],
  ["只在派对打招呼", "eventationship", "除了蹦迪没交集", "nothing in common but the dance floor"],
  ["健身点头朋友", "gymationship", "熟悉又陌生的撸铁搭子", "the gym buddy you know but don't know"],
  ["合租但不熟", "roomationship", "厨房都不会同时出现", "never even in the kitchen at the same time"],
  ["追剧限定", "netflixationship", "一起看剧，不看你眼睛", "watch shows together, never look at each other"],
  ["咖啡社交型", "coffeelationship", "每次都点拿铁，从不加你微信", "always orders a latte, never adds you"],
  ["语音陪伴型", "voicemationship", "听声音熟，见面尴尬", "know the voice, awkward in person"],
  ["表情包友情", "memationship", "全靠梗图维系感情", "held together entirely by memes"],
  ["转账关系", "venmoship", "除了分账毫无瓜葛", "nothing between you but split bills"],
  ["情感空窗", "dryationship", "像在恋爱，但没感觉了", "looks like love, feels like nothing"],
  ["被拉黑型", "ghostationship", "昨天还说晚安，今天消失了", "said goodnight yesterday, vanished today"],
  ["撩完就跑型", "flirtationship", "总是撩人但从不认真", "always flirting, never serious"],
  ["先缓缓型", "on-hold-ship", "搁置状态、烂尾关系", "on hold, never finished"],
  ["感情回收站", "reboundship", "失恋疗伤用，不持久", "for healing a breakup, not built to last"],
];
// 只有「恋爱中」「已婚」才多出的选项
const REL_SHIP_OPEN = ["开放关系", "open relationship", "有伴侣，但关系是开放的", "has a partner, but it's open"];
const _shipValue = ([zh, en]) => `${zh} / ${en}`;

// 摇出来的其他关系池：恋爱中/已婚才可能摇到「开放关系」
function _shipPool() {
  const status = _val("petSterilized");
  const withOpen = status === "恋爱中/Dating" || status === "已婚/Married";
  return withOpen ? [REL_SHIP_OPEN, ...REL_SHIPS] : REL_SHIPS;
}

function onRelStatusChange() {
  // 改成单身/离异：之前摇到的「开放关系」作废，那一段要重摇
  const pool = new Set(_shipPool().map(_shipValue));
  document.querySelectorAll("#rel-ships-list input[type=hidden]").forEach((inp) => {
    if (inp.value && !pool.has(inp.value)) _resetShipBox(inp.dataset.index);
  });
  _syncShips();
  _updateRelSteps();
}

// 摇完「几段其他关系」：生成对应个数的骰子框
function onShipCountRolled(value) {
  const n = parseInt(value, 10) || 0;
  const list = document.getElementById("rel-ships-list");
  list.innerHTML = Array.from({ length: n }, (_, i) => `
    <div id="rel-ship-step-${i}" class="hidden">
      <label>第 ${i + 1} 段 Relationship #${i + 1}</label>
      <div class="dice-field-row">
        <button class="dice-roll-btn" id="rel-ship-${i}-dice-btn" data-rolls="0" onclick="rollShipDice(${i})">${diceFaceImg(6, 4)}</button>
        <div id="rel-ship-${i}-display" class="dice-result-input ship-result">—</div>
        <input id="rel-ship-${i}" data-index="${i}" type="hidden" value="" />
      </div>
    </div>`).join("");
  list.dataset.count = n;
  _syncShips();
  _updateRelSteps();
}

function _resetShipBox(i) {
  const inp = document.getElementById(`rel-ship-${i}`);
  const disp = document.getElementById(`rel-ship-${i}-display`);
  const btn = document.getElementById(`rel-ship-${i}-dice-btn`);
  if (inp) inp.value = "";
  if (disp) disp.textContent = "—";
  if (btn) { btn.dataset.rolls = "0"; btn.disabled = false; btn.classList.remove("dice-exhausted"); btn.innerHTML = diceFaceImg(6, 4); }
}

// 摇第 i 段是哪种关系：不和其他段重复；结果旁边直接显示说明
function rollShipDice(i) {
  const btn = document.getElementById(`rel-ship-${i}-dice-btn`);
  const display = document.getElementById(`rel-ship-${i}-display`);
  const inp = document.getElementById(`rel-ship-${i}`);
  if (!btn || !display || !inp) return;
  const rolls = parseInt(btn.dataset.rolls || "0", 10);
  if (rolls >= MAX_HOUSING_ROLLS) return;
  btn.dataset.rolls = rolls + 1;
  btn.disabled = true;
  let count = 0;
  const iv = setInterval(() => {
    btn.innerHTML = diceFaceImg(Math.floor(Math.random() * 6) + 1, 4);
    count++;
    if (count >= 16) {
      clearInterval(iv);
      btn.innerHTML = diceFaceImg(Math.floor(Math.random() * 6) + 1, 4);
      const remaining = MAX_HOUSING_ROLLS - parseInt(btn.dataset.rolls, 10);
      btn.disabled = remaining <= 0;
      if (remaining <= 0) btn.classList.add("dice-exhausted");
      else btn.title = `还可摇 ${remaining} 次 / ${remaining} rolls left`;
      const taken = new Set([...document.querySelectorAll("#rel-ships-list input[type=hidden]")]
        .filter((x) => x !== inp).map((x) => x.value));
      const choices = _shipPool().filter((sh) => !taken.has(_shipValue(sh)));
      const [zh, en, desc, descEn] = choices[Math.floor(Math.random() * choices.length)];
      inp.value = _shipValue([zh, en]);
      display.innerHTML = `<b class="zh">${escapeHtml(zh)}</b> <small class="en">${escapeHtml(en)}</small><span class="ship-desc"><span class="zh">${escapeHtml(desc)}</span> <span class="en">${escapeHtml(descEn)}</span></span>`;
      _syncShips();
    }
  }, 70);
}

// 汇总到 rel-ships：0 段 =「都没有」；否则把各段拼起来
function _syncShips() {
  const list = document.getElementById("rel-ships-list");
  const n = parseInt(list?.dataset.count || "0", 10);
  const out = document.getElementById("rel-ships");
  if (!out) return;
  if (!_val("rel-shipCount")) out.value = "";
  else if (n === 0) out.value = REL_SHIP_NONE;
  else out.value = [...list.querySelectorAll("input[type=hidden]")].map((x) => x.value).filter(Boolean).join(" · ");
}

// ── 婚恋状况页：一个个出现 ──
// 婚恋状况 → 谈过几段 →（谈过才问）前任联系 → 还爱前任 → 白月光 → 孩子 → Crush → 几段其他关系 → 每一段
function _relSteps() {
  const hadRel = () => !!_val("rel-pastCount") && _val("rel-pastCount") !== "0";
  const n = parseInt(document.getElementById("rel-ships-list")?.dataset.count || "0", 10);
  return [
    { el: "rel-step-past", value: "rel-pastCount", label: "谈过多少恋爱", labelEn: "Past relationships" },
    { el: "rel-step-exContact", value: "rel-exContact", applies: hadRel, label: "和前任还有联系吗", labelEn: "Ex contact" },
    { el: "rel-step-stillLoveEx", value: "rel-stillLoveEx", applies: hadRel, label: "还爱前任吗", labelEn: "Still love your ex" },
    { el: "rel-step-whiteMoon", value: "rel-whiteMoon", label: "有白月光吗", labelEn: "The one that got away" },
    { el: "rel-step-kids", value: "rel-kids", label: "有孩子吗", labelEn: "Kids" },
    { el: "rel-step-crush", value: "rel-crush", label: "现在对谁有 Crush 吗", labelEn: "Current crush" },
    { el: "rel-step-shipCount", value: "rel-shipCount", label: "还有几段其他关系", labelEn: "Other ships" },
    ...Array.from({ length: n }, (_, i) => ({ el: `rel-ship-step-${i}`, value: `rel-ship-${i}`, label: `第 ${i + 1} 段其他关系`, labelEn: `Other ship #${i + 1}` })),
  ];
}
function _updateRelSteps() {
  return _applySteps(_relSteps(), !!_val("petSterilized"));
}

// Date Picker Functions
const _today = new Date();
let selectedYear = _today.getFullYear();
let selectedMonth = _today.getMonth() + 1;
let selectedDay = _today.getDate();

function openDatePicker() {
  document.getElementById("datePicker").classList.remove("hidden");
  generateWheels();
}

const _daysInMonth = (y, m) => new Date(y, m, 0).getDate();

function generateWheels() {
  createWheel("yearWheel", 0, 5000, selectedYear, (v) => { selectedYear = v; _refreshDayWheel(); });
  createWheel("monthWheel", 1, 12, selectedMonth, (v) => { selectedMonth = v; _refreshDayWheel(); });
  _refreshDayWheel(true);
}

// 年/月变了：日的滚轮跟着变成这个月的天数（2 月 28/29 天等）
function _refreshDayWheel(force = false) {
  const wheel = document.getElementById("dayWheel");
  const max = _daysInMonth(selectedYear, selectedMonth);
  if (!force && wheel.dataset.max === String(max)) return;
  selectedDay = Math.min(selectedDay, max);
  createWheel("dayWheel", 1, max, selectedDay, (v) => (selectedDay = v));
  wheel.dataset.max = max;
}

// 滚轮：停在正中间的那个数字自动变成选中的
function createWheel(id, start, end, selected, onSelect) {
  const wheel = document.getElementById(id);
  wheel.innerHTML = "";
  // 上下各放一个空白垫片，让第一个和最后一个数字也能滚到正中间
  const padTop = document.createElement("div");
  padTop.className = "wheel-pad";
  wheel.appendChild(padTop);
  const items = [];
  for (let i = start; i <= end; i++) {
    const item = document.createElement("div");
    item.textContent = i;
    // 点某个数字：把它滚到正中间（滚到中间就会被选中）
    item.onclick = () => wheel.scrollTo({ top: (i - start) * itemH(), behavior: "smooth" });
    wheel.appendChild(item);
    items.push(item);
  }
  const padBottom = padTop.cloneNode();
  wheel.appendChild(padBottom);

  const itemH = () => items[0]?.offsetHeight || 28;
  let current = -1;
  const mark = (idx) => {
    idx = Math.max(0, Math.min(items.length - 1, idx));
    if (idx === current) return;
    items[current]?.classList.remove("selected");
    items[idx].classList.add("selected");
    current = idx;
    onSelect(start + idx);
  };

  let ready = false;
  wheel.onscroll = () => {
    if (ready) mark(Math.round(wheel.scrollTop / itemH()));
  };

  if (!wheel._touchBound) {
    wheel.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: true });
    wheel.addEventListener("touchmove", (e) => e.stopPropagation(), { passive: true });
    wheel._touchBound = true;
  }

  // 先标出当前值，再把它滚到正中间（等布局完成才量得到高度）
  items[selected - start]?.classList.add("selected");
  current = selected - start;
  setTimeout(() => {
    const pad = (wheel.clientHeight - itemH()) / 2;
    padTop.style.height = padBottom.style.height = pad + "px";
    wheel.scrollTop = current * itemH();
    ready = true;
  }, 0);
}

function confirmDate() {
  const display = document.getElementById("birthDisplay");
  display.value = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-${String(selectedDay).padStart(2, "0")}`;

  document.getElementById("datePicker").classList.add("hidden");
}

//Age Calculation
function getPetAge() {
  const value = document.getElementById("birthDisplay").value;
  if (!value) return "未知 / Unknown";

  const birth = new Date(value);
  const today = new Date();

  const totalMonths =
    (today.getFullYear() - birth.getFullYear()) * 12 +
    (today.getMonth() - birth.getMonth());

  const years = Math.floor(totalMonths / 12);
  const months = Math.abs(totalMonths % 12);

  if (years === 0) {
    return `${months}`;
  } else if (months === 0) {
    return `${years}`;
  } else {
    return `${years}.${months}`;
  }
}

// Mammal subgroups (up to 4-level selection for Mammals: class→subgroup→sub-subgroup→species)
// When a subgroup value is an object (not array), a 4th sub-subgroup picker is shown.
const breedSubgroups = {
  "哺乳类 / Mammals": {
    "猫科 / Felines": {
      "家猫 / Domestic Cats": [
        "猫 / Cat",
        "野猫 / Wild Cat",
        "橘猫 / Orange Tabby",
        "三花猫 / Calico",
        "狸花猫 / Chinese Tabby",
        "布偶猫 / Ragdoll",
        "拿破仑猫 / Napoleon Cat",
        "英国短毛猫 / British Shorthair",
        "英短金渐层 / British Shorthair (Golden)",
        "苏格兰折耳猫 / Scottish Fold",
        "美国短毛猫 / American Shorthair",
        "波斯猫 / Persian",
        "异国短毛猫 / Exotic Shorthair",
        "暹罗猫 / Siamese",
        "缅因猫 / Maine Coon",
        "孟加拉猫 / Bengal Cat",
        "俄罗斯蓝猫 / Russian Blue",
        "挪威森林猫 / Norwegian Forest Cat",
        "斯芬克斯猫 / Sphynx",
      ],
      "大型猫科 / Big Cats": [
        "猎豹 / Cheetah",
        "豹 / Leopard",
        "雪豹 / Leopard (Snow)",
        "黑豹 / Black Panther",
        "狮子 / Lion",
        "非洲狮 / Lion (African)",
        "亚洲狮 / Lion (Asiatic)",
        "刚果狮 / Lion (Congo)",
        "马赛狮 / Lion (Maasai)",
        "美洲豹 / Jaguar",
        "老虎 / Tiger",
        "孟加拉虎 / Tiger (Bengal)",
        "西伯利亚虎 / Tiger (Siberian)",
        "白虎 / Tiger (White)",
        "加拿大猞猁 / Canada Lynx",
      ],
    },
    "犬科 / Canines": {
      "家犬 / Domestic Dogs": [
        "狗 / Dog",
        "哈士奇 / Husky",
        "阿拉斯加雪橇犬 / Alaskan Malamute",
        "萨摩耶 / Samoyed",
        "金毛寻回犬 / Golden Retriever",
        "拉布拉多寻回犬 / Dog (Labrador Retriever)",
        "德国牧羊犬 / German Shepherd",
        "边境牧羊犬 / Dog (Border Collie)",
        "古英格兰牧羊犬 / Dog (Old English Sheepdog)",
        "柯基 / Corgi",
        "贵宾犬 / Poodle",
        "比熊犬 / Bichon Frise",
        "腊肠犬 / Dachshund",
        "比格犬 / Beagle",
        "法国斗牛犬 / French Bulldog",
        "英国斗牛犬 / English Bulldog",
        "松狮犬 / Chow Chow",
        "秋田犬 / Akita",
        "柴犬 / Dog (Shiba Inu)",
        "西施犬 / Shih Tzu",
        "约克夏梗 / Yorkshire Terrier",
        "迷你雪纳瑞 / Miniature Schnauzer",
        "杜宾犬 / Doberman",
        "罗威纳犬 / Rottweiler",
        "拳师犬 / Boxer",
        "大丹犬 / Dog (Great Dane)",
        "圣伯纳犬 / Dog (Saint Bernard)",
        "蝴蝶犬 / Dog (Papillon)",
        "博美犬 / Dog (Pomeranian)",
        "巴哥犬 / Dog (Pug)",
        "罗素梗 / Dog (Russell Terrier)",
      ],
      "狼属 / Wolves": [
        "狼 / Wolf",
        "灰狼 / Wolf (Gray)",
        "白狼 / Wolf (White)",
      ],
      "狐属 / Foxes": [
        "狐狸 / Fox",
        "赤狐 / Fox (Red)",
        "藏狐 / Fox (Tibetan)",
        "耳廓狐 / Fennec Fox",
      ],
      "野生犬科 / Wild Canines": [
        "郊狼 / Coyote",
        "豺 / Jackal",
        "澳洲野犬 / Dingo",
        "非洲野犬 / African Wild Dog",
      ],
    },
    "熊科 / Bears": [
      "熊 / Bear",
      "亚洲黑熊 / Bear (Asian Black)",
      "棕熊 / Bear (Brown)",
      "北极熊 / Bear (Polar)",
      "大熊猫 / Giant Panda",
    ],
    "灵长类 / Primates": [
      "猴 / Monkey",
      "狒狒 / Baboon",
      "山魈 / Mandrill",
      "猩猩 / Orangutan",
      "山地大猩猩 / Mountain Gorilla",
      "狐猴 / Lemur",
    ],
    "啮齿类 / Rodents": [
      "鼠 / Mouse",
      "大鼠 / Rat",
      "仓鼠 / Hamster",
      "豚鼠 / Guinea Pig",
      "龙猫 / Chinchilla",
      "松鼠 / Squirrel",
      "花栗鼠 / Chipmunk",
      "鼯鼠 / Flying Squirrel",
      "蒙古沙鼠 / Mongolian Gerbil",
      "河狸 / Beaver",
      "山绒鼠 / Viscacha",
    ],
    "兔形目 / Lagomorphs": [
      "兔子 / Rabbit",
      "花斑兔 / Rabbit (Harlequin)",
      "垂耳兔 / Rabbit (Lop-eared)",
      "迷你雷克斯兔 / Rabbit (Mini Rex)",
      "荷兰侏儒兔 / Rabbit (Netherland Dwarf)",
    ],
    "有蹄类 / Ungulates": [
      "马 / Horse",
      "斑马 / Zebra",
      "驴 / Donkey",
      "牛 / Cow",
      "水牛 / Buffalo",
      "骆驼 / Camel",
      "犀牛 / Rhinoceros",
      "河马 / Hippopotamus",
      "大象 / Elephant",
      "疣猪 / Warthog",
      "约克夏猪 / Yorkshire Pig",
      "貘 / Tapir",
    ],
    "鹿 & 长颈鹿科 / Deer & Giraffids": [
      "马鹿 / Red Deer",
      "梅花鹿 / Spotted Deer",
      "驼鹿 / Moose",
      "霍加皮 / Okapi",
      "长颈鹿 / Giraffe",
    ],
    "羊羚类 / Bovids": [
      "绵羊 / Sheep",
      "达尔绵羊 / Sheep (Dall)",
      "美利奴绵羊 / Sheep (Merino)",
      "山羊 / Goat",
      "安哥拉山羊 / Angora Goat",
      "羊驼 / Alpaca",
      "瞪羚 / Gazelle",
      "汤氏瞪羚 / Thomson's Gazelle",
      "黑斑羚 / Impala",
      "高鼻羚羊 / Saiga Antelope",
      "大角羚 / Oryx",
    ],
    "鼬科 / Mustelids": [
      "雪貂 / Ferret",
      "水獭 / Otter",
      "海獭 / Sea Otter",
      "白鼬 / Stoat",
      "蜜獾 / Honey Badger",
      "日本獾 / Japanese Badger",
    ],
    "鬣狗科 / Hyenas": [
      "斑点鬣狗 / Hyena (Spotted)",
      "条纹鬣狗 / Hyena (Striped)",
    ],
    "海洋哺乳类 / Marine Mammals": [
      "海豚 / Dolphin",
      "宽吻海豚 / Bottlenose Dolphin",
      "虎鲸 / Orca",
      "座头鲸 / Humpback Whale",
      "蓝鲸 / Blue Whale",
      "抹香鲸 / Sperm Whale",
      "白鲸 / Beluga",
      "独角鲸 / Narwhal",
      "斑海豹 / Spotted Seal",
      "北象海豹 / Northern Elephant Seal",
      "海狮 / Sea Lion",
      "海象 / Walrus",
      "儒艮 / Dugong",
      "海牛 / Manatee",
    ],
    "有袋类 / Marsupials": ["袋鼠 / Kangaroo", "考拉 / Koala"],
    "翼手目 / Chiroptera": ["蝙蝠 / Bat", "果蝠 / Fruit Bat"],
    "其他哺乳类 / Other Mammals": [
      "刺猬 / Hedgehog",
      "浣熊 / Raccoon",
      "狸 / Tanuki",
      "麝香猫 / Civet",
      "猫鼬 / Mongoose",
      "臭鼬 / Skunk",
      "鼹鼠 / Mole",
      "小熊猫 / Red Panda",
      "树懒 / Sloth",
      "小食蚁兽 / Anteater (Tamandua)",
    ],
  },
  "鱼类 / Fish": {
    "海鱼 / Saltwater Fish": [
      "大白鲨 / Great White Shark",
      "鲸鲨 / Whale Shark",
      "锤头鲨 / Hammerhead Shark",
      "虎鲨 / Tiger Shark",
      "牛鲨 / Bull Shark",
      "蓝鲨 / Blue Shark",
      "柠檬鲨 / Lemon Shark",
      "护士鲨 / Nurse Shark",
      "魟 / Stingray",
      "蝠鲼 / Manta Ray",
      "电鳐 / Electric Ray",
      "小丑鱼 / Clownfish",
      "蓝倒吊 / Blue Tang",
      "神仙鱼 / Angelfish",
      "蝴蝶鱼 / Butterflyfish",
      "狮子鱼 / Lionfish",
      "石斑鱼 / Grouper",
      "炮弹鱼 / Triggerfish",
      "鹦嘴鱼 / Parrotfish",
      "隆头鱼 / Wrasse",
      "刺尾鱼 / Surgeonfish",
      "鮟鱇鱼 / Anglerfish",
      "皇带鱼 / Oarfish",
      "蝰鱼 / Viperfish",
      "灯笼鱼 / Lanternfish",
      "桶眼鱼 / Barreleye",
      "枪鱼 / Swordfish",
      "旗鱼 / Marlin",
      "金枪鱼 / Tuna",
      "翻车鱼 / Ocean Sunfish",
      "飞鱼 / Flying Fish",
      "海马 / Seahorse",
      "河豚 / Pufferfish",
      "章鱼 / Octopus",
      "乌贼 / Squid",
      "墨鱼 / Cuttlefish",
    ],
    "淡水鱼 / Freshwater Fish": [
      "锦鲤 / Koi",
      "金鱼 / Goldfish",
      "虹鳟 / Rainbow Trout",
      "鲶鱼 / Catfish",
      "斗鱼 / Betta Fish",
      "孔雀鱼 / Guppy",
      "草鱼 / Grass Carp",
      "鲤鱼 / Carp",
      "鲫鱼 / Crucian Carp",
      "鲈鱼 / Bass",
      "鳄雀鳝 / Alligator Gar",
      "电鳗 / Electric Eel",
      "食人鱼 / Piranha",
    ],
  },
};

// Breed data (non-mammal classes only — mammals use breedSubgroups)
const breedData = {
  "鸟类 / Birds": [
    "白头海雕 / Bald Eagle",
    "金丝雀 / Canary",
    "鸡 / Chicken",
    "鹤 / Crane",
    "乌鸦 / Crow",
    "鸭 / Duck",
    "文鸟 / Finch",
    "火烈鸟 / Flamingo",
    "金雕 / Golden Eagle",
    "苍鹭 / Heron",
    "八哥 / Myna",
    "鸵鸟 / Ostrich",
    "猫头鹰 / Owl",
    "仓鸮 / Owl (Barn)",
    "鹦鹉 / Parrot",
    "孔雀 / Peafowl",
    "雄孔雀 / Peacock",
    "鹈鹕 / Pelican",
    "鸽子 / Pigeon",
    "蛇鹫 / Secretarybird",
    "虎头海雕 / Stellar's Sea Eagle",
    "天鹅 / Swan",
    "火鸡 / Turkey",
  ],
  "爬行类 / Reptiles": [
    "短吻鳄 / Alligator",
    "凯门鳄 / Caiman",
    "变色龙 / Chameleon",
    "湾鳄 / Crocodile (Saltwater)",
    "暹罗鳄 / Crocodile (Siamese)",
    "鳄蜥 / Crocodile Skink",
    "壁虎 / Gecko",
    "鬣蜥 / Iguana",
    "科莫多巨蜥 / Komodo Dragon",
    "蜥蜴 / Lizard",
    "响尾蛇 / Rattlesnake",
    "石龙子 / Skink",
    "蛇 / Snake",
    "鳄龟 / Snapping Turtle",
    "陆龟 / Tortoise",
    "龟 / Turtle",
  ],
  "两栖类 / Amphibians": [
    "钝口螈 / Axolotl",
    "青蛙 / Frog",
    "蝾螈 / Salamander",
    "蟾蜍 / Toad",
  ],
  "节肢动物 / Arthropods": [
    "螃蟹 / Crab",
    "蜈蚣 / Centipede",
    "蚱蜢 / Grasshopper",
    "独角仙 / Rhinoceros Beetle",
    "蝎子 / Scorpion",
    "蜘蛛 / Spider",
  ],
};

// ── Height ranges per breed [min, max] in cm, step 5 ─────────
const breedHeight = {
  // ── Tiny (20–70) ──
  "蜘蛛 / Spider": [20, 65],
  "蚱蜢 / Grasshopper": [20, 60],
  "螃蟹 / Crab": [25, 65],
  "蜈蚣 / Centipede": [25, 65],
  "蝎子 / Scorpion": [25, 70],
  "独角仙 / Rhinoceros Beetle": [25, 65],
  "鼠 / Mouse": [30, 70],
  "蒙古沙鼠 / Mongolian Gerbil": [30, 70],
  "花栗鼠 / Chipmunk": [35, 75],
  "仓鼠 / Hamster": [30, 70],
  "鼯鼠 / Flying Squirrel": [35, 75],
  "山绒鼠 / Viscacha": [40, 80],
  "大鼠 / Rat": [40, 85],
  // ── Very small (55–115) ──
  "青蛙 / Frog": [50, 95],
  "蟾蜍 / Toad": [50, 95],
  "蝾螈 / Salamander": [55, 100],
  "钝口螈 / Axolotl": [55, 100],
  "鼹鼠 / Mole": [55, 95],
  "刺猬 / Hedgehog": [60, 100],
  "白鼬 / Stoat": [60, 100],
  "壁虎 / Gecko": [60, 105],
  "鱼 / Fish": [50, 110],
  "豚鼠 / Guinea Pig": [65, 110],
  "龙猫 / Chinchilla": [70, 115],
  "蝙蝠 / Bat": [65, 110],
  "果蝠 / Fruit Bat": [70, 115],
  "松鼠 / Squirrel": [45, 90],
  // ── Small (80–145) ──
  "兔子 / Rabbit": [80, 140],
  "花斑兔 / Rabbit (Harlequin)": [80, 140],
  "垂耳兔 / Rabbit (Lop-eared)": [80, 140],
  "迷你雷克斯兔 / Rabbit (Mini Rex)": [75, 130],
  "荷兰侏儒兔 / Rabbit (Netherland Dwarf)": [65, 120],
  "雪貂 / Ferret": [75, 120],
  "变色龙 / Chameleon": [70, 115],
  "蜥蜴 / Lizard": [70, 120],
  "石龙子 / Skink": [70, 120],
  "鳄蜥 / Crocodile Skink": [70, 120],
  "蛇 / Snake": [100, 165],
  "响尾蛇 / Rattlesnake": [100, 160],
  "陆龟 / Tortoise": [90, 145],
  "龟 / Turtle": [85, 140],
  "鳄龟 / Snapping Turtle": [90, 150],
  "金丝雀 / Canary": [80, 125],
  "文鸟 / Finch": [80, 120],
  "八哥 / Myna": [90, 140],
  "鸽子 / Pigeon": [90, 140],
  "鸡 / Chicken": [95, 150],
  "鸭 / Duck": [90, 145],
  // ── Medium-small (110–165) ──
  "猫 / Cat": [105, 158],
  "野猫 / Wild Cat": [105, 158],
  "橘猫 / Orange Tabby": [105, 158],
  "三花猫 / Calico": [105, 158],
  "狸花猫 / Chinese Tabby": [105, 158],
  "布偶猫 / Ragdoll": [115, 165],
  "拿破仑猫 / Napoleon Cat": [90, 140],
  "英国短毛猫 / British Shorthair": [110, 160],
  "英短金渐层 / British Shorthair (Golden)": [110, 160],
  "苏格兰折耳猫 / Scottish Fold": [105, 158],
  "美国短毛猫 / American Shorthair": [110, 160],
  "波斯猫 / Persian": [110, 158],
  "异国短毛猫 / Exotic Shorthair": [108, 158],
  "暹罗猫 / Siamese": [110, 163],
  "缅因猫 / Maine Coon": [120, 170],
  "孟加拉猫 / Bengal Cat": [115, 165],
  "俄罗斯蓝猫 / Russian Blue": [110, 160],
  "挪威森林猫 / Norwegian Forest Cat": [118, 168],
  "斯芬克斯猫 / Sphynx": [105, 155],
  "麝香猫 / Civet": [100, 155],
  "狸 / Tanuki": [105, 158],
  "浣熊 / Raccoon": [105, 158],
  "猫鼬 / Mongoose": [85, 138],
  "小熊猫 / Red Panda": [95, 148],
  "狐猴 / Lemur": [90, 148],
  "树懒 / Sloth": [90, 148],
  "考拉 / Koala": [115, 165],
  "巴哥犬 / Dog (Pug)": [120, 163],
  "蝴蝶犬 / Dog (Papillon)": [110, 158],
  "博美犬 / Dog (Pomeranian)": [110, 155],
  "罗素梗 / Dog (Russell Terrier)": [120, 163],
  "腊肠犬 / Dachshund": [110, 155],
  "比格犬 / Beagle": [125, 165],
  "西施犬 / Shih Tzu": [110, 155],
  "约克夏梗 / Yorkshire Terrier": [110, 153],
  "迷你雪纳瑞 / Miniature Schnauzer": [120, 163],
  "贵宾犬 / Poodle": [130, 173],
  "比熊犬 / Bichon Frise": [120, 160],
  "法国斗牛犬 / French Bulldog": [125, 163],
  "耳廓狐 / Fennec Fox": [90, 143],
  "猴 / Monkey": [110, 165],
  "日本獾 / Japanese Badger": [110, 158],
  "蜜獾 / Honey Badger": [115, 163],
  "小食蚁兽 / Anteater (Tamandua)": [115, 163],
  "水獭 / Otter": [120, 165],
  "海獭 / Sea Otter": [130, 173],
  "臭鼬 / Skunk": [90, 143],
  "猫头鹰 / Owl": [100, 153],
  "仓鸮 / Owl (Barn)": [100, 153],
  "乌鸦 / Crow": [100, 153],
  "鹦鹉 / Parrot": [100, 155],
  "火鸡 / Turkey": [120, 168],
  "大熊猫 / Giant Panda": [150, 200],
  "鬣蜥 / Iguana": [115, 163],
  "科莫多巨蜥 / Komodo Dragon": [140, 190],
  "短吻鳄 / Alligator": [148, 198],
  "凯门鳄 / Caiman": [145, 193],
  "暹罗鳄 / Crocodile (Siamese)": [148, 198],
  // ── Medium (145–190) ──
  "狗 / Dog": [125, 188],
  "柴犬 / Dog (Shiba Inu)": [138, 178],
  "柯基 / Corgi": [130, 168],
  "英国斗牛犬 / English Bulldog": [138, 175],
  "松狮犬 / Chow Chow": [143, 183],
  "秋田犬 / Akita": [153, 193],
  "哈士奇 / Husky": [158, 198],
  "萨摩耶 / Samoyed": [158, 198],
  "金毛寻回犬 / Golden Retriever": [160, 200],
  "德国牧羊犬 / German Shepherd": [163, 205],
  "杜宾犬 / Doberman": [168, 210],
  "拳师犬 / Boxer": [163, 205],
  "罗威纳犬 / Rottweiler": [165, 210],
  "阿拉斯加雪橇犬 / Alaskan Malamute": [168, 213],
  "边境牧羊犬 / Dog (Border Collie)": [148, 185],
  "狒狒 / Baboon": [148, 193],
  "山魈 / Mandrill": [153, 200],
  "猩猩 / Orangutan": [155, 200],
  "袋鼠 / Kangaroo": [160, 215],
  "驴 / Donkey": [153, 198],
  "约克夏猪 / Yorkshire Pig": [143, 188],
  "疣猪 / Warthog": [143, 188],
  "牛 / Cow": [163, 213],
  "瞪羚 / Gazelle": [153, 198],
  "汤氏瞪羚 / Thomson's Gazelle": [150, 195],
  "高鼻羚羊 / Saiga Antelope": [148, 193],
  "黑斑羚 / Impala": [153, 198],
  "梅花鹿 / Spotted Deer": [155, 200],
  "貘 / Tapir": [158, 205],
  "绵羊 / Sheep": [138, 183],
  "达尔绵羊 / Sheep (Dall)": [140, 185],
  "美利奴绵羊 / Sheep (Merino)": [138, 183],
  "山羊 / Goat": [130, 178],
  "安哥拉山羊 / Angora Goat": [130, 178],
  "羊驼 / Alpaca": [148, 193],
  "天鹅 / Swan": [130, 175],
  "火烈鸟 / Flamingo": [143, 188],
  "鹤 / Crane": [148, 193],
  "苍鹭 / Heron": [148, 193],
  "孔雀 / Peafowl": [143, 188],
  "雄孔雀 / Peacock": [143, 188],
  "鹈鹕 / Pelican": [143, 188],
  "蛇鹫 / Secretarybird": [148, 193],
  "鸵鸟 / Ostrich": [163, 210],
  "狐狸 / Fox": [113, 163],
  "赤狐 / Fox (Red)": [113, 163],
  "藏狐 / Fox (Tibetan)": [110, 160],
  "斑海豹 / Spotted Seal": [135, 180],
  "海豚 / Dolphin": [155, 205],
  // ── Medium-large (163–215) ──
  "拉布拉多寻回犬 / Dog (Labrador Retriever)": [158, 198],
  "古英格兰牧羊犬 / Dog (Old English Sheepdog)": [158, 200],
  "澳洲野犬 / Dingo": [150, 195],
  "非洲野犬 / African Wild Dog": [155, 200],
  "郊狼 / Coyote": [148, 193],
  "豺 / Jackal": [148, 193],
  "加拿大猞猁 / Canada Lynx": [148, 193],
  "豹 / Leopard": [158, 203],
  "雪豹 / Leopard (Snow)": [158, 203],
  "猎豹 / Cheetah": [163, 208],
  "美洲豹 / Jaguar": [163, 208],
  "黑豹 / Black Panther": [163, 208],
  "白头海雕 / Bald Eagle": [153, 198],
  "金雕 / Golden Eagle": [153, 198],
  "虎头海雕 / Stellar's Sea Eagle": [158, 203],
  "大角羚 / Oryx": [168, 218],
  "霍加皮 / Okapi": [173, 223],
  "马鹿 / Red Deer": [173, 223],
  "山地大猩猩 / Mountain Gorilla": [165, 213],
  "鲨鱼 / Shark": [168, 240],
  "湾鳄 / Crocodile (Saltwater)": [170, 228],
  // ── Large (183–240) ──
  "圣伯纳犬 / Dog (Saint Bernard)": [173, 218],
  "大丹犬 / Dog (Great Dane)": [178, 225],
  "狼 / Wolf": [173, 218],
  "灰狼 / Wolf (Gray)": [173, 218],
  "白狼 / Wolf (White)": [173, 218],
  "狮子 / Lion": [178, 225],
  "非洲狮 / Lion (African)": [178, 225],
  "亚洲狮 / Lion (Asiatic)": [175, 220],
  "刚果狮 / Lion (Congo)": [178, 225],
  "马赛狮 / Lion (Maasai)": [178, 225],
  "老虎 / Tiger": [183, 228],
  "孟加拉虎 / Tiger (Bengal)": [183, 228],
  "西伯利亚虎 / Tiger (Siberian)": [188, 235],
  "白虎 / Tiger (White)": [183, 228],
  "熊 / Bear": [178, 230],
  "亚洲黑熊 / Bear (Asian Black)": [170, 218],
  "棕熊 / Bear (Brown)": [183, 233],
  "北极熊 / Bear (Polar)": [193, 248],
  "马 / Horse": [178, 233],
  "水牛 / Buffalo": [178, 230],
  "斑马 / Zebra": [173, 225],
  "驼鹿 / Moose": [198, 265],
  "河狸 / Beaver": [113, 158],
  "鲸 / Whale": [183, 265],
  // ── Very large (215–350) ──
  "大象 / Elephant": [233, 325],
  "河马 / Hippopotamus": [213, 283],
  "犀牛 / Rhinoceros": [203, 275],
  "骆驼 / Camel": [203, 275],
  "长颈鹿 / Giraffe": [283, 400],
  // ── Fish ──
  // Tiny saltwater
  "小丑鱼 / Clownfish": [50, 95],
  "蓝倒吊 / Blue Tang": [55, 100],
  "蝴蝶鱼 / Butterflyfish": [55, 100],
  "海马 / Seahorse": [50, 95],
  "灯笼鱼 / Lanternfish": [50, 95],
  "桶眼鱼 / Barreleye": [50, 90],
  "蝰鱼 / Viperfish": [55, 100],
  // Small-medium saltwater
  "神仙鱼 / Angelfish": [60, 110],
  "狮子鱼 / Lionfish": [65, 115],
  "河豚 / Pufferfish": [60, 110],
  "鮟鱇鱼 / Anglerfish": [60, 110],
  "炮弹鱼 / Triggerfish": [70, 120],
  "刺尾鱼 / Surgeonfish": [65, 120],
  "隆头鱼 / Wrasse": [70, 130],
  "飞鱼 / Flying Fish": [75, 130],
  // Medium saltwater
  "鹦嘴鱼 / Parrotfish": [100, 160],
  "墨鱼 / Cuttlefish": [95, 158],
  "乌贼 / Squid": [100, 165],
  "章鱼 / Octopus": [110, 170],
  "电鳐 / Electric Ray": [130, 180],
  "石斑鱼 / Grouper": [120, 175],
  // Large saltwater
  "护士鲨 / Nurse Shark": [150, 200],
  "魟 / Stingray": [140, 190],
  "柠檬鲨 / Lemon Shark": [155, 210],
  "金枪鱼 / Tuna": [155, 220],
  "蓝鲨 / Blue Shark": [160, 220],
  "牛鲨 / Bull Shark": [165, 230],
  "蝠鲼 / Manta Ray": [165, 230],
  "翻车鱼 / Ocean Sunfish": [165, 230],
  "虎鲨 / Tiger Shark": [170, 240],
  "锤头鲨 / Hammerhead Shark": [170, 240],
  "枪鱼 / Swordfish": [170, 240],
  "大白鲨 / Great White Shark": [175, 250],
  "旗鱼 / Marlin": [175, 250],
  "鲸鲨 / Whale Shark": [185, 270],
  "皇带鱼 / Oarfish": [183, 265],
  // Tiny freshwater
  "孔雀鱼 / Guppy": [45, 88],
  "斗鱼 / Betta Fish": [50, 93],
  "金鱼 / Goldfish": [55, 105],
  // Small-medium freshwater
  "食人鱼 / Piranha": [90, 148],
  "锦鲤 / Koi": [100, 160],
  "鲫鱼 / Crucian Carp": [100, 158],
  "鲈鱼 / Bass": [110, 168],
  "虹鳟 / Rainbow Trout": [120, 175],
  "鲶鱼 / Catfish": [130, 185],
  // Large freshwater
  "鲤鱼 / Carp": [140, 198],
  "草鱼 / Grass Carp": [150, 210],
  "电鳗 / Electric Eel": [165, 230],
  "鳄雀鳝 / Alligator Gar": [168, 238],
};

const breedHeightDefaults = {
  "哺乳类 / Mammals": [120, 190],
  "鸟类 / Birds": [110, 175],
  "爬行类 / Reptiles": [90, 165],
  "两栖类 / Amphibians": [55, 120],
  "节肢动物 / Arthropods": [20, 80],
  "鱼类 / Fish": [50, 130],
};

function getHeightRange(breedSpecific, breedClass) {
  if (breedSpecific && breedHeight[breedSpecific])
    return breedHeight[breedSpecific];
  return breedHeightDefaults[breedClass] || [100, 200];
}

function updateHeightOptions() {
  const breedSpecific = _breedSel("petBreed");
  const breedClass = _breedSel("petBreedClass");
  const [min, max] = getHeightRange(breedSpecific, breedClass);
  const select = document.getElementById("petHeight");
  const wrapper = document.getElementById("heightWrapper");

  select.innerHTML =
    '<option value="" disabled selected hidden>选择身高 / Select height...</option>';
  for (let h = min; h <= max; h += 5) {
    const opt = document.createElement("option");
    opt.value = `${h}`;
    opt.textContent = `${h} cm`;
    select.appendChild(opt);
  }
  // If mixed, wait until breed2 is selected before showing height
  if (!document.getElementById("isMixed")?.checked) {
    wrapper.classList.remove("hidden");
  }
}

function updateHeightOptions2() {
  updateHeightOptions();
  document.getElementById("heightWrapper")?.classList.remove("hidden");
}

// ── Housing inputs ────────────────────────────────────────────

function rollDistrictDice(prefix) {
  const btn = document.getElementById(`${prefix}-district-dice-btn`);
  const display = document.getElementById(`${prefix}-district-display`);
  const hidden = document.getElementById(`${prefix}-district`);
  if (!btn || !display) return;
  const rolls = parseInt(btn.dataset.rolls || "0", 10);
  if (rolls >= MAX_HOUSING_ROLLS) return;
  btn.dataset.rolls = rolls + 1;
  btn.disabled = true;
  let count = 0;
  const iv = setInterval(() => {
    btn.innerHTML = diceFaceImg(Math.floor(Math.random() * 6) + 1, 4);
    count++;
    if (count >= 16) {
      clearInterval(iv);
      const roll = Math.floor(Math.random() * 6) + 1;
      btn.innerHTML = diceFaceImg(roll, 4);
      const remaining = MAX_HOUSING_ROLLS - parseInt(btn.dataset.rolls, 10);
      btn.disabled = remaining <= 0;
      if (remaining <= 0) btn.classList.add("dice-exhausted");
      else btn.title = `还可摇 ${remaining} 次 / ${remaining} rolls left`;
      const tier = HOUSING_TIERS.districtTiers[roll];
      const picked = tier[Math.floor(Math.random() * tier.length)];
      if (hidden) hidden.value = picked;
      display.textContent = disp(picked);
    }
  }, 70);
}

function rollVehicleTypeDice() {
  const btn = document.getElementById("vehicle-type-dice-btn");
  if (!btn) return;
  const rolls = parseInt(btn.dataset.rolls || "0", 10);
  if (rolls >= MAX_HOUSING_ROLLS) return;
  btn.dataset.rolls = rolls + 1;
  btn.disabled = true;
  let count = 0;
  const iv = setInterval(() => {
    btn.innerHTML = diceFaceImg(Math.floor(Math.random() * 6) + 1, 4);
    count++;
    if (count >= 16) {
      clearInterval(iv);
      const roll = Math.floor(Math.random() * 6) + 1;
      btn.innerHTML = diceFaceImg(roll, 4);
      const remaining = MAX_HOUSING_ROLLS - parseInt(btn.dataset.rolls, 10);
      btn.disabled = remaining <= 0;
      if (remaining <= 0) btn.classList.add("dice-exhausted");
      else btn.title = `还可摇 ${remaining} 次 / ${remaining} rolls left`;
      const tier = HOUSING_TIERS.vehicleTypes[roll];
      // pick one from the tier randomly
      const picked = tier[Math.floor(Math.random() * tier.length)];
      const hidden = document.getElementById("vehicle-types-hidden");
      if (hidden) hidden.value = picked;
      const display = document.getElementById("vehicle-types-display");
      if (display) display.textContent = picked;
      // show car model dice only for 普通车 or 豪车
      const needsModel = picked.startsWith("普通车") || picked.startsWith("豪车");
      const modelWrapper = document.getElementById("vehicle-car-model-wrapper");
      if (modelWrapper) {
        // 品牌框什么时候出现由 _updateVehicleSteps 决定（一项一项出现）
        if (!needsModel) {
          const mBtn = document.getElementById("vehicle-model-dice-btn");
          const mDisp = document.getElementById("vehicle-model-display");
          const mInp = document.getElementById("vehicle-model");
          if (mBtn) { mBtn.dataset.rolls = "0"; mBtn.disabled = false; mBtn.classList.remove("dice-exhausted"); mBtn.innerHTML = diceFaceImg(6, 4); }
          if (mDisp) mDisp.textContent = "—";
          if (mInp) mInp.value = "";
        }
        const modelLabel = document.getElementById("vehicle-model-label");
        if (modelLabel) modelLabel.textContent = picked.startsWith("豪车") ? "豪车品牌 Luxury Brand" : "车辆品牌 Car Brand";
      }
      // determine price tier category from vehicle type
      let priceTierKey = "regularCar";
      if (picked.includes("自行车") || picked.includes("单轮车") || picked.includes("三轮车")) priceTierKey = "bicycle";
      else if (picked.includes("电瓶车")) priceTierKey = "ebike";
      else if (picked.includes("摩托车")) priceTierKey = "motorcycle";
      else if (picked.includes("豪车")) priceTierKey = "luxuryCar";
      // store category and reset price dice
      const priceWrapper = document.getElementById("vehicle-price-wrapper");
      // 价值框最后才出现（_updateVehicleSteps）；这里只记下价位档次
      if (priceWrapper) priceWrapper.dataset.priceTier = priceTierKey;
      const pBtn = document.getElementById("vehicle-price-dice-btn");
      const pDisp = document.getElementById("vehicle-price-display");
      const pInp = document.getElementById("vehicle-price");
      if (pBtn) { pBtn.dataset.rolls = "0"; pBtn.disabled = false; pBtn.classList.remove("dice-exhausted"); pBtn.innerHTML = diceFaceImg(6, 4); }
      if (pDisp) pDisp.textContent = "—";
      if (pInp) pInp.value = "";
    }
  }, 70);
}

function rollVehicleModelDice() {
  const btn = document.getElementById("vehicle-model-dice-btn");
  const display = document.getElementById("vehicle-model-display");
  const hidden = document.getElementById("vehicle-model");
  const typesHidden = document.getElementById("vehicle-types-hidden");
  if (!btn || !display) return;
  const rolls = parseInt(btn.dataset.rolls || "0", 10);
  if (rolls >= MAX_HOUSING_ROLLS) return;
  btn.dataset.rolls = rolls + 1;
  btn.disabled = true;
  const isLuxury = (typesHidden?.value || "").startsWith("豪车");
  let count = 0;
  const iv = setInterval(() => {
    btn.innerHTML = diceFaceImg(Math.floor(Math.random() * 6) + 1, 4);
    count++;
    if (count >= 16) {
      clearInterval(iv);
      const roll = Math.floor(Math.random() * 6) + 1;
      btn.innerHTML = diceFaceImg(roll, 4);
      const remaining = MAX_HOUSING_ROLLS - parseInt(btn.dataset.rolls, 10);
      btn.disabled = remaining <= 0;
      if (remaining <= 0) btn.classList.add("dice-exhausted");
      else btn.title = `还可摇 ${remaining} 次 / ${remaining} rolls left`;
      const tier = (isLuxury ? HOUSING_TIERS.carModelsLuxury : HOUSING_TIERS.carModelsRegular)[roll];
      const picked = tier[Math.floor(Math.random() * tier.length)];
      if (hidden) hidden.value = picked;
      display.textContent = disp(picked);
    }
  }, 70);
}

function rollVehicleFieldDice(field) {
  const btn = document.getElementById(`vehicle-${field}-dice-btn`);
  const display = document.getElementById(`vehicle-${field}-display`);
  if (!btn || !display) return;
  const rolls = parseInt(btn.dataset.rolls || "0", 10);
  if (rolls >= MAX_HOUSING_ROLLS) return;
  btn.dataset.rolls = rolls + 1;
  btn.disabled = true;
  let count = 0;
  const iv = setInterval(() => {
    btn.innerHTML = diceFaceImg(Math.floor(Math.random() * 6) + 1, 4);
    count++;
    if (count >= 16) {
      clearInterval(iv);
      const roll = Math.floor(Math.random() * 6) + 1;
      btn.innerHTML = diceFaceImg(roll, 4);
      const remaining = MAX_HOUSING_ROLLS - parseInt(btn.dataset.rolls, 10);
      btn.disabled = remaining <= 0;
      if (remaining <= 0) btn.classList.add("dice-exhausted");
      else btn.title = `还可摇 ${remaining} 次 / ${remaining} rolls left`;
      let tierMap;
      if (field === "count") {
        tierMap = HOUSING_TIERS.vehicleCount;
      } else {
        const priceTierKey = document.getElementById("vehicle-price-wrapper")?.dataset.priceTier || "regularCar";
        tierMap = HOUSING_TIERS.vehiclePriceByType[priceTierKey] || HOUSING_TIERS.vehiclePriceByType.regularCar;
      }
      const value = tierMap[roll];
      document.getElementById(`vehicle-${field}`).value = value;
      display.textContent = disp(value);
    }
  }, 70);
}

function rollParentsFieldDice(field) {
  const btn = document.getElementById(`parents-${field}-dice-btn`);
  const display = document.getElementById(`parents-${field}-display`);
  if (!btn || !display) return;
  const rolls = parseInt(btn.dataset.rolls || "0", 10);
  if (rolls >= MAX_HOUSING_ROLLS) return;
  btn.dataset.rolls = rolls + 1;
  btn.disabled = true;
  let count = 0;
  const iv = setInterval(() => {
    btn.innerHTML = diceFaceImg(Math.floor(Math.random() * 6) + 1, 4);
    count++;
    if (count >= 16) {
      clearInterval(iv);
      const roll = Math.floor(Math.random() * 6) + 1;
      btn.innerHTML = diceFaceImg(roll, 4);
      const remaining = MAX_HOUSING_ROLLS - parseInt(btn.dataset.rolls, 10);
      btn.disabled = remaining <= 0;
      if (remaining <= 0) btn.classList.add("dice-exhausted");
      else btn.title = `还可摇 ${remaining} 次 / ${remaining} rolls left`;
      let value;
      if (field === "status") {
        value = HOUSING_TIERS.parentsStatus[roll];
      } else if (field === "relationship") {
        value = HOUSING_TIERS.parentsRelationship[roll];
      } else if (field === "siblingCount") {
        value = HOUSING_TIERS.siblingCount[roll];
      } else if (field === "siblingWealth") {
        const rawClass = (document.getElementById("petBreedClass")?.value || "").split(" / ")[0].trim();
        const tierMap = HOUSING_TIERS.siblingWealthBySpecies[rawClass] || HOUSING_TIERS.siblingWealthBySpecies["default"];
        value = tierMap[roll];
      }
      document.getElementById(`parents-${field}`).value = value;
      display.textContent = disp(value);
      if (field === "status") {
        const bothAlive = value === "都健在";
        const fatherAlive = bothAlive || value === "仅父亲健在";
        const motherAlive = bothAlive || value === "仅母亲健在";
        document.getElementById("parents-father-wrapper")?.classList.toggle("hidden", !fatherAlive);
        document.getElementById("parents-mother-wrapper")?.classList.toggle("hidden", !motherAlive);
        document.getElementById("parents-rel-wrapper")?.classList.toggle("hidden", !bothAlive);
      } else if (field === "siblingCount") {
        const hasSiblings = value !== "独生/Only Child";
        document.getElementById("siblings-wealth-wrapper")?.classList.toggle("hidden", !hasSiblings);
      }
    }
  }, 70);
}

function getHousingDistrictValue(prefix) {
  // setup form uses a hidden input set by dice
  const hidden = document.getElementById(`${prefix}-district`);
  if (hidden) return hidden.value || "";
  // edit form fallback: select dropdown
  const sel = document.getElementById(`${prefix}-district-select`);
  if (!sel) return "";
  if (sel.value === "自定义") {
    return document.getElementById(`${prefix}-district-custom`)?.value.trim() || "";
  }
  return sel.value || "";
}

function getHouseTypeValue(prefix) {
  const sel = document.getElementById(`${prefix}-type`);
  if (!sel) return "";
  if (sel.value === "自定义") {
    return document.getElementById(`${prefix}-type-custom`).value.trim();
  }
  return sel.value || "";
}

// ── 地区选择：洲 → 国家 → 省/州 → 城市（数据在 geo-data.js 的 GEO_DATA）──
// 每一级最后都有「自定义」：选了就直接输入城市名（不能有标点）。
// 城市选项的 value 是中文城市名（房子档次评分按中文名判断），英文名放在 data-en 里。
const _GEO_CUSTOM = "__custom__";
// [层级, 下拉提示, 标题]：每一级的标题单独一行，放在自己的下拉框上面
const _GEO_LEVELS = [
  ["continent", "选择洲 / Select Continent...", "洲 Continent"],
  ["country", "选择国家或地区 / Select Country or Region...", "国家/地区 Country/Region"],
  ["division", "选择省或州 / Select Province or State...", "省/州 Province/State"],
  ["city", "选择城市 / Select City...", "城市 City"],
];
const _geoPair = (s) => {
  const [zh, en] = s.split("|");
  return { zh, en };
};
const _geoCities = (s) => s.split(";").map(_geoPair);

function buildCitySelectors(prefix) {
  const root = document.getElementById(`${prefix}-geo`);
  if (!root) return;
  root.innerHTML =
    _GEO_LEVELS.map(([lv, , label], i) => `
      <div id="${prefix}-${lv}-wrap" class="geo-level${i ? " hidden" : ""}">
        <label>${label}</label>
        <div class="nes-select">
          <select id="${prefix}-${lv}-select" onchange="_onGeoChange('${prefix}','${lv}')"></select>
        </div>
      </div>`).join("") +
    `<div id="${prefix}-city-custom-wrap" class="geo-level hidden">
       <label>城市 City</label>
       <input id="${prefix}-city-custom" class="nes-input hidden" type="text" maxlength="20"
         placeholder="输入城市名（不能有标点）/ City name (no punctuation)" />
     </div>`;
  _attachNoPunct(document.getElementById(`${prefix}-city-custom`));
  _fillGeoSelect(prefix, "continent", GEO_DATA.map(([name]) => _geoPair(name)));
}

// 填一级下拉。前三级 value 用序号；城市 value 用中文名
function _fillGeoSelect(prefix, lv, items) {
  const sel = document.getElementById(`${prefix}-${lv}-select`);
  const ph = _GEO_LEVELS.find(([l]) => l === lv)[1];
  sel.innerHTML = `<option value="" disabled selected hidden>${ph}</option>`;
  items.forEach((it, i) => {
    const opt = document.createElement("option");
    opt.value = lv === "city" ? it.zh : String(i);
    // 用户自定义加进来的地名只有一种写法：原样显示，不按中英拆
    opt.textContent = it.en ? `${it.zh} ${it.en}` : it.zh;
    if (!it.en) opt.dataset.noi18n = "";
    if (lv === "city" && it.en) opt.dataset.en = it.en;
    sel.appendChild(opt);
  });
  const custom = document.createElement("option");
  custom.value = _GEO_CUSTOM;
  custom.textContent = "自定义 Custom";
  sel.appendChild(custom);
  document.getElementById(`${prefix}-${lv}-wrap`).classList.remove("hidden");
}

function _onGeoChange(prefix, lv) {
  const idx = _GEO_LEVELS.findIndex(([l]) => l === lv);
  const v = document.getElementById(`${prefix}-${lv}-select`).value;
  const customInput = document.getElementById(`${prefix}-city-custom`);

  // 更深的层级全部收起、清空
  _GEO_LEVELS.slice(idx + 1).forEach(([l]) => {
    document.getElementById(`${prefix}-${l}-wrap`).classList.add("hidden");
    document.getElementById(`${prefix}-${l}-select`).innerHTML = "";
  });

  // 任何一级选「自定义」→ 直接输入城市名（带「城市 City」标题）
  const customWrap = document.getElementById(`${prefix}-city-custom-wrap`);
  if (v === _GEO_CUSTOM) {
    customWrap.classList.remove("hidden");
    customInput.classList.remove("hidden");
    return;
  }
  customWrap.classList.add("hidden");
  customInput.classList.add("hidden");
  customInput.value = "";

  const ci = document.getElementById(`${prefix}-continent-select`).value;
  if (lv === "continent") {
    _fillGeoSelect(prefix, "country", GEO_DATA[ci][1].map(([name]) => _geoPair(name)));
  } else if (lv === "country") {
    const body = GEO_DATA[ci][1][v][1];
    if (Array.isArray(body)) _fillGeoSelect(prefix, "division", body.map(([name]) => _geoPair(name)));
    else _fillGeoSelect(prefix, "city", _geoCities(body));
  } else if (lv === "division") {
    const country = document.getElementById(`${prefix}-country-select`).value;
    const [, cities, direct] = GEO_DATA[ci][1][country][1][v];
    _fillGeoSelect(prefix, "city", _geoCities(cities));
    if (direct) {
      // 直辖（如北京市、香港）：城市就是它自己，自动选好、不再显示城市下拉
      const citySel = document.getElementById(`${prefix}-city-select`);
      citySel.selectedIndex = 1;
      document.getElementById(`${prefix}-city-wrap`).classList.add("hidden");
    }
  }
}

// ── 通用：页面上的项按顺序一条一条出现，每次只多出下一项 ──
// steps: [{ el: 元素 id, value: 值 input id, applies?: () => 是否适用, label?: 提示用名字 }]
// 不适用的项直接隐藏、不挡后面；返回第一个还没填的项（用于检查）
const _val = (id) => document.getElementById(id)?.value || "";
function _applySteps(steps, startReady) {
  let prevDone = startReady;
  let firstMissing = null;
  for (const st of steps) {
    const el = document.getElementById(st.el);
    if (st.applies && !st.applies()) {
      el?.classList.add("hidden");
      continue;
    }
    el?.classList.toggle("hidden", !prevDone);
    const has = !!_val(st.value);
    if (!has && !firstMissing) firstMissing = st;
    prevDone = prevDone && has;
  }
  return firstMissing;
}
// ── 填写页：新出现的项如果在可视范围外（被挡住/在下面），自动滚到能看见 ──
// 监听所有填写页里「hidden 被去掉」的元素；同一轮里出现好几个时，滚到最后出现的那个
(() => {
  let target = null;
  new MutationObserver((muts) => {
    for (const m of muts) {
      const el = m.target;
      if (!(el instanceof HTMLElement)) continue;
      if (!(m.oldValue || "").split(/\s+/).includes("hidden") || el.classList.contains("hidden")) continue;
      const scroller = el.closest(".setup-page .setup-content");
      if (!scroller || !el.closest(".page.active")) continue;
      target = el;
    }
    if (!target) return;
    const el = target;
    target = null;
    // 等这一轮显示/隐藏都排完再滚
    setTimeout(() => {
      const scroller = el.closest(".setup-content");
      if (!scroller || el.offsetParent === null) return;
      const box = scroller.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      if (r.bottom > box.bottom) scroller.scrollBy({ top: r.bottom - box.bottom + 12, behavior: "smooth" });
      else if (r.top < box.top) scroller.scrollBy({ top: r.top - box.top - 12, behavior: "smooth" });
    }, 30);
  }).observe(document.body, { attributes: true, attributeFilter: ["class"], attributeOldValue: true, subtree: true });
})();

// 页面里任何骰子结果变了 / 下拉或输入变了，就重新排一次
function _watchSteps(sectionId, update) {
  const sec = document.getElementById(sectionId);
  if (!sec) return;
  sec.addEventListener("change", update);
  sec.addEventListener("input", update);
  new MutationObserver((muts) => {
    if (muts.some((m) => (m.target.nodeType === 1 ? m.target : m.target.parentElement)?.closest(".dice-result-input"))) update();
  }).observe(sec, { childList: true, characterData: true, subtree: true });
  update();
}

// ── 房子页 ──
const _HOUSE_VILLA_TYPES = ["别墅", "四合院", "老洋房"];
const _HOUSE_APT_TYPES = ["公寓", "大平层", "普通住宅", "石库门"];
const _HOUSE_STEPS = [
  { el: "house-step-district", value: "house-district", label: "区域", labelEn: "District" },
  { el: "house-step-type", value: "house-type", label: "房屋类型", labelEn: "House type" },
  { el: "house-villa-wrapper", value: "house-villa-floors", label: "别墅共几层", labelEn: "Villa floors", applies: () => _HOUSE_VILLA_TYPES.includes(_val("house-type")) },
  { el: "house-garden-section", value: "house-garden", label: "有院子吗", labelEn: "Garden", applies: () => _HOUSE_VILLA_TYPES.includes(_val("house-type")) },
  { el: "house-step-area", value: "house-area", label: "面积", labelEn: "Area" },
  { el: "house-apt-floors-wrapper", value: "house-apt-floor", label: "住在第几层", labelEn: "Floor", applies: () => _HOUSE_APT_TYPES.includes(_val("house-type")) },
  { el: "house-apt-total-section", value: "house-apt-total", label: "一共几层", labelEn: "Total floors", applies: () => _HOUSE_APT_TYPES.includes(_val("house-type")) },
  { el: "house-step-tenure", value: "house-tenure", label: "租还是买", labelEn: "Rent or buy" },
  { el: "house-ownership-section", value: "house-ownership", label: "产权归属", labelEn: "Ownership", applies: () => _val("house-tenure") === "购买" },
  { el: "house-mortgage-wrapper", value: "house-mortgage", label: "有房贷吗", labelEn: "Mortgage", applies: () => _val("house-tenure") === "购买" },
  { el: "house-price-wrapper", value: "house-price", label: "房价", labelEn: "Price" },
];
function _updateHouseSteps() {
  // 第一项要等城市选好；返回第一个还没填的项（检查用）
  const missing = _applySteps(_HOUSE_STEPS, !!getHousingCityValue("house"));
  // 价格标题：租房是「租金」，买房是「房价」
  const priceLabel = document.getElementById("house-price-label");
  if (priceLabel) priceLabel.textContent = _val("house-tenure") === "购买" ? "房价 Price" : "租金 Rent";
  if (missing?.value === "house-price" && _val("house-tenure") !== "购买") return { ...missing, label: "租金", labelEn: "Rent" };
  return missing;
}
function _watchHouseSteps() {
  _watchSteps("profile-housing", _updateHouseSteps);
}

// ── 车辆页：类型 → 品牌（普通车/豪车才有）→ 数量 → 价值 ──
const _VEHICLE_STEPS = [
  { el: "vehicle-car-model-wrapper", value: "vehicle-model",
    applies: () => /^(普通车|豪车)/.test(_val("vehicle-types-hidden")) },
  { el: "vehicle-step-count", value: "vehicle-count" },
  { el: "vehicle-price-wrapper", value: "vehicle-price" },
];
function _updateVehicleSteps() {
  _applySteps(_VEHICLE_STEPS, !!_val("vehicle-types-hidden"));
}

// ── 自定义选项库：大家自定义过的性别 / 性取向 / 城市（服务器 /custom-options）──
// 页面加载时合进下拉选项；生成档案时把这次用到的自定义内容存进去（_saveCustomOptions）
const _OTHER_GEO = "其他|Other";

async function loadCustomOptions() {
  try {
    const opts = await (await api("/custom-options")).json();
    (opts.gender || []).forEach((v) => _addCustomSelectOption("petGender", v));
    (opts.orientation || []).forEach((v) => _addCustomSelectOption("petOrientation", v));
    (opts.city || []).forEach(_mergeCustomCity);
  } catch (_) {}
}

// 加在「自定义」选项前面；文字是用户写的，原样显示
function _addCustomSelectOption(selectId, value) {
  const sel = document.getElementById(selectId);
  if (!sel || !value || [...sel.options].some((o) => o.value === value)) return;
  const opt = document.createElement("option");
  opt.value = value;
  opt.textContent = value;
  opt.dataset.noi18n = "";
  sel.insertBefore(opt, sel.querySelector('option[value="自定义/Custom"]'));
}

// 自定义城市合进 GEO_DATA：path 是选「自定义」之前已经选好的几级（中文名）。
// 缺的那几级放进「其他 Other」，比如只选了洲 → 洲 / 其他 / 城市
function _mergeCustomCity({ name, path = [] }) {
  if (!name) return;
  const zhOf = (node) => node[0].split("|")[0];
  const findOrAdd = (list, zh, make) => {
    let node = zh && list.find((n) => zhOf(n) === zh);
    if (!node) {
      node = list.find((n) => n[0] === _OTHER_GEO);
      if (!node) list.push((node = make()));
    }
    return node;
  };
  const addCity = (holder, idx) => {
    const cities = holder[idx] ? holder[idx].split(";") : [];
    if (!cities.some((c) => c.split("|")[0] === name)) holder[idx] = [...cities, name].join(";");
  };
  const continent = findOrAdd(GEO_DATA, path[0], () => [_OTHER_GEO, []]);
  const country = findOrAdd(continent[1], path[1], () => [_OTHER_GEO, ""]);
  if (typeof country[1] === "string") return addCity(country, 1);
  const division = findOrAdd(country[1], path[2], () => [_OTHER_GEO, ""]);
  if (division[2]) return; // 直辖市（如北京市）不会有自定义城市
  addCity(division, 1);
}

// 选「自定义」之前已经选好的洲 / 国家 / 省（中文名）
function _geoPath(prefix) {
  const path = [];
  let node = { 1: GEO_DATA };
  for (const lv of ["continent", "country", "division"]) {
    const sel = document.getElementById(`${prefix}-${lv}-select`);
    const wrap = document.getElementById(`${prefix}-${lv}-wrap`);
    if (!sel || wrap?.classList.contains("hidden") || !sel.value || sel.value === _GEO_CUSTOM) break;
    node = node[1][Number(sel.value)];
    if (!node) break;
    path.push(node[0].split("|")[0]);
    if (!Array.isArray(node[1])) break;
  }
  return path;
}

// 生成档案后：这次用到的自定义性别 / 性取向 / 城市存进系统
function _saveCustomOptions() {
  const post = (body) =>
    api("/custom-options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
  const body = {};
  if (_val("petGender") === "自定义/Custom") body.gender = getCustomFieldValue("petGender", "gender-custom");
  if (_val("petOrientation") === "自定义/Custom") body.orientation = getCustomFieldValue("petOrientation", "orientation-custom");
  if (body.gender || body.orientation) post(body);
  ["house", "parents-father", "parents-mother"].forEach((prefix) => {
    const input = document.getElementById(`${prefix}-city-custom`);
    if (!input || input.classList.contains("hidden") || input.closest(".hidden")) return;
    const name = getHousingCityValue(prefix);
    if (name) post({ city: { name, path: _geoPath(prefix) } });
  });
}

// 城市中文名（用于存档和评分）；自定义时是输入的文字
function getHousingCityValue(prefix) {
  const customInput = document.getElementById(`${prefix}-city-custom`);
  if (customInput && !customInput.classList.contains("hidden")) {
    return _stripPunct(customInput.value).trim();
  }
  return document.getElementById(`${prefix}-city-select`)?.value || "";
}

// 选中城市所在国家的中文名；国家这一级（或更上一级）选了自定义时返回 ""
function getHousingCountry(prefix) {
  const ci = document.getElementById(`${prefix}-continent-select`)?.value;
  const co = document.getElementById(`${prefix}-country-select`)?.value;
  if (!ci || !co || ci === _GEO_CUSTOM || co === _GEO_CUSTOM) return "";
  return GEO_DATA[ci]?.[1]?.[co]?.[0]?.split("|")[0] || "";
}

// 显示用的城市名：「中文 / English」；自定义时是输入的文字
function getCityDisplayName(prefix) {
  const zh = getHousingCityValue(prefix);
  if (!zh) return "";
  const customInput = document.getElementById(`${prefix}-city-custom`);
  if (customInput && !customInput.classList.contains("hidden")) return zh;
  const sel = document.getElementById(`${prefix}-city-select`);
  const en = sel?.options[sel.selectedIndex]?.dataset.en;
  return en ? `${zh} / ${en}` : zh;
}

// ── Housing & income tier data ─────────────────────────────────
const HOUSING_TIERS = {
  // District: 9 options grouped into 6 dice tiers (low→high prestige)
  districtTiers: {
    1: ["郊区"],
    2: ["老城区", "新区"],
    3: ["学区", "科技园区"],
    4: ["市中心", "滨水区"],
    5: ["CBD"],
    6: ["豪华住宅区"],
  },
  type: {
    1: "下水管道",
    2: "地下室",
    3: "普通住宅",
    4: "公寓",
    5: "大平层",
    6: "别墅",
  },
  garden: {
    1: "无院子",
    2: "无院子",
    3: "无院子",
    4: "有院子",
    5: "有院子",
    6: "有院子",
  },
  area: {
    1: "20-40",
    2: "50-80",
    3: "80-120",
    4: "120-200",
    5: "200-400",
    6: "500+",
  },
  tenure: {
    1: "租住中",
    2: "租住中",
    3: "购买",
    4: "购买",
    5: "购买",
    6: "购买",
  },
  ownership: {
    1: "父母名下",
    2: "父母名下",
    3: "父母名下",
    4: "父母名下",
    5: "父母名下",
    6: "自己名下",
  },
  mortgage: {
    1: "有房贷",
    2: "有房贷",
    3: "有房贷",
    4: "有房贷",
    5: "无房贷",
    6: "无房贷",
  },
  priceRent: {
    1: "月租500元",
    2: "月租1000元",
    3: "月租3000元",
    4: "月租5000元",
    5: "月租1w元",
    6: "月租3w+",
  },
  priceBuy: {
    1: "50w",
    2: "100w",
    3: "300w",
    4: "500w",
    5: "1000w",
    6: "3000w+",
  },
  // House price tiers scaled by type
  priceRentByType: {
    cheap:  { 1:"月租300元", 2:"月租500元",  3:"月租800元",  4:"月租1000元", 5:"月租1500元", 6:"月租2000元" },
    mid:    { 1:"月租500元", 2:"月租1000元", 3:"月租2000元", 4:"月租3500元", 5:"月租5000元", 6:"月租8000元" },
    high:   { 1:"月租1000元",2:"月租2000元", 3:"月租4000元", 4:"月租6000元", 5:"月租1w元",   6:"月租2w+"    },
    luxury: { 1:"月租5000元",2:"月租8000元", 3:"月租1.5w元", 4:"月租2.5w元", 5:"月租5w元",   6:"月租10w+"   },
  },
  priceBuyByType: {
    cheap:  { 1:"5w",   2:"10w",   3:"20w",   4:"30w",   5:"50w",    6:"80w"    },
    mid:    { 1:"30w",  2:"50w",   3:"100w",  4:"200w",  5:"300w",   6:"500w"   },
    high:   { 1:"100w", 2:"200w",  3:"350w",  4:"600w",  5:"1000w",  6:"1500w"  },
    luxury: { 1:"300w", 2:"600w",  3:"1000w", 4:"2000w", 5:"3000w",  6:"5000w+" },
  },
  income: {
    1: "3k以下",
    2: "3k-8k",
    3: "8k-15k",
    4: "15k-30k",
    5: "3w-10w/月",
    6: "10w+/月",
  },
  // 还有几段其他关系：都是确切数字（数组 = 这一档里随机取一个）
  shipCount: { 1: "0", 2: "1", 3: "2", 4: "3", 5: "4", 6: ["5", "6", "7", "8"] },
  pastRelCount: {
    1: "0",
    2: ["1", "2"],
    3: ["3", "4"],
    4: ["5", "6"],
    5: ["7", "8", "9", "10"],
    6: ["11", "12", "13", "15", "20"],
  },
  exContact: {
    1: "完全断联/No Contact",
    2: "完全断联/No Contact",
    3: "偶尔联系/Occasional",
    4: "还是朋友/Still Friends",
    5: "暧昧未清/Unresolved",
    6: "藕断丝连/On & Off",
  },
  stillLoveEx: {
    1: "完全放下/Moved On",
    2: "完全放下/Moved On",
    3: "不确定/Not Sure",
    4: "有一点/A Little",
    5: "还爱/Still Love",
    6: "深爱/Still Deeply",
  },
  whiteMoonlight: {
    1: "没有/None",
    2: "没有/None",
    3: "没有/None",
    4: "可能有/Maybe",
    5: "有/Yes",
    6: "一直有/Always",
  },
  hasKids: {
    1: "0",
    2: "0",
    3: "0",
    4: "1",
    5: "2",
    6: ["3", "4", "5"],
  },
  hasCrush: {
    1: "没有/None",
    2: "没有/None",
    3: "可能/Maybe",
    4: "有/Yes",
    5: "暗恋中/Secretly",
    6: "强烈迷恋/Intensely",
  },
  // 每一面有几个选项，摇到那一面时随机取一个
  datingPurpose: {
    1: ["孤独/Lonely", "打发时间/Killing Time"],
    2: ["炮友/FWB", "刚分手/Just Broke Up"],
    3: ["一夜情/ONS", "探索一下/Just Exploring"],
    4: ["好玩/Just for Fun", "想认真恋爱/Looking for Love"],
    5: ["三人行/Threesome", "被朋友安利/Friend's Rec"],
    6: ["和伴侣吵架了/Fight w/ Partner", "想认真恋爱/Looking for Love"],
  },
  relationshipGoal: {
    1: ["结交朋友/Make Friends", "短期交友/Short-term Fling"],
    2: ["长期固炮/Regular FWB", "床搭子/Bed Buddy"],
    3: ["搭子/Buddy", "饭搭子/Food Buddy", "唇友/Kissing Friend"],
    4: ["雌雄伴侣 / Dating", "严肃恋爱/Serious Relationship"],
    5: ["结婚对象/Marriage", "灵魂伴侣/Soulmate", "柏拉图/Platonic"],
    6: ["随缘/Whatever", "网恋/Online Romance"],
  },
  education: {
    1: "小学",
    2: "初中",
    3: "高中",
    4: "大专",
    5: "本科",
    6: "硕士+",
  },
  occupation: {
    1: ["无业 / Unemployed", "洞穴看守 / Cave Guard", "树懒学徒 / Sloth Apprentice"],
    2: ["体力劳动 / Manual Labor", "搬运工 / Porter", "挖洞工 / Burrow Digger", "伐木兽 / Lumberbeast"],
    3: ["服务业 / Service Industry", "毛发造型师 / Fur Stylist", "嗅觉侦探 / Scent Detective", "领地中介 / Territory Agent"],
    4: ["办公室职员 / Office Worker", "族群书记 / Clan Scribe", "信息素分析员 / Pheromone Analyst"],
    5: ["专业人士 / Professional", "兽医 / Vet", "族群顾问 / Pack Advisor", "猎物评估师 / Prey Assessor"],
    6: ["企业高管 / Executive", "首席领地官 / Chief Territory Officer", "族群酋长助理 / Alpha Assistant"],
  },
  mbtiEI: { 1: "I", 2: "I", 3: "I", 4: "E", 5: "E", 6: "E" },
  mbtiSN: { 1: "N", 2: "N", 3: "N", 4: "S", 5: "S", 6: "S" },
  mbtiTF: { 1: "F", 2: "F", 3: "F", 4: "T", 5: "T", 6: "T" },
  mbtiJP: { 1: "P", 2: "P", 3: "P", 4: "J", 5: "J", 6: "J" },
  villaFloors: { 1: "1层独栋", 2: "2层别墅", 3: "2层别墅", 4: "3层别墅", 5: "3层别墅", 6: "4层及以上" },
  aptFloor:    { 1: "1-5层", 2: "6-10层", 3: "11-20层", 4: "21-30层", 5: "31-40层", 6: "40层以上" },
  aptTotal:    { 1: "6层以下", 2: "10层", 3: "18层", 4: "28层", 5: "35层", 6: "50层以上" },
  vehicleCount: { 1: "1", 2: "1", 3: "2", 4: "2", 5: "3", 6: "4+" },
  vehiclePriceByType: {
    bicycle:    { 1: "500元以下", 2: "500-2000元", 3: "2000元-1w", 4: "1w-5w", 5: "5w-30w", 6: "30w+" },
    ebike:      { 1: "2000元以下", 2: "2000-5000元", 3: "5000元-1w", 4: "1w-2w", 5: "2w-5w", 6: "5w+" },
    motorcycle: { 1: "5000元以下", 2: "5000元-2w", 3: "2w-5w", 4: "5w-15w", 5: "15w-50w", 6: "50w+" },
    regularCar: { 1: "3w以下", 2: "3w-8w", 3: "8w-15w", 4: "15w-25w", 5: "25w-40w", 6: "40w-80w" },
    luxuryCar:  { 1: "30w-60w", 2: "60w-100w", 3: "100w-200w", 4: "200w-500w", 5: "500w-1000w", 6: "1000w+" },
  },
  vehicleTypes: {
    1: ["自行车 / Bicycle"],
    2: ["单轮车 / Unicycle", "三轮车 / Tricycle"],
    3: ["电瓶车 / E-Bike"],
    4: ["摩托车 / Motorcycle"],
    5: ["普通车 / Regular Car"],
    6: ["豪车 / Luxury Car"],
  },
  // Tiered car models — each tier has multiple options, one picked randomly
  carModelsRegular: {
    1: ["Toyota Corolla 丰田卡罗拉", "Nissan Sylphy 日产轩逸"],
    2: ["Honda Civic 本田思域", "Volkswagen Polo 大众Polo"],
    3: ["Volkswagen Golf 大众高尔夫", "Mazda 3 马自达3"],
    4: ["Toyota Camry 丰田凯美瑞", "Honda Accord 本田雅阁"],
    5: ["Nissan Teana 日产天籁", "Mazda 6 马自达6"],
    6: ["BMW 3 Series 宝马3系(入门)", "Mercedes C-Class 奔驰C级(入门)"],
  },
  carModelsLuxury: {
    1: ["BMW 5 Series 宝马5系", "Mercedes E-Class 奔驰E级"],
    2: ["Audi A6 奥迪A6", "Volvo XC90 沃尔沃XC90"],
    3: ["BMW 7 Series 宝马7系", "Mercedes S-Class 奔驰S级"],
    4: ["Porsche Cayenne 保时捷卡宴", "Range Rover 路虎揽胜"],
    5: ["Ferrari Roma 法拉利Roma", "Porsche 911 保时捷911", "Lamborghini Huracán 兰博基尼"],
    6: ["Rolls-Royce Ghost 劳斯莱斯幻影", "Bentley Bentayga 宾利添越", "Bugatti Chiron 布加迪"],
  },
  parentsStatus: {
    1: "均已故",
    2: "仅父亲健在",
    3: "仅母亲健在",
    4: "都健在",
    5: "都健在",
    6: "都健在",
  },
  parentsRelationship: {
    1: "离婚/Divorced",
    2: "冷战/Cold War",
    3: "普通/Ordinary",
    4: "和睦/Harmonious",
    5: "恩爱/Loving",
    6: "神仙眷侣/Perfect Couple ✨",
  },
  siblingCount: {
    1: "独生/Only Child",
    2: "独生/Only Child",
    3: "1个/1 Sibling",
    4: "2个/2 Siblings",
    5: "3个/3 Siblings",
    6: "4个+/4+ Siblings",
  },
  siblingWealthBySpecies: {
    "哺乳类": { 1:"经济困难", 2:"普通",     3:"小康",     4:"小康",   5:"富裕",   6:"富裕✨" },
    "鸟类":   { 1:"经济困难", 2:"经济困难", 3:"普通",     4:"小康",   5:"小康",   6:"富裕"  },
    "爬行类": { 1:"经济困难", 2:"经济困难", 3:"经济困难", 4:"普通",   5:"普通",   6:"小康"  },
    "两栖类": { 1:"经济困难", 2:"经济困难", 3:"经济困难", 4:"普通",   5:"普通",   6:"小康"  },
    "节肢动物":{ 1:"经济困难", 2:"经济困难", 3:"经济困难", 4:"经济困难",5:"普通",  6:"普通"  },
    "鱼类":   { 1:"经济困难", 2:"经济困难", 3:"经济困难", 4:"普通",   5:"普通",   6:"小康"  },
    "default":{ 1:"经济困难", 2:"经济困难", 3:"普通",     4:"普通",   5:"小康",   6:"小康"  },
  },
  // City/region-specific housing type tiers (arrays = random pick from options)
  cityTypes: {
    "北京":    { 1:"下水管道", 2:"地下室", 3:"普通住宅", 4:"公寓", 5:"大平层", 6:["别墅","四合院"] },
    "上海":    { 1:"下水管道", 2:"地下室", 3:"普通住宅", 4:"公寓", 5:["大平层","石库门"], 6:["别墅","老洋房"] },
    "西南":    { 1:"下水管道", 2:"地下室", 3:"普通住宅", 4:"公寓", 5:["大平层","吊脚楼"], 6:"别墅" },
    "内蒙古":  { 1:"下水管道", 2:"地下室", 3:["普通住宅","蒙古包"], 4:"公寓", 5:"大平层", 6:"别墅" },
    "江南":    { 1:"下水管道", 2:"地下室", 3:"普通住宅", 4:"公寓", 5:["大平层","水乡民居"], 6:"别墅" },
    "黄土高原":{ 1:"下水管道", 2:"地下室", 3:["普通住宅","窑洞"], 4:"公寓", 5:"大平层", 6:"别墅" },
    "西北":    { 1:"下水管道", 2:"地下室", 3:["普通住宅","平顶房"], 4:"公寓", 5:"大平层", 6:"别墅" },
    "福建":    { 1:"下水管道", 2:"地下室", 3:"普通住宅", 4:"公寓", 5:["大平层","土楼"], 6:"别墅" },
    "藏区":    { 1:"下水管道", 2:"地下室", 3:"普通住宅", 4:["公寓","碉房"], 5:"大平层", 6:"别墅" },
    "东北":    { 1:"下水管道", 2:"地下室", 3:["普通住宅","东北民居"], 4:"公寓", 5:"大平层", 6:"别墅" },
  },
};

const SCORE_DEDUCTIONS = {
  // 房屋类型 / House type — only top tier gets bonus
  下水管道: -20,
  地下室: -15,
  普通住宅: -8,
  公寓: -3,
  大平层: 0,
  别墅: +15,
  // regional special types
  四合院: +15,
  老洋房: +15,
  石库门: -3,
  吊脚楼: 0,
  蒙古包: -8,
  水乡民居: 0,
  窑洞: -8,
  平顶房: -8,
  土楼: 0,
  碉房: -3,
  东北民居: -8,
  // 院子 / Garden — only 有院子 gets bonus
  无院子: 0,
  有院子: +5,
  // 面积 / Area — only 500+ gets bonus
  "20-40": -8,
  "50-80": -5,
  "80-120": -2,
  "120-200": 0,
  "200-400": 0,
  "500+": +10,
  // 租/买 / Tenure — only 购买 gets bonus
  租住中: -5,
  购买: +5,
  // 产权 / Ownership — only 自己名下 gets bonus
  父母名下: -5,
  自己名下: +8,
  // 房贷 / Mortgage — only 无房贷 gets bonus
  有房贷: -4,
  无房贷: +6,
  // 月租价格 / Rent price — only 月租3w+ gets bonus
  月租500元: -10,
  月租1000元: -6,
  月租3000元: -3,
  月租5000元: -1,
  月租1w元: 0,
  "月租3w+": +8,
  // 买房价格 / Buy price
  "5w": -15,
  "10w": -13,
  "20w": -11,
  "30w": -10,
  "50w": -10,
  "80w": -8,
  "100w": -6,
  "200w": -4,
  "300w": -3,
  "350w": -3,
  "500w": -1,
  "600w": -1,
  "1000w": 0,
  "1500w": +2,
  "2000w": +5,
  "3000w": +12,
  "3000w+": +12,
  "5000w+": +18,
  // 月租价格 (by type)
  "月租300元": -15,
  "月租800元": -8,
  "月租1500元": -5,
  "月租2000元": -3,
  "月租3500元": -2,
  "月租4000元": -1,
  "月租6000元": 0,
  "月租8000元": +2,
  "月租1.5w元": +4,
  "月租2w+": +7,
  "月租2.5w元": +9,
  "月租5w元": +12,
  "月租10w+": +18,
  // 月收入 / Income — only 10w+/月 gets bonus
  "3k以下": -12,
  "3k-8k": -7,
  "8k-15k": -3,
  "15k-30k": 0,
  "3w-10w/月": 0,
  "10w+/月": +15,
  // 学历 / Education — only 硕士+ gets bonus
  小学: -10,
  初中: -6,
  高中: -3,
  大专: -1,
  本科: 0,
  "硕士+": +8,
  // 职业 / Occupation — only 企业高管 gets bonus（同一档的兽人职业分数相同）
  "无业 / Unemployed": -10, "洞穴看守 / Cave Guard": -10, "树懒学徒 / Sloth Apprentice": -10,
  "体力劳动 / Manual Labor": -5, "搬运工 / Porter": -5, "挖洞工 / Burrow Digger": -5, "伐木兽 / Lumberbeast": -5,
  "服务业 / Service Industry": -2, "毛发造型师 / Fur Stylist": -2, "嗅觉侦探 / Scent Detective": -2, "领地中介 / Territory Agent": -2,
  "办公室职员 / Office Worker": 0, "族群书记 / Clan Scribe": 0, "信息素分析员 / Pheromone Analyst": 0,
  "专业人士 / Professional": 0, "兽医 / Vet": 0, "族群顾问 / Pack Advisor": 0, "猎物评估师 / Prey Assessor": 0,
  "企业高管 / Executive": +12, "首席领地官 / Chief Territory Officer": +12, "族群酋长助理 / Alpha Assistant": +12,
  // 婚恋状况 / Relationship status — only 单身 gets bonus
  "单身/Single": +5,
  "恋爱中/Dating": -5,
  "已婚/Married": -5,
  "离异/Divorced": -3,
  "已配对/Mated": -5,
  "开放关系/Open Relationship": -8,
  // 车辆价值 / Vehicle value — 按车型各自的价位
  // bicycle
  "500元以下": -8, "500-2000元": -6, "2000元-1w": -4, "1w-5w": -2, "5w-30w": 0, "30w+": +2,
  // ebike
  "2000元以下": -8, "2000-5000元": -6, "5000元-1w": -4, "1w-2w": -2, "2w-5w": 0, "5w+": +1,
  // motorcycle（"2w-5w" 和 ebike 共用上面那条）
  "5000元以下": -6, "5000元-2w": -3, "5w-15w": +2, "15w-50w": +5, "50w+": +8,
  // regularCar
  "3w以下": -5, "3w-8w": -2, "8w-15w": 0, "15w-25w": +2, "25w-40w": +4, "40w-80w": +6,
  // luxuryCar
  "30w-60w": +5, "60w-100w": +8, "100w-200w": +10, "200w-500w": +12, "500w-1000w": +14, "1000w+": +18,
  // 父母状况 / Parents status — only 都健在 gets bonus
  "都健在": +5,
  "仅父亲健在": -2,
  "仅母亲健在": -2,
  "均已故": -5,
  // 兄弟姐妹数量 / Sibling count — only child gets bonus, many siblings = shared resources
  "独生/Only Child": +3,
  "1个/1 Sibling": 0,
  "2个/2 Siblings": -2,
  "3个/3 Siblings": -4,
  "4个+/4+ Siblings": -6,
  // 兄弟姐妹状况 / Sibling wealth
  "经济困难": -3,
  "普通": 0,
  "小康": +2,
  "富裕": +4,
  "富裕✨": +6,
  // 种族大类歧视链 / Species hierarchy — only 哺乳类 gets bonus
  "哺乳类 / Mammals": +5,
  "鸟类 / Birds": 0,
  "爬行类 / Reptiles": -3,
  "两栖类 / Amphibians": -6,
  "节肢动物 / Arthropods": -12,
  "鱼类 / Fish": -5,
  // 性取向歧视链 / Orientation hierarchy — only 异性恋 gets bonus
  "异性恋/Straight": +3,
  "同性恋/Gay·Lesbian": -2,
  "双性恋/Bisexual": -2,
  "泛性恋/Pansexual": -4,
  "无性恋/Asexual": -5,
  "不透露/Prefer not to say": -5,
  "自定义/Custom": -2,
};

// MBTI type scoring — everyone claiming INTJ/INFJ/INFP loses points
const MBTI_SCORES = {
  INTJ: -3, INFJ: -3, INFP: -3,
  ENFP: -2, INTP: -2, ENTP: -2,
  ENTJ: -1, ENFJ: -1, ISTJ: -2, ESTJ: -2, ESFJ: -1, ISFJ: -1,
  ESTP: +2, ESFP: +2, ISTP: +1, ISFP: +1,
};

const MAX_HOUSING_ROLLS = 3;

function getHouseTypeTier(city) {
  if (!city) return HOUSING_TIERS.type;
  if (city === "北京") return HOUSING_TIERS.cityTypes["北京"];
  if (city === "上海") return HOUSING_TIERS.cityTypes["上海"];
  const southwest = ["重庆", "成都", "昆明", "贵阳"];
  if (southwest.includes(city)) return HOUSING_TIERS.cityTypes["西南"];
  const jiangnan = ["苏州", "杭州", "南京", "宁波", "无锡"];
  if (jiangnan.includes(city)) return HOUSING_TIERS.cityTypes["江南"];
  if (city === "西安") return HOUSING_TIERS.cityTypes["黄土高原"];
  if (city === "乌鲁木齐") return HOUSING_TIERS.cityTypes["西北"];
  const fujian = ["厦门", "福州"];
  if (fujian.includes(city)) return HOUSING_TIERS.cityTypes["福建"];
  const northeast = ["哈尔滨", "沈阳", "大连"];
  if (northeast.includes(city)) return HOUSING_TIERS.cityTypes["东北"];
  // custom city keyword matches
  if (["内蒙古","呼和浩特","包头","鄂尔多斯"].some(k => city.includes(k)))
    return HOUSING_TIERS.cityTypes["内蒙古"];
  if (["西藏","拉萨","青海","西宁","甘孜","阿坝","川西","林芝"].some(k => city.includes(k)))
    return HOUSING_TIERS.cityTypes["藏区"];
  return HOUSING_TIERS.type;
}

function rollHousingFieldDice(field, prefix) {
  const btn = document.getElementById(`${prefix}-${field}-dice-btn`);
  const display = document.getElementById(`${prefix}-${field}-display`);
  if (!btn || !display) return;

  const rolls = parseInt(btn.dataset.rolls || "0", 10);
  if (rolls >= MAX_HOUSING_ROLLS) return;

  btn.dataset.rolls = rolls + 1;
  btn.disabled = true;

  let count = 0;
  const iv = setInterval(() => {
    btn.innerHTML = diceFaceImg(Math.floor(Math.random() * 6) + 1, 4);
    count++;
    if (count >= 16) {
      clearInterval(iv);
      const roll = Math.floor(Math.random() * 6) + 1;
      btn.innerHTML = diceFaceImg(roll, 4);

      const remaining = MAX_HOUSING_ROLLS - parseInt(btn.dataset.rolls, 10);
      btn.disabled = remaining <= 0;
      if (remaining > 0) {
        btn.title = `还可摇 ${remaining} 次 / ${remaining} rolls left`;
      } else {
        btn.title = "已用完摇骰机会 / No rolls left";
        btn.classList.add("dice-exhausted");
      }

      let value = "";
      let text = "";

      if (field === "type") {
        const city = getHousingCityValue(prefix);
        const typeTier = getHouseTypeTier(city);
        const rawValue = typeTier[roll];
        value = Array.isArray(rawValue) ? rawValue[Math.floor(Math.random() * rawValue.length)] : rawValue;
        text = disp(value);
        document.getElementById(`${prefix}-type`).value = value;
        const isVilla = value === "别墅" || value === "四合院" || value === "老洋房";
        const isApt = value === "公寓" || value === "大平层" || value === "普通住宅" || value === "石库门";
        // 别墅层数 / 院子 / 楼层 什么时候出现由 _updateHouseSteps 决定（一项一项出现）
        if (!isVilla) {
          document.getElementById(`${prefix}-garden`).value = "";
          document.getElementById(`${prefix}-garden-display`).textContent = "—";
          const gardenBtn = document.getElementById(
            `${prefix}-garden-dice-btn`,
          );
          if (gardenBtn) {
            gardenBtn.dataset.rolls = "0";
            gardenBtn.disabled = false;
            gardenBtn.classList.remove("dice-exhausted");
            gardenBtn.innerHTML = diceFaceImg(1, 4);
          }
        }
        if (!isApt) {
          ["apt-floor", "apt-total"].forEach((f) => {
            const inp = document.getElementById(`${prefix}-${f}`);
            const disp2 = document.getElementById(`${prefix}-${f}-display`);
            const b = document.getElementById(`${prefix}-${f}-dice-btn`);
            if (inp) inp.value = "";
            if (disp2) disp2.textContent = "—";
            if (b) { b.dataset.rolls = "0"; b.disabled = false; b.classList.remove("dice-exhausted"); b.innerHTML = diceFaceImg(1, 4); }
          });
        }
        // 记下价位档次（按房屋类型）；价格框本身最后才出现
        const priceTierKey = (value === "下水管道" || value === "地下室") ? "cheap"
          : (value === "别墅" || value === "四合院" || value === "老洋房") ? "luxury"
          : (value === "公寓" || value === "大平层" || value === "老洋房" || value === "石库门") ? "high"
          : "mid";
        const priceWrapper = document.getElementById(`${prefix}-price-wrapper`);
        // 价格框什么时候出现由 _updateHouseSteps 决定（整页最后一个出现），这里只记下价位档次
        if (priceWrapper) priceWrapper.dataset.priceTier = priceTierKey;
        const pBtn = document.getElementById(`${prefix}-price-dice-btn`);
        const pDisp = document.getElementById(`${prefix}-price-display`);
        const pInp = document.getElementById(`${prefix}-price`);
        if (pBtn) { pBtn.dataset.rolls = "0"; pBtn.disabled = false; pBtn.classList.remove("dice-exhausted"); pBtn.innerHTML = diceFaceImg(6, 4); }
        if (pDisp) pDisp.textContent = "—";
        if (pInp) pInp.value = "";
      } else if (field === "garden") {
        value = HOUSING_TIERS.garden[roll];
        text = disp(value);
        document.getElementById(`${prefix}-garden`).value = value;
      } else if (field === "area") {
        value = HOUSING_TIERS.area[roll];
        text = `${value}㎡`;
        document.getElementById(`${prefix}-area`).value = value;
      } else if (field === "tenure") {
        value = HOUSING_TIERS.tenure[roll];
        text = disp(value);
        document.getElementById(`${prefix}-tenure`).value = value;
        const isBuying = value === "购买";
        // 租和买的价格区间不同：重摇租还是买时，之前摇的价格作废
        const pInp = document.getElementById(`${prefix}-price`);
        const pDisp = document.getElementById(`${prefix}-price-display`);
        const pBtn = document.getElementById(`${prefix}-price-dice-btn`);
        if (pInp) pInp.value = "";
        if (pDisp) pDisp.textContent = "—";
        if (pBtn) { pBtn.dataset.rolls = "0"; pBtn.disabled = false; pBtn.classList.remove("dice-exhausted"); pBtn.innerHTML = diceFaceImg(6, 4); }
        if (isBuying) {
          ["ownership", "mortgage"].forEach((f) => {
            const d = document.getElementById(`${prefix}-${f}-display`);
            if (d) d.textContent = "—";
            const inp = document.getElementById(`${prefix}-${f}`);
            if (inp) inp.value = "";
            const b = document.getElementById(`${prefix}-${f}-dice-btn`);
            if (b) {
              b.dataset.rolls = "0";
              b.disabled = false;
              b.classList.remove("dice-exhausted");
              b.innerHTML = diceFaceImg(1, 4);
            }
          });
        } else {
          document.getElementById(`${prefix}-ownership`).value = "租住中";
          document.getElementById(`${prefix}-mortgage`).value = "";
        }
      } else if (field === "ownership") {
        value = HOUSING_TIERS.ownership[roll];
        text = disp(value);
        document.getElementById(`${prefix}-ownership`).value = value;
      } else if (field === "mortgage") {
        value = HOUSING_TIERS.mortgage[roll];
        text = disp(value);
        document.getElementById(`${prefix}-mortgage`).value = value;
      } else if (field === "price") {
        const tenureEl = document.getElementById(`${prefix}-tenure`);
        const isRenting = !tenureEl || tenureEl.value !== "购买";
        const priceTierKey = document.getElementById(`${prefix}-price-wrapper`)?.dataset.priceTier || "mid";
        const tierGroup = isRenting ? HOUSING_TIERS.priceRentByType : HOUSING_TIERS.priceBuyByType;
        value = (tierGroup[priceTierKey] || (isRenting ? HOUSING_TIERS.priceRent : HOUSING_TIERS.priceBuy))[roll];
        text = disp(value);
        document.getElementById(`${prefix}-price`).value = value;
      } else if (field === "villa-floors") {
        value = HOUSING_TIERS.villaFloors[roll];
        text = value;
        document.getElementById(`${prefix}-villa-floors`).value = value;
      } else if (field === "apt-floor") {
        value = HOUSING_TIERS.aptFloor[roll];
        text = value;
        document.getElementById(`${prefix}-apt-floor`).value = value;
        // 重摇楼层：一共几层要重新摇（它什么时候出现由 _updateHouseSteps 决定）
        const totalSec = document.getElementById(`${prefix}-apt-total-section`);
        if (totalSec) {
          document.getElementById(`${prefix}-apt-total`).value = "";
          document.getElementById(`${prefix}-apt-total-display`).textContent = "—";
          const tb = document.getElementById(`${prefix}-apt-total-dice-btn`);
          if (tb) { tb.dataset.rolls = "0"; tb.disabled = false; tb.classList.remove("dice-exhausted"); tb.innerHTML = diceFaceImg(1, 4); }
        }
      } else if (field === "apt-total") {
        // Constrain total >= floor tier
        const floorVal = document.getElementById(`${prefix}-apt-floor`)?.value;
        const floorTierMap = {"1-5层":1,"6-10层":2,"11-20层":3,"21-30层":4,"31-40层":5,"40层以上":6};
        const minTier = floorTierMap[floorVal] || 1;
        const constrainedRoll = Math.max(roll, minTier);
        value = HOUSING_TIERS.aptTotal[constrainedRoll];
        text = value;
        document.getElementById(`${prefix}-apt-total`).value = value;
      }

      display.textContent = text;
    }
  }, 70);
}

function onOrientationChange(selectId, customInputId) {
  const sel = document.getElementById(selectId);
  const customInput = document.getElementById(customInputId);
  customInput.classList.toggle("hidden", sel.value !== "自定义/Custom");
}

function getCustomFieldValue(selectId, customInputId) {
  const sel = document.getElementById(selectId);
  if (!sel) return "";
  if (sel.value === "自定义/Custom") {
    const custom = document.getElementById(customInputId);
    return custom ? _stripPunct(custom.value).trim() || sel.value : sel.value;
  }
  return sel.value;
}

function getHousingDescription() {
  const city = getHousingCityValue("house");
  const cityDisplay = getCityDisplayName("house");
  const district = getHousingDistrictValue("house");
  const type = getHouseTypeValue("house");
  const villaFloors = document.getElementById("house-villa-floors").value;
  const garden = document.getElementById("house-garden").value;
  const area = document.getElementById("house-area").value.trim();
  const aptFloor = document.getElementById("house-apt-floor")?.value.trim() || "";
  const aptTotal = document.getElementById("house-apt-total")?.value.trim() || "";
  const price = document.getElementById("house-price").value.trim();
  const ownership = document.getElementById("house-ownership").value;
  const mortgageWrapper = document.getElementById("house-mortgage-wrapper");
  const mortgage = mortgageWrapper.classList.contains("hidden")
    ? ""
    : document.getElementById("house-mortgage").value;

  const parts = [];
  if (cityDisplay || district)
    parts.push([cityDisplay, disp(district)].filter(Boolean).join(" "));
  if (area) parts.push(`${area}㎡`);
  if (type)
    parts.push(type === "别墅" ? `${disp(type)}(${villaFloors})` : disp(type));
  if (garden === "有院子") parts.push("有院子 / Garden ✨");
  if (aptFloor && aptTotal)
    parts.push(`${aptFloor}/共${aptTotal} fl.`);
  else if (aptFloor) parts.push(`${aptFloor}`);
  if (price) parts.push(disp(price));
  if (ownership) parts.push(disp(ownership));
  if (mortgage) parts.push(disp(mortgage));
  return parts.join(" ");
}

// ── 种族选择（主物种 suffix=""，混血第二物种 suffix="2"）──
// 每一级（大类 / 细类 / 子类 / 物种）最后都有「自定义」选项，选中后显示输入框。
// 自定义的内容会在生成档案后加入种族库（/custom-breeds），之后所有人都能选到。
const _BREED_CUSTOM = "__custom__";
const _BREED_PH = {
  sg: "选择细类 / Select subgroup...",
  ssg: "选择子类 / Select sub-group...",
  sp: "选择物种 / Select species...",
};
const _breedIds = (s) => ({
  cls: `petBreedClass${s}`,
  sg: `petBreedSubgroup${s}`,
  ssg: `petBreedSubSubgroup${s}`,
  sp: `petBreed${s}`,
  sgWrap: `breedSubgroupWrapper${s}`,
  ssgWrap: `breedSubSubgroupWrapper${s}`,
  spWrap: `breedSpecificWrapper${s}`,
});

// 读取某一级的值：选了自定义就读输入框（已去掉标点）
function _breedSel(selectId) {
  const v = document.getElementById(selectId)?.value || "";
  if (v !== _BREED_CUSTOM) return v;
  return _stripPunct(document.getElementById(`${selectId}-custom`)?.value).trim();
}

function _syncBreedCustomInput(selectId) {
  const input = document.getElementById(`${selectId}-custom`);
  if (!input) return;
  const isCustom = document.getElementById(selectId)?.value === _BREED_CUSTOM;
  input.classList.toggle("hidden", !isCustom);
  if (!isCustom) input.value = "";
}

function _resetBreedSelect(selectId, placeholder) {
  document.getElementById(selectId).innerHTML =
    `<option value="" disabled selected hidden>${placeholder}</option>`;
  _syncBreedCustomInput(selectId);
}

function _addBreedOption(select, value) {
  const opt = document.createElement("option");
  opt.value = value;
  opt.textContent = value;
  select.appendChild(opt);
}

function _addBreedCustomOption(select) {
  const opt = document.createElement("option");
  opt.value = _BREED_CUSTOM;
  opt.textContent = "自定义 Custom";
  select.appendChild(opt);
}

function _show(id, visible) {
  document.getElementById(id)?.classList.toggle("hidden", !visible);
}

// 显示物种下拉；forceCustom = 上一级是自定义，物种也只能自定义
function _showBreedSpecies(s, list, forceCustom) {
  const ids = _breedIds(s);
  const select = document.getElementById(ids.sp);
  _resetBreedSelect(ids.sp, _BREED_PH.sp);
  if (!forceCustom) {
    // 第二物种不能和主物种相同
    const exclude = s === "2" ? document.getElementById("petBreed")?.value : null;
    list.forEach((b) => { if (b !== exclude) _addBreedOption(select, b); });
  }
  _addBreedCustomOption(select);
  if (forceCustom) select.value = _BREED_CUSTOM;
  _syncBreedCustomInput(ids.sp);
  _show(ids.spWrap, true);
  if (s === "") updateHeightOptions();
}

function _onBreedClass(s) {
  const ids = _breedIds(s);
  const cls = document.getElementById(ids.cls).value;
  _syncBreedCustomInput(ids.cls);
  _resetBreedSelect(ids.sg, _BREED_PH.sg);
  _resetBreedSelect(ids.ssg, _BREED_PH.ssg);
  _resetBreedSelect(ids.sp, _BREED_PH.sp);
  _show(ids.ssgWrap, false);
  _show("heightWrapper", false);

  if (cls === _BREED_CUSTOM) {
    _show(ids.sgWrap, false);
    _showBreedSpecies(s, [], true);
  } else if (breedSubgroups[cls]) {
    const sgSelect = document.getElementById(ids.sg);
    Object.keys(breedSubgroups[cls]).forEach((sg) => _addBreedOption(sgSelect, sg));
    _addBreedCustomOption(sgSelect);
    _show(ids.sgWrap, true);
    _show(ids.spWrap, false);
  } else {
    _show(ids.sgWrap, false);
    _showBreedSpecies(s, breedData[cls] || []);
  }
}

function _onBreedSubgroup(s) {
  const ids = _breedIds(s);
  const cls = document.getElementById(ids.cls).value;
  const sg = document.getElementById(ids.sg).value;
  _syncBreedCustomInput(ids.sg);
  _resetBreedSelect(ids.ssg, _BREED_PH.ssg);
  _resetBreedSelect(ids.sp, _BREED_PH.sp);
  _show("heightWrapper", false);

  const val = sg === _BREED_CUSTOM ? null : (breedSubgroups[cls] || {})[sg];
  if (sg === _BREED_CUSTOM) {
    _show(ids.ssgWrap, false);
    _showBreedSpecies(s, [], true);
  } else if (val && !Array.isArray(val)) {
    // 还有一层子类
    const ssgSelect = document.getElementById(ids.ssg);
    Object.keys(val).forEach((ssg) => _addBreedOption(ssgSelect, ssg));
    _addBreedCustomOption(ssgSelect);
    _show(ids.ssgWrap, true);
    _show(ids.spWrap, false);
  } else {
    _show(ids.ssgWrap, false);
    _showBreedSpecies(s, val || []);
  }
}

function _onBreedSubSubgroup(s) {
  const ids = _breedIds(s);
  const cls = document.getElementById(ids.cls).value;
  const sg = document.getElementById(ids.sg).value;
  const ssg = document.getElementById(ids.ssg).value;
  _syncBreedCustomInput(ids.ssg);
  _show("heightWrapper", false);
  if (ssg === _BREED_CUSTOM) _showBreedSpecies(s, [], true);
  else _showBreedSpecies(s, ((breedSubgroups[cls] || {})[sg] || {})[ssg] || []);
}

function _onBreedSpecies(s) {
  _syncBreedCustomInput(_breedIds(s).sp);
  if (s === "") updateHeightOptions();
  else updateHeightOptions2();
}

// HTML 里 onchange 用的名字
function onBreedClassChange() { _onBreedClass(""); }
function onBreedSubgroupChange() { _onBreedSubgroup(""); }
function onBreedSubSubgroupChange() { _onBreedSubSubgroup(""); }
function onBreedSpeciesChange() { _onBreedSpecies(""); }
function onBreedClass2Change() { _onBreedClass("2"); }
function onBreedSubgroup2Change() { _onBreedSubgroup("2"); }
function onBreedSubSubgroup2Change() { _onBreedSubSubgroup("2"); }
function onBreedSpecies2Change() { _onBreedSpecies("2"); }

function onMixedBreedChange() {
  const checked = document.getElementById("isMixed")?.checked;
  document
    .getElementById("mixedBreedExtra")
    ?.classList.toggle("hidden", !checked);
  if (checked) {
    document.getElementById("heightWrapper")?.classList.add("hidden");
  } else {
    if (document.getElementById("petBreed")?.value) updateHeightOptions();
  }
}

// ── 种族库：大家自定义过的种族 ──
// 页面加载时取回并合并进 breedSubgroups / breedData，下拉里就能直接选到
function _mergeCustomBreed(e) {
  if (!e || !e.cls || !e.species) return;
  const push = (list, v) => { if (!list.includes(v)) list.push(v); };
  if (breedSubgroups[e.cls]) {
    if (!e.sg) return;
    const group = breedSubgroups[e.cls];
    if (e.ssg) {
      if (!group[e.sg]) group[e.sg] = {};
      if (Array.isArray(group[e.sg])) push(group[e.sg], e.species);
      else push((group[e.sg][e.ssg] = group[e.sg][e.ssg] || []), e.species);
    } else {
      if (!group[e.sg]) group[e.sg] = [];
      if (Array.isArray(group[e.sg])) push(group[e.sg], e.species);
      else push((group[e.sg]["自定义 / Custom"] = group[e.sg]["自定义 / Custom"] || []), e.species);
    }
  } else {
    if (!breedData[e.cls]) {
      breedData[e.cls] = [];
      // 新的大类：加到两个大类下拉里（放在「自定义」前面）
      ["petBreedClass", "petBreedClass2"].forEach((id) => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const opt = document.createElement("option");
        opt.value = e.cls;
        opt.textContent = e.cls;
        sel.insertBefore(opt, sel.querySelector(`option[value="${_BREED_CUSTOM}"]`));
      });
    }
    push(breedData[e.cls], e.species);
  }
}

api("/custom-breeds")
  .then((r) => r.json())
  .then((list) => (Array.isArray(list) ? list : []).forEach(_mergeCustomBreed))
  .catch(() => {});

// 生成档案时，把用到的自定义种族存进种族库
function _saveCustomBreed(s) {
  const ids = _breedIds(s);
  const isCustom = (id) => document.getElementById(id)?.value === _BREED_CUSTOM;
  const custom = {
    cls: isCustom(ids.cls),
    sg: isCustom(ids.sg),
    ssg: isCustom(ids.ssg),
    species: isCustom(ids.sp),
  };
  if (!custom.cls && !custom.sg && !custom.ssg && !custom.species) return;
  const visible = (id) => !document.getElementById(id)?.classList.contains("hidden");
  const entry = {
    cls: _breedSel(ids.cls),
    sg: visible(ids.sgWrap) ? _breedSel(ids.sg) : "",
    ssg: visible(ids.ssgWrap) ? _breedSel(ids.ssg) : "",
    species: _breedSel(ids.sp),
    custom,
  };
  if (!entry.cls || !entry.species) return;
  api("/custom-breeds", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  })
    .then(() => _mergeCustomBreed(entry))
    .catch(() => {});
}

// Create Profile & Swipe Function
let profiles = [];
let currentIndex = 0;
function createCard() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();
  const name = document.getElementById("petName").value;
  const breedClass = _breedSel("petBreedClass");
  const breedSpecific = _breedSel("petBreed");
  const breed =
    breedClass && breedSpecific
      ? `${breedClass} · ${breedSpecific}`
      : breedSpecific || breedClass;
  const isMixed = document.getElementById("isMixed")?.checked || false;
  const breedClass2 = _breedSel("petBreedClass2");
  const breedSpecific2 = _breedSel("petBreed2");
  const breed2 = isMixed
    ? breedClass2 && breedSpecific2
      ? `${breedClass2} · ${breedSpecific2}`
      : breedSpecific2 || breedClass2
    : "";
  const height = document.getElementById("petHeight").value;
  const gender = getCustomFieldValue("petGender", "gender-custom");
  const orientation = getCustomFieldValue(
    "petOrientation",
    "orientation-custom",
  );
  const age = getPetAge();
  const hukou = getHousingDescription();
  const sterilized = document.getElementById("petSterilized").value;
  const mbti1 = document.getElementById("petMbti1").value;
  const mbti2 = document.getElementById("petMbti2").value;
  const mbti3 = document.getElementById("petMbti3").value;
  const mbti4 = document.getElementById("petMbti4").value;

  const mbti = mbti1 + mbti2 + mbti3 + mbti4;
  const hobby = getSelectedHobbyTags("hobby-tags");
  const standards = getSelectedStandardTags();
  const edu = document.getElementById("petEdu").value;
  const occupation = document.getElementById("petOccupation").value;
  const income = document.getElementById("petIncome").value;
  const finalScore = getTotalProfileScore();
  // 只存现在显示着的项（重摇后被隐藏的旧答案不存）
  const houseData = {
    city: getHousingCityValue("house"),
    district: getHousingDistrictValue("house"),
    type: getHouseTypeValue("house"),
    villaFloors: _shownVal("house-villa-floors"),
    garden: _shownVal("house-garden"),
    area: _shownVal("house-area"),
    aptFloor: _shownVal("house-apt-floor"),
    aptTotal: _shownVal("house-apt-total"),
    tenure: _shownVal("house-tenure"),
    ownership: _shownVal("house-ownership"),
    mortgage: _shownVal("house-mortgage"),
    price: _shownVal("house-price"),
  };

  const vehicleTypes = (document.getElementById("vehicle-types-hidden")?.value || "").split(",").filter(Boolean);
  const vehicleData = {
    types: vehicleTypes,
    model: _shownVal("vehicle-model"),
    count: _shownVal("vehicle-count"),
    price: _shownVal("vehicle-price"),
  };

  const parentsData = {
    status: _shownVal("parents-status"),
    // 已故的一方不显示籍贯，也不存
    fatherOrigin: document.getElementById("parents-father-wrapper")?.classList.contains("hidden") ? "" : getCityDisplayName("parents-father"),
    motherOrigin: document.getElementById("parents-mother-wrapper")?.classList.contains("hidden") ? "" : getCityDisplayName("parents-mother"),
    relationship: _shownVal("parents-relationship"),
    siblingCount: _shownVal("parents-siblingCount"),
    siblingWealth: _shownVal("parents-siblingWealth"),
  };

  const g = _shownVal;
  const relationshipData = {
    status: g("petSterilized"),
    ships: g("rel-ships"),
    pastRelCount: g("rel-pastCount"),
    exContact: g("rel-exContact"),
    stillLoveEx: g("rel-stillLoveEx"),
    whiteMoonlight: g("rel-whiteMoon"),
    kids: g("rel-kids"),
    crush: g("rel-crush"),
    datingPurpose: g("rel-purpose"),
    relationshipGoal: g("rel-goal"),
  };

  let profile = {
    username: username,
    password: password,
    name: name,
    breed: breed,
    mixed: isMixed,
    breed2: breed2,
    height: height,
    gender: gender,
    orientation: orientation,
    age: age,
    birth: document.getElementById("birthDisplay")?.value || "",
    horoscope: getHoroscope(document.getElementById("birthDisplay")?.value),
    hukou: hukou,
    house: houseData,
    vehicle: vehicleData,
    parents: parentsData,
    relationship: relationshipData,
    sterilized: sterilized,
    mbti: mbti,
    hobby: hobby,
    standards: standards,
    edu: edu,
    occupation: occupation,
    income: income,
    score: finalScore,
    // 画布没准备好（比如 p5 没加载出来）就存一张空白的，不存空数组
    grid: _isValidGrid(grid) ? grid : _blankGrid(),
    gridText: currentText,
  };

  // 先在本地记下新用户，看完档案卡可直接进入教学，不用回去登录
  currentUser = profile;

  // send the profile data to the server
  _pendingProfileSave = api("/profiles", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(profile),
  })
    .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
    .then(({ ok, data }) => {
      if (!ok) {
        // 用户名已被别人占用（密码不同）
        currentUser = null;
        showAlert("这个用户名已被占用，请换一个重新注册！\nThis username is taken, please sign up with another one.");
        goTo("login");
        return;
      }
      _acceptLogin(data);
      // 拿到令牌后，把这次用到的自定义内容（种族、爱好、性别、性取向、城市）存进系统，之后所有人都能选到
      _saveCustomBreed("");
      if (isMixed) _saveCustomBreed("2");
      _saveCustomHobbies();
      _saveCustomOptions();
      startMessagePolling();
    })
    .catch((err) => console.error("Save profile failed:", err))
    .finally(() => {
      _pendingProfileSave = null;
    });

  // 档案卡和浏览页、我的档案共用 renderCardHTML，显示格式保持一致
  // （date 只用于印章日期显示；服务器保存时会写入自己的时间）
  document.getElementById("petCard").innerHTML = renderCardHTML({
    ...profile,
    date: new Date().toISOString(),
  });

  document.getElementById("score-running-badge").style.display = "none";
  animateSettlement(finalScore);

  goTo("card");
}

function matchesOrientation(viewer, target) {
  const o = (viewer.orientation || "").split("/")[0].trim(); // e.g. "异性恋"
  const vg = (viewer.gender || "").split("/")[0].trim(); // e.g. "雄"
  const tg = (target.gender || "").split("/")[0].trim(); // e.g. "雌"

  if (o === "异性恋") {
    if (vg === "雄") return tg === "雌";
    if (vg === "雌") return tg === "雄";
    return true; // 非二元 viewer 看全部
  }
  if (o === "同性恋") {
    return tg === vg;
  }
  // 双性恋 / 泛性恋 / 无性恋 / 其他 / 不透露 / 未填 → 全部显示
  return true;
}

let _pendingProfileSave = null;

function createSwipeCard({ skipOnboarding = false } = {}) {
  // 新建档案还在保存中 → 等保存完成再进入（拿到服务器返回的完整用户数据）
  if (_pendingProfileSave) {
    _pendingProfileSave.then(() => createSwipeCard({ skipOnboarding }));
    return;
  }
  if (!currentUser) {
    showAlert("请先登录 / Please login first");
    goTo("login");
    return;
  }
  checkNotifications();
  //Get profiles from profiles.json
  api("/profiles")
    // transform the response into JSON to get the data
    .then((res) => res.json())
    // store data back in the profiles array
    .then((data) => {
      profiles = data;

      // Remove the current user's profile from the list
      profiles = profiles.filter((p) => p.username !== currentUser.username);

      // Filter by orientation
      profiles = profiles.filter((p) => matchesOrientation(currentUser, p));

      // Shuffle so order is different every session
      for (let i = profiles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [profiles[i], profiles[j]] = [profiles[j], profiles[i]];
      }

      currentIndex = 0;
      showProfile();
      goTo("swipe-page");
      if (skipOnboarding) {
        // 老用户：不显示教学，直接开始骚扰消息这些
        startSwipeInterrupts();
        startGenderedNotifications();
        if (!popupShowing) showNextPopup();
      } else {
        startTutorial();
      }
      _startProfileDataRefresh();
    });
}

// 只取一个人的档案；取不到返回 null
function fetchProfile(username) {
  return api(`/profiles/${encodeURIComponent(username)}`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
}

let _profileRefreshTimer = null;
function _startProfileDataRefresh() {
  if (_profileRefreshTimer) clearInterval(_profileRefreshTimer);
  _profileRefreshTimer = setInterval(() => {
    // app 在后台时不请求
    if (document.hidden) return;
    // 只要 like / skip / 印象，不下载整份档案（画、文字等）
    api("/profiles/activity")
      .then(r => r.json())
      .then(fresh => {
        let currentChanged = false;
        profiles.forEach((p, i) => {
          const f = fresh.find(x => x.username === p.username);
          if (!f) return;
          const wasLikes = p.likes?.length || 0;
          const wasInterps = JSON.stringify(p.interpretations || {});
          p.likes = f.likes || [];
          p.skips = f.skips || [];
          p.interpretations = f.interpretations || {};
          const nowLikes = p.likes.length;
          const nowInterps = JSON.stringify(p.interpretations);
          if (i === currentIndex && (wasLikes !== nowLikes || wasInterps !== nowInterps)) {
            currentChanged = true;
          }
        });
        // Also update currentUser likes/skips
        if (currentUser) {
          const me = fresh.find(x => x.username === currentUser.username);
          if (me) {
            const prevLikes = currentUser.likes?.length || 0;
            currentUser.likes = me.likes || [];
            currentUser.skips = me.skips || [];
            currentUser.interpretations = me.interpretations || {};
            if ((me.likes?.length || 0) > prevLikes) {
              _showLikeBanner(me.likes.length);
            }
          }
        }
        if (currentChanged) showProfile();
      })
      .catch(() => {});
  }, 30000);
}

// ── Hobby tags ────────────────────────────────────────────────

let _customHobbyTags = [];

async function loadCustomHobbyTags() {
  try {
    const res = await api("/custom-hobbies");
    _customHobbyTags = await res.json();
  } catch (e) {
    _customHobbyTags = [];
  }
}

function buildHobbyTags(containerId) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;

  // Group custom tags by declared category
  const customByCategory = {};
  _customHobbyTags.forEach((t) => {
    const obj =
      typeof t === "string" ? { tag: t, categoryZh: null, tier: 1 } : t;
    // 没有分类的旧标签放进第一个分类（不再单独显示「自定义」分类）
    const key = HOBBY_CATEGORIES.some((c) => c.zh === obj.categoryZh) ? obj.categoryZh : HOBBY_CATEGORIES[0].zh;
    if (!customByCategory[key]) customByCategory[key] = [];
    customByCategory[key].push(obj);
  });

  let html = HOBBY_CATEGORIES.map((cat) => {
    let catHtml = `<div class="hobby-cat-label" data-zh="${cat.zh}">${cat.zh} / ${cat.en}</div>`;
    catHtml += cat.tags
      .map((t) => {
        const zh = typeof t === "string" ? t : t.zh;
        const en = typeof t === "string" ? "" : t.en;
        const display = en ? `${zh} / ${en}` : zh;
        return `<span class="hobby-tag tier-${cat.tier}" data-tier="${cat.tier}" data-zh="${zh}" data-en="${en}" onclick="toggleHobbyTag(this)">${display}</span>`;
      })
      .join("");
    if (customByCategory[cat.zh]) {
      catHtml += customByCategory[cat.zh]
        .map(
          (obj) =>
            `<span class="hobby-tag tier-${obj.tier}" data-tier="${obj.tier}" data-zh="${escapeHtml(obj.tag)}" data-custom data-noi18n onclick="toggleHobbyTag(this)">${escapeHtml(obj.tag)}</span>`,
        )
        .join("");
    }
    return catHtml;
  }).join("");

  wrap.innerHTML = html;
}

function getHobbyScore() {
  const tags = document.querySelectorAll("#hobby-tags .hobby-tag.selected");
  let total = 0;
  tags.forEach((el) => {
    // 自定义爱好不加不减（分类是用户自己选的，按分类给分就能刷分）
    if (el.dataset.custom !== undefined) return;
    const tier = parseInt(el.dataset.tier || "4", 10);
    if (tier === 0) total += 3;       // 堕落放松 → relatable/authentic
    else if (tier === 1) total += 2;  // 兽人特色 → unique/interesting
    else if (tier === 2) total += 2;  // 运动与竞技 → athletic
    else if (tier === 3) total += 1;  // 科技/科学 → cool nerd
    else if (tier === 4) total += 0;  // 健康养生 → neutral
    else if (tier === 5) total -= 1;  // 艺术/文学/音乐/知识 → 装
  });
  return Math.max(-15, Math.min(25, total));
}

function toggleHobbyTag(el) {
  if (el.classList.contains("selected")) {
    el.classList.remove("selected");
  } else {
    const selected = document.querySelectorAll("#hobby-tags .hobby-tag.selected");
    if (selected.length >= 5) {
      el.classList.add("hobby-tag-limit-flash");
      setTimeout(() => el.classList.remove("hobby-tag-limit-flash"), 600);
      return;
    }
    el.classList.add("selected");
  }
}

function getSelectedHobbyTags(containerId) {
  return Array.from(
    document.querySelectorAll(`#${containerId} .hobby-tag.selected`),
  )
    .map((el) => {
      // 从 data-zh / data-en 拼，不读页面文字（单语模式下页面上只剩一种语言）
      const zh = el.dataset.zh || el.textContent.trim();
      const en = el.dataset.en || "";
      return en ? `${zh} / ${en}` : zh;
    })
    .join(" · ");
}

// ── 择偶标准 Mate Standards ────────────────────────────────────
const MATE_STANDARDS = [
  { zh: "软萌",         en: "Soft & Cute" },
  { zh: "身高要求",     en: "Height Req." },
  { zh: "专一",         en: "Exclusive" },
  { zh: "体贴",         en: "Considerate" },
  { zh: "没有怪癖",     en: "No Weird Quirks" },
  { zh: "有怪癖",       en: "Quirky OK" },
  { zh: "无浓烈异味",   en: "No Strong Odor" },
  { zh: "气味合拍",     en: "Scent Compatible" },
  { zh: "作息昼出夜伏", en: "Diurnal" },
  { zh: "作息昼伏夜出", en: "Nocturnal" },
  { zh: "冬眠同步",     en: "Sync Hibernation" },
  { zh: "毛发整洁",     en: "Groomed Fur" },
  { zh: "换毛期可接受", en: "Shedding OK" },
  { zh: "爪子干净",     en: "Clean Claws" },
  { zh: "尾巴好看",     en: "Nice Tail" },
  { zh: "领地稳固",     en: "Stable Territory" },
  { zh: "领地宽阔",     en: "Large Territory" },
  { zh: "不介意杂交",   en: "Mixed OK" },
  { zh: "同物种优先",   en: "Same Species Pref." },
  { zh: "体型相近",     en: "Similar Build" },
  { zh: "无幼崽",       en: "No Cubs" },
  { zh: "已绝育",       en: "Sterilized" },
  { zh: "不挑食",       en: "Not Picky Eater" },
  { zh: "觅食能力强",   en: "Good Forager" },
  { zh: "筑巢技能满",   en: "Master Nester" },
  { zh: "不乱叫",       en: "Quiet" },
  { zh: "独立性强",     en: "Highly Independent" },
  { zh: "黏人",         en: "Clingy OK" },
  { zh: "社交动物",     en: "Social Animal" },
  { zh: "喜欢晒太阳",   en: "Loves Sunbathing" },
  { zh: "接受多伴侣",   en: "Poly OK" },
  { zh: "同巢居住",     en: "Cohabitation OK" },
  { zh: "不咬人",       en: "Non-Biting" },
  { zh: "食肉优先",     en: "Carnivore Pref." },
  { zh: "食草优先",     en: "Herbivore Pref." },
  { zh: "杂食可接受",   en: "Omnivore OK" },
  { zh: "水栖友好",     en: "Aquatic Friendly" },
  { zh: "体温相近",     en: "Compatible Temp." },
  { zh: "迁徙意愿低",   en: "Low Migration" },
  // ── 人类向 ──
  { zh: "有稳定收入",   en: "Stable Income" },
  { zh: "有房",         en: "Has Property" },
  { zh: "有车",         en: "Has Car" },
  { zh: "高学历",       en: "Highly Educated" },
  { zh: "不催婚催生",   en: "No Marriage Pressure" },
  { zh: "爱干净",       en: "Hygienic" },
  { zh: "会做饭",       en: "Can Cook" },
  { zh: "幽默感",       en: "Has Humor" },
  { zh: "情绪稳定",     en: "Emotionally Stable" },
  { zh: "不打游戏",     en: "No Gaming" },
  { zh: "爱打游戏",     en: "Gamer OK" },
  { zh: "不抽烟",       en: "Non-Smoker" },
  { zh: "不喝酒",       en: "Non-Drinker" },
  { zh: "爱运动",       en: "Active" },
  { zh: "宅",           en: "Homebody" },
  { zh: "爱旅游",       en: "Loves Travel" },
  { zh: "同城",         en: "Same City" },
  { zh: "愿意异地",     en: "LDR OK" },
  { zh: "有共同爱好",   en: "Shared Hobbies" },
  { zh: "三观相合",     en: "Compatible Values" },
  { zh: "颜值在线",     en: "Attractive" },
  { zh: "家庭关系简单", en: "Simple Family" },
  { zh: "不啃老",       en: "Self-Sufficient" },
  { zh: "经济独立",     en: "Financially Independent" },
  { zh: "接受丁克",     en: "Childfree OK" },
  { zh: "想要孩子",     en: "Wants Kids" },
  { zh: "养宠物",       en: "Has Pets" },
  { zh: "不养宠物",     en: "No Pets" },
  { zh: "MBTI对盘",     en: "MBTI Match" },
  { zh: "星座相合",     en: "Horoscope Match" },
  { zh: "不看星座",     en: "Ignores Horoscope" },
  { zh: "接受前任",     en: "Ex History OK" },
  { zh: "无前任联系",   en: "No Ex Contact" },
  { zh: "愿意见家长",   en: "Meet Parents OK" },
  { zh: "不用见家长",   en: "No Meeting the Parents" },
  { zh: "秒回消息",     en: "Replies Instantly" },
  { zh: "能查手机",     en: "Lets Me Check Their Phone" },
  { zh: "有钱就行",     en: "Rich Is Enough" },
  { zh: "富二代",       en: "Trust Fund Kid" },
  { zh: "可以养我",     en: "Will Support Me" },
  { zh: "父母双亡",     en: "No Living Parents" },
  // ── 奇怪的 ──
  { zh: "接受SM",       en: "BDSM OK" },
  { zh: "已婚",         en: "Married" },
  { zh: "怀孕中",       en: "Pregnant" },
  { zh: "接受开放关系", en: "Open Relationship OK" },
  { zh: "接受出轨",     en: "Cheating OK" },
  { zh: "接受三人行",   en: "Threesome OK" },
  { zh: "只约不恋",     en: "No Strings Attached" },
  { zh: "愿意当备胎",   en: "Happy to Be Backup" },
  { zh: "刚离婚",       en: "Freshly Divorced" },
  { zh: "带着幼崽",     en: "Comes with Cubs" },
  { zh: "有前科",       en: "Has a Record" },
  { zh: "恋足癖",       en: "Paw Fetish" },
  { zh: "戴项圈",       en: "Wears a Collar" },
  { zh: "想被圈养",     en: "Wants to Be Kept" },
  { zh: "愿意当饲主",   en: "Willing to Be Owner" },
  { zh: "发情期同步",   en: "Synced Heat Cycle" },
  { zh: "会咬人",       en: "Bites" },
  { zh: "不洗澡也行",   en: "Baths Optional" },
  { zh: "前任是我朋友", en: "Dated My Friend" },
  { zh: "有毛就行",     en: "Any Fur Will Do" },
  { zh: "恋爱脑",       en: "Love-Brained" },
  { zh: "年上",         en: "Older Partner" },
  { zh: "年下",         en: "Younger Partner" },
];

function buildStandardsTags(containerId) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  wrap.innerHTML = MATE_STANDARDS.map(
    (t) => `<span class="hobby-tag tier-1" data-zh="${t.zh}" onclick="toggleStandardTag(this)">${t.zh} / ${t.en}</span>`
  ).join("");
}

function toggleStandardTag(el) {
  if (el.classList.contains("selected")) {
    el.classList.remove("selected");
  } else {
    const selected = document.querySelectorAll("#standards-tags .hobby-tag.selected");
    if (selected.length >= 5) {
      showAlert("太过贪心了！最多选5个\nToo greedy! Max 5 standards.");
      el.classList.add("hobby-tag-limit-flash");
      setTimeout(() => el.classList.remove("hobby-tag-limit-flash"), 600);
      return;
    }
    el.classList.add("selected");
  }
}

function getSelectedStandardTags() {
  return Array.from(document.querySelectorAll("#standards-tags .hobby-tag.selected"))
    .map((el) => {
      const zh = el.dataset.zh;
      const std = MATE_STANDARDS.find((s) => s.zh === zh);
      return std ? `${zh} / ${std.en}` : zh;
    })
    .join(" · ");
}

let _pendingCustomTag = null;
let _pendingCustomContainerId = null;
let _pendingCustomInputId = null;

function addCustomHobbyTag(containerId, inputId) {
  const input = document.getElementById(inputId);
  // 自定义标签不能有标点符号（输入时已过滤，这里再兜底一次）
  const tag = _stripPunct(input?.value || "").trim().slice(0, 20);
  if (!tag) return;

  const existing = Array.from(
    document.querySelectorAll(`#${containerId} .hobby-tag`),
  ).find((el) => el.dataset.zh === tag);
  if (existing) {
    existing.classList.add("selected");
    input.value = "";
    return;
  }

  _pendingCustomTag = tag;
  _pendingCustomContainerId = containerId;
  _pendingCustomInputId = inputId;

  const list = document.getElementById("hobby-cat-picker-list");
  // 用 data-index 传分类：原来 JSON.stringify 产生的双引号会截断 onclick="..."，点了没反应
  list.innerHTML = HOBBY_CATEGORIES.map(
    (cat, i) =>
      `<button class="hobby-cat-option" data-index="${i}" onclick="const c=HOBBY_CATEGORIES[this.dataset.index];confirmCustomHobbyTag(c.zh,c.tier)">${cat.zh} / ${cat.en}</button>`,
  ).join("");
  document.getElementById("hobby-cat-picker").classList.remove("hidden");
}

function confirmCustomHobbyTag(categoryZh, tier) {
  const tag = _pendingCustomTag;
  const containerId = _pendingCustomContainerId;
  const inputId = _pendingCustomInputId;
  closeHobbyCatPicker();
  if (!tag) return;

  // 先只加在自己的页面上；等档案生成了，选中的自定义爱好才存进系统（_saveCustomHobbies）
  const wrap = document.getElementById(containerId);
  if (wrap) {
    const labels = Array.from(wrap.querySelectorAll(".hobby-cat-label"));
    const targetLabel = labels.find((lbl) => lbl.dataset.zh === categoryZh);
    const el = document.createElement("span");
    // 已经选满 5 个就只加进列表、不自动选中
    const full = document.querySelectorAll(`#${containerId} .hobby-tag.selected`).length >= 5;
    el.className = `hobby-tag tier-${tier}${full ? "" : " selected"}`;
    el.dataset.tier = tier;
    el.dataset.category = categoryZh;
    el.dataset.custom = "";
    el.dataset.new = "";
    el.onclick = () => toggleHobbyTag(el);
    el.textContent = tag;
    el.dataset.zh = tag;
    el.dataset.noi18n = "";
    if (targetLabel) {
      let node = targetLabel.nextSibling;
      let last = targetLabel;
      while (node && !node.classList?.contains("hobby-cat-label")) {
        last = node;
        node = node.nextSibling;
      }
      last.after(el);
    } else {
      // 找不到分类标题时放在列表最后（不再单独建「自定义」分类）
      wrap.appendChild(el);
    }
  }

  const input = document.getElementById(inputId);
  if (input) input.value = "";
}

// 生成档案后：这次新加、而且选中了的自定义爱好存进系统
function _saveCustomHobbies() {
  document.querySelectorAll("#hobby-tags .hobby-tag.selected[data-new]").forEach((el) => {
    api("/custom-hobbies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag: el.dataset.zh, categoryZh: el.dataset.category, tier: Number(el.dataset.tier) }),
    }).catch(() => {});
  });
}

function closeHobbyCatPicker() {
  document.getElementById("hobby-cat-picker").classList.add("hidden");
  _pendingCustomTag = null;
  _pendingCustomContainerId = null;
  _pendingCustomInputId = null;
}

// ── 教学：在真正的浏览页上，用一份示范档案把所有功能走一遍 ──────────
// 整个页面盖一层半透明的「纸」，只挖空现在要按的地方，提示写在纸上。
// 示范档案只存在本地：教学里的解读 / 赞同 / 印象 / 喜欢都不会发到服务器（api() 里拦下）。
const TUT_USER = "__tutorial__";
const TUT_FIELD = "mbti"; // 教长按 / 短按用的那一栏（换栏的话，下面提示里的「MBTI」也要跟着改）

// 示范档案的头像：一张用「好」字拼的笑脸
function _tutDemoGrid() {
  const g = Array.from({ length: 32 }, () => Array(32).fill(null));
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const dx = x - 16,
        dy = y - 14;
      if (dx * dx + dy * dy <= 100) g[y][x] = "好";
    }
  }
  // 眼睛、嘴巴挖空
  [[10, 12], [10, 13], [11, 12], [11, 13], [10, 18], [10, 19], [11, 18], [11, 19], [17, 13], [18, 14], [18, 18], [17, 19]].forEach(
    ([y, x]) => (g[y][x] = null),
  );
  // 耳朵
  [[6, 11], [7, 11], [6, 12], [6, 20], [7, 20], [6, 21]].forEach(([y, x]) => (g[y][x] = "好"));
  return g;
}

function _tutDemoProfile() {
  return {
    username: TUT_USER,
    name: "教学兽",
    breed: "鸟类 / Birds · 猫头鹰 / Owl",
    height: "35",
    gender: "雌/Female",
    orientation: "泛性恋/Pansexual",
    age: "3",
    birth: "2023-04-01",
    horoscope: "白羊座 / Aries",
    hukou: "上海 / Shanghai 普通住宅",
    house: { city: "上海", district: "", type: "普通住宅", area: "50-80", price: "", ownership: "", mortgage: "" },
    vehicle: { types: [], model: "", count: "", price: "" },
    parents: { status: "都健在", siblingCount: "", siblingWealth: "" },
    relationship: { status: "单身/Single", datingPurpose: "好玩/Just for Fun", relationshipGoal: "随缘/Whatever" },
    sterilized: "单身/Single",
    mbti: "ENFP",
    hobby: "夜行 / Night Roaming · 嗅探 / Sniffing",
    standards: "专一 / Exclusive",
    edu: "本科",
    occupation: "猎物评估师 / Prey Assessor",
    income: "8k-15k",
    score: 100,
    grid: _tutDemoGrid(),
    gridText: "好",
    likes: [],
    skips: [],
    // 别人已经写好的解读：短按时和你写的一起飘出来
    interpretations: {
      [TUT_FIELD]: [
        { text: "太吵了", addedBy: "_", agrees: 2, agreedBy: {} },
        { text: "e人退散", addedBy: "_", agrees: 0, agreedBy: {} },
        { text: "快乐小狗", addedBy: "_", agrees: 1, agreedBy: {} },
      ],
    },
  };
}

// 每一步：target = 挖空的地方（没有就整张纸盖住）；open = 挖空处能不能按（不能按的步骤点纸上的 ▶ 继续）
// popup = 正在开着真正的弹窗，纸先收起来，只在顶上留一条提示
const _TUT_STEPS = {
  intro: { zh: "恭喜你已经建立完自己的档案了\n是时候正式开始使用了\n跟随指示熟悉一下所有的功能吧", en: "Welcome to the real deal!\nFollow the little notes and see what you can do here.", next: "longpress" },
  longpress: { target: () => _tutField(), open: true, zh: "长按「MBTI」\n来，说说你觉得这玩意儿是什么", en: "Hold down the MBTI.\nWhat's your take on this thing?" },
  interpWrite: { popup: true, zh: "写下你的看法，毒舌一点也没关系～写完点确定", en: "Write what you think. Feel free to be a little mean. Tap OK when you're done." },
  tap: { target: () => _tutField(), open: true, zh: "现在再点一下这里\n来看看别人的脑回路", en: "Now tap it again.\nLet's see what everyone else thinks." },
  agree: { target: () => _tutBubbleArea(), open: true, zh: "谁说得有道理？点一下那句红字\n越多人认同，字就越大", en: "Someone make a good point? Tap their red words.\nThe more likes, the bigger they get." },
  impressBtn: { target: () => _tutBtn(1), open: true, zh: "点中间亮着的按钮\n用一个词形容一下 ta", en: "Tap the glowing button.\nDescribe them in ONE word." },
  impWrite: { popup: true, zh: "想好了吗？写下那个词，点确定\n它就会刻进 ta 的头像里", en: "Got a word? Type it in and hit OK.\nIt'll be carved into their avatar." },
  impDone: { target: () => document.querySelector("#swipe-container .avatar-box"), zh: "看！你的评价已经刻上去了\n这下 ta 可跑不掉了", en: "Look! Your impression is carved in.\nNo taking it back now!", next: "skipInfo" },
  skipInfo: { target: () => _tutBtn(2), zh: "不来电？点右边的叉叉\n不过得告诉我们为什么哦", en: "Not feeling it? Hit the X.\nBut first, tell us why.", next: "msgInfo" },
  msgInfo: { target: () => document.getElementById("msg-notif-btn"), zh: "有人给你发消息啦？\n都在这里，别错过", en: "Got a message?\nYou'll find them all right here.", next: "rankInfo" },
  rankInfo: { target: () => document.getElementById("rank-btn"), zh: "来看看排行榜\n今天谁是人气王？", en: "The leaderboard!\nWho's everyone's favorite today?", next: "meInfo" },
  meInfo: { target: () => document.querySelector("#swipe-topbar > .nes-btn"), zh: "这里是「我」！\n改档案、切语言、换皮肤，或者重看教学", en: "Your little corner!\nEdit your profile, switch languages and themes, or replay this tutorial.", next: "likeBtn" },
  likeBtn: { target: () => _tutBtn(0), open: true, zh: "心动了吗？\n点亮这颗爱心，冲！", en: "Feeling the spark?\nHit that heart!" },
  warn: { popup: true, zh: "哎呀，系统觉得这段关系有点危险\n但你要是铁了心，就继续吧", en: "Uh-oh. The system sees a little red flag.\nStill wanna go for it? Be our guest." },
  opener: { popup: true, zh: "选一句开场白，发给 ta！\n小心，有些话可是要扣分的", en: "Pick an opener and send it!\nCareful, some lines will cost you points." },
  done: { zh: "好啦，教学结束！\n去看看你的下一位嘉宾吧", en: "And that's the tour!\nGo meet your next potential match. 👀", next: "finish", btn: ["开始", "Let's go"] },
};
// 进度编号只算纸上的步骤，不算弹窗里的提示
const _TUT_ORDER = ["longpress", "tap", "agree", "impressBtn", "impDone", "skipInfo", "msgInfo", "rankInfo", "meInfo", "likeBtn"];

const _tutField = () => document.querySelector(`#swipe-container .value[data-field="${TUT_FIELD}"]`);
const _tutBtn = (i) => document.querySelectorAll("#swipe-page .swipebutton .nes-btn")[i];
// 教学那一栏连同飘出来的红字一起框住
function _tutBubbleArea() {
  const span = _tutField();
  if (!span) return null;
  const els = [span, ...span.querySelectorAll(".interp-bubble")];
  const rs = els.map((e) => e.getBoundingClientRect());
  return {
    left: Math.min(...rs.map((r) => r.left)),
    top: Math.min(...rs.map((r) => r.top)),
    right: Math.max(...rs.map((r) => r.right)),
    bottom: Math.max(...rs.map((r) => r.bottom)),
  };
}

function startTutorial() {
  stopSwipeInterrupts();
  const demo = _tutDemoProfile();
  profiles.splice(currentIndex, 0, demo);
  showProfile();
  document.querySelector("#swipe-page .card-frame")?.scrollTo(0, 0);
  _tut = { active: true, step: null, agrees: 0, raf: 0 };
  // 已经弹出来的消息 / 「有人喜欢你」横幅先收起来，教学完再出来
  _quietOverlayEnter();
  document.getElementById("tut").classList.remove("hidden");
  _tutGo("intro");
  const loop = () => {
    if (!_tut.active) return;
    _tutLayout();
    _tut.raf = requestAnimationFrame(loop);
  };
  loop();
}

// 从「我」里重看教学
function replayTutorial() {
  closeMePage();
  startTutorial();
}

function _tutGo(step) {
  if (step === "finish") return _tutFinish();
  _tut.step = step;
  const s = _TUT_STEPS[step];
  const root = document.getElementById("tut");
  root.dataset.mode = s.popup ? "popup" : s.target ? (s.open ? "open" : "look") : "full";
  const n = _TUT_ORDER.indexOf(step);
  document.getElementById("tut-progress").textContent = n >= 0 ? `${String(n + 1).padStart(2, "0")} / ${String(_TUT_ORDER.length).padStart(2, "0")}` : "";
  document.getElementById("tut-text").innerHTML = biHtml(s.zh, s.en);
  const next = document.getElementById("tut-next");
  next.dataset.off = s.next ? "" : "1"; // .nes-btn 的 display 带 !important，用 CSS 属性选择器藏
  next.innerHTML = biHtml(...(s.btn || [step === "intro" ? "开始" : "继续", step === "intro" ? "Start" : "Next"])) + " ▶";
  // 要按的东西先滚到看得见的地方
  const t = s.target?.();
  if (t instanceof Element) t.scrollIntoView({ block: "center", behavior: "smooth" });
}

function tutNext() {
  const s = _TUT_STEPS[_tut.step];
  if (s?.next) _tutGo(s.next);
}

// 每一帧按目标现在的位置摆好四块纸和提示（卡片会滚动、红字会飘）
function _tutLayout() {
  const s = _TUT_STEPS[_tut.step];
  const root = document.getElementById("tut");
  const note = document.getElementById("tut-note");
  // body 被刘海往下挪过，fixed 浮层以 body 为基准，所以坐标要减掉 body 的位置
  const base = document.body.getBoundingClientRect();
  const W = window.innerWidth,
    H = window.innerHeight;
  let t = s.target?.();
  if (t instanceof Element) t = t.getBoundingClientRect();
  const panes = ["t", "b", "l", "r"].map((k) => document.getElementById(`tut-${k}`));
  const ring = document.getElementById("tut-ring");
  const place = (el, x, y, w, h) => {
    el.style.left = x - base.left + "px";
    el.style.top = y - base.top + "px";
    el.style.width = Math.max(0, w) + "px";
    el.style.height = Math.max(0, h) + "px";
  };

  if (!t || s.popup) {
    // 没有目标：整张纸盖满（弹窗步骤里纸由 CSS 收起来）
    place(panes[0], 0, 0, W, H);
    panes.slice(1).forEach((p) => place(p, 0, 0, 0, 0));
    ring.style.display = "none";
    if (s.popup) {
      note.style.left = 12 - base.left + "px";
      note.style.top = 12 - base.top + "px";
    } else {
      note.style.left = (W - note.offsetWidth) / 2 - base.left + "px";
      note.style.top = (H - note.offsetHeight) / 2 - base.top + "px";
    }
    return;
  }

  const pad = 6;
  const x0 = Math.max(0, t.left - pad),
    y0 = Math.max(0, t.top - pad),
    x1 = Math.min(W, t.right + pad),
    y1 = Math.min(H, t.bottom + pad);
  place(panes[0], 0, 0, W, y0);
  place(panes[1], 0, y1, W, H - y1);
  place(panes[2], 0, y0, x0, y1 - y0);
  place(panes[3], x1, y0, W - x1, y1 - y0);
  ring.style.display = "block";
  place(ring, x0, y0, x1 - x0, y1 - y0);

  // 提示写在挖空处下面；下面放不下就写在上面
  const nh = note.offsetHeight,
    nw = note.offsetWidth,
    gap = 14;
  const below = y1 + gap + nh <= H - 8;
  const ny = below ? y1 + gap : Math.max(8, y0 - gap - nh);
  const nx = Math.min(Math.max(12, (x0 + x1) / 2 - nw / 2), W - nw - 12);
  note.style.left = nx - base.left + "px";
  note.style.top = ny - base.top + "px";
}

// 真正的功能里埋的钩子：教学开着时，按教学的进度往下走
function _tutHook(ev) {
  if (!_tut.active) return;
  const step = _tut.step;
  // 弹窗被关掉（取消）→ 回到上一步重来；确定提交的话同步就会先跳到下一步
  const backIfStill = (popupStep, back) =>
    setTimeout(() => {
      if (_tut.active && _tut.step === popupStep) _tutGo(back);
    }, 0);
  if (ev === "interp-open" && step === "longpress") _tutGo("interpWrite");
  else if (ev === "interp-close") backIfStill("interpWrite", "longpress");
  else if (ev === "interp-submit" && step === "interpWrite") _tutGo("tap");
  else if (ev === "interp-expand" && step === "tap") _tutGo("agree");
  else if (ev === "interp-collapse" && step === "agree") _tutGo("tap");
  else if (ev === "agree" && step === "agree" && ++_tut.agrees >= 2) setTimeout(() => _tutGo("impressBtn"), 500);
  else if (ev === "imp-open" && step === "impressBtn") _tutGo("impWrite");
  else if (ev === "imp-close") backIfStill("impWrite", "impressBtn");
  else if (ev === "imp-submit" && step === "impWrite") _tutGo("impDone");
  else if (ev === "warn-open" && step === "likeBtn") _tutGo("warn");
  else if (ev === "warn-close") backIfStill("warn", "likeBtn");
  else if (ev === "opener-open" && (step === "likeBtn" || step === "warn")) _tutGo("opener");
  else if (ev === "opener-close") backIfStill("opener", "likeBtn");
  else if (ev === "liked" && step === "opener") _tutGo("done");
}

// 教学里对示范档案的请求不发出去，直接回一个假的结果
function _tutFakeResponse(url, opts) {
  if (!_tut.active || (opts.method || "GET") !== "POST" || !String(opts.body || "").includes(TUT_USER)) return null;
  let data = { success: true };
  if (url === "/interpretation/agree") {
    const b = JSON.parse(opts.body);
    const it = currentProfileInterpretations[b.field]?.[b.interpIndex];
    data = { agrees: (it?.agrees || 0) + 1 };
  }
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } }));
}

const _tutIsDemo = (p) => p?.username === TUT_USER;

// 教学开着时，每一步只能做这一步教的动作（比如长按那一步短按不会把红字弹出来）
const _TUT_ALLOW = { longpress: ["longpress"], tap: ["tap"], agree: ["tap"] };
function _tutBlocks(action) {
  return _tut.active && !(_TUT_ALLOW[_tut.step] || []).includes(action);
}

function _tutFinish() {
  _tut.active = false;
  cancelAnimationFrame(_tut.raf);
  document.getElementById("tut").classList.add("hidden");
  // 拿掉示范档案，回到它原来的位置（喜欢完它已经翻到下一张了）
  const i = profiles.findIndex(_tutIsDemo);
  if (i >= 0) {
    profiles.splice(i, 1);
    currentIndex = i;
  }
  showProfile();
  document.querySelector("#swipe-page .card-frame")?.scrollTo(0, 0);
  startSwipeInterrupts();
  startGenderedNotifications();
  _resumeAfterOverlay();
}

let currentProfileInterpretations = {};
let longPressJustFired = false;

// ── Pixel icon system ─────────────────────────────────────────

function _makeIcon(pattern, px, color = themeInk()) {
  const c = document.createElement("canvas");
  c.width = pattern[0].length * px;
  c.height = pattern.length * px;
  const ctx = c.getContext("2d");
  ctx.fillStyle = color;
  pattern.forEach((row, ry) =>
    row.forEach((v, rx) => {
      if (v) ctx.fillRect(rx * px, ry * px, px, px);
    }),
  );
  return c.toDataURL();
}

const _iconCache = {};
const _iconPatterns = {
  envelope: [
    [1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 0, 0, 0, 0, 0, 1, 1],
    [1, 0, 1, 0, 0, 0, 1, 0, 1],
    [1, 0, 0, 1, 0, 1, 0, 0, 1],
    [1, 0, 0, 0, 1, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1],
  ],
  bubble: [
    [0, 1, 1, 1, 1, 1, 1, 1, 0],
    [1, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 1],
    [0, 1, 1, 1, 1, 1, 1, 1, 0],
    [0, 0, 0, 1, 1, 0, 0, 0, 0],
    [0, 0, 0, 0, 1, 0, 0, 0, 0],
  ],
  // upright pencil: eraser cap top, hollow shaft, tapered tip bottom
  pencil: [
    [0, 1, 1, 1, 0],
    [0, 1, 1, 1, 0],
    [0, 1, 0, 1, 0],
    [0, 1, 0, 1, 0],
    [0, 1, 0, 1, 0],
    [0, 1, 1, 1, 0],
    [0, 1, 0, 1, 0],
    [0, 0, 1, 0, 0],
  ],
  // thick 2-px X
  xmark: [
    [1, 1, 0, 0, 0, 1, 1],
    [1, 1, 1, 0, 1, 1, 1],
    [0, 1, 1, 1, 1, 1, 0],
    [0, 0, 1, 1, 1, 0, 0],
    [0, 1, 1, 1, 1, 1, 0],
    [1, 1, 1, 0, 1, 1, 1],
    [1, 1, 0, 0, 0, 1, 1],
  ],
  paw: [
    [0, 1, 1, 0, 1, 1, 0, 1, 1],
    [0, 1, 1, 0, 1, 1, 0, 1, 1],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 1, 1, 1, 1, 1, 0, 0],
    [0, 1, 1, 1, 1, 1, 1, 1, 0],
    [0, 0, 1, 1, 1, 1, 1, 0, 0],
  ],
  dice: [
    [1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 0, 0, 0, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 1, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 0, 0, 0, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1],
  ],
  // pixel ⚠️ warning triangle with ! inside
  warn: [
    [0, 0, 0, 1, 0, 0, 0],
    [0, 0, 1, 1, 1, 0, 0],
    [0, 1, 1, 1, 1, 1, 0],
    [1, 1, 1, 0, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1],
  ],
  // 点喜欢时的风险警告：大号像素三角，只画轮廓（镂空）+ 中间的「!」
  warn_big: [
    [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0],
    [0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0],
    [0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0],
    [0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0],
    [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0],
    [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  ],
  // 排行榜按钮：奖杯
  trophy: [
    [0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1],
    [1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1],
    [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    [0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0],
    [0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    [0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0],
  ],
  // pixel eye
  eye: [
    [0, 1, 1, 1, 1, 1, 0],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 0, 1, 0, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [0, 1, 1, 1, 1, 1, 0],
  ],
  // 密码框的小眼睛：睁眼（杏仁形眼眶 + 瞳孔）
  pw_eye: [
    [0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0],
    [0, 0, 1, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0],
    [0, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1, 0],
    [1, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1],
    [0, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1, 0],
    [0, 0, 1, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0],
    [0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0],
  ],
  // 密码框的小眼睛：闭眼（向下弯的眼皮 + 睫毛）
  pw_eye_closed: [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
    [0, 0, 1, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0],
    [0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0],
    [0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0],
    [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0],
  ],
  // pixel clock
  clock: [
    [0, 1, 1, 1, 1, 0],
    [1, 0, 0, 0, 0, 1],
    [1, 0, 1, 0, 0, 1],
    [1, 0, 1, 1, 0, 1],
    [1, 0, 0, 0, 0, 1],
    [0, 1, 1, 1, 1, 0],
  ],
  // pixel question mark
  question: [
    [0, 1, 1, 1, 0],
    [1, 0, 0, 0, 1],
    [0, 0, 0, 1, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 1, 0, 0],
  ],
};

// 换配色时要按新墨色重画页面上已有的图标：记下每张图标图片怎么重新生成
const _iconRegen = new Map();

function getIcon(name, px = 3, color) {
  // 没指定颜色 = 用当前配色的墨色
  const key = `${name}_${px}_${color || themeInk()}`;
  if (!_iconCache[key]) {
    _iconCache[key] = _makeIcon(_iconPatterns[name], px, color || themeInk());
    if (!color) _iconRegen.set(_iconCache[key], () => getIcon(name, px));
  }
  return _iconCache[key];
}

function iconImg(name, px = 3, color) {
  const p = _iconPatterns[name];
  const w = p[0].length * px,
    h = p.length * px;
  return `<img src="${getIcon(name, px, color)}" width="${w}" height="${h}" style="image-rendering:pixelated;vertical-align:middle;">`;
}

// 换配色：页面上已有的像素图标 / 骰子 / 爱心按新墨色换掉，档案卡重画（头像也跟着变色）
document.addEventListener("themechange", () => {
  const oldHeart = getPixelHeartUrl._cache;
  const oldVomit = getPixelVomitUrl._cache;
  getPixelHeartUrl._cache = getPixelVomitUrl._cache = null;
  document.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src");
    const regen = _iconRegen.get(src);
    if (regen) img.src = regen();
    else if (src && src === oldHeart) img.src = getPixelHeartUrl();
    else if (src && src === oldVomit) img.src = getPixelVomitUrl();
  });
  if (document.getElementById("swipe-page")?.classList.contains("active")) showProfile();
  _refreshMyProfileCard();
});

// Dice faces ⚀–⚅  (9×9 grid: border at 0/8, dots at 2/4/6 — 1-cell gap from border)
const _diceDotSets = {
  1: [[4, 4]],
  2: [
    [2, 6],
    [6, 2],
  ],
  3: [
    [2, 6],
    [4, 4],
    [6, 2],
  ],
  4: [
    [2, 2],
    [2, 6],
    [6, 2],
    [6, 6],
  ],
  5: [
    [2, 2],
    [2, 6],
    [4, 4],
    [6, 2],
    [6, 6],
  ],
  6: [
    [2, 2],
    [2, 6],
    [4, 2],
    [4, 6],
    [6, 2],
    [6, 6],
  ],
};
function getDiceFaceUrl(n, px = 3) {
  const key = `dice${n}_${px}_${themeInk()}`;
  if (_iconCache[key]) return _iconCache[key];
  const dots = _diceDotSets[n];
  const c = document.createElement("canvas");
  c.width = 9 * px;
  c.height = 9 * px;
  const ctx = c.getContext("2d");
  ctx.fillStyle = themeInk();
  for (let r = 0; r < 9; r++) {
    for (let col = 0; col < 9; col++) {
      if (
        r === 0 ||
        r === 8 ||
        col === 0 ||
        col === 8 ||
        dots.some(([dr, dc]) => dr === r && dc === col)
      )
        ctx.fillRect(col * px, r * px, px, px);
    }
  }
  _iconCache[key] = c.toDataURL();
  _iconRegen.set(_iconCache[key], () => getDiceFaceUrl(n, px));
  return _iconCache[key];
}

function diceFaceImg(n, px = 3) {
  const s = 9 * px;
  return `<img src="${getDiceFaceUrl(n, px)}" width="${s}" height="${s}" style="image-rendering:pixelated;vertical-align:middle;">`;
}

function initPixelButtons() {
  // topbar message button — keep badge
  const msgBtn = document.getElementById("msg-notif-btn");
  if (msgBtn) {
    const badge = msgBtn.querySelector("#msg-notif-count");
    msgBtn.innerHTML = iconImg("bubble", 3);
    if (badge) msgBtn.appendChild(badge);
  }
  const rankBtn = document.getElementById("rank-btn");
  if (rankBtn) rankBtn.innerHTML = iconImg("trophy", 3);
  // old-style dice buttons (income, edit form)
  document.querySelectorAll(".dice-btn").forEach((btn) => {
    btn.innerHTML = iconImg("dice", 3);
  });
  // housing dice-roll buttons — init with face 6
  document.querySelectorAll(".dice-roll-btn").forEach((btn) => {
    btn.innerHTML = diceFaceImg(6, 4);
  });
  // global emoji → pixel icon replacement across all buttons
  document.querySelectorAll(".nes-btn").forEach((btn) => {
    const t = btn.textContent.trim();
    if (t === "💗") btn.innerHTML = iconImg("heart_sm", 3);
    if (t === "💭") btn.innerHTML = iconImg("pencil", 3);
    if (t === "❌") btn.innerHTML = iconImg("xmark", 3);
    if (t.includes("✉️")) {
      const label = t.replace(/✉️/g, "").trim();
      btn.innerHTML = (label ? label + " " : "") + iconImg("envelope", 3);
    }
  });
  // replace ⚠️ warning icon div
  const warnEl = document.getElementById("warning-icon");
  if (warnEl) warnEl.textContent = "⚠️";
}

// Register heart_sm pattern at module level so it's always available
_iconPatterns.heart_sm = [
  [0, 1, 1, 0, 1, 1, 0],
  [1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1],
  [0, 1, 1, 1, 1, 1, 0],
  [0, 0, 1, 1, 1, 0, 0],
  [0, 0, 0, 1, 0, 0, 0],
];

document.addEventListener("DOMContentLoaded", async () => {
  document.querySelectorAll(".dice-btn").forEach((btn) => {
    btn.innerHTML = diceFaceImg(6, 3);
  });
  initPixelButtons();
  // 大家自定义过的爱好 / 性别 / 性取向 / 城市先取回来，合进选项里
  await Promise.all([loadCustomHobbyTags(), loadCustomOptions()]);
  buildHobbyTags("hobby-tags");
  buildStandardsTags("standards-tags");
  buildCitySelectors("house");
  _watchHouseSteps();
  _watchSteps("profile-vehicle", _updateVehicleSteps);
  _watchSteps("profile-sterilized", _updateRelSteps);
  buildCitySelectors("parents-father");
  buildCitySelectors("parents-mother");
  _tryAutoLogin();
});

function rollIncomeTierDice() {
  const btn = document.getElementById("petIncome-dice-btn");
  const display = document.getElementById("petIncome-display");
  if (!btn || !display) return;
  const rolls = parseInt(btn.dataset.rolls || "0", 10);
  if (rolls >= MAX_HOUSING_ROLLS) return;
  btn.dataset.rolls = rolls + 1;
  btn.disabled = true;
  let count = 0;
  const iv = setInterval(() => {
    btn.innerHTML = diceFaceImg(Math.floor(Math.random() * 6) + 1, 4);
    count++;
    if (count >= 16) {
      clearInterval(iv);
      const roll = Math.floor(Math.random() * 6) + 1;
      btn.innerHTML = diceFaceImg(roll, 4);
      const remaining = MAX_HOUSING_ROLLS - parseInt(btn.dataset.rolls, 10);
      btn.disabled = remaining <= 0;
      if (remaining <= 0) btn.classList.add("dice-exhausted");
      const value = HOUSING_TIERS.income[roll];
      document.getElementById("petIncome").value = value;
      display.textContent = disp(value);
    }
  }, 70);
}

function renderValue(profile, field, valueText, extraClass = "") {
  const raw = profile.interpretations && profile.interpretations[field];
  const interps = Array.isArray(raw) ? raw : raw ? [raw] : [];
  // 名字原样显示成一行，不按「中文 / English」拆开（名字里可能本来就有 /，比如 AC/DC）
  const display = field === "name"
    ? `<span class="bi-zh">${escapeHtml(valueText || "—")}</span>`
    : fmtBI(valueText);
  if (interps.length > 0) {
    return `<span class="value ${extraClass} has-interpretations" data-field="${field}">${display}</span>`;
  }
  return `<span class="value ${extraClass}" data-field="${field}">${display}</span>`;
}

function renderCardHTML(profile) {
  // 每一栏的内容由 shared/card-data.js 的 cardValues 统一算出（大屏 web 也用同一份）
  const c = cardValues(profile);
  const cell = (zh, en, field, text, extra) => `
    <div class="cell">
      <span class="label"><span class="zh">${zh}</span> <small class="en">${en}</small></span>
      ${renderValue(profile, field, text, extra)}
    </div>`;
  const section = (zh, en, field, text, extra) => `
  <div class="section">
    <span class="label"><span class="zh">${zh}</span> <small class="en">${en}</small></span>
    ${renderValue(profile, field, text, extra)}
  </div>`;
  const row = (cells) => `
  <div class="${cells.length === 1 ? "" : `grid-${cells.length}`}">${cells.join("")}
  </div>`;
  const stampColorClass = c.score < 60 ? "stamp-red" : "";
  const pixels = (n, url, cls) =>
    n === 0
      ? '<span class="value" style="opacity:0.4">—</span>'
      : Array(Math.min(n, 48)).fill(`<img src="${url}" class="${cls}">`).join("");
  return `
<div class="card" data-noi18n>

  <div class="profile-score-stamp ${stampColorClass}">
    <span class="stamp-date">${c.stampDate}</span>
    <span class="stamp-num">${c.score}</span>
    <span class="stamp-lines"><span></span><span></span></span>
  </div>

  <div class="avatar-box">
    <img src="${c.avatar}" class="avatar">
  </div>
${section("名字", "Name", "name", c.name, "big")}
${section("物种", "Species", "breed", c.breed, "territory")}
${row([cell("性别", "Gender", "gender", c.gender), cell("年龄", "Age", "age", c.age), cell("身高", "Height", "height", c.height)])}
${row([cell("性取向", "Orientation", "orientation", c.orientation), cell("婚恋", "Status", "sterilized", c.status)])}
${c.ships ? section("其他关系", "Other Ships", "ships", c.ships) : ""}
${row([cell("MBTI", "", "mbti", c.mbti).replace(' <small class="en"></small>', "").replace('<span class="zh">MBTI</span>', "MBTI"), cell("星座", "Horoscope", "horoscope", c.horoscope)])}
${section("领地", "Territory", "hukou", c.territory, "territory")}
${section("车辆", "Vehicles", "vehicle", c.vehicle)}
${row([cell("学历", "Education", "edu", c.edu), cell("职业", "Job", "occupation", c.occupation), cell("月收入", "Income", "income", c.income)])}
${section("总资产", "Total Assets", "assets", c.assets)}
${row([cell("目的", "Here For", "datingPurpose", c.datingPurpose), cell("期望关系", "Looking For", "relationshipGoal", c.relationshipGoal)])}
${c.relRows.map((r) => row(r.map(([zh, en, key, text]) => cell(zh, en, key, text)))).join("")}
${section("兴趣爱好", "Hobbies", "hobby", c.hobby)}
${section("家庭状况", "Family", "parents", c.family)}
${c.standards ? section("择偶标准", "Looking For", "standards", c.standards) : ""}

  <div class="section">
    <span class="label"><span class="zh">被喜欢</span> <small class="en">Liked</small></span>
    <div class="pixel-hearts-box">${pixels(c.likes, getPixelHeartUrl(), "pixel-heart")}</div>
  </div>

  <div class="section">
    <span class="label"><span class="zh">被跳过</span> <small class="en">Skipped</small></span>
    <div class="pixel-hearts-box">${pixels(c.skips, getPixelVomitUrl(), "pixel-heart pixel-vomit")}</div>
  </div>

</div>
  `;
}

function showProfile() {
  const container = document.getElementById("swipe-container");
  container.innerHTML = "";

  if (currentIndex >= profiles.length) {
    container.innerHTML = `<h1>没有更多兽人了 / No more profiles ${iconImg("paw", 3)}</h1>`;
    _profileShownAt = 0;
    _currentSwipeProfileName = "";
    return;
  }

  const profile = profiles[currentIndex];
  _profileShownAt = Date.now();
  _currentSwipeProfileName = profile.name || profile.username || "";
  _currentSwipeProfile = profile;
  currentProfileInterpretations = profile.interpretations || {};

  container.innerHTML = renderCardHTML(profile);
  attachLabelHandlers(profile.username);
  attachSectionDragScroll(container);
  console.log("Showing profile:", profile);
  console.log("Current index:", currentIndex);
}

function attachSectionDragScroll(cardContainer) {
  cardContainer.querySelectorAll(".section, .cell").forEach((el) => {
    let dragging = false;
    let startX, startY, scrollLeft, scrollTop;

    el.addEventListener("mousedown", (e) => {
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      scrollLeft = el.scrollLeft;
      scrollTop = el.scrollTop;
      el.style.cursor = "grabbing";
      e.preventDefault();
    });

    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      el.scrollLeft = scrollLeft - (e.clientX - startX);
      el.scrollTop = scrollTop - (e.clientY - startY);
    });

    window.addEventListener("mouseup", () => {
      dragging = false;
      el.style.cursor = "";
    });

    // Touch drag-scroll (stop propagation so card swipe isn't triggered)
    let tStartX, tStartY, tScrollLeft, tScrollTop;
    el.addEventListener(
      "touchstart",
      (e) => {
        tStartX = e.touches[0].clientX;
        tStartY = e.touches[0].clientY;
        tScrollLeft = el.scrollLeft;
        tScrollTop = el.scrollTop;
      },
      { passive: true },
    );

    el.addEventListener(
      "touchmove",
      (e) => {
        const dx = tStartX - e.touches[0].clientX;
        const dy = tStartY - e.touches[0].clientY;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
          el.scrollLeft = tScrollLeft + dx;
          el.scrollTop = tScrollTop + dy;
        }
      },
      { passive: true },
    );
  });
}

// Long press + tap handlers for labels
let longPressTimer = null;
let interpTarget = { field: null, profileUsername: null, labelText: null };
let touchStartX = 0;
let touchStartY = 0;

function attachLabelHandlers(profileUsername, containerEl) {
  const container = containerEl || document.getElementById("swipe-container");

  // Remove old listeners by replacing the container node's cloned handlers
  // (simpler: just use a flag so we don't double-bind across showProfile calls)
  if (container._labelHandlersBound) {
    container.removeEventListener("touchstart", container._onTouchStart);
    container.removeEventListener("touchend", container._onTouchEnd);
    container.removeEventListener("touchcancel", container._onTouchCancel);
    container.removeEventListener("touchmove", container._onTouchMove);
    container.removeEventListener("click", container._onClick);
  }

  container._onTouchStart = (e) => {
    // 新的一次按下：上一次长按后浏览器没补发 click 的话，标记会一直留着把这次短按吞掉
    longPressJustFired = false;
    const label = e.target.closest(".value[data-field]");
    if (!label) return;

    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;

    // Lock these now — DOM may re-render before timer fires
    const fieldLocked = label.dataset.field;
    const clone = label.cloneNode(true);
    clone.querySelectorAll(".interp-bubble").forEach((b) => b.remove());
    // 中文行 / 英文行分开取（卡片上两行都在，直接取 textContent 会粘成「单身Single」）
    const zhLine = clone.querySelector(".bi-zh")?.textContent.trim() || clone.textContent.trim();
    const enLine = clone.querySelector(".bi-en")?.textContent.trim() || zhLine;
    const labelTextLocked = { zh: zhLine, en: enLine };

    if (_tutBlocks("longpress")) return;
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      longPressJustFired = true;
      openInterpPopup(fieldLocked, profileUsername, labelTextLocked);
    }, 500);
  };

  container._onTouchEnd = () => {
    if (longPressTimer === null) return; // long press already fired, ignore
    clearTimeout(longPressTimer);
    longPressTimer = null;
  };

  container._onTouchCancel = () => {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  };

  container._onTouchMove = (e) => {
    if (longPressTimer === null) return;
    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;
    if (Math.sqrt(dx * dx + dy * dy) > 10) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  // Short tap: expand → show all red comment bubbles crowded in same span
  container._onClick = (e) => {
    if (longPressJustFired) {
      longPressJustFired = false;
      return;
    }

    // Tapping a red bubble → agree (max 2 per user, persisted to server)
    const bubble = e.target.closest(".interp-bubble");
    if (bubble) {
      const myAgrees = parseInt(bubble.dataset.myAgrees || "0");
      if (myAgrees >= 2) return;
      const fieldSpan = bubble.closest(".value[data-field]");
      const field = fieldSpan?.dataset.field;
      const interpIndex = parseInt(bubble.dataset.interpIndex);
      api("/interpretation/agree", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileUsername,
          field,
          interpIndex,
          agreeingUser: currentUser.username,
        }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (!data.limited) {
            bubble.dataset.myAgrees = myAgrees + 1;
            bubble.dataset.agrees = data.agrees;
            const base = parseFloat(bubble.dataset.baseFontSize || "11");
            bubble.style.fontSize = base + data.agrees * 5 + "px";
            const arr = currentProfileInterpretations[field];
            if (Array.isArray(arr) && arr[interpIndex]) {
              arr[interpIndex].agrees = data.agrees;
              if (!arr[interpIndex].agreedBy) arr[interpIndex].agreedBy = {};
              arr[interpIndex].agreedBy[currentUser.username] = myAgrees + 1;
            }
            _tutHook("agree");
          }
        });
      return;
    }

    const span = e.target.closest(".value[data-field]");
    if (!span) return;
    if (_tutBlocks("tap")) return;

    const field = span.dataset.field;
    const raw = currentProfileInterpretations[field];
    const interpList = Array.isArray(raw) ? raw : raw ? [raw] : [];
    if (interpList.length === 0) return;

    // Collapse — remove only bubbles, original content untouched
    if (span.dataset.expanded === "true") {
      span.dataset.expanded = "false";
      span.classList.remove("interp-expanded");
      span.querySelectorAll(".interp-bubble").forEach((b) => b.remove());
      _tutHook("interp-collapse");
      return;
    }

    // Expand — leave original innerHTML completely alone, just append bubbles
    span.dataset.expanded = "true";
    span.classList.add("interp-expanded");

    interpList.forEach((interp, i) => {
      const b = document.createElement("span");
      b.className = "interp-bubble";
      b.textContent = interp.text;
      b.dataset.interpIndex = i;
      const savedAgrees = interp.agrees || 0;
      const myAgrees = interp.agreedBy?.[currentUser?.username] || 0;
      b.dataset.agrees = savedAgrees;
      b.dataset.myAgrees = myAgrees;
      b.dataset.baseFontSize = "11";
      if (savedAgrees > 0) b.style.fontSize = 11 + savedAgrees * 5 + "px";

      const n = interpList.length;
      // Evenly distribute on an ellipse so starting positions are already spread
      const angle = (i / Math.max(n, 1)) * 2 * Math.PI;
      const ringR = Math.max(50, n * 14); // ring radius grows with count
      const sx = Math.cos(angle) * ringR * 0.6 + (Math.random() - 0.5) * 8;
      const sy = Math.sin(angle) * ringR * 0.28 + (Math.random() - 0.5) * 5;

      // Final rest position — also spread on a ring, collision-corrected after render
      const fAngle = angle + 0.3 * (Math.random() - 0.5);
      const fDist = Math.max(40, n * 12);
      const fx0 = Math.cos(fAngle) * fDist * 0.7;
      const fy0 = Math.sin(fAngle) * fDist * 0.3;
      const dx = (Math.random() - 0.5) * 6;
      const dy = (Math.random() - 0.5) * 5;

      b.style.setProperty("--sx", sx + "px");
      b.style.setProperty("--sy", sy + "px");
      b.style.setProperty("--fx", fx0 + "px");
      b.style.setProperty("--fy", fy0 + "px");
      b.style.setProperty("--dx", dx + "px");
      b.style.setProperty("--dy", dy + "px");
      b.style.animationDelay = `${i * 55}ms, ${700 + i * 55}ms`;

      span.appendChild(b);
    });
    _tutHook("interp-expand");

    // Double-RAF: wait for layout so offsetWidth/offsetHeight are accurate
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const spanR = span.getBoundingClientRect();
        const cx = spanR.left + spanR.width / 2;
        const cy = spanR.top + spanR.height / 2;
        const mg = 4;

        const textRect = {
          l: -spanR.width / 2 - mg,
          r: spanR.width / 2 + mg,
          t: -spanR.height / 2 - mg,
          b: spanR.height / 2 + mg,
        };

        const section = span.closest(".section, .cell");
        let sectionRect = null;
        let labelRect = null;
        if (section) {
          const sr = section.getBoundingClientRect();
          sectionRect = {
            l: sr.left - cx,
            r: sr.right - cx,
            t: sr.top - cy,
            b: sr.bottom - cy,
          };
          const lbl = section.querySelector(".label");
          if (lbl) {
            const lr = lbl.getBoundingClientRect();
            labelRect = {
              l: lr.left - cx - mg,
              r: lr.right - cx + mg,
              t: lr.top - cy - mg,
              b: lr.bottom - cy + mg,
            };
          }
        }

        const bubbleEls = Array.from(span.querySelectorAll(".interp-bubble"));

        // Measure each bubble's actual rendered half-size (offsetWidth ignores CSS transform).
        // Fallback to text-length estimate if layout hasn't resolved yet.
        const hw = bubbleEls.map((b) => {
          const w = b.offsetWidth;
          return (w > 0 ? w : Math.max(30, b.textContent.length * 7)) / 2 + mg;
        });
        const hh = bubbleEls.map((b) => {
          const h = b.offsetHeight;
          return (h > 0 ? h : 14) / 2 + mg;
        });

        const pos = bubbleEls.map((b) => ({
          fx: parseFloat(b.style.getPropertyValue("--fx")) || 0,
          fy: parseFloat(b.style.getPropertyValue("--fy")) || 0,
        }));

        function pushOffRect(fx, fy, w2, h2, rect) {
          const overX = fx - w2 < rect.r && fx + w2 > rect.l;
          const overY = fy - h2 < rect.b && fy + h2 > rect.t;
          if (!overX || !overY) return [fx, fy];
          const dL = Math.abs(fx - (rect.l - w2));
          const dR = Math.abs(fx - (rect.r + w2));
          const dU = Math.abs(fy - (rect.t - h2));
          const dD = Math.abs(fy - (rect.b + h2));
          const min = Math.min(dL, dR, dU, dD);
          if (min === dL) fx = rect.l - w2;
          else if (min === dR) fx = rect.r + w2;
          else if (min === dU) fy = rect.t - h2;
          else fy = rect.b + h2;
          return [fx, fy];
        }

        function constrain(i) {
          let { fx, fy } = pos[i];
          const w2 = hw[i],
            h2 = hh[i];
          [fx, fy] = pushOffRect(fx, fy, w2, h2, textRect);
          if (labelRect) [fx, fy] = pushOffRect(fx, fy, w2, h2, labelRect);
          if (sectionRect) {
            fx = Math.max(sectionRect.l + w2, Math.min(sectionRect.r - w2, fx));
            fy = Math.max(sectionRect.t + h2, Math.min(sectionRect.b - h2, fy));
          }
          pos[i] = { fx, fy };
        }

        bubbleEls.forEach((_, i) => constrain(i));

        // Multi-pass bubble-bubble AABB repulsion using actual sizes
        for (let pass = 0; pass < 80; pass++) {
          let moved = false;
          for (let a = 0; a < pos.length; a++) {
            for (let b = a + 1; b < pos.length; b++) {
              const minX = hw[a] + hw[b];
              const minY = hh[a] + hh[b];
              const dx = pos[b].fx - pos[a].fx;
              const dy = pos[b].fy - pos[a].fy;
              const olX = minX - Math.abs(dx);
              const olY = minY - Math.abs(dy);
              if (olX <= 0 || olY <= 0) continue;
              moved = true;
              if (olX <= olY) {
                const push = olX / 2 + 1;
                if (dx >= 0) {
                  pos[a].fx -= push;
                  pos[b].fx += push;
                } else {
                  pos[a].fx += push;
                  pos[b].fx -= push;
                }
              } else {
                const push = olY / 2 + 1;
                if (dy >= 0) {
                  pos[a].fy -= push;
                  pos[b].fy += push;
                } else {
                  pos[a].fy += push;
                  pos[b].fy -= push;
                }
              }
            }
          }
          // Re-constrain all after each full pass
          bubbleEls.forEach((_, i) => constrain(i));
          if (!moved) break;
        }

        bubbleEls.forEach((b, i) => {
          b.style.setProperty("--fx", pos[i].fx + "px");
          b.style.setProperty("--fy", pos[i].fy + "px");
        });
      }),
    );
  };

  container.addEventListener("touchstart", container._onTouchStart, {
    passive: true,
  });
  container.addEventListener("touchend", container._onTouchEnd, {
    passive: true,
  });
  container.addEventListener("touchcancel", container._onTouchCancel, {
    passive: true,
  });
  container.addEventListener("touchmove", container._onTouchMove, {
    passive: true,
  });
  container.addEventListener("click", container._onClick);
  container._labelHandlersBound = true;
}

function openInterpPopup(field, profileUsername, labelText) {
  interpTarget = { field, profileUsername, labelText };
  document.getElementById("interpret-label-name").innerHTML =
    biHtml(`"${labelText.zh}" 对你来说意味着什么？`, `What does "${labelText.en}" mean to you?`);
  document.getElementById("interpret-input").value = "";
  document.getElementById("interpret-popup").classList.remove("hidden");
  document.getElementById("interpret-input").focus();
  _tutHook("interp-open");
}

function closeInterpPopup() {
  document.getElementById("interpret-popup").classList.add("hidden");
  interpTarget = { field: null, profileUsername: null, labelText: null };
  _tutHook("interp-close");
}

function submitInterpretation() {
  const text = document.getElementById("interpret-input").value.trim();
  if (!text || !interpTarget.field) return;

  const field = interpTarget.field;
  const profileUsername = interpTarget.profileUsername;

  closeInterpPopup();

  // Optimistically add to local state so the bubble appears immediately
  if (!currentProfileInterpretations[field]) currentProfileInterpretations[field] = [];
  if (!Array.isArray(currentProfileInterpretations[field])) {
    currentProfileInterpretations[field] = [currentProfileInterpretations[field]];
  }
  currentProfileInterpretations[field].push({ text, addedBy: currentUser.username, agrees: 0, agreedBy: {} });

  // Mark the label in the DOM so the red glow indicator appears immediately
  document.querySelectorAll(`.value[data-field="${CSS.escape(field)}"]`).forEach(el => {
    el.classList.add("has-interpretations");
  });

  api("/interpretation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileUsername, field, text, addedBy: currentUser.username }),
  });
  _tutHook("interp-submit");
}

// ── Risk Warning System ───────────────────────────────────────

const carnivoreSpecies = new Set([
  "非洲野犬 / African Wild Dog",
  "短吻鳄 / Alligator",
  "白头海雕 / Bald Eagle",
  "熊 / Bear",
  "亚洲黑熊 / Bear (Asian Black)",
  "棕熊 / Bear (Brown)",
  "北极熊 / Bear (Polar)",
  "黑豹 / Black Panther",
  "凯门鳄 / Caiman",
  "加拿大猞猁 / Canada Lynx",
  "猫 / Cat",
  "变色龙 / Chameleon",
  "猎豹 / Cheetah",
  "郊狼 / Coyote",
  "湾鳄 / Crocodile (Saltwater)",
  "暹罗鳄 / Crocodile (Siamese)",
  "澳洲野犬 / Dingo",
  "狗 / Dog",
  "边境牧羊犬 / Dog (Border Collie)",
  "大丹犬 / Dog (Great Dane)",
  "拉布拉多寻回犬 / Dog (Labrador Retriever)",
  "古英格兰牧羊犬 / Dog (Old English Sheepdog)",
  "蝴蝶犬 / Dog (Papillon)",
  "博美犬 / Dog (Pomeranian)",
  "巴哥犬 / Dog (Pug)",
  "罗素梗 / Dog (Russell Terrier)",
  "圣伯纳犬 / Dog (Saint Bernard)",
  "柴犬 / Dog (Shiba Inu)",
  "海豚 / Dolphin",
  "耳廓狐 / Fennec Fox",
  "雪貂 / Ferret",
  "狐狸 / Fox",
  "赤狐 / Fox (Red)",
  "藏狐 / Fox (Tibetan)",
  "金雕 / Golden Eagle",
  "苍鹭 / Heron",
  "斑点鬣狗 / Hyena (Spotted)",
  "条纹鬣狗 / Hyena (Striped)",
  "豺 / Jackal",
  "美洲豹 / Jaguar",
  "科莫多巨蜥 / Komodo Dragon",
  "豹 / Leopard",
  "雪豹 / Leopard (Snow)",
  "狮子 / Lion",
  "非洲狮 / Lion (African)",
  "亚洲狮 / Lion (Asiatic)",
  "刚果狮 / Lion (Congo)",
  "马赛狮 / Lion (Maasai)",
  "鼹鼠 / Mole",
  "猫鼬 / Mongoose",
  "水獭 / Otter",
  "猫头鹰 / Owl",
  "仓鸮 / Owl (Barn)",
  "响尾蛇 / Rattlesnake",
  "海獭 / Sea Otter",
  "蛇鹫 / Secretarybird",
  "鲨鱼 / Shark",
  "石龙子 / Skink",
  "臭鼬 / Skunk",
  "蛇 / Snake",
  "鳄龟 / Snapping Turtle",
  "斑海豹 / Spotted Seal",
  "虎头海雕 / Stellar's Sea Eagle",
  "白鼬 / Stoat",
  "老虎 / Tiger",
  "孟加拉虎 / Tiger (Bengal)",
  "西伯利亚虎 / Tiger (Siberian)",
  "白虎 / Tiger (White)",
  "鲸 / Whale",
  "野猫 / Wild Cat",
  "狼 / Wolf",
  "灰狼 / Wolf (Gray)",
  "白狼 / Wolf (White)",
]);

const herbivoreSpecies = new Set([
  "羊驼 / Alpaca",
  "安哥拉山羊 / Angora Goat",
  "河狸 / Beaver",
  "水牛 / Buffalo",
  "骆驼 / Camel",
  "花栗鼠 / Chipmunk",
  "牛 / Cow",
  "驴 / Donkey",
  "大象 / Elephant",
  "鼯鼠 / Flying Squirrel",
  "果蝠 / Fruit Bat",
  "瞪羚 / Gazelle",
  "长颈鹿 / Giraffe",
  "山羊 / Goat",
  "豚鼠 / Guinea Pig",
  "河马 / Hippopotamus",
  "马 / Horse",
  "鬣蜥 / Iguana",
  "黑斑羚 / Impala",
  "袋鼠 / Kangaroo",
  "考拉 / Koala",
  "狐猴 / Lemur",
  "蒙古沙鼠 / Mongolian Gerbil",
  "驼鹿 / Moose",
  "霍加皮 / Okapi",
  "大角羚 / Oryx",
  "鸵鸟 / Ostrich",
  "兔子 / Rabbit",
  "花斑兔 / Rabbit (Harlequin)",
  "垂耳兔 / Rabbit (Lop-eared)",
  "迷你雷克斯兔 / Rabbit (Mini Rex)",
  "荷兰侏儒兔 / Rabbit (Netherland Dwarf)",
  "马鹿 / Red Deer",
  "小熊猫 / Red Panda",
  "犀牛 / Rhinoceros",
  "独角仙 / Rhinoceros Beetle",
  "高鼻羚羊 / Saiga Antelope",
  "绵羊 / Sheep",
  "达尔绵羊 / Sheep (Dall)",
  "美利奴绵羊 / Sheep (Merino)",
  "树懒 / Sloth",
  "梅花鹿 / Spotted Deer",
  "松鼠 / Squirrel",
  "天鹅 / Swan",
  "貘 / Tapir",
  "汤氏瞪羚 / Thomson's Gazelle",
  "陆龟 / Tortoise",
  "山绒鼠 / Viscacha",
  "疣猪 / Warthog",
  "约克夏猪 / Yorkshire Pig",
  "斑马 / Zebra",
]);

function _getSpecies(breedStr) {
  if (!breedStr) return "";
  const parts = breedStr.split(" · ");
  return parts.length >= 2 ? parts[parts.length - 1] : breedStr;
}

function _dietType(breedStr) {
  const s = _getSpecies(breedStr);
  if (carnivoreSpecies.has(s)) return "carnivore";
  if (herbivoreSpecies.has(s)) return "herbivore";
  return "omnivore";
}

const _incomeRank = {
  "<3k": 0,
  "3k–8k": 1,
  "8k–15k": 2,
  "15k–30k": 3,
  "30k+": 4,
  "30w+": 5,
};
function _rankIncome(str) {
  if (!str) return -1;
  for (const [k, v] of Object.entries(_incomeRank))
    if (str.includes(k)) return v;
  return -1;
}

const _eduKeys = [
  "小学",
  "初中",
  "高中",
  "大专",
  "本科",
  "硕士",
  "博士后",
  "博士",
];
function _rankEdu(str) {
  if (!str) return -1;
  if (str.includes("博士后")) return 6;
  for (let i = 0; i < _eduKeys.length; i++)
    if (str.includes(_eduKeys[i])) return i;
  return -1;
}

function getMbtiCompatibility(m1, m2) {
  if (!m1 || !m2 || m1.length !== 4 || m2.length !== 4) return 5;
  const a = m1.toUpperCase(),
    b = m2.toUpperCase();
  const goldenPairs = [
    ["INTJ", "ENFP"],
    ["INTP", "ENFJ"],
    ["ENTJ", "INFP"],
    ["ENTP", "INFJ"],
    ["ISTJ", "ESFP"],
    ["ISFJ", "ESTP"],
    ["ESTJ", "ISFP"],
    ["ESFJ", "ISTP"],
  ];
  const sorted = [a, b].sort().join("-");
  if (goldenPairs.some(([x, y]) => [x, y].sort().join("-") === sorted))
    return 10;
  if (a === b) return 7;
  let score = 5;
  if (a[1] === b[1]) score += 1; // Same N/S — shared worldview
  if (a[0] !== b[0]) score += 1; // Different E/I — complementary energy
  if (a[3] !== b[3]) score += 1; // Different J/P — complementary lifestyle
  if (a[2] === b[2]) score -= 1; // Same T/F — can create power struggle
  return Math.min(10, Math.max(1, score));
}

function _parseCm(str) {
  if (!str) return null;
  const m = str.match(/(\d+)/);
  return m ? parseInt(m[1]) : null;
}

function buildWarnings(me, target) {
  const warnings = [];
  const myDiet = _dietType(me.breed);
  const targetDiet = _dietType(target.breed);
  const targetName = _getSpecies(target.breed) || target.name;

  if (myDiet === "carnivore" && targetDiet === "herbivore") {
    warnings.push({
      level: "critical",
      lines: [
        "对方是草食动物 / Your match is a herbivore",
        "约会时请控制你的捕食本能 / Control your predatory instincts on dates",
        "将对方当零食是刑事犯罪 / Consuming your date is a criminal offense",
        "你确定你只是想谈恋爱？ / Are you sure you're here just for romance?",
      ],
    });
  } else if (myDiet === "herbivore" && targetDiet === "carnivore") {
    warnings.push({
      level: "critical",
      lines: [
        "对方是食肉动物 / Your match is a carnivore",
        "约会前请确认对方已经吃饱 / Make sure they've eaten before the date",
        "建议在人多的公共场所见面 / Meet somewhere crowded and public",
        "你可能会被当作约会套餐 / You may end up as the dinner, not the date",
      ],
    });
  } else if (myDiet === "omnivore" && targetDiet === "herbivore") {
    warnings.push({
      level: "warning",
      lines: [
        "你是杂食动物，对方是草食动物 / You're an omnivore; they're a herbivore",
        "请注意饮食习惯上的差异 / Mind the difference in dietary habits",
      ],
    });
  } else if (myDiet === "herbivore" && targetDiet === "omnivore") {
    warnings.push({
      level: "warning",
      lines: [
        "对方是杂食动物，请保持一定警惕 / Your match is an omnivore — stay alert",
      ],
    });
  }

  const myH = _parseCm(me.height);
  const tgH = _parseCm(target.height);
  if (myH && tgH) {
    const gap = Math.abs(myH - tgH);
    if (gap >= 80) {
      warnings.push({
        level: "critical",
        lines: [
          `体型差距高达 ${gap}cm / Body size gap: ${gap}cm`,
          myH < tgH
            ? "对方随时可以把你一口吞下 / They could swallow you whole"
            : "你随时可以把对方一口吞下 / You could swallow them whole",
        ],
      });
    } else if (gap >= 40) {
      warnings.push({
        level: "warning",
        lines: [
          `体型差距 ${gap}cm / Body size gap: ${gap}cm`,
          "存在明显的力量不对等 / Significant power imbalance",
        ],
      });
    }
  }

  const myInc = _rankIncome(me.income);
  const tgInc = _rankIncome(target.income);
  if (myInc >= 0 && tgInc >= 0) {
    const gap = tgInc - myInc;
    if (gap >= 3)
      warnings.push({
        level: "warning",
        lines: [
          "收入差距悬殊 / Significant income disparity",
          "癞蛤蟆想吃天鹅肉？ / Are you punching above your weight?",
        ],
      });
    else if (gap <= -3)
      warnings.push({
        level: "warning",
        lines: [
          "收入差距悬殊 / Significant income disparity",
          "对方可能只想找个免费餐厅 / They might just be looking for a free meal",
        ],
      });
  }

  const myEdu = _rankEdu(me.edu);
  const tgEdu = _rankEdu(target.edu);
  if (myEdu >= 0 && tgEdu >= 0 && Math.abs(tgEdu - myEdu) >= 3) {
    warnings.push({
      level: "warning",
      lines: [
        "学历差距较大 / Significant education gap",
        "你们可能没有共同话题 / You may have little in common to talk about",
      ],
    });
  }

  if (
    me.mbti &&
    target.mbti &&
    me.mbti.length === 4 &&
    target.mbti.length === 4
  ) {
    const compat = getMbtiCompatibility(me.mbti, target.mbti);
    if (compat <= 3) {
      warnings.push({
        level: "critical",
        lines: [
          `MBTI 兼容指数：${compat}/10 / MBTI compatibility: ${compat}/10`,
          `${escapeHtml(me.mbti)} × ${escapeHtml(target.mbti)} 大数据显示此组合配对成功率极低 / Big data says this pairing rarely works`,
          "你们大概率聊不到一起去 / You two will likely clash",
        ],
      });
    } else if (compat <= 5) {
      warnings.push({
        level: "warning",
        lines: [
          `MBTI 兼容指数：${compat}/10 / MBTI compatibility: ${compat}/10`,
          `根据大数据统计，${escapeHtml(me.mbti)} 和 ${escapeHtml(target.mbti)} 在相处中容易产生摩擦 / Statistically, ${escapeHtml(me.mbti)} and ${escapeHtml(target.mbti)} tend to clash`,
          "继续前请做好心理准备 / Proceed with caution",
        ],
      });
    }
  }

  return warnings;
}

function showLikeWarning(warnings) {
  const hasCritical = warnings.some((w) => w.level === "critical");
  document.getElementById("warning-icon").innerHTML = iconImg("warn_big", 6, "#ff0000");
  document.getElementById("warning-icon").className = hasCritical
    ? "warning-icon critical"
    : "warning-icon";
  document.getElementById("warning-messages-list").innerHTML = warnings
    .map(
      (w) => `
    <div class="warning-block ${w.level}">
      ${w.lines.map((l) => `<p class="warning-line">${l}</p>`).join("")}
    </div>
  `,
    )
    .join("");
  document.getElementById("warning-overlay").classList.remove("hidden");
  _tutHook("warn-open");
}

function proceedDespiteWarning() {
  document.getElementById("warning-overlay").classList.add("hidden");
  openLikeOpenerPopup();
}

function closeWarning() {
  document.getElementById("warning-overlay").classList.add("hidden");
  _tutHook("warn-close");
}

// send like to server
// ── Like opener popup ─────────────────────────────────────────
let _selectedOpener = null;
let _selectedOpenerType = null;
let _selectedOpenerText = null; // 发出去的是双语全文，收到的人按自己的语言看

const OPENER_FIXED = [
  // normal — no penalty
  { zh: "你多高呀", en: "How tall are you?", type: "normal" },
  { zh: "你是哪里人呀", en: "Where are you from?", type: "normal" },
  { zh: "在哪里工作呀", en: "Where do you work?", type: "normal" },
  { zh: "平时几点睡呀", en: "What time do you sleep?", type: "normal" },
  { zh: "平时喜欢宅在家吗", en: "Homebody or go-out type?", type: "normal" },
  { zh: "你平时去哪里溜达", en: "Where do you hang out?", type: "normal" },
  { zh: "你最近在忙什么", en: "What keeps you busy?", type: "normal" },
  // weird/anthro — penalty -5
  { zh: "你会咬人吗", en: "Do you bite?", type: "weird" },
  { zh: "你的尾巴多长", en: "How long is your tail?", type: "weird" },
  { zh: "你冬天会冬眠吗", en: "Do you hibernate?", type: "weird" },
  { zh: "你的毛是天然色吗", en: "Is your fur natural?", type: "weird" },
  { zh: "我梦见你了", en: "I dreamed of you", type: "weird" },
  { zh: "你身上香吗", en: "Do you smell nice?", type: "weird" },
  { zh: "你咬人疼吗", en: "Does your bite hurt?", type: "weird" },
  { zh: "你看起来很好抱", en: "You look so huggable", type: "weird" },
  { zh: "你是食草还是食肉的", en: "Herbivore or carnivore?", type: "weird" },
  { zh: "你有没有换过毛色", en: "Ever dyed your fur?", type: "weird" },
  { zh: "你毛多还是毛少", en: "Fluffy or sleek?", type: "weird" },
  { zh: "你的爪子锋利吗", en: "Are your claws sharp?", type: "weird" },
  { zh: "你平时用四肢走路吗", en: "Do you walk on all fours?", type: "weird" },
  // boring — penalty -3
  { zh: "你好呀", en: "Hello~", type: "boring" },
  { zh: "你好", en: "Hi", type: "boring" },
  { zh: "hihi", en: "hihi", type: "boring" },
  { zh: "哈喽", en: "Hallo", type: "boring" },
  { zh: "在吗", en: "You there?", type: "boring" },
  { zh: "嗨", en: "Hey", type: "boring" },
  // flagged — penalty -10
  { zh: "睡了吗", en: "You awake?", type: "flagged" },
  { zh: "你一个人住吗", en: "Do you live alone?", type: "flagged" },
  { zh: "发我你的照片", en: "Send me your photos", type: "flagged" },
  { zh: "好近呀", en: "You're so close by", type: "flagged" },
  { zh: "约吗", en: "Wanna hook up?", type: "flagged" },
];

// 按对方档案生成的开场白（双语）；拆不出英文的（比如自定义爱好）英文里就用原词
function _genProfileOpeners(p) {
  const out = [];
  const zhEn = (v) => {
    const [zh, en] = splitBi(v) || [v, v];
    return [zh.trim(), en.trim()];
  };
  if (p.hobby)
    p.hobby
      .split(" · ")
      .slice(0, 2)
      .forEach((h) => {
        const [zh, en] = zhEn(h);
        out.push({ zh: `我也喜欢${zh}！`, en: `I like ${en} too!` });
      });
  if (p.mbti) out.push({ zh: `${p.mbti} 的你好！`, en: `Hi there, ${p.mbti}!` });
  if (p.occupation) {
    const [zh, en] = zhEn(p.occupation);
    out.push({ zh: `做${zh}是什么感觉？`, en: `What's it like being a ${en}?` });
  }
  return out.slice(0, 3);
}

function openLikeOpenerPopup() {
  if (currentIndex >= profiles.length) return;
  const p = profiles[currentIndex];
  _selectedOpener = null;
  _selectedOpenerType = null;

  const profileOpeners = _genProfileOpeners(p);
  const allOpeners = [
    ...profileOpeners.map((o) => ({ ...o, type: "profile" })),
    ...OPENER_FIXED,
  ];

  const makeChipHtml = (list) =>
    list
      .map(({ zh, en, type }) => {
        const display = en ? `${zh} / ${en}` : zh;
        return `<span class="opener-chip opener-${type}" data-key="${escapeHtml(zh)}" data-type="${type}" data-display="${escapeHtml(display)}">${escapeHtml(display)}</span>`;
      })
      .join("");

  const beltOuter = document.getElementById("opener-belt-outer");
  beltOuter.innerHTML = "";

  for (let row = 0; row < 3; row++) {
    // shuffle a copy for each row so they look different
    const shuffled = [...allOpeners].sort(() => Math.random() - 0.5);
    const chips = makeChipHtml(shuffled);
    const belt = document.createElement("div");
    belt.className = `opener-belt opener-belt-r${row}`;
    belt.innerHTML = chips + chips;
    belt.onpointerdown = (e) => {
      const chip = e.target.closest(".opener-chip");
      if (!chip) return;
      e.preventDefault();
      selectOpener(chip.dataset.key, chip.dataset.type, chip.dataset.display);
    };
    beltOuter.appendChild(belt);
  }

  document.getElementById("opener-selected-text").textContent =
    "点击上方选择 Click to select";
  document.getElementById("like-opener-popup").classList.remove("hidden");
  _tutHook("opener-open");
}

function selectOpener(key, type, display) {
  document.querySelectorAll("#opener-belt .opener-chip").forEach((c) => {
    c.classList.toggle("selected", c.dataset.key === key);
  });
  _selectedOpener = key;
  _selectedOpenerType = type;
  _selectedOpenerText = display || key;
  document.getElementById("opener-selected-text").textContent = display || key;
}

function closeLikeOpenerPopup() {
  document.getElementById("like-opener-popup").classList.add("hidden");
  _selectedOpener = null;
  _selectedOpenerType = null;
  _tutHook("opener-close");
}

function submitLikeOpener() {
  if (!_selectedOpener || currentIndex >= profiles.length) return;
  const target = profiles[currentIndex];
  const text = _selectedOpenerText || _selectedOpener;
  const type = _selectedOpenerType;

  closeLikeOpenerPopup();

  // 教学里的示范档案：不存进发件箱（api 那边也不会真的发出去）
  if (currentUser && !_tutIsDemo(target)) {
    _cacheOutbox(currentUser.username, currentUser.name, target.username, target.name, text);
    api("/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: currentUser.username,
        fromName: currentUser.name,
        to: target.username,
        toName: target.name,
        content: text,
      }),
    });
  }

  doLike("开场白", text);

  const penalties = { boring: -3, weird: -5, flagged: -10 };
  const delta = penalties[type];
  if (delta) {
    _currentScore = Math.max(0, _currentScore + delta);
    const badge = document.getElementById("score-running-badge");
    if (badge) badge.textContent = `SCORE: ${_currentScore}`;
    setTimeout(() => showScoreDelta(delta), 400);
  }
}

function like() {
  if (currentIndex >= profiles.length) return;
  const target = profiles[currentIndex];
  const warnings = buildWarnings(currentUser, target);
  // 教学里每个人都要看到一次风险提示：和示范档案没冲突的话，补一条
  if (_tutIsDemo(target) && !warnings.length)
    warnings.push({
      level: "warning",
      lines: [
        "对方是夜行动物 / Your match is nocturnal",
        "你们的作息可能完全相反 / Your sleep schedules may never overlap",
      ],
    });
  if (warnings.length > 0) {
    showLikeWarning(warnings);
  } else {
    openLikeOpenerPopup();
  }
}

function doLike(label, reason) {
  if (currentIndex >= profiles.length) return;
  _consecutiveSkips = 0;
  const target = profiles[currentIndex];
  api("/like", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      likerUsername: currentUser.username,
      likerPetName: currentUser.name,
      likedUsername: target.username,
      label,
      reason,
    }),
  });
  currentIndex++;
  showProfile();
  _tutHook("liked");
}

// CheckNotifications (likes)
function checkNotifications() {
  if (!currentUser) return;

  api(`/notifications/${currentUser.username}`)
    .then((res) => res.json())
    .then((data) => {
      if (data.likesCount > 0) {
        _showLikeBanner(data.likesCount);
      }
    });
}

// 「我」/ 排行榜开着时，骚扰弹窗、提醒、喜欢横幅都先不出来；关掉后消息弹窗和横幅再补上
function _quietOverlayOpen() {
  return _tut.active || ["me-overlay", "rank-overlay"].some((id) => !document.getElementById(id)?.classList.contains("hidden"));
}
let _pendingLikeBanner = null;
// 打开「我」/ 排行榜时：正在显示的消息弹窗放回队列最前面，喜欢横幅先收起（它们层级比浮层高）
function _quietOverlayEnter() {
  if (popupShowing && currentPopupMsg) {
    popupQueue.unshift(currentPopupMsg);
    const popup = document.getElementById("msg-popup");
    popup.classList.add("hidden");
    popup.classList.remove("popup-slide-in");
    popupShowing = false;
    currentPopupMsg = null;
  }
  const banner = document.getElementById("like-banner");
  if (banner) {
    _pendingLikeBanner = parseInt(banner.querySelector("strong")?.textContent, 10) || 0;
    banner.remove();
  }
}
function _resumeAfterOverlay() {
  if (_quietOverlayOpen()) return;
  if (_pendingLikeBanner !== null) {
    const n = _pendingLikeBanner;
    _pendingLikeBanner = null;
    _showLikeBanner(n);
  }
  if (!popupShowing) showNextPopup();
}

function _showLikeBanner(count) {
  if (_quietOverlayOpen()) {
    _pendingLikeBanner = count;
    return;
  }
  // Remove any existing banner first
  document.getElementById("like-banner")?.remove();
  const banner = document.createElement("div");
  banner.id = "like-banner";
  // 数字加粗会把句子切成几段，自动拆分认不出来，所以中英文分开标好
  const n = Number(count) || 0;
  banner.innerHTML = `${iconImg("heart_sm", 2)} <span data-noi18n><span class="zh">有 <strong>${n}</strong> 只兽人喜欢你！</span><span class="bi-sep"> / </span><span class="en"><strong>${n}</strong> anthros liked you!</span></span><button onclick="document.getElementById('like-banner')?.remove()">✕</button>`;
  document.body.appendChild(banner);
}

// ── Message System ──────────────────────────────────────────

let msgPollingInterval = null;
let seenMessageIds = new Set(); // 已经弹过窗的消息 id

// ── Outbox cache (sessionStorage) — persists sent messages when server lacks /conversation ──
const _OUTBOX_KEY = "anthro_outbox_v1";
function _getOutbox() {
  try { return JSON.parse(sessionStorage.getItem(_OUTBOX_KEY) || "[]"); }
  catch { return []; }
}
function _cacheOutbox(from, fromName, to, toName, content) {
  const cache = _getOutbox();
  cache.push({ id: "local_" + Date.now() + "_" + (Math.random() * 1e6 | 0), from, fromName, to, toName, content, date: new Date().toISOString(), read: true });
  try { sessionStorage.setItem(_OUTBOX_KEY, JSON.stringify(cache)); } catch {}
}

function startMessagePolling() {
  if (!currentUser) return;
  api(`/messages/${currentUser.username}`)
    .then((res) => res.json())
    .then((msgs) => {
      // 登录时对已有未读消息弹窗提示
      msgs.filter((m) => !m.read).forEach((m) => showMessagePopup(m));
      // 全部加入 seen，防止轮询时重复弹
      msgs.forEach((m) => seenMessageIds.add(m.id));
      updateBadge(msgs);
    });

  if (msgPollingInterval) clearInterval(msgPollingInterval);
  msgPollingInterval = setInterval(fetchAndNotify, 15000);
}

function fetchAndNotify() {
  if (!currentUser) return;
  api(`/messages/${currentUser.username}`)
    .then((res) => res.json())
    .then((msgs) => {
      updateBadge(msgs);

      // 找出还没弹过窗的未读新消息
      const newMsgs = msgs.filter((m) => !m.read && !seenMessageIds.has(m.id));
      newMsgs.forEach((m) => {
        seenMessageIds.add(m.id);
        showMessagePopup(m);
      });
    });
}

function fetchUnreadCount() {
  if (!currentUser) return;
  api(`/messages/${currentUser.username}`)
    .then((res) => res.json())
    .then((msgs) => updateBadge(msgs));
}

function updateBadge(msgs) {
  const unread = msgs.filter((m) => !m.read).length;
  const badge = document.getElementById("msg-notif-count");
  if (!badge) return;
  if (unread > 0) {
    badge.textContent = unread;
    badge.classList.remove("hidden");
  } else {
    badge.textContent = "";
    badge.classList.add("hidden");
  }
}

// ── 弹窗逻辑 ────────────────────────────────────────────────

// 系统/假用户发的固定文案（双语）可以按语言拆开；真实用户自己打的字原样显示，不拆
let _cannedMsgs = null;
function _isCannedMsg(content) {
  if (!_cannedMsgs) {
    _cannedMsgs = new Set([
      ..._FAKE_MSG_POOL, ..._MIXED_BLOOD_MSG_POOL, ..._SINGLE_QUESTION_POOL,
      ...Object.values(_BREED_MSG_POOLS).flat(),
      ...[..._FAKE_ALERT_POOL, ..._MIXED_BLOOD_ALERT_POOL].map((a) => a.content),
      ...OPENER_FIXED.map((o) => (o.en ? `${o.zh} / ${o.en}` : o.zh)),
    ]);
  }
  return (
    _cannedMsgs.has(content) ||
    /^(我也喜欢.+！ \/ I like .+ too!|.+ 的你好！ \/ Hi there, .+!|做.+是什么感觉？ \/ What's it like being a .+\?)$/.test(content)
  );
}
const _noI18nAttr = (content) => (_isCannedMsg(content) ? "" : " data-noi18n");
// 时间格式跟着语言走
const _timeLocale = () => (currentLang === "en" ? "en-US" : "zh-CN");

let popupQueue = [];
let popupShowing = false;
let currentPopupMsg = null;

function showMessagePopup(msg) {
  popupQueue.push(msg);
  if (!popupShowing) showNextPopup();
}

function showNextPopup() {
  if (popupQueue.length === 0) {
    popupShowing = false;
    currentPopupMsg = null;
    return;
  }
  // 只在 swipe-page 激活、没开着教学 / 「我」/ 排行榜时才弹窗
  if (!document.getElementById("swipe-page")?.classList.contains("active") || _quietOverlayOpen()) {
    popupShowing = false;
    return;
  }
  popupShowing = true;
  const msg = popupQueue.shift();
  currentPopupMsg = msg;

  const box = document.querySelector(".msg-popup-box");
  if (box) box.classList.toggle("msg-alert", !!msg.alertStyle);

  const fromIcon = msg.alertStyle ? iconImg("warn", 3) : iconImg("envelope", 2);
  document.getElementById("msg-popup-from").innerHTML =
    msg.alertStyle
      ? `${fromIcon} ${escapeHtml(msg.fromName || msg.from)}`
      : `${fromIcon} 来自 From <span data-noi18n>${escapeHtml(msg.fromName || msg.from)}</span>`;
  const contentEl = document.getElementById("msg-popup-content");
  contentEl.toggleAttribute("data-noi18n", !msg.alertStyle && !_isCannedMsg(msg.content));
  contentEl.textContent = msg.content;

  const popup = document.getElementById("msg-popup");
  popup.classList.remove("hidden");
  popup.classList.add("popup-slide-in");

  // 3秒后自动关闭
  setTimeout(closeMessagePopup, 3000);
}

function handlePopupClick() {
  const msg = currentPopupMsg;
  closeMessagePopup();
  if (msg) {
    openMessages();
    openConvoView(msg.from, msg.fromName || msg.from);
  }
}

function closeMessagePopup() {
  const popup = document.getElementById("msg-popup");
  popup.classList.add("hidden");
  popup.classList.remove("popup-slide-in");
  // 如果队列里还有消息，500ms 后显示下一条
  setTimeout(showNextPopup, 500);
}

function openMessages() {
  if (!currentUser) return;
  stopSwipeInterrupts();
  // 每次打开都重置到收件箱视图
  document.getElementById("convo-view").classList.add("hidden");
  document.getElementById("messages-header").classList.remove("hidden");
  document.getElementById("messages-list").classList.remove("hidden");
  convoTarget = null;

  document.getElementById("messages-panel").classList.remove("hidden");
  loadMessages();
}

function closeMessages() {
  document.getElementById("messages-panel").classList.add("hidden");
  document.getElementById("convo-view").classList.add("hidden");
  document.getElementById("messages-list").classList.remove("hidden");
  convoTarget = null;
  if (document.getElementById("swipe-page")?.classList.contains("active"))
    startSwipeInterrupts();
  // 等标记已读完成后刷新角标（退出面板回到 swipe 页时角标正确）
  const p = pendingReadPromise || Promise.resolve();
  pendingReadPromise = null;
  p.then(() => fetchUnreadCount());
}

function loadMessages() {
  if (!currentUser) return;

  const list = document.getElementById("messages-list");
  const showEmpty = () => {
    list.innerHTML =
      '<p style="text-align:center; opacity:0.6;">暂无消息 / No messages yet</p>';
  };

  // 同时取收到的（用于角标）和所有收发（用于预览）
  // 若 /allMessages 不存在则降级到只用 /messages
  const receivedP = api(`/messages/${currentUser.username}`)
    .then((r) => r.json())
    .catch(() => []);
  const allP = api(`/allMessages/${currentUser.username}`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

  Promise.all([receivedP, allP]).then(([received, all]) => {
    updateBadge(received);

    // 若 /allMessages 不可用，降级只显示收到的消息，并合并 outbox 缓存
    const outbox = _getOutbox();
    const msgs = all !== null
      ? all
      : [...received, ...outbox].filter(
          (m, i, arr) =>
            arr.findIndex((x) => x.content === m.content && x.from === m.from && x.to === m.to) === i,
        );

    if (!msgs || msgs.length === 0) {
      showEmpty();
      return;
    }

    // 按"对方"分组，最新一条无论谁发都算
    const grouped = {};
    msgs.forEach((m) => {
      const otherUser = m.from === currentUser.username ? m.to : m.from;
      const otherName =
        m.from === currentUser.username
          ? m.toName || m.to
          : m.fromName || m.from;

      if (!grouped[otherUser]) {
        grouped[otherUser] = {
          username: otherUser,
          name: otherName,
          latest: m,
          unread: 0,
        };
      } else if (new Date(m.date) > new Date(grouped[otherUser].latest.date)) {
        grouped[otherUser].latest = m;
      }
    });

    // 未读数单独从 received 统计
    received.forEach((m) => {
      if (!m.read && grouped[m.from]) grouped[m.from].unread++;
    });

    const conversations = Object.values(grouped).sort(
      (a, b) => new Date(b.latest.date) - new Date(a.latest.date),
    );

    list.innerHTML = conversations
      .map((c) => {
        const time = new Date(c.latest.date).toLocaleString(_timeLocale(), {
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
        const nameSafe = escapeHtml(c.name);
        const userSafe = escapeHtml(c.username);
        const preview = escapeHtml(c.latest.content);
        // 未读：红点 + 红字（不显示数字）；已读：绿字
        return `
        <div class="msg-item ${c.unread > 0 ? "msg-unread" : "msg-read"}"
             data-user="${userSafe}" data-name="${nameSafe}"
             onclick="openConvoView(this.dataset.user, this.dataset.name)">
          <div class="msg-from" data-noi18n>${nameSafe}</div>
          <div class="msg-content"${_noI18nAttr(c.latest.content)}>${preview}</div>
          <div class="msg-time">${time}</div>
        </div>`;
      })
      .join("");
  });
}

// ── Conversation thread view ─────────────────────────────────

let convoTarget = null;
let pendingReadPromise = null; // 追踪标记已读的 PUT 请求

function openConvoView(username, name) {
  convoTarget = { username, name };
  document.getElementById("convo-with-name").textContent = name;
  document.getElementById("messages-header").classList.add("hidden");
  document.getElementById("messages-list").classList.add("hidden");
  document.getElementById("convo-view").classList.remove("hidden");
  loadConvo();
  setConvoBg(username);
}

function setConvoBg(_username) {
  const bubbles = document.getElementById("convo-bubbles");
  bubbles.style.backgroundImage = "";
  bubbles.style.backgroundSize = "";
  bubbles.style.backgroundPosition = "";
  bubbles.style.backgroundRepeat = "";
}

function closeConvoView() {
  document.getElementById("convo-view").classList.add("hidden");
  document.getElementById("messages-header").classList.remove("hidden");
  document.getElementById("messages-list").classList.remove("hidden");
  convoTarget = null;

  // 等 PUT 请求全部完成后再刷新收件箱和角标
  const p = pendingReadPromise || Promise.resolve();
  pendingReadPromise = null;
  p.then(() => loadMessages());
}

function _renderConvoBubbles(msgs) {
  const bubbles = document.getElementById("convo-bubbles");
  const other = convoTarget.username;

  const unread = msgs.filter((m) => m.to === currentUser.username && !m.read);
  pendingReadPromise = Promise.all(
    unread.map((m) => api(`/messages/${m.id}/read`, { method: "PUT" })),
  );

  if (msgs.length === 0) {
    bubbles.innerHTML = '<p class="convo-empty">暂无消息 / No messages yet</p>';
    return;
  }

  bubbles.innerHTML = msgs
    .map((m) => {
      const isMine = m.from === currentUser.username;
      const time = new Date(m.date).toLocaleString(_timeLocale(), {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      return `
        <div class="bubble-row ${isMine ? "bubble-mine" : "bubble-theirs"}">
          <div class="bubble">
            <div class="bubble-text"${_noI18nAttr(m.content)}>${escapeHtml(m.content)}</div>
            <div class="bubble-time">${time}</div>
          </div>
        </div>`;
    })
    .join("");

  bubbles.scrollTop = bubbles.scrollHeight;
  fetchUnreadCount();
}

function _mergeWithOutbox(serverMsgs, other) {
  const outbox = _getOutbox().filter(
    (m) => m.from === currentUser.username && m.to === other,
  );
  // 去重：outbox 里已被服务端确认的消息（内容+to相同且时间接近）跳过
  const serverContents = new Set(serverMsgs.map((m) => m.content + "|" + m.from));
  const newLocal = outbox.filter((m) => !serverContents.has(m.content + "|" + m.from));
  return [...serverMsgs, ...newLocal].sort((a, b) => new Date(a.date) - new Date(b.date));
}

function loadConvo() {
  if (!currentUser || !convoTarget) return;
  const u1 = encodeURIComponent(currentUser.username);
  const u2 = encodeURIComponent(convoTarget.username);
  const other = convoTarget.username;

  // 级别1: /conversation
  api(`/conversation/${u1}/${u2}`)
    .then((res) => (res.ok ? res.json() : null))
    .then((msgs) => {
      if (msgs !== null) {
        _renderConvoBubbles(_mergeWithOutbox(msgs, other));
        return;
      }
      // 级别2: /allMessages 过滤
      return api(`/allMessages/${encodeURIComponent(currentUser.username)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((all) => {
          if (all !== null) {
            const filtered = all.filter(
              (m) =>
                (m.from === currentUser.username && m.to === other) ||
                (m.from === other && m.to === currentUser.username),
            ).sort((a, b) => new Date(a.date) - new Date(b.date));
            _renderConvoBubbles(_mergeWithOutbox(filtered, other));
            return;
          }
          // 级别3: /messages (只收件) + outbox 缓存
          return api(`/messages/${encodeURIComponent(currentUser.username)}`)
            .then((r) => (r.ok ? r.json() : []))
            .then((received) => {
              const fromOther = received.filter((m) => m.from === other);
              _renderConvoBubbles(_mergeWithOutbox(fromOther, other));
            });
        });
    })
    .catch(() => {
      _renderConvoBubbles(_mergeWithOutbox([], other));
    });
}

function sendConvoMessage() {
  if (!convoTarget || !currentUser) return;
  const input = document.getElementById("convo-input");
  const content = input.value.trim();
  if (!content) return;

  // 立即追加气泡，不等服务器
  input.value = "";
  appendBubble(content, true);
  _cacheOutbox(currentUser.username, currentUser.name, convoTarget.username, convoTarget.name, content);

  api("/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      from: currentUser.username,
      fromName: currentUser.name,
      to: convoTarget.username,
      toName: convoTarget.name,
      content,
    }),
  });
}

function appendBubble(content, isMine) {
  const bubbles = document.getElementById("convo-bubbles");

  // 清除「暂无消息」占位
  const empty = bubbles.querySelector(".convo-empty");
  if (empty) empty.remove();

  const now = new Date().toLocaleString(_timeLocale(), {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const row = document.createElement("div");
  row.className = `bubble-row ${isMine ? "bubble-mine" : "bubble-theirs"}`;
  row.innerHTML = `
    <div class="bubble">
      <div class="bubble-text"${_noI18nAttr(content)}>${escapeHtml(content)}</div>
      <div class="bubble-time">${now}</div>
    </div>`;
  bubbles.appendChild(row);
  bubbles.scrollTop = bubbles.scrollHeight;
}

// ── Swipe interrupt popups ──────────────────────────────────

let _interruptTimer = null;
let _consecutiveSkips = 0;
let _profileShownAt = 0;
let _currentSwipeProfileName = "";
let _currentSwipeProfile = null;

function _randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function _pickInterruptName() {
  const names = profiles.map((p) => p.name || p.username).filter(Boolean);
  if (names.length === 0) return L("某兽人", "Someone");
  return names[_randInt(0, names.length - 1)];
}

function showSwipeInterrupt() {
  if (_quietOverlayOpen()) return;
  const elapsed = _profileShownAt
    ? Math.floor((Date.now() - _profileShownAt) / 1000)
    : 0;

  // Real messages — only added when the data is meaningful
  // 每条返回 [中文, English]；随机数、名字只取一次，中英文两半才对得上
  const real = [];
  const cur = _currentSwipeProfileName;
  if (_consecutiveSkips >= 2) {
    real.push(() => [`你已连续跳过 ${_consecutiveSkips} 个档案了`, `You've skipped ${_consecutiveSkips} profiles in a row`]);
  }
  if (elapsed >= 15 && cur) {
    real.push(() => [`你已经看「${cur}」的档案 ${elapsed} 秒了，还不行动吗？`, `You've been on "${cur}" for ${elapsed}s, still not moving?`]);
  }
  if (elapsed >= 30 && cur) {
    real.push(() => [`你在「${cur}」的档案上停了这么久…`, `You've lingered on "${cur}" for so long…`]);
  }

  // Fake messages — always available
  const fake = [
    (n = _pickInterruptName(), k = _randInt(2, 18)) => [`「${n}」查看了你的档案 ${k} 次`, `"${n}" viewed your profile ${k} times`],
    (k = _randInt(2, 7)) => [`最近 ${k} 只兽人拒绝了你`, `${k} fursonas rejected you recently`],
    (n = _pickInterruptName()) => [`「${n}」刚刚跳过了你`, `"${n}" just skipped you`],
    (n = _pickInterruptName(), k = _randInt(1, 8)) => [`「${n}」${k} 分钟前看过你`, `"${n}" viewed you ${k} min ago`],
    (k = _randInt(1, 5)) => [`有 ${k} 只兽人在等你回复`, `${k} fursonas are waiting for your reply`],
    (n = _pickInterruptName()) => [`「${n}」正在查看你的档案`, `"${n}" is viewing your profile`],
    (n = _pickInterruptName(), k = _randInt(2, 9)) => [`你和「${n}」已错过 ${k} 次`, `You and "${n}" have missed each other ${k} times`],
    (n = _pickInterruptName()) => [`「${n}」对你感到好奇`, `"${n}" is curious about you`],
    () => ["系统提示：你的魅力值正在下降", "System: your charm rating is dropping"],
    (k = _randInt(3, 20)) => [`${k} 只兽人今天跳过了你`, `${k} fursonas skipped you today`],
  ];

  const pool = [...real, ...fake];
  const [zh, en] = pool[_randInt(0, pool.length - 1)]();

  const el = document.createElement("div");
  el.className = "swipe-interrupt";
  el.style.top = _randInt(8, 65) + "vh";
  el.style.left = _randInt(4, 52) + "vw";
  el.innerHTML = `${biHtml(zh, en)}<button class="interrupt-close" onclick="this.parentElement.remove()">✕</button>`;
  document.body.appendChild(el);
}

function startSwipeInterrupts() {
  stopSwipeInterrupts();
  function schedule() {
    _interruptTimer = setTimeout(
      () => {
        if (
          document.getElementById("swipe-page")?.classList.contains("active")
        ) {
          showSwipeInterrupt();
          schedule();
        }
      },
      _randInt(5000, 14000),
    );
  }
  schedule();
}

// 只暂停计时器，不删除已经弹出来的弹窗（打开我的档案/消息时它们保留）
function stopSwipeInterrupts() {
  if (_interruptTimer) {
    clearTimeout(_interruptTimer);
    _interruptTimer = null;
  }
  stopGenderedNotifications();
}

// ── Gendered auto-notifications ───────────────────────────────

const _FAKE_MALE_NAMES = [
  "虎哥Brian",
  "狼先生Ace",
  "兔子Kevin",
  "熊大壮",
  "狐狸Ethan",
  "豹子君",
  "棕熊Oliver",
  "黑豹Ray",
  "雪豹Leo",
  "柴犬Hiro",
  "鬣狗Max",
  "鳄鱼Drake",
  "猪猪Derek",
  "犀牛Leon",
  "河马Hugo",
  "花豹Kai",
  "白狼Soren",
  "赤狐Finn",
  "大象Jules",
  "浣熊Remy",
  "狼獾Grit",
  "土狼Cye",
  "草原犬Rex",
  "鹰族Talon",
  "水豚Marco",
];

const _FAKE_FEMALE_NAMES = [
  "兔子Mia",
  "猫咪Yuki",
  "狐狸Elena",
  "豹女Sara",
  "鹿女Fawn",
  "熊猫Lin",
  "雪貂Nova",
  "虎妹Zara",
  "狼女Ash",
  "龙女Lune",
  "水獭Pip",
  "猞猁Ivy",
  "刺猬Rosa",
  "貂女Sable",
  "羊驼Mochi",
  "企鹅Noel",
  "仓鼠Coco",
  "松鼠Hazel",
  "蛇女Naga",
  "鸟女Peri",
  "麋鹿Willow",
  "白虎Frost",
  "蓝鸟Skye",
  "雪兔Luna",
  "豺女Vex",
];

const _FAKE_MSG_POOL = [
  "你好，看到你的档案感觉很有缘 / Hi, I saw your profile and felt like it was fate",
  "嗨！我们好像很配哎，要聊聊吗？ / Hey! We seem like a great match, wanna chat?",
  "你的兽设好可爱！我是来自上海的虎族 / Your fursona is so cute! I'm a tiger from Shanghai",
  "我觉得你就是我在找的那个人 / I think you're the one I've been looking for",
  "你的兽人画像是自己画的吗？好厉害！ / Did you draw your anthro portrait yourself? So talented!",
  "嗨，我喜欢你的爱好，我们有很多共同点 / Hi, I love your hobbies, we have so much in common",
  "你好漂亮，敢问芳名吗？ / You're gorgeous, may I ask your name?",
  "我摇了个超级好的地产，想请你来参观 / I rolled an amazing property, I'd love to show you around",
  "你的MBTI是我最喜欢的类型！！ / Your MBTI is my favorite type!!",
  "嗨，你是我今天看到最好看的档案 ✨ / Hey, you're the best-looking profile I've seen today ✨",
  "我在附近，要不要出来喝杯咖啡 ☕ / I'm nearby, want to grab a coffee? ☕",
  "你好，冒昧打扰，我觉得你很特别 / Hi, sorry to bother you, but I think you're really special",
  "你有在玩游戏吗？可以一起吗？ / Do you play games? Can we play together?",
  "哇你真的很符合我的理想型…… / Wow, you really match my ideal type...",
  "第一次用这个软件，看到你就想打招呼 / First time using this app, saw you and had to say hi",
  "我家有个很大的院子，你会喜欢的 / My place has a huge yard, you'd love it",
  "你平时喜欢去哪里玩？ / Where do you usually like to go for fun?",
  "我的耳朵比你大，但我听你说话最认真 / My ears are bigger than yours, but I listen to you most carefully",
  "看到你第一眼就觉得命中注定了 / The moment I saw you I knew it was destiny",
  "我可以请你吃顿饭吗？我很会做菜的 / Can I treat you to dinner? I'm a really good cook",
  "你的档案分数好高，你一定是个很好的伴侣 / Your profile score is so high, you must be a great partner",
  "我刷了好几遍才鼓起勇气来打招呼 / I scrolled past you several times before I worked up the courage to say hi",
  "你好，我也是喜欢夜晚活动的…… / Hi, I'm a night owl too...",
  "我们住得很近！要不要见个面？ / We live really close! Wanna meet up?",
  "你的耳朵好好看，是真的还是造型？ / Your ears are so pretty, are they real or styled?",
  "看到你滑过去了，赶紧搜到你打招呼 / Saw you slip past, so I searched you up to say hi",
  "我平时很内向，但你的档案让我忍不住 / I'm usually really shy, but your profile made me do it",
  "你有在养其他宠物吗，还是你自己就是宠物型的 / Do you keep other pets, or are you the pet type yourself?",
  "嗨，你好，我是附近的狼，请多关照 / Hey hi, I'm the wolf from around here, nice to meet you",
  "你的档案是我今天点开的第一个，缘分啊 / Yours is the first profile I opened today, must be fate",
];

const _FAKE_ALERT_POOL = [
  {
    from: "系统通知 / System Notice",
    content: "⚠️ 警告：你已超过3天没有更新档案，魅力值持续下降 / ⚠️ Warning: you haven't updated your profile in 3 days, your charm keeps dropping",
  },
  { from: "系统通知 / System Notice", content: "⚠️ 你的配对成功率低于行业平均水平12% / ⚠️ Your match rate is 12% below the industry average" },
  {
    from: "系统通知 / System Notice",
    content: "👀 本周已有47只兽人查看了你的档案，但无人主动打招呼 / 👀 47 anthros viewed your profile this week, but no one said hi",
  },
  { from: "系统通知 / System Notice", content: "⚠️ 检测到你有3条消息超过24小时未回复 / ⚠️ You have 3 messages unanswered for over 24 hours" },
  { from: "系统通知 / System Notice", content: "💔 有人刚刚把你从收藏列表中移除了 / 💔 Someone just removed you from their favorites" },
  { from: "系统通知 / System Notice", content: "⚠️ 你的账号活跃度即将降为低级，将减少曝光 / ⚠️ Your account activity is about to drop to Low, reducing your exposure" },
  { from: "系统通知 / System Notice", content: "❌ 本周你被跳过的次数较上周上升了34% / ❌ Times you got skipped this week are up 34% from last week" },
  {
    from: "系统通知 / System Notice",
    content: "⚠️ 有人查看了你的档案3次但没有打招呼，可能在犹豫 / ⚠️ Someone viewed your profile 3 times without saying hi, they may be hesitating",
  },
  { from: "系统通知 / System Notice", content: "💬 你有2条未回复消息，对方可能已经等不及了 / 💬 You have 2 unanswered messages, they may be running out of patience" },
  { from: "系统通知 / System Notice", content: "⚠️ 系统检测：你的照片吸引力评分低于平均值 / ⚠️ System check: your photo attractiveness score is below average" },
];

const _MIXED_BLOOD_MSG_POOL = [
  "等一下，你是混血的？哪两个种族的混血啊 / Wait, you're mixed? Mixed with what two species?",
  "混血档案……说实话我一般不太考虑的，不好意思 / Mixed profiles... honestly I don't usually consider them, sorry",
  "我家里人接受不了混血的，这个我没办法 / My family can't accept mixed heritage, nothing I can do",
  "你是哪两个种族的混血？一般来说这个很重要 / Which two species are you mixed with? That usually matters a lot",
  "混血的话感觉基因比较复杂，你身体一般健康吗 / Mixed genes seem kind of complicated, are you generally healthy?",
  "我之前交往过混血的，结果很不好，不太想再试了 / I dated someone mixed before and it went badly, I'd rather not try again",
  "混血感觉挺特别的，但我家里比较传统 / Mixed heritage seems pretty unique, but my family is traditional",
  "你的档案分数这么低，是因为混血那条吗 / Is your score this low because of the mixed-heritage thing?",
  "混血的外貌有时候挺奇特的……你真人看起来怎么样 / Mixed looks can be kind of unusual... what do you look like in person?",
  "老实说我不太了解混血，你们有什么特别之处吗 / Honestly I don't know much about mixed heritage, is there anything special about you?",
];

const _MIXED_BLOOD_ALERT_POOL = [
  { from: "系统通知 / System Notice", content: "⚠️ 系统检测：混血档案配对成功率比纯种低67% / ⚠️ System check: mixed profiles match 67% less often than purebreds" },
  { from: "系统通知 / System Notice", content: "❌ 你的档案因混血标注被12名用户主动屏蔽 / ❌ 12 users blocked your profile because of the mixed-heritage tag" },
  {
    from: "系统通知 / System Notice",
    content: "⚠️ 大数据提示：混血档案在本地区配对指数处于最低段位 / ⚠️ Big data alert: mixed profiles rank lowest in local match index",
  },
  {
    from: "系统通知 / System Notice",
    content: "💔 系统检测：3名用户看到你的混血背景后取消了配对 / 💔 System check: 3 users unmatched after seeing your mixed background",
  },
  {
    from: "系统通知 / System Notice",
    content: "⚠️ 混血用户的曝光度已被系统调降，请升级会员以恢复可见度 / ⚠️ Mixed users' visibility has been lowered, upgrade to Premium to restore it",
  },
  {
    from: "系统通知 / System Notice",
    content: "⚠️ 平台提示：你的混血背景在本周筛选中被过滤了 8 次 / ⚠️ Platform notice: your mixed background got filtered out 8 times this week",
  },
];

// ── Breed-specific message pools (real species only) ──────────
// Keys checked in insertion order — more specific before broader
// e.g. 大熊猫→小熊猫→熊猫→熊, 猎豹→豹, 鹿→马

const _BREED_MSG_POOLS = {
  // ── Specific keys first to win substring matching ──
  大熊猫: [
    "大熊猫！太珍稀了，感觉很幸运能看到你的档案 / A giant panda! So rare, I feel lucky to see your profile",
    "你真的很喜欢吃竹子吗，还是这是刻板印象 / Do you really love bamboo, or is that a stereotype?",
    "你的眼圈是天生的吗，好特别好好看 / Are your eye patches natural? So unique and pretty",
    "大熊猫感觉特别受欢迎，你一定收到很多消息吧 / Pandas seem so popular, you must get tons of messages",
    "你平时喜欢赖在地上打滚吗 / Do you like rolling around on the floor?",
    "大熊猫好稀少啊，遇到你感觉很幸运 / Giant pandas are so rare, I feel lucky to meet you",
    "你喜欢爬树吗，大熊猫好像还挺会爬的 / Do you like climbing trees? Pandas seem pretty good at it",
  ],
  小熊猫: [
    "小熊猫！颜色这么好看，感觉像秋天的颜色 / A red panda! Your colors are gorgeous, like autumn",
    "你的尾巴有条纹吗，好想看看 / Is your tail striped? I'd love to see it",
    "小熊猫感觉特别灵巧，平时喜欢爬高处吗 / Red pandas seem so nimble, do you like climbing high places?",
    "你喜欢吃什么，小熊猫应该很挑食吧 / What do you like to eat? Red pandas must be picky eaters",
    "看到你的档案感觉很温暖，不知道为什么 / Your profile feels so warm, I don't know why",
    "小熊猫的脸好圆，你真人一定也这样 / Red pandas have such round faces, you must too in person",
  ],
  猎豹: [
    "猎豹！速度最快的陆地种族，你跑起来一定很帅 / A cheetah! The fastest land species, you must look amazing running",
    "你真的能跑那么快吗，想亲眼见一次 / Can you really run that fast? I want to see it myself",
    "猎豹的花纹每只都不一样的吗 / Is every cheetah's pattern different?",
    "你平时体力消耗很大吧，休息的时候喜欢做什么 / You must burn a lot of energy, what do you like to do when you rest?",
    "猎豹感觉很专注，做一件事就全力以赴对吗 / Cheetahs seem so focused, all in on one thing at a time, right?",
    "你在感情里也是这么迅速果断吗 / Are you this quick and decisive in relationships too?",
  ],
  雪豹: [
    "雪豹！感觉最神秘的猫科种族，很难得见到 / A snow leopard! The most mysterious feline, so rare to see",
    "你适应寒冷的气候吗，城市里会不会不习惯 / Are you used to the cold? Is the city hard to get used to?",
    "雪豹的花纹很特别，是那种模糊的斑点吗 / Snow leopard patterns are so unique, are they those blurry spots?",
    "你的尾巴特别长对吗，冷的时候会用来取暖吗 / Your tail is extra long, right? Do you use it to keep warm?",
    "我觉得雪豹特别有一种孤傲的美，很吸引我 / Snow leopards have this proud, lonely beauty that really draws me in",
    "你喜欢高处还是低处，雪豹感觉天生就爱山顶 / Do you prefer high places or low? Snow leopards seem born for mountaintops",
  ],
  黑豹: [
    "黑豹！全身黑色的猫科，气场太强了 / A black panther! All-black feline, what an aura",
    "你在暗处真的几乎隐形吗 / Are you really almost invisible in the dark?",
    "黑豹的眼睛在黑暗里发光吗，好神秘 / Do a black panther's eyes glow in the dark? So mysterious",
    "你平时是很安静的那种吗，感觉黑豹很沉稳 / Are you the quiet type? Black panthers seem so composed",
    "见到你档案第一眼就被吸引了，黑豹太好看了 / Your profile caught my eye instantly, black panthers are gorgeous",
    "你性格是内敛型还是强势型的 / Are you more reserved or more dominant?",
  ],
  美洲豹: [
    "美洲豹！感觉很有力量感的种族 / A jaguar! Such a powerful species",
    "你的花纹是玫瑰形的斑点吗，好特别 / Are your spots those rosette shapes? So unique",
    "美洲豹会游泳对吗，你喜欢水吗 / Jaguars can swim, right? Do you like water?",
    "你力气很大吧，保护起自己在乎的人一定很有力 / You must be really strong, I bet you're great at protecting the ones you care about",
    "美洲豹感觉特别沉稳，不轻易动怒对吗 / Jaguars seem so steady, not easily angered, right?",
    "你在感情里是主动还是被动的那一方 / In relationships, are you the one who makes the first move?",
  ],
  猫头鹰: [
    "猫头鹰！夜视能力是最好的之一，好厉害 / An owl! One of the best night visions out there, amazing",
    "你的头真的可以转将近270度吗，想亲眼见见 / Can your head really turn almost 270 degrees? I want to see it",
    "猫头鹰白天睡觉，那你晚上是不是特别活跃 / Owls sleep in the day, so are you extra active at night?",
    "你的羽毛飞起来很安静对吗，完全听不到声音 / Your feathers are totally silent in flight, right?",
    "猫头鹰感觉特别智慧，跟你聊天感觉会学到很多 / Owls seem so wise, I bet I'd learn a lot talking to you",
    "你会发出什么声音，是那种低沉的叫声吗 / What sounds do you make? That deep hooting kind?",
  ],
  猫鼬: [
    "猫鼬！感觉特别机警的种族，什么都逃不过你们 / A meerkat! Such an alert species, nothing gets past you",
    "猫鼬能免疫蛇毒吗，这个真的很厉害 / Are meerkats really immune to snake venom? That's incredible",
    "你平时是群居的吗，猫鼬感觉很有团队意识 / Do you live in a group? Meerkats seem like real team players",
    "你站起来两足直立的时候一定很可爱 / You must look so cute standing up on two legs",
    "猫鼬感觉特别机灵，你聊天反应也这么快吗 / Meerkats seem so clever, are you this quick when chatting too?",
  ],
  麝香猫: [
    "麝香猫！感觉很特别的小型肉食动物 / A civet! Such a unique little carnivore",
    "你是夜行性的吗，白天一般在做什么 / Are you nocturnal? What do you usually do during the day?",
    "麝香猫感觉很有个性，不太好驯服那种 / Civets seem so independent, the hard-to-tame type",
    "你的嗅觉很灵敏吗，麝香猫感觉气息很独特 / Is your sense of smell really sharp? Civets have such a distinct scent",
    "遇到麝香猫很少见，今天鼓起勇气打招呼 / Civets are so rare to meet, I worked up the courage to say hi today",
  ],
  龙猫: [
    "龙猫！南美洲的小可爱，你的毛一定超软 / A chinchilla! South America's little cutie, your fur must be so soft",
    "你的耳朵是圆圆大大的吗，好可爱 / Are your ears big and round? So cute",
    "龙猫的毛密度特别高对吗，摸起来是什么感觉 / Chinchilla fur is super dense, right? What does it feel like?",
    "你喜欢洗沙浴吗，龙猫都这样吧 / Do you like dust baths? All chinchillas do, right?",
    "你平时爱跳跃吗，龙猫弹跳力好像很强 / Do you like jumping around? Chinchillas seem super bouncy",
    "你本人和名字一样可爱吗，想认识你 / Are you as cute as your name? I'd love to get to know you",
  ],
  狐猫: [
    "狐猫！感觉很奇特的种族，名字很有趣 / A fossa! Such an unusual species, fun name too",
    "你是晨昏活动型的吗，两头活跃 / Are you crepuscular? Active at dawn and dusk?",
    "感觉狐猫不太常见，很高兴能认识你 / Fossas seem pretty rare, really happy to meet you",
  ],
  狐猴: [
    "狐猴！感觉很特别的灵长类，眼睛一定很大 / A lemur! Such a special primate, your eyes must be huge",
    "你的尾巴有条纹吗，感觉很好看 / Is your tail striped? It must look great",
    "狐猴感觉特别灵活，爬树很厉害吧 / Lemurs seem so agile, you must be great at climbing",
    "你喜欢晒太阳吗，听说狐猴很爱这个 / Do you like sunbathing? I heard lemurs love it",
    "狐猴的眼睛在黑暗里会发光吗 / Do lemur eyes glow in the dark?",
    "你平时是群居的吗，狐猴感觉很爱热闹 / Do you live in a group? Lemurs seem to love company",
  ],
  耳廓狐: [
    "耳廓狐！耳朵好大好好看，比脑袋还大吗 / A fennec fox! Your ears are so big, bigger than your head?",
    "你的耳朵是用来散热的吗，好聪明的设计 / Are your ears for cooling off? What a clever design",
    "耳廓狐感觉特别可爱，你平时爱撒娇吗 / Fennecs are so adorable, are you clingy and sweet?",
    "你是沙漠适应型的，城市里会不会太潮湿 / You're built for the desert, is the city too humid for you?",
    "看到你的档案第一反应就是耳朵，太特别了 / The first thing I noticed on your profile was the ears, so unique",
    "你体型很小吗，感觉耳廓狐都小小的 / Are you small? Fennec foxes all seem so tiny",
  ],
  郊狼: [
    "郊狼！感觉特别有适应力的种族 / A coyote! Such an adaptable species",
    "你真的什么都能吃吗，郊狼的适应性很强对吗 / Can you really eat anything? Coyotes are super adaptable, right?",
    "你叫声是那种很特别的嚎叫吗，好想听一次 / Is your call that special howl? I'd love to hear it once",
    "郊狼感觉特别聪明，很难被骗对吗 / Coyotes seem so smart, hard to fool, right?",
    "你平时是独行还是群居，郊狼感觉两种都行 / Are you a loner or a pack animal? Coyotes seem fine either way",
    "我觉得郊狼特别有生命力，很吸引我 / Coyotes have such a strong life force, it really draws me in",
  ],
  马鹿: [
    "马鹿！感觉很有气势的鹿族，你的角一定很壮观 / A red deer! Such a majestic deer, your antlers must be impressive",
    "你的角每年都会换吗，换的时候是什么感觉 / Do your antlers grow back every year? What does that feel like?",
    "马鹿体型很大对吗，你身高多少 / Red deer are big, right? How tall are you?",
    "你奔跑起来一定很雄壮，想看看 / You must look so powerful running, I'd love to see",
    "马鹿感觉很有领地意识，你也是吗 / Red deer seem so territorial, are you too?",
    "你平时是群居的还是独行的 / Do you live in a herd or on your own?",
  ],
  长颈鹿: [
    "长颈鹿！感觉视野最好的种族，能看很远 / A giraffe! The species with the best view, you can see so far",
    "你的身高很高吗，长颈鹿都这么高挑吗 / Are you really tall? Are all giraffes this tall and slender?",
    "你喝水的时候腿要叉开吗，好有趣 / Do you have to spread your legs to drink water? So funny",
    "长颈鹿的舌头是紫色的对吗，为什么 / Giraffe tongues are purple, right? Why is that?",
    "你的斑纹图案是独特的吗，每只都不同 / Is your pattern unique? Every giraffe's is different",
    "遇到长颈鹿感觉很特别，今天打招呼了 / Meeting a giraffe feels so special, so I said hi today",
  ],
  仓鼠: [
    "仓鼠！超可爱，脸颊是鼓鼓的那种吗 / A hamster! So cute, do you have those puffy cheeks?",
    "你会把食物藏在颊囊里吗，好神奇 / Do you stash food in your cheek pouches? Amazing",
    "仓鼠喜欢跑轮吗，晚上会不停跑吗 / Do hamsters like running wheels? Do you run all night?",
    "你平时睡很久吗，仓鼠冬天会冬眠吗 / Do you sleep a lot? Do hamsters hibernate in winter?",
    "仓鼠体型小小的，感觉特别可爱 / Hamsters are so tiny, you must be adorable",
    "你喜欢被抱吗，还是比较独立 / Do you like being held, or are you more independent?",
  ],
  花栗鼠: [
    "花栗鼠！背上有条纹，超可爱 / A chipmunk! Stripes down your back, so cute",
    "你的颊囊能装很多东西吗，感觉很厉害 / Can your cheek pouches hold a lot? That's impressive",
    "花栗鼠感觉特别活泼，你平时闲不住吗 / Chipmunks seem so lively, can you never sit still?",
    "你喜欢藏食物吗，冬天会提前储存吗 / Do you like hiding food? Do you stock up before winter?",
    "感觉花栗鼠很讨人喜欢，你一定很受欢迎 / Chipmunks are so likable, you must be really popular",
  ],
  鼯鼠: [
    "鼯鼠！会滑翔的松鼠，好厉害 / A flying squirrel! A squirrel that glides, amazing",
    "你展开翼膜滑翔的样子一定很帅，想看看 / You must look so cool gliding with your membranes spread, I want to see",
    "你能滑翔多远，有没有什么记录 / How far can you glide? Do you have a record?",
    "鼯鼠是夜行性的吗，夜晚出来活动 / Are flying squirrels nocturnal? Out and about at night?",
    "感觉鼯鼠特别特别，不常见到，很高兴认识你 / Flying squirrels are so special and rare, really happy to meet you",
  ],
  松鼠: [
    "松鼠！感觉特别活泼好动的种族 / A squirrel! Such a lively, energetic species",
    "你真的会把食物埋起来然后找不到吗 / Do you really bury food and then forget where?",
    "松鼠的尾巴是大大蓬蓬的吗，好想看 / Is a squirrel's tail big and fluffy? I want to see",
    "你爬树很厉害吧，高处对你来说没什么难度 / You must be a great climber, heights are nothing for you",
    "松鼠感觉精力很旺盛，你也是这样吗 / Squirrels seem so full of energy, are you like that too?",
    "你喜欢吃坚果吗，这个应该不是刻板印象 / Do you like nuts? That's probably not a stereotype",
  ],
  袋鼠: [
    "袋鼠！感觉特别有力量的种族，腿很有劲 / A kangaroo! Such a powerful species, strong legs",
    "你的跳跃距离很远吧，能跳多远 / You must jump really far, how far can you go?",
    "袋鼠的尾巴很粗对吗，用来保持平衡 / Kangaroo tails are thick, right? For balance?",
    "袋鼠族拳击真的很厉害对吗，你平时温和吗 / Kangaroos are amazing boxers, right? Are you gentle normally?",
    "你有育儿袋吗，感觉很特别 / Do you have a pouch? That's so special",
    "我一直很好奇袋鼠族，今天终于见到了 / I've always been curious about kangaroos, finally met one today",
  ],
  羊驼: [
    "羊驼！感觉很有个性的种族，表情很特别 / An alpaca! Such a quirky species, your expressions are so unique",
    "你真的会吐口水吗，哪种情况下才会 / Do you really spit? In what situations?",
    "羊驼的毛剪下来很软吗，是真正的羊驼绒 / Is alpaca fleece really soft when sheared? Real alpaca wool?",
    "你平时是傲娇型的吗，感觉羊驼族都有点骄傲 / Are you the tsundere type? Alpacas all seem a bit proud",
    "感觉羊驼族特别有个性，很想认识你 / Alpacas have so much personality, I'd love to get to know you",
  ],
  变色龙: [
    "变色龙！变色能力真的很厉害，是根据情绪变色吗 / A chameleon! Changing color is so cool, does it depend on your mood?",
    "你一次能看两个方向吗，眼睛各自独立转动 / Can you look in two directions at once? Each eye moves on its own?",
    "变色龙的舌头比身体还长，弹出去抓猎物吗 / Chameleon tongues are longer than their bodies, you shoot it out to catch prey?",
    "你动作很慢但精准度很高对吗 / You move slowly but with great precision, right?",
    "变色龙感觉特别神秘，很想认识你 / Chameleons seem so mysterious, I'd love to get to know you",
    "你现在是什么颜色，心情好的时候是什么色 / What color are you right now? What color are you when you're happy?",
  ],
  // ── General species ──
  狼: [
    "你是狼的吗，我从小就觉得狼是最酷的种族 / Are you a wolf? I've always thought wolves were the coolest species",
    "狼都这么好看吗，我有点心跳加速 / Are all wolves this good-looking? My heart's racing a bit",
    "据说狼特别忠诚，是真的吗？ / They say wolves are super loyal, is that true?",
    "你平时是群居还是独行？狼感觉很神秘 / Are you a pack animal or a lone wolf? Wolves seem so mysterious",
    "你的嗥叫一定很好听吧，想听一次 / Your howl must sound great, I'd love to hear it once",
    "狼的眼睛颜色一般是什么？你的眼睛一定很特别 / What color are wolf eyes usually? Yours must be special",
    "我一直觉得狼是最有魅力的，今天见到你更确定了 / I've always thought wolves were the most charming, meeting you made me sure",
    "听说狼认准一个就是一辈子，这是真的吗？ / I heard wolves mate for life once they choose, is that true?",
    "你尾巴蓬松吗？一直很好奇狼尾巴摸起来什么感觉 / Is your tail fluffy? I've always wondered what a wolf tail feels like",
    "狼的领地意识很强吧，那你会保护自己喜欢的人吗？ / Wolves are really territorial, right? Would you protect someone you like?",
  ],
  狐: [
    "狐真的都这么聪明吗，跟你说话有点紧张 / Are all foxes this smart? I'm a little nervous talking to you",
    "听说狐特别会撒娇，是真的吗？ / I heard foxes are really good at acting cute, true?",
    "你的耳朵是尖的吧？好想碰一下 / Your ears are pointy, right? I want to touch them",
    "你是红狐还是银狐？还是别的什么颜色？ / Are you a red fox or a silver fox? Or some other color?",
    "狐脑子这么好使，你一定很难追到吧 / Foxes are so clever, you must be hard to win over",
    "你有几条尾巴啊？听说修炼久了会有很多条 / How many tails do you have? I heard you grow more with time",
    "狐都这么漂亮，你一定被搭讪很多次了吧 / Foxes are all so pretty, you must get hit on a lot",
    "我觉得狐天生就有一种神秘感，很吸引我 / Foxes have a natural air of mystery that really draws me in",
    "你是擅长谋略的那种狐狸吗，还是比较温柔型的？ / Are you the scheming kind of fox, or the gentle type?",
    "听说和狐谈恋爱很刺激，是真的吗？ / I heard dating a fox is thrilling, is that true?",
  ],
  猫: [
    "猫真的都这么独立吗，我喜欢这种感觉 / Are all cats really this independent? I like that",
    "你平时是傲娇型的还是黏人型的猫？ / Are you a tsundere cat or a clingy cat?",
    "猫的睡眠时间真的很长吗？你喜欢睡懒觉吗 / Do cats really sleep that much? Do you like sleeping in?",
    "你有没有不经意间把东西推下桌子的习惯 / Do you have a habit of casually knocking things off tables?",
    "猫对喜欢的人会主动吗，还是等对方来找你？ / Do cats make the first move with someone they like, or wait for them?",
    "你的耳朵会根据心情动吗？好想看看生气时的样子 / Do your ears move with your mood? I want to see them when you're angry",
    "猫喜欢被摸耳朵吗，还是只允许特别亲近的人 / Do cats like having their ears touched, or only by someone really close?",
    "你是那种高冷外表但其实很粘人的猫吗？ / Are you the aloof-looking but secretly clingy kind of cat?",
    "猫眼睛特别好看，你的是竖瞳还是圆瞳？ / Cat eyes are so pretty, are yours slit pupils or round?",
    "我一直觉得猫最难追，所以今天鼓起勇气打招呼 / I've always thought cats were hardest to win over, so I worked up the courage today",
  ],
  虎: [
    "虎！我最喜欢虎了，气场很强 / A tiger! Tigers are my favorite, what an aura",
    "你的花纹是橙黑色的吗，还是白虎？ / Are your stripes orange and black, or are you a white tiger?",
    "虎看起来很厉害，但是内心柔软吗？ / Tigers look so fierce, but are you soft inside?",
    "跟虎在一起会很有安全感吧，我喜欢这种感觉 / Being with a tiger must feel so safe, I like that",
    "你平时脾气怎么样？听说虎容易急躁 / How's your temper? I heard tigers can be short-tempered",
    "你有没有在打盹的时候露出肚皮的习惯 / Do you show your belly when you nap?",
    "虎是百兽之王，那你在感情里也是强势的那一方吗？ / Tigers are kings of the jungle, so are you the dominant one in relationships too?",
    "我觉得虎特别帅，看到你的档案就直接打招呼了 / Tigers are so handsome, I said hi the moment I saw your profile",
    "你的爪子平时收起来的吗？ / Do you keep your claws retracted normally?",
    "虎力量很大吧，保护喜欢的人一定很有力 / Tigers are so strong, you must be great at protecting the one you like",
  ],
  豹: [
    "豹！速度最快的种族，你跑步一定很厉害 / A leopard! The fastest species, you must be a great runner",
    "你是猎豹还是花豹还是雪豹？都好喜欢 / Are you a cheetah, a leopard, or a snow leopard? I love them all",
    "豹的花纹是每只都不一样的吗？ / Is every leopard's pattern different?",
    "豹感觉很孤傲，你平时朋友多吗 / Leopards seem so aloof, do you have many friends?",
    "你喜欢爬树吗？豹都爱待在高处 / Do you like climbing trees? Leopards love being up high",
    "豹反应速度这么快，打游戏一定很厉害 / Leopards react so fast, you must be great at games",
    "我觉得豹是最有美感的猫科种族，线条太好看了 / Leopards are the most beautiful felines, those lines are gorgeous",
    "你有没有喜欢独处的倾向？豹感觉很享受独处 / Do you tend to like being alone? Leopards seem to enjoy solitude",
    "豹眼神很锐利，看到你档案感觉被扫视到了 / Leopards have such sharp eyes, I felt scanned just looking at your profile",
    "雪豹的话，你能适应城市生活吗，还是更喜欢山地 / If you're a snow leopard, can you handle city life, or do you prefer mountains?",
  ],
  狮: [
    "狮子！我一直很仰慕狮子的气场 / A lion! I've always admired a lion's aura",
    "你有鬃毛吗？狮子的鬃毛好好看 / Do you have a mane? Lion manes are gorgeous",
    "狮子是群居的吧，你有一个大家族吗？ / Lions live in prides, right? Do you have a big family?",
    "你平时是那种保护大家的角色吗？感觉很可靠 / Are you the one who protects everyone? You seem so reliable",
    "我喜欢狮子那种泰然自若的感觉，很有领袖气质 / I love that calm, composed lion vibe, such a natural leader",
    "你懒得动的时候是什么样子的 / What do you look like when you're too lazy to move?",
    "狮子会撒娇吗？感觉你们很骄傲 / Do lions act cute? You all seem so proud",
    "你是那种睡觉特别能睡的狮子吗 / Are you the kind of lion that can sleep forever?",
    "狮子在感情里是主动还是被动的那一方？ / Are lions the ones who make the first move in relationships?",
    "跟狮子在一起感觉会很有安全感，我很心动 / Being with a lion would feel so safe, my heart's fluttering",
  ],
  熊猫: [
    "熊猫！！太可爱了我直接打招呼 / A panda!! Too cute, I had to say hi",
    "你真的很喜欢吃竹子吗？还是这个是刻板印象 / Do you really love bamboo? Or is that a stereotype?",
    "熊猫是不是特别受欢迎，你一定收到很多消息吧 / Pandas must be super popular, you must get tons of messages",
    "你的眼圈是天生的吗，好特别好好看 / Are your eye patches natural? So unique and pretty",
    "听说熊猫脾气很好而且特别可爱，你是这样的吗 / I heard pandas are good-tempered and super cute, are you like that?",
    "你平时喜欢赖在地上滚吗 / Do you like rolling around on the floor?",
    "熊猫好稀少啊，感觉很幸运能看到你的档案 / Pandas are so rare, I feel lucky to see your profile",
    "你是四川的熊猫吗，还是其他地方的 / Are you a Sichuan panda, or from somewhere else?",
  ],
  熊: [
    "熊！！感觉超有安全感的 / A bear!! You feel so safe",
    "你平时冬眠吗？还是已经进化到不需要冬眠了 / Do you hibernate? Or have you evolved past that?",
    "熊拥抱起来一定很舒服，好想试试 / Bear hugs must feel amazing, I want to try",
    "你是什么熊？棕熊还是黑熊还是北极熊？ / What kind of bear are you? Brown, black, or polar?",
    "听说熊脾气很好，只要不激怒就很温和，是吗 / I heard bears are gentle as long as you don't provoke them, true?",
    "你有没有很喜欢蜂蜜的习惯 / Do you have a thing for honey?",
    "熊看起来憨厚但其实很聪明对吗 / Bears look goofy but are actually really smart, right?",
    "我觉得熊是最让人放心的种族之一，想认识你 / Bears are one of the most reassuring species, I'd love to meet you",
    "你睡觉的时候会蜷缩成一团吗？ / Do you curl up into a ball when you sleep?",
    "熊力量很大，但是性格温和的话简直完美 / Bears are so strong, and if you're gentle too that's just perfect",
  ],
  兔: [
    "兔子！跑得最快的小型种族对吗 / A rabbit! The fastest small species, right?",
    "你的耳朵是竖着的还是垂着的？都好可爱 / Are your ears upright or floppy? Both are so cute",
    "兔子害怕的时候会把耳朵压下来吗 / Do rabbits flatten their ears when they're scared?",
    "你有没有喜欢不停抖腿的习惯 / Do you have a habit of constantly bouncing your leg?",
    "兔子视野很广对吗？几乎是360度 / Rabbits have really wide vision, right? Almost 360 degrees",
    "你喜欢吃什么？胡萝卜是刻板印象还是真的爱吃 / What do you like to eat? Is the carrot thing a stereotype or real?",
    "兔子都这么可爱，你本人一定更可爱 / Rabbits are all so cute, you must be even cuter in person",
    "听说兔子一紧张就会不停动鼻子，你也这样吗 / I heard rabbits twitch their noses nonstop when nervous, do you too?",
    "兔子的毛一定超级软，好想摸 / Rabbit fur must be super soft, I want to pet it",
    "你平时活动时间是白天还是晨昏的？ / Are you active during the day, or at dawn and dusk?",
  ],
  鹿: [
    "鹿！感觉特别温柔的种族 / A deer! Such a gentle species",
    "你有角吗？鹿的角都好好看 / Do you have antlers? Deer antlers are so beautiful",
    "鹿奔跑的时候一定很优雅 / Deer must look so graceful running",
    "你平时警觉性很高吗？鹿感觉很敏感 / Are you always on alert? Deer seem so sensitive",
    "听说鹿眼睛特别大特别漂亮，你也是吗 / I heard deer have big, beautiful eyes, do you too?",
    "鹿在感情里是很纯情的那种吗？ / Are deer the pure, innocent type in love?",
    "你的角每年都会换吗，好神奇 / Do your antlers grow back every year? So amazing",
    "我觉得鹿特别有灵气，遇到你感觉很幸运 / Deer have such an ethereal vibe, I feel lucky to meet you",
    "鹿害怕的时候是什么反应，冻住还是逃跑 / What do deer do when scared, freeze or run?",
    "你对自己喜欢的人会主动吗，还是等对方追？ / Do you make the first move with someone you like, or wait to be chased?",
  ],
  鸟: [
    "鸟！会飞的种族我特别羡慕 / A bird! I'm so jealous of species that can fly",
    "你的翅膀展开有多宽？ / How wide is your wingspan?",
    "飞翔的感觉是什么样的，能描述一下吗 / What does flying feel like? Can you describe it?",
    "你是猛禽系的还是鸣禽系的？ / Are you a bird of prey or a songbird?",
    "高处看世界一定很壮观，你最高飞过多高 / The world must look amazing from up high, how high have you flown?",
    "鸟的眼睛视力超好对吗，能看多远 / Birds have amazing eyesight, right? How far can you see?",
    "你平时喜欢在高处待着吗，比如阳台或者山顶 / Do you like being up high, like balconies or mountaintops?",
    "你的羽毛是什么颜色的，好想看看 / What color are your feathers? I'd love to see",
    "你会模仿声音吗，还是只会发出自己本来的叫声 / Can you mimic sounds, or just make your own call?",
    "我一直觉得鸟是最自由的种族，很向往你们 / I've always thought birds were the freest species, I envy you",
  ],
  鹰: [
    "鹰！猛禽里最帅的种族，气场真的很强 / An eagle! The most handsome bird of prey, what an aura",
    "你俯冲的速度有多快？据说猛禽俯冲非常恐怖 / How fast is your dive? I heard raptor dives are terrifying",
    "鹰的视力真的可以看很远很远吗 / Can eagles really see super far?",
    "你爪子的力量很大吧，能抓住什么 / Your talons must be really strong, what can you grab?",
    "鹰感觉特别孤傲，但是对喜欢的人会温柔吗 / Eagles seem so aloof, but are you gentle with someone you like?",
    "你喜欢在高空翱翔吗，一个人在那么高的地方不孤独吗 / Do you like soaring up high? Isn't it lonely up there alone?",
    "我特别喜欢鹰那种霸气中带着冷静的感觉 / I love that eagle vibe, fierce but calm",
  ],
  蛇: [
    "蛇！感觉神秘又酷，我一直很好奇蛇 / A snake! Mysterious and cool, I've always been curious about snakes",
    "你是冷血的吗，冬天会变得不活泼吗 / Are you cold-blooded? Do you get sluggish in winter?",
    "蛇的感知能力是靠舌头吗？好神奇 / Do snakes sense things with their tongues? So amazing",
    "你有毒吗？如果有的话……算了 / Are you venomous? If you are... never mind",
    "蛇蜕皮的时候是什么感觉 / What does shedding your skin feel like?",
    "听说蛇特别有情调，是真的吗 / I heard snakes are really romantic, is that true?",
    "你平时喜欢盘在温暖的地方吗 / Do you like coiling up somewhere warm?",
    "蛇的眼神特别有魔力，感觉你一定也是这样的 / Snakes have such hypnotic eyes, I bet yours are too",
    "我很喜欢蛇的神秘感，和你聊天一定很有意思 / I love the mystery of snakes, chatting with you must be fun",
    "你是树栖还是地栖的？ / Do you live in trees or on the ground?",
  ],
  犬: [
    "狗！感觉最可靠的种族之一 / A dog! One of the most reliable species",
    "你平时会摇尾巴吗，开心的时候 / Do you wag your tail when you're happy?",
    "听说狗嗅觉特别好，你能闻出很多人闻不到的气味吗 / I heard dogs have an amazing sense of smell, can you smell things most people can't?",
    "狗在感情里是很专一的那种对吗 / Dogs are really loyal in love, right?",
    "你喜欢户外活动吗？狗感觉精力很旺盛 / Do you like outdoor activities? Dogs seem so full of energy",
    "你的耳朵是竖耳还是垂耳？两种我都喜欢 / Are your ears upright or floppy? I like both",
    "狗对自己喜欢的人是很黏的那种吗 / Are dogs really clingy with people they like?",
    "你遇到喜欢的人会直接说出来吗，还是会拐弯抹角 / When you like someone, do you say it straight out or beat around the bush?",
    "狗睡觉会做追梦梦吗，腿会不会抖 / Do dogs dream about chasing things? Do your legs twitch?",
    "我觉得狗特别真诚，所以第一眼就想打招呼 / Dogs are so sincere, that's why I wanted to say hi right away",
  ],
  马: [
    "马！气质好特别，我一直很喜欢马族 / A horse! Such a unique vibe, I've always loved horses",
    "你平时喜欢奔跑吗，还是更享受悠闲的节奏 / Do you like galloping, or do you prefer a slow pace?",
    "马都这么高挑吗，你身高多少 / Are all horses this tall? How tall are you?",
    "你的鬃毛是什么颜色的，好想看看 / What color is your mane? I'd love to see",
    "听说马很通人性，你对人的情绪感知能力强吗 / I heard horses really understand people, are you good at reading emotions?",
    "马在感情里是奔放型的还是保守型的 / Are horses free-spirited or reserved in love?",
    "你喜欢大草原还是城市生活 / Do you prefer open grasslands or city life?",
    "马力量很大，保护起喜欢的人来一定很有力 / Horses are so strong, you must be great at protecting the one you like",
    "我觉得马特别有活力，和你在一起一定不会无聊 / Horses are so full of energy, being with you would never be boring",
    "你跑步的时候是四足还是双足？ / Do you run on four legs or two?",
  ],
  猪: [
    "猪！听说猪其实超级聪明的，是真的吗 / A pig! I heard pigs are actually super smart, is that true?",
    "你平时喜欢在泥地打滚吗，还是这个是刻板印象 / Do you like rolling in the mud, or is that a stereotype?",
    "猪对食物真的很有热情吗，你有什么特别喜欢的 / Are pigs really that passionate about food? Any favorites?",
    "听说猪嗅觉比狗还灵，是真的吗 / I heard pigs have a better nose than dogs, is that true?",
    "猪感觉很享受生活，你是这种类型吗 / Pigs seem to really enjoy life, are you that type?",
    "我觉得猪特别真实可爱，想和你认识 / Pigs are so genuine and cute, I'd love to get to know you",
    "你有小蹄子吗，听说猪的蹄很有意思 / Do you have little hooves? I heard pig hooves are interesting",
    "猪智商真的很高，在学业或者工作上很厉害吗 / Pigs are really smart, are you great at school or work?",
  ],
  浣熊: [
    "浣熊！超可爱的种族，你有没有洗东西的习惯 / A raccoon! Such a cute species, do you have a habit of washing things?",
    "浣熊的眼圈是天生的吗，好特别 / Is your eye mask natural? So unique",
    "你有没有把食物拿去水里洗一洗再吃的习惯 / Do you wash your food in water before eating it?",
    "浣熊感觉特别机灵，一定很聪明 / Raccoons seem so clever, you must be really smart",
    "你平时是昼行性还是夜行性的 / Are you diurnal or nocturnal?",
    "浣熊的爪子很灵巧对吗，手工能力一定很强 / Raccoon paws are really nimble, right? You must be great at crafts",
    "我觉得浣熊特别有个性，看到你就想认识 / Raccoons have so much personality, I wanted to meet you right away",
    "你背上的条纹尾巴是真的还是造型 / Is your ringed tail real or styled?",
  ],
  水獭: [
    "水獭！最可爱的种族之一，我直接就打招呼了 / An otter! One of the cutest species, I said hi immediately",
    "你会游泳吗，水獭天生就会吧 / Can you swim? Otters are born knowing how, right?",
    "水獭的毛摸起来是什么感觉，防水的吗 / What does otter fur feel like? Is it waterproof?",
    "你平时喜欢待在水边吗 / Do you like hanging out by the water?",
    "听说水獭喜欢把喜欢的东西放在肚子上，你有这个习惯吗 / I heard otters keep their favorite things on their bellies, do you?",
    "水獭手牵手睡觉是真的吗，好想 / Is it true otters hold hands while sleeping? I want that",
    "你喜欢吃鱼吗？水獭应该都很爱吧 / Do you like fish? All otters must love it",
    "我觉得水獭是最治愈的种族，想认识你 / Otters are the most healing species, I'd love to get to know you",
  ],
  狸: [
    "狸！感觉好神秘，你是什么狸 / A tanuki! So mysterious, what kind are you?",
    "狸有没有变化的能力，传说里狸猫很厉害 / Can tanuki shapeshift? They're so powerful in legends",
    "你的肚皮是圆圆的吗，好想摸 / Is your belly round? I want to pat it",
    "狸是夜行性的吗，你喜欢晚上活动吗 / Are tanuki nocturnal? Do you like going out at night?",
    "听说狸特别擅长伪装，你平时给人什么印象 / I heard tanuki are masters of disguise, what impression do you give people?",
    "你是日本狸还是其他地方的 / Are you a Japanese tanuki or from somewhere else?",
    "我觉得狸很有趣，今天鼓起勇气打招呼 / Tanuki are so interesting, I worked up the courage to say hi today",
  ],
  鱼: [
    "鱼！水里的种族，你平时怎么上岸活动 / A fish! A water species, how do you get around on land?",
    "你能在陆地待多久，会不会不舒服 / How long can you stay on land? Is it uncomfortable?",
    "鱼的鳞片是什么颜色的 / What color are your scales?",
    "鱼的记忆力真的只有七秒吗，这肯定是假的吧 / Do fish really have a seven-second memory? That has to be fake",
    "你在水里还是陆地上更自在 / Are you more comfortable in water or on land?",
    "我很好奇鱼的日常生活，想多了解你 / I'm so curious about a fish's daily life, I want to know more about you",
    "鱼的尾鳍展开一定很漂亮 / Your tail fin must look beautiful spread out",
    "鲨鱼的话，你游泳的速度很快吧 / If you're a shark, you must swim really fast",
  ],
  // ── Additional species ──
  猴: [
    "猴！感觉特别活泼好动的种族 / A monkey! Such a lively, active species",
    "你爬树很厉害吧，尾巴可以卷东西吗 / You must be great at climbing, can your tail grab things?",
    "猴感觉特别聪明，你在生活里很会变通吗 / Monkeys seem so smart, are you good at adapting in life?",
    "你平时是群居的吗，猴感觉很爱热闹 / Do you live in a group? Monkeys seem to love company",
    "猴的好奇心很强吧，什么都想试试 / Monkeys are so curious, you must want to try everything",
    "感觉猴很有意思，想认识你 / Monkeys seem so fun, I'd love to get to know you",
  ],
  猩猩: [
    "猩猩！感觉最有智慧的灵长类之一 / An ape! One of the wisest primates",
    "你会使用工具吗，猩猩这方面很厉害 / Can you use tools? Apes are great at that",
    "你的臂展很长吗，猩猩感觉臂力很强 / Is your arm span long? Apes seem so strong",
    "猩猩智商很高，你平时有什么兴趣爱好 / Apes are really smart, what are your hobbies?",
    "你喜欢独处吗，感觉猩猩比较安静沉稳 / Do you like being alone? Apes seem quiet and steady",
    "认识猩猩感觉很有趣，想和你多聊聊 / Meeting an ape is so interesting, I'd love to chat more",
  ],
  鼠: [
    "鼠！感觉特别机灵的种族 / A rat! Such a clever species",
    "你的胡须很灵敏吗，能感知周围环境 / Are your whiskers really sensitive? Can you sense your surroundings?",
    "鼠记忆力和解决问题的能力都很强对吗 / Rats have great memory and problem-solving skills, right?",
    "你平时是夜行性的吗，白天睡觉 / Are you nocturnal? Sleep during the day?",
    "鼠感觉特别适应力强，哪里都能生活 / Rats are so adaptable, you can live anywhere",
    "和鼠相处感觉会很有趣，想认识你 / Hanging out with a rat would be so fun, I'd love to meet you",
  ],
  豚鼠: [
    "豚鼠！感觉圆滚滚超可爱的种族 / A guinea pig! Such a round, adorable species",
    "你高兴的时候会蹦跶吗，那个动作好可爱 / Do you popcorn when you're happy? That's so cute",
    "豚鼠喜欢发出什么声音，那种咕噜声吗 / What sounds do guinea pigs make? That purring kind?",
    "你的毛是什么颜色的，好想看看 / What color is your fur? I'd love to see",
    "豚鼠感觉特别亲人，很好接触吗 / Guinea pigs seem so friendly, are you easy to approach?",
    "见到豚鼠感觉很开心，今天打招呼了 / Seeing a guinea pig made me so happy, so I said hi today",
  ],
  海豚: [
    "海豚！感觉最聪明的海洋种族 / A dolphin! The smartest ocean species",
    "你能用回声定位吗，感觉好神奇 / Can you use echolocation? That's so amazing",
    "海豚智商很高，你平时喜欢什么类型的挑战 / Dolphins are really smart, what kind of challenges do you like?",
    "你会跳出水面吗，那个动作一定很帅 / Do you leap out of the water? That must look so cool",
    "海豚感觉特别爱玩，你是活泼型的吗 / Dolphins seem so playful, are you the lively type?",
    "我一直觉得海豚是最友善的种族之一，很心动 / I've always thought dolphins were one of the friendliest species, my heart's fluttering",
  ],
  鲸: [
    "鲸！海洋里最庞大的存在，气场很特别 / A whale! The biggest thing in the ocean, such a special aura",
    "你的歌声是那种在海里传很远的低鸣吗 / Is your song that low hum that travels far through the sea?",
    "鲸感觉特别深沉，内心世界一定很丰富 / Whales seem so deep, your inner world must be so rich",
    "你喜欢深海还是浅海，鲸感觉偏爱深处 / Do you prefer the deep sea or shallow water? Whales seem to love the depths",
    "遇到鲸感觉很特别，今天鼓起勇气打招呼了 / Meeting a whale feels so special, I worked up the courage to say hi today",
  ],
  海豹: [
    "海豹！感觉圆滚滚很可爱的种族 / A seal! Such a round, cute species",
    "你在水里很灵活，但在陆地上是扭动前进吗 / You're so agile in water, but do you wiggle along on land?",
    "海豹的眼睛特别大特别圆对吗，好好看 / Seal eyes are so big and round, right? So pretty",
    "你喜欢晒太阳吗，感觉海豹都爱趴在礁石上 / Do you like sunbathing? Seals all seem to love lying on rocks",
    "你有大胡子吗，感觉很有特点 / Do you have big whiskers? Very distinctive",
    "海豹感觉特别可爱，见到你档案很开心 / Seals are so cute, I was so happy to see your profile",
  ],
  考拉: [
    "考拉！感觉睡眠时间最长的种族，你也爱睡吗 / A koala! The species that sleeps the most, do you love sleeping too?",
    "你真的只吃桉树叶吗，会不会吃腻 / Do you really only eat eucalyptus? Don't you get sick of it?",
    "考拉的鼻子是扁扁大大的吗，好特别 / Is a koala's nose big and flat? So unique",
    "你平时睡多久，一天能睡二十多小时吗 / How long do you sleep? Can you sleep 20-plus hours a day?",
    "考拉感觉特别慢节奏，你喜欢安静的生活吗 / Koalas seem so slow-paced, do you like a quiet life?",
    "见到考拉感觉很幸运，今天打招呼了 / I feel lucky to meet a koala, so I said hi today",
  ],
  蝙蝠: [
    "蝙蝠！唯一会飞的哺乳类，很特别 / A bat! The only flying mammal, so special",
    "你用回声定位导航吗，感觉好神奇 / Do you navigate by echolocation? That's so amazing",
    "蝙蝠倒挂着睡觉吗，不会头晕吗 / Do bats sleep upside down? Don't you get dizzy?",
    "你是夜行性的吗，白天不太活动 / Are you nocturnal? Not very active during the day?",
    "蝙蝠感觉很神秘，想多了解你 / Bats seem so mysterious, I want to know more about you",
    "你的翅膀展开有多大，飞起来是什么感觉 / How big is your wingspan? What does flying feel like?",
  ],
  刺猬: [
    "刺猬！感觉特别有个性的小型种族 / A hedgehog! Such a quirky little species",
    "你的刺平时是收着还是竖着的 / Are your spines usually flat or standing up?",
    "刺猬遇到危险会缩成一团吗，好想看看 / Do hedgehogs curl into a ball when in danger? I want to see",
    "你是夜行性的吗，晚上特别活跃 / Are you nocturnal? Extra active at night?",
    "刺猬感觉特别可爱，虽然有刺但眼神很温柔 / Hedgehogs are so cute, spiky but with such gentle eyes",
    "你喜欢被摸吗，那怎么摸才不会被扎到 / Do you like being petted? How do I pet you without getting poked?",
  ],
  臭鼬: [
    "臭鼬！感觉特别有个性，谁都不敢惹你们 / A skunk! So much personality, nobody dares mess with you",
    "你真的会喷液体吗，哪种情况下才会用 / Do you really spray? In what situations?",
    "臭鼬的花纹是黑白条纹吗，好特别 / Are skunk stripes black and white? So unique",
    "听说臭鼬其实很温和，是真的吗 / I heard skunks are actually really gentle, is that true?",
    "你平时害怕什么，感觉没有天敌的感觉 / What are you afraid of? It feels like you have no natural enemies",
    "臭鼬感觉很有自信，我喜欢这种感觉 / Skunks seem so confident, I like that",
  ],
  树懒: [
    "树懒！感觉最放松的种族，很羡慕你们 / A sloth! The most relaxed species, I envy you",
    "你真的动作很慢吗，不着急不焦虑的感觉 / Do you really move that slowly? No rush, no anxiety?",
    "树懒挂在树上睡觉吗，不会掉下来吗 / Do sloths sleep hanging from trees? Don't you fall?",
    "你一天睡多久，感觉很享受生活 / How long do you sleep a day? You seem to really enjoy life",
    "树懒感觉特别治愈，想和你在一起放松一下 / Sloths are so healing, I'd love to just relax with you",
    "你的爪子很长吗，用来抓树枝的那种 / Are your claws long? The kind for gripping branches?",
  ],
  雪貂: [
    "雪貂！感觉特别活泼的小型肉食动物 / A ferret! Such a lively little carnivore",
    "你是那种精力很旺盛然后突然睡着的类型吗 / Are you the type with tons of energy who suddenly falls asleep?",
    "雪貂身体很细长对吗，钻洞很厉害 / Ferrets are long and slim, right? Great at squeezing into burrows",
    "你喜欢玩耍吗，感觉雪貂特别爱玩 / Do you like playing? Ferrets seem to love it",
    "你的毛是什么颜色的，白的还是棕的还是其他 / What color is your fur, white, brown, or something else?",
    "感觉雪貂特别有趣，想认识你 / Ferrets seem so fun, I'd love to get to know you",
  ],
  蜜獾: [
    "蜜獾！听说无所畏惧的种族，是真的吗 / A honey badger! I heard you're the fearless species, is it true?",
    "你真的什么都不怕吗，就算对上更大的动物 / Are you really not afraid of anything, even bigger animals?",
    "蜜獾皮很厚对吗，一般攻击伤不到你们 / Honey badger skin is super thick, right? Most attacks can't hurt you",
    "你喜欢吃蜂蜜吗，为什么叫蜜獾 / Do you like honey? Is that why you're called a honey badger?",
    "感觉蜜獾特别有勇气，我很欣赏 / Honey badgers are so brave, I really admire that",
    "你在感情里也是这么勇敢无畏吗 / Are you this fearless in love too?",
  ],
  海獭: [
    "海獭！最可爱的海洋种族，我直接就打招呼了 / A sea otter! The cutest ocean species, I said hi immediately",
    "你会把食物放在肚子上吃吗，想看看这个 / Do you eat food off your belly? I'd love to see that",
    "海獭手牵手睡觉是真的吗，好想 / Is it true sea otters hold hands while sleeping? I want that",
    "你的毛防水吗，能浮在水面上吗 / Is your fur waterproof? Can you float on the surface?",
    "海獭喜欢吃贝类吗，用石头砸开的那种 / Do sea otters like shellfish? The kind you crack open with a rock?",
    "我觉得海獭是最治愈的种族之一，想认识你 / Sea otters are one of the most healing species, I'd love to meet you",
  ],
  鬣狗: [
    "鬣狗！感觉很有团队精神的种族 / A hyena! Such a team-spirited species",
    "听说鬣狗社会里雌性更强势，你是这样吗 / I heard females are in charge in hyena society, is that you?",
    "你们的叫声是那种笑声一样的吗，好特别 / Is your call that laughing sound? So unique",
    "鬣狗的咬合力很大对吗，很厉害 / Hyenas have a super strong bite, right? Impressive",
    "你平时是群居的，有固定的族群吗 / Do you live in a clan? A regular group?",
    "感觉鬣狗被误解很多，你实际上是什么性格 / Hyenas get misunderstood a lot, what's your personality really like?",
  ],
  大象: [
    "大象！感觉最有智慧的陆地种族 / An elephant! The wisest land species",
    "大象记忆力真的很好吗，不会忘事吗 / Do elephants really have amazing memories? Never forget anything?",
    "你的鼻子很灵活吗，能做很多事情 / Is your trunk really nimble? You can do so much with it",
    "大象感情很丰富，你是很重感情的那种吗 / Elephants are so emotional, are you the deeply sentimental type?",
    "大象感觉特别可靠，很想认识你 / Elephants seem so reliable, I'd love to get to know you",
    "你有象牙吗，还是你们的亚种没有 / Do you have tusks, or does your subspecies not?",
  ],
  犀牛: [
    "犀牛！感觉特别有存在感的种族 / A rhino! Such a commanding presence",
    "你的角是真的角质的吗，很硬吧 / Is your horn really made of keratin? Must be hard",
    "犀牛皮肤很厚实对吗，不怕一般伤害 / Rhino skin is really thick, right? Not afraid of normal injuries?",
    "你视力不好但嗅觉很灵吗，听说是这样 / Bad eyesight but a great nose, right? That's what I heard",
    "犀牛感觉外表强硬但内心很温和吗 / Do rhinos look tough on the outside but gentle inside?",
    "今天鼓起勇气打招呼，感觉犀牛很特别 / Worked up the courage to say hi today, rhinos seem so special",
  ],
  河马: [
    "河马！水里最危险的种族之一，感觉很厉害 / A hippo! One of the most dangerous species in the water, impressive",
    "你在水里的时间多还是陆地多 / Do you spend more time in water or on land?",
    "河马皮肤会分泌红色液体吗，那个是防晒的吗 / Does hippo skin ooze red liquid? Is that sunscreen?",
    "你的嘴巴张开很大吗，感觉力量很强 / Can you open your mouth really wide? Seems so powerful",
    "河马感觉外表憨厚，实际上非常有力量 / Hippos look goofy but are actually incredibly strong",
    "遇到河马很难得，打招呼看看 / Meeting a hippo is rare, figured I'd say hi",
  ],
  骆驼: [
    "骆驼！感觉最耐旱的种族，很厉害 / A camel! The most drought-proof species, amazing",
    "你的驼峰里装的是脂肪不是水对吗，真的 / Your humps store fat, not water, right? Really?",
    "骆驼踩沙漠很稳，蹄子很宽大吗 / Camels walk so steadily on sand, are your hooves really wide?",
    "你脾气怎么样，骆驼感觉很有个性 / How's your temper? Camels seem to have a lot of attitude",
    "骆驼眼睫毛很长对吗，好特别 / Camels have really long eyelashes, right? So unique",
    "感觉骆驼特别耐力强，你在生活里也是坚韧型的吗 / Camels have so much stamina, are you the resilient type in life too?",
  ],
  斑马: [
    "斑马！条纹是每只都不一样的吗，好特别 / A zebra! Is every zebra's stripe pattern different? So unique",
    "你的条纹是黑底白纹还是白底黑纹，这个问题我想了很久 / Are your stripes white on black or black on white? I've wondered about this forever",
    "斑马奔跑速度很快吗，能逃脱天敌 / Can zebras run really fast? Fast enough to escape predators?",
    "你是群居的吗，斑马感觉很有团队意识 / Do you live in a herd? Zebras seem like team players",
    "我觉得斑马很有辨识度，见到你就记住了 / Zebras are so recognizable, I remembered you the moment I saw you",
    "你和马有来往吗，感觉你们是近亲 / Do you hang out with horses? You're close relatives, right?",
  ],
  绵羊: [
    "绵羊！感觉毛最蓬松的种族，摸起来软吗 / A sheep! The fluffiest species, is your wool soft?",
    "你的毛会定期剃掉吗，那个过程是什么感觉 / Do you get sheared regularly? What's that like?",
    "绵羊感觉特别温和，你平时脾气很好吗 / Sheep seem so gentle, are you usually good-tempered?",
    "你有犄角吗，绵羊有的有有的没有 / Do you have horns? Some sheep do, some don't",
    "感觉绵羊很舒适，在一起一定很放松 / Sheep seem so cozy, being together must be so relaxing",
    "你是那种喜欢跟着群体还是喜欢独处的 / Do you like following the flock, or being on your own?",
  ],
  山羊: [
    "山羊！爬山高手，什么样的斜坡都能爬吗 / A goat! Master climber, can you handle any slope?",
    "你的胡子是白的吗，感觉山羊有胡子 / Is your beard white? Goats seem to have beards",
    "山羊眼睛是方形瞳孔对吗，好神奇 / Goats have rectangular pupils, right? So amazing",
    "你真的什么都能吃吗，山羊很不挑食 / Can you really eat anything? Goats aren't picky at all",
    "你有犄角吗，山羊的角感觉很有气势 / Do you have horns? Goat horns look so impressive",
    "山羊感觉很有个性，想认识你 / Goats have so much personality, I'd love to get to know you",
  ],
  孔雀: [
    "孔雀！感觉最华丽的鸟类，见到你很惊喜 / A peacock! The most dazzling bird, what a nice surprise",
    "你的尾羽展开有多大，一定很壮观 / How big is your tail fan? It must be spectacular",
    "孔雀会主动展示自己吗，感觉很自信 / Do peacocks show off on their own? You seem so confident",
    "你的羽毛颜色是什么，蓝的绿的还是白的 / What color are your feathers, blue, green, or white?",
    "孔雀感觉特别有气质，想和你聊聊 / Peacocks have such elegance, I'd love to chat",
    "你平时低调还是喜欢展示，孔雀感觉很特别 / Are you low-key or do you like to show off? Peacocks are so special",
  ],
  鹦鹉: [
    "鹦鹉！会说话的种族，你能学多少词 / A parrot! The talking species, how many words can you learn?",
    "你记忆力很好吗，能记住很多内容 / Is your memory really good? Can you remember lots of things?",
    "鹦鹉感觉特别聪明，会解决复杂问题 / Parrots seem so smart, great at solving complex problems",
    "你的羽毛是什么颜色的，好想看看 / What color are your feathers? I'd love to see",
    "鹦鹉寿命很长对吗，感觉很有阅历 / Parrots live really long, right? You must have seen a lot",
    "和鹦鹉聊天一定很有趣，想试试 / Chatting with a parrot must be so fun, I want to try",
  ],
  天鹅: [
    "天鹅！感觉最优雅的鸟类，气质很特别 / A swan! The most elegant bird, such a special aura",
    "你游泳的时候脖子弯成弧线吗，好优美 / Does your neck curve into an arc when you swim? So graceful",
    "天鹅是一夫一妻制的吗，感情很专一 / Are swans monogamous? So devoted",
    "你飞翔的时候翅膀声很大吗 / Are your wings loud when you fly?",
    "天鹅感觉特别高洁，今天鼓起勇气打招呼 / Swans seem so pure and noble, I worked up the courage to say hi today",
    "你在感情里是很忠诚的那种吗 / Are you the really loyal type in relationships?",
  ],
  火烈鸟: [
    "火烈鸟！颜色最鲜艳的鸟类，好漂亮 / A flamingo! The most vibrant bird, so pretty",
    "你的颜色是吃东西吃出来的吗，越吃越粉 / Does your color come from what you eat? The more you eat, the pinker?",
    "火烈鸟单腿站立是为了保暖吗 / Do flamingos stand on one leg to stay warm?",
    "你的弯嘴是用来过滤食物的吗，好聪明的设计 / Is your curved beak for filtering food? What a clever design",
    "火烈鸟感觉特别独特，遇到你很开心 / Flamingos are so unique, I'm so happy to meet you",
    "你平时是群居的吗，火烈鸟感觉都是大群的 / Do you live in a flock? Flamingos always seem to be in big groups",
  ],
  乌鸦: [
    "乌鸦！感觉最聪明的鸟类之一 / A crow! One of the smartest birds",
    "乌鸦会使用工具吗，听说这方面很厉害 / Can crows use tools? I heard you're great at that",
    "你记忆力很好吗，乌鸦能记住很多人的脸 / Is your memory good? Crows can remember tons of faces",
    "你喜欢收集亮晶晶的东西吗 / Do you like collecting shiny things?",
    "乌鸦感觉特别有个性，不是一般的鸟 / Crows have so much personality, not your average bird",
    "和乌鸦聊天感觉会很有意思，想试试 / Chatting with a crow would be so interesting, I want to try",
  ],
  鹤: [
    "鹤！感觉特别优雅的鸟类，飞起来一定很美 / A crane! Such an elegant bird, you must look beautiful in flight",
    "鹤是一夫一妻制的吗，在感情里很专一 / Are cranes monogamous? So devoted in love",
    "你的舞蹈是真实存在的吗，鹤求偶舞 / Is the crane dance real? The courtship dance?",
    "你能站在一条腿上休息吗，平衡感超好 / Can you rest standing on one leg? Amazing balance",
    "鹤感觉很有气质，看到你档案就被吸引了 / Cranes have such grace, your profile drew me right in",
    "你的寿命很长吗，感觉鹤很有阅历 / Do you live really long? Cranes seem so worldly",
  ],
  鳄: [
    "鳄鱼！感觉最古老的种族之一，真的很厉害 / A crocodile! One of the oldest species, truly impressive",
    "你在水里的速度很快吗，还是说主要靠静止等待 / Are you fast in the water, or do you mostly wait motionless?",
    "鳄鱼的咬合力是所有种族里最强的之一吗 / Is a crocodile's bite one of the strongest of any species?",
    "你的皮肤摸起来是粗糙的鳞片感吗 / Does your skin feel like rough scales?",
    "鳄鱼感觉特别沉稳，不轻易行动 / Crocodiles seem so composed, never moving rashly",
    "你是冷血动物吗，喜欢晒太阳取暖 / Are you cold-blooded? Do you like basking in the sun to warm up?",
  ],
  蜥蜴: [
    "蜥蜴！感觉特别有个性的爬行种族 / A lizard! Such a quirky reptile",
    "你的尾巴断了可以再生吗，这个真的很神奇 / Can your tail grow back if it breaks? That's so amazing",
    "蜥蜴变色能力怎么样，会根据环境改变颜色吗 / How good are lizards at changing color? Do you change with your surroundings?",
    "你是冷血动物吗，早上需要先晒太阳活动 / Are you cold-blooded? Do you need to sunbathe before getting going in the morning?",
    "蜥蜴感觉很灵活，反应速度很快 / Lizards seem so agile, super quick reactions",
    "你平时喜欢在哪里待着，高处还是地面 / Where do you like to hang out, up high or on the ground?",
  ],
  壁虎: [
    "壁虎！爬墙高手，垂直面对你来说完全没难度 / A gecko! Wall-climbing pro, vertical surfaces are nothing for you",
    "你的脚是用微绒毛贴墙的吗，这个原理很神奇 / Do your feet stick to walls with tiny hairs? That's so amazing",
    "壁虎能在天花板上走吗，太厉害了 / Can geckos walk on ceilings? Incredible",
    "你的尾巴可以断掉再生吗 / Can your tail break off and grow back?",
    "壁虎感觉很灵活，喜欢到处探索 / Geckos seem so nimble, you must love exploring",
    "你平时是夜行性的吗，夜晚比较活跃 / Are you nocturnal? More active at night?",
  ],
  龟: [
    "龟！感觉最长寿的种族，好厉害 / A turtle! The longest-living species, amazing",
    "你的壳真的是身体的一部分吗，不能脱掉对吗 / Is your shell really part of your body? You can't take it off, right?",
    "龟行动缓慢但很稳，生活里也是慢节奏吗 / Turtles move slow but steady, is your life slow-paced too?",
    "你能缩进壳里完全躲起来吗 / Can you hide completely inside your shell?",
    "龟感觉见过很多，人生经验一定很丰富 / Turtles have seen so much, you must have tons of life experience",
    "你喜欢水里还是陆地，这两种龟都有吗 / Do you prefer water or land? Are there turtles for both?",
  ],
  青蛙: [
    "青蛙！感觉最会跳的两栖种族 / A frog! The best jumper among amphibians",
    "你能跳多高，身体比例来说很惊人吧 / How high can you jump? It must be amazing for your size",
    "青蛙的皮肤是湿润的吗，需要保持湿度 / Is frog skin moist? Do you need to stay damp?",
    "你会发出什么叫声，夏天那种蛙鸣吗 / What sound do you make? That summer croaking?",
    "青蛙感觉特别有活力，你也是这样吗 / Frogs seem so full of energy, are you like that too?",
    "遇到青蛙很高兴，想认识你 / So happy to meet a frog, I'd love to get to know you",
  ],
  蝾螈: [
    "蝾螈！感觉特别神奇的两栖种族 / A salamander! Such a magical amphibian",
    "你的四肢断了可以再生吗，这个能力很惊人 / Can your limbs regrow if you lose them? That's incredible",
    "钝口螈的话，你是那种永远幼态的吗，好可爱 / If you're an axolotl, do you stay baby-faced forever? So cute",
    "蝾螈感觉很安静，不怎么叫对吗 / Salamanders seem so quiet, you don't make many sounds, right?",
    "你是水里生活还是陆地，两栖的话两边都行 / Do you live in water or on land? As an amphibian, either works",
    "感觉蝾螈很特别，今天打招呼了 / Salamanders seem so special, so I said hi today",
  ],
  蜘蛛: [
    "蜘蛛！八只眼睛，视野是360度的吗 / A spider! Eight eyes, is your vision 360 degrees?",
    "你会结网吗，织出来的网是用来捕猎的吗 / Do you spin webs? Are they for catching prey?",
    "蜘蛛的丝很强韧对吗，比钢铁还坚固 / Spider silk is super strong, right? Stronger than steel",
    "你有毒吗，大部分蜘蛛都有一点点 / Are you venomous? Most spiders are a little",
    "蜘蛛感觉特别有耐心，等待猎物那种沉稳 / Spiders seem so patient, that calm way of waiting for prey",
    "遇到蜘蛛感觉很特别，今天打招呼了 / Meeting a spider feels so special, so I said hi today",
  ],
  蝎子: [
    "蝎子！感觉很有气势的节肢种族 / A scorpion! Such an imposing arthropod",
    "你的毒刺有多毒，危险吗 / How venomous is your stinger? Is it dangerous?",
    "蝎子的钳子力量很大吗 / Are scorpion pincers really strong?",
    "你是夜行性的吗，白天躲在哪里 / Are you nocturnal? Where do you hide during the day?",
    "蝎子感觉特别有威慑力，但你性格是什么样的 / Scorpions seem so intimidating, but what's your personality like?",
    "遇到蝎子感觉很特别，想认识你 / Meeting a scorpion feels so special, I'd love to get to know you",
  ],
  螃蟹: [
    "螃蟹！横着走的种族，感觉很有趣 / A crab! The sideways-walking species, so fun",
    "你真的只能横着走吗，还是说可以直行 / Can you really only walk sideways, or can you go straight too?",
    "螃蟹的壳很硬吗，保护性很强 / Is a crab shell really hard? Great protection?",
    "你的钳子很有力吗，夹东西很厉害 / Are your pincers strong? Great at pinching things?",
    "螃蟹感觉很有个性，想认识你 / Crabs have so much personality, I'd love to get to know you",
    "你是淡水螃蟹还是海水螃蟹 / Are you a freshwater crab or a saltwater crab?",
  ],
};

function _pickBreedMessage() {
  const breed = (currentUser.breed || "").toLowerCase();
  for (const [key, pool] of Object.entries(_BREED_MSG_POOLS)) {
    if (breed.includes(key)) {
      return Math.random() < 0.65
        ? pool[_randInt(0, pool.length - 1)]
        : _FAKE_MSG_POOL[_randInt(0, _FAKE_MSG_POOL.length - 1)];
    }
  }
  return _FAKE_MSG_POOL[_randInt(0, _FAKE_MSG_POOL.length - 1)];
}

let _floodTimers = [];

// ── Single-user intrusive questions ───────────────────────────

const _SINGLE_QUESTION_POOL = [
  "你有秘密伴侣吗？/ Do you have a secret partner?",
  "你有在国外的伴侣吗？/ Do you have a partner abroad?",
  "你有在其他国家的伴侣吗？/ Do you have a partner in other countries?",
  "你有网恋对象吗？/ Do you have an online partner?",
  '你有在暧昧关系中吗？/ Are you "in a situationship" single?',
  '你还爱着前任吗？/ Are you "still in love with your ex" single?',
  '你是开放关系吗？/ Are you "in an open relationship" single?',
  '你找fwb/ons吗？/ Are you "in a friends with benefits" single?',
  '你有在暗恋谁吗？/ Are you "I have a crush on someone" single?',
  "你是因为孤独所以想找伴侣吗？/ Are you \"I want a partner because I'm lonely\" single?",
  "你结过婚吗？/ Have you been married?",
  "你有孩子吗？/ Do you have kids?",
  '你有「那个错过的人」吗？/ Do you have a "one that got away"?',
];

function _startSingleQuestions() {
  const burstDelays = [6000, 18000, 35000, 55000, 80000];
  burstDelays.forEach((delay) => {
    const t = setTimeout(() => {
      if (!document.getElementById("swipe-page")?.classList.contains("active"))
        return;
      _showSingleQuestion();
    }, delay);
    _floodTimers.push(t);
  });

  function scheduleNext() {
    const t = setTimeout(
      () => {
        if (!document.getElementById("swipe-page")?.classList.contains("active"))
          return;
        _showSingleQuestion();
        scheduleNext();
      },
      _randInt(40000, 90000),
    );
    _floodTimers.push(t);
  }
  scheduleNext();
}

function _showSingleQuestion() {
  if (_quietOverlayOpen()) return;
  const text = _SINGLE_QUESTION_POOL[_randInt(0, _SINGLE_QUESTION_POOL.length - 1)];
  const el = document.createElement("div");
  el.className = "swipe-interrupt";
  el.style.top = _randInt(8, 65) + "vh";
  el.style.left = _randInt(4, 52) + "vw";
  el.innerHTML = `${iconImg("question",2)} ${text}<button class="interrupt-close" onclick="this.parentElement.remove()">✕</button>`;
  document.body.appendChild(el);
  setTimeout(() => el?.remove(), 10000);
}

function startGenderedNotifications() {
  if (!currentUser) return;
  const g = (currentUser.gender || "").split("/")[0];
  if (g === "雌") _startFloodMessages();
  else if (g === "雄") _startFloodSkips();
  _startProfileViewNotifs();
  _startUnrepliedReminders();
  if (currentUser.mixed) _startMixedBloodNotifs();
  const sterilized = (currentUser.sterilized || "").toLowerCase();
  if (sterilized.includes("单身") || sterilized.includes("single")) _startSingleQuestions();
}

function _startMixedBloodNotifs() {
  const burstDelays = [2000, 7000, 14000, 28000, 50000];
  burstDelays.forEach((delay, i) => {
    const t = setTimeout(() => {
      if (!document.getElementById("swipe-page")?.classList.contains("active"))
        return;
      if (i % 2 === 0) {
        const alert =
          _MIXED_BLOOD_ALERT_POOL[
            _randInt(0, _MIXED_BLOOD_ALERT_POOL.length - 1)
          ];
        showMessagePopup({
          id: "alert_" + Date.now(),
          from: "system",
          fromName: alert.from,
          content: alert.content,
          alertStyle: true,
        });
      } else {
        const sender = _pickSenderName();
        const content =
          _MIXED_BLOOD_MSG_POOL[_randInt(0, _MIXED_BLOOD_MSG_POOL.length - 1)];
        _sendRealFakeMsg(sender, content, false);
      }
    }, delay);
    _floodTimers.push(t);
  });

  function scheduleNext() {
    const t = setTimeout(
      () => {
        if (
          !document.getElementById("swipe-page")?.classList.contains("active")
        )
          return;
        if (Math.random() < 0.4) {
          const alert =
            _MIXED_BLOOD_ALERT_POOL[
              _randInt(0, _MIXED_BLOOD_ALERT_POOL.length - 1)
            ];
          showMessagePopup({
            id: "alert_" + Date.now(),
            from: "system",
            fromName: alert.from,
            content: alert.content,
            alertStyle: true,
          });
        } else {
          const sender = _pickSenderName();
          const content =
            _MIXED_BLOOD_MSG_POOL[
              _randInt(0, _MIXED_BLOOD_MSG_POOL.length - 1)
            ];
          _sendRealFakeMsg(sender, content, false);
        }
        scheduleNext();
      },
      _randInt(20000, 45000),
    );
    _floodTimers.push(t);
  }
  scheduleNext();
}

function stopGenderedNotifications() {
  _floodTimers.forEach(clearTimeout);
  _floodTimers = [];
}

function _pickOppositeProfile() {
  const g = (currentUser.gender || "").split("/")[0];
  const opposite = profiles.filter((p) => (p.gender || "").split("/")[0] !== g);
  if (opposite.length > 0) return opposite[_randInt(0, opposite.length - 1)];
  return null;
}

function _pickAnyOtherProfile() {
  if (profiles.length > 0) return profiles[_randInt(0, profiles.length - 1)];
  return null;
}

function _pickSenderName() {
  const p = _pickOppositeProfile();
  if (p) return { name: p.name, username: p.username };
  const g = (currentUser.gender || "").split("/")[0];
  const pool = g === "雌" ? _FAKE_MALE_NAMES : _FAKE_FEMALE_NAMES;
  const name = pool[_randInt(0, pool.length - 1)];
  return { name, username: "fake_" + name };
}

function _pickSkipperName() {
  const p = _pickOppositeProfile();
  if (p) return p.name;
  return _FAKE_FEMALE_NAMES[_randInt(0, _FAKE_FEMALE_NAMES.length - 1)];
}

function _pickViewerName() {
  const p = _pickAnyOtherProfile();
  if (p) return p.name;
  const all = [..._FAKE_MALE_NAMES, ..._FAKE_FEMALE_NAMES];
  return all[_randInt(0, all.length - 1)];
}

// ── Female: flood of real inbox messages ──────────────────────

function _sendRealFakeMsg(sender, content, alertStyle) {
  if (alertStyle) {
    showMessagePopup({
      id: "alert_" + Date.now(),
      from: sender.username,
      fromName: sender.name,
      content,
      alertStyle: true,
    });
    return;
  }
  api("/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      from: sender.username,
      fromName: sender.name,
      to: currentUser.username,
      content,
    }),
  })
    .then((r) => r.json())
    .then((msg) => {
      seenMessageIds.add(msg.id);
      showMessagePopup(msg);
      fetchUnreadCount();
    })
    .catch(() => {
      showMessagePopup({
        id: "fake_" + Date.now(),
        from: sender.username,
        fromName: sender.name,
        content,
      });
    });
}

function _startFloodMessages() {
  const burstDelays = [20000, 45000, 80000, 130000, 190000, 260000];
  burstDelays.forEach((delay, i) => {
    const t = setTimeout(() => {
      if (!document.getElementById("swipe-page")?.classList.contains("active"))
        return;
      if (i === 4 || i === 7) {
        const alert =
          _FAKE_ALERT_POOL[_randInt(0, _FAKE_ALERT_POOL.length - 1)];
        showMessagePopup({
          id: "alert_" + Date.now(),
          from: "system",
          fromName: alert.from,
          content: alert.content,
          alertStyle: true,
        });
      } else {
        const sender = _pickSenderName();
        const content = _pickBreedMessage();
        _sendRealFakeMsg(sender, content, false);
      }
    }, delay);
    _floodTimers.push(t);
  });

  function scheduleNext() {
    const t = setTimeout(
      () => {
        if (
          !document.getElementById("swipe-page")?.classList.contains("active")
        )
          return;
        if (Math.random() < 0.25) {
          const alert =
            _FAKE_ALERT_POOL[_randInt(0, _FAKE_ALERT_POOL.length - 1)];
          showMessagePopup({
            id: "alert_" + Date.now(),
            from: "system",
            fromName: alert.from,
            content: alert.content,
            alertStyle: true,
          });
        } else {
          const sender = _pickSenderName();
          const content = _pickBreedMessage();
          _sendRealFakeMsg(sender, content, false);
        }
        scheduleNext();
      },
      _randInt(60000, 120000),
    );
    _floodTimers.push(t);
  }
  scheduleNext();
}

// ── Male: flood of skip notifications ─────────────────────────

function _startFloodSkips() {
  const burstDelays = [
    3000, 7000, 12000, 18000, 25000, 33000, 42000, 52000, 63000,
  ];
  burstDelays.forEach((delay) => {
    const t = setTimeout(() => {
      if (!document.getElementById("swipe-page")?.classList.contains("active"))
        return;
      _showSkipNotif(_pickSkipperName());
    }, delay);
    _floodTimers.push(t);
  });

  function scheduleNext() {
    const t = setTimeout(
      () => {
        if (
          !document.getElementById("swipe-page")?.classList.contains("active")
        )
          return;
        _showSkipNotif(_pickSkipperName());
        scheduleNext();
      },
      _randInt(6000, 16000),
    );
    _floodTimers.push(t);
  }
  scheduleNext();
}

function _showSkipNotif(name) {
  if (_quietOverlayOpen()) return;
  const el = document.createElement("div");
  el.className = "swipe-interrupt skip-notif";
  el.style.top = _randInt(8, 72) + "vh";
  el.style.left = _randInt(3, 55) + "vw";
  el.innerHTML = `${iconImg("xmark",2)} ${biHtml(`「${name}」跳过了你`, `"${name}" skipped you`)}<button class="interrupt-close" onclick="this.parentElement.remove()">✕</button>`;
  document.body.appendChild(el);
  setTimeout(() => el?.remove(), 7000);
}

// ── All: "X viewed your profile" ──────────────────────────────

function _startProfileViewNotifs() {
  const delays = [5000, 14000, 28000, 45000, 65000];
  delays.forEach((delay) => {
    const t = setTimeout(() => {
      if (!document.getElementById("swipe-page")?.classList.contains("active"))
        return;
      _showProfileViewNotif();
    }, delay);
    _floodTimers.push(t);
  });

  function scheduleNext() {
    const t = setTimeout(
      () => {
        if (
          !document.getElementById("swipe-page")?.classList.contains("active")
        )
          return;
        _showProfileViewNotif();
        scheduleNext();
      },
      _randInt(30000, 70000),
    );
    _floodTimers.push(t);
  }
  scheduleNext();
}

function _showProfileViewNotif() {
  if (_quietOverlayOpen()) return;
  // 名字由 biHtml 转义
  const name = _pickViewerName();
  const secs = _randInt(4, 87);
  const el = document.createElement("div");
  el.className = "swipe-interrupt";
  el.style.top = _randInt(8, 72) + "vh";
  el.style.left = _randInt(3, 55) + "vw";
  el.innerHTML = `${iconImg("eye",2)} ${biHtml(`「${name}」查看了你的档案，停留了 ${secs} 秒`, `"${name}" viewed your profile for ${secs}s`)}<button class="interrupt-close" onclick="this.parentElement.remove()">✕</button>`;
  document.body.appendChild(el);
  setTimeout(() => el?.remove(), 8000);
}

// ── All: unreplied reminders ───────────────────────────────────

function _startUnrepliedReminders() {
  const delays = [35000, 80000, 140000];
  delays.forEach((delay) => {
    const t = setTimeout(() => {
      if (!document.getElementById("swipe-page")?.classList.contains("active"))
        return;
      _showUnrepliedReminder();
    }, delay);
    _floodTimers.push(t);
  });

  function scheduleNext() {
    const t = setTimeout(
      () => {
        if (
          !document.getElementById("swipe-page")?.classList.contains("active")
        )
          return;
        _showUnrepliedReminder();
        scheduleNext();
      },
      _randInt(90000, 180000),
    );
    _floodTimers.push(t);
  }
  scheduleNext();
}

const _TIME_PHRASES = [
  "10分钟/10min",
  "23分钟/23min",
  "1小时/1hr",
  "2小时/2hrs",
  "3小时/3hrs",
  "半天/half a day",
  "一整天/a whole day",
  "快两天/nearly 2 days",
];

function _showUnrepliedReminder() {
  if (_quietOverlayOpen()) return;
  // 名字由 biHtml 转义；时间短语是「一整天/a whole day」，中英文两半各取一边
  const name = _pickViewerName();
  const [tZh, tEn] = _TIME_PHRASES[_randInt(0, _TIME_PHRASES.length - 1)].split("/");
  const texts = [
    `${iconImg("bubble",2)} ${biHtml(`你已经 ${tZh} 没有回复「${name}」了`, `You haven't replied to "${name}" in ${tEn}`)}`,
    `${iconImg("clock",2)} ${biHtml(`你还没有回复「${name}」，对方可能在等你`, `"${name}" might be waiting`)}`,
    `${iconImg("envelope",2)} ${biHtml(`「${name}」发来的消息你还没有回复哦`, `You left "${name}" on read`)}`,
    `${iconImg("bubble",2)} ${biHtml(`你已经忘记回复「${name}」了吗？`, `Did you forget to reply to "${name}"?`)}`,
  ];
  const el = document.createElement("div");
  el.className = "swipe-interrupt";
  el.style.top = _randInt(8, 72) + "vh";
  el.style.left = _randInt(3, 55) + "vw";
  el.innerHTML = `${texts[_randInt(0, texts.length - 1)]}<button class="interrupt-close" onclick="this.parentElement.remove()">✕</button>`;
  document.body.appendChild(el);
  setTimeout(() => el?.remove(), 10000);
}

// ── Toast 通知 ───────────────────────────────────────────────

function skip() {
  if (currentIndex >= profiles.length) return;
  openReasonPopup("skip");
}

function doSkip(label, reason) {
  if (currentUser && currentIndex < profiles.length) {
    const target = profiles[currentIndex];
    api("/skip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        skipperPetName: currentUser.name,
        skippedUsername: target.username,
        label,
        reason,
      }),
    });
  }
  _consecutiveSkips++;
  currentIndex++;
  showProfile();
}

// ── Reason Popup ─────────────────────────────────────────────

let pendingAction = null;
let selectedReasonLabel = null;

function openReasonPopup(action) {
  if (currentIndex >= profiles.length) return;
  pendingAction = action;
  selectedReasonLabel = null;

  const p = profiles[currentIndex];
  const rel = p.relationship || {};
  // 顺序、项目和档案卡一致（旧档案里的伴侣相关字段有值也照常列出）
  const par = p.parents || {};
  const fields = [
    { label: "物种/Species", value: p.breed },
    { label: "性别/Gender", value: p.gender },
    { label: "年龄/Age", value: p.age },
    { label: "身高/Height", value: p.height },
    { label: "性取向/Orientation", value: p.orientation },
    { label: "婚恋/Status", value: p.sterilized || rel.status },
    { label: "其他关系/Other Ships", value: rel.ships && rel.ships !== REL_SHIP_NONE ? rel.ships : "" },
    { label: "MBTI", value: p.mbti },
    { label: "星座/Horoscope", value: p.horoscope },
    { label: "领地/Territory", value: p.house?.city || p.house?.district || p.hukou },
    { label: "车/Vehicle", value: p.vehicle?.types?.length },
    { label: "学历/Education", value: p.edu },
    { label: "职业/Job", value: p.occupation },
    { label: "月收入/Income", value: p.income },
    { label: "目的/Here For", value: rel.datingPurpose },
    { label: "期望关系/Looking For", value: rel.relationshipGoal },
    { label: "谈过/Past Rels", value: rel.pastRelCount },
    { label: "前任联系/Ex Contact", value: rel.exContact },
    { label: "还爱前任/Still Love Ex", value: rel.stillLoveEx },
    { label: "白月光/Moonlight", value: rel.whiteMoonlight },
    { label: "子女/Kids", value: rel.kids },
    { label: "暗恋/Crush", value: rel.crush },
    { label: "目前伴侣/Partner", value: rel.currentPartner },
    { label: "伴侣数量/# Partners", value: rel.partnerCount },
    { label: "暧昧/Ambiguous", value: rel.ambiguous },
    { label: "秘密伴侣/Secret", value: rel.secretPartner },
    { label: "境外伴侣/Foreign", value: rel.foreignPartner },
    { label: "异地伴侣/Long Dist", value: rel.otherCityPartner },
    { label: "爱好/Hobbies", value: p.hobby },
    { label: "家庭状况/Family", value: par.status || par.relationship || par.siblingCount },
    { label: "择偶标准/Standards", value: p.standards },
  ].filter((f) => f.value);

  document.getElementById("reason-popup-title").innerHTML =
    action === "like"
      ? `${iconImg("heart_sm", 2)} 喜欢的理由 / Why do you like?`
      : `${iconImg("xmark", 2)} 跳过的理由 / Why skip?`;

  document.getElementById("reason-labels").innerHTML = fields
    .map(
      (f) =>
        `<button class="reason-label-btn" onclick="selectReasonLabel(this,'${f.label}')">${f.label}</button>`,
    )
    .join("");

  document.getElementById("reason-input").value = "";
  document.getElementById("reason-popup").classList.remove("hidden");
}

function selectReasonLabel(btn, label) {
  document
    .querySelectorAll(".reason-label-btn")
    .forEach((b) => b.classList.remove("selected"));
  btn.classList.add("selected");
  selectedReasonLabel = label;
}

function closeReasonPopup() {
  document.getElementById("reason-popup").classList.add("hidden");
  pendingAction = null;
  selectedReasonLabel = null;
}

function submitReason() {
  if (!selectedReasonLabel) {
    showAlert("请先选择一个标签\nPlease select a label");
    return;
  }
  const reason = document.getElementById("reason-input").value.trim();
  const action = pendingAction;
  const label = selectedReasonLabel;
  closeReasonPopup();
  if (action === "like") doLike(label, reason);
  else if (action === "skip") doSkip(label, reason);
}

function goToMyProfile() {
  if (!currentUser) return;
  stopSwipeInterrupts();
  // 只取自己这一份最新档案（grid / likes / skips）
  fetchProfile(currentUser.username).then((fresh) => {
    if (fresh) currentUser = fresh;
    _openMyProfileEdit(currentUser);
  });
}

function _openMyProfileEdit(u) {
  const container = document.getElementById("my-profile-card-body");
  if (container) {
    container.innerHTML = renderCardHTML(u);
    attachSectionDragScroll(container);
    currentProfileInterpretations = u.interpretations || {};
    attachLabelHandlers(u.username, container);
  }
  document.getElementById("profile-edit").classList.remove("hidden");
}

function closeMyProfile() {
  document.getElementById("profile-edit").classList.add("hidden");
  // 从「我」菜单进来的：回到菜单，菜单关掉时才恢复浏览页的弹窗
  if (!document.getElementById("me-overlay")?.classList.contains("hidden")) return;
  if (document.getElementById("swipe-page")?.classList.contains("active"))
    startSwipeInterrupts();
}

// ── 排行榜：和大屏 web 同一个规则（分数 − 被跳过次数，取前十）──
// 先显示列表，点一个人进去看档案；只能看，不接长按 / 点按（不能写解读、不能赞同），也没有喜欢 / 跳过按钮
// 服务器 /ranking 只发前十名；上次的结果先显示，新数据到了再刷新；列表头像画小图并缓存
let _rankList = [];
const _rankThumbCache = new Map();

// 列表小头像：同一个人、同一张画、同一套配色只画一次
function _rankThumb(p) {
  if (!p.grid && p.avatar) return p.avatar;
  const key = `${p.username}|${currentTheme.bg}${currentTheme.ink}|${p.gridText || ""}|${JSON.stringify(p.grid)}`;
  if (!_rankThumbCache.has(key)) {
    if (_rankThumbCache.size > 60) _rankThumbCache.clear();
    _rankThumbCache.set(key, renderGridAsAvatar(p.grid, p.gridText, 160));
  }
  return _rankThumbCache.get(key);
}
let _rankDetailIdx = -1;
const _rankScore = (p) => Math.max(0, (p.score ?? 60) - (p.skips?.length || 0));

function openRanking() {
  stopSwipeInterrupts();
  _quietOverlayEnter();
  _rankDetailIdx = -1;
  _showRankList();
  // 有上次的结果就先显示，没有才显示「加载中」
  if (_rankList.length) _renderRankList();
  else document.getElementById("rank-list").innerHTML = `<p class="rank-empty">加载中… / Loading…</p>`;
  document.getElementById("rank-overlay").classList.remove("hidden");
  api("/ranking")
    .then((r) => r.json())
    .then((list) => {
      if (!Array.isArray(list)) throw new Error();
      _rankList = list;
      // 正在看某个人的档案时不打断，回到列表时就是新的
      if (_rankDetailIdx < 0) _renderRankList();
    })
    .catch(() => {
      if (!_rankList.length)
        document.getElementById("rank-list").innerHTML = `<p class="rank-empty">加载失败，请稍后再试 / Failed to load, please try again</p>`;
    });
}

function _renderRankList() {
  const list = document.getElementById("rank-list");
  if (!_rankList.length) {
    list.innerHTML = `<p class="rank-empty">还没有人上榜 / No one on the list yet</p>`;
    return;
  }
  list.innerHTML = _rankList
    .map((p, i) => {
      // 列表只需要名字、物种、喜欢 / 跳过数，不用 cardValues（它会画一张 1024 的大头像）
      const c = { name: p.name, breed: cardBreed(p), likes: p.likes?.length || 0, skips: p.skips?.length || 0 };
      const score = _rankScore(p);
      return `
      <button class="nes-btn rank-item${i < 3 ? " rank-top" : ""}" onclick="openRankDetail(${i})">
        <span class="rank-no">No.${i + 1}</span>
        <img class="rank-avatar" src="${_rankThumb(p)}" alt="" />
        <span class="rank-info">
          <span class="rank-name" data-noi18n>${escapeHtml(c.name || "—")}</span>
          <span class="rank-breed">${fmtBI(c.breed)}</span>
          <span class="rank-stats">
            ${iconImg("heart_sm", 2)} ${c.likes}
            <img src="${getPixelVomitUrl()}" class="rank-vomit" alt="" /> ${c.skips}
          </span>
        </span>
        <span class="rank-score${score < 60 ? " stamp-red" : ""}">${score}</span>
      </button>`;
    })
    .join("");
}

function openRankDetail(i) {
  const p = _rankList[i];
  if (!p) return;
  _rankDetailIdx = i;
  const body = document.getElementById("rank-detail-body");
  body.innerHTML = renderCardHTML(p);
  attachSectionDragScroll(body);
  document.getElementById("rank-detail-title").textContent = `No.${i + 1}`;
  document.getElementById("rank-title").classList.add("hidden");
  document.getElementById("rank-detail-title").classList.remove("hidden");
  document.getElementById("rank-list").classList.add("hidden");
  document.getElementById("rank-detail").classList.remove("hidden");
  body.parentElement.scrollTop = 0;
}

function _showRankList() {
  _rankDetailIdx = -1;
  document.getElementById("rank-title").classList.remove("hidden");
  document.getElementById("rank-detail-title").classList.add("hidden");
  document.getElementById("rank-list").classList.remove("hidden");
  document.getElementById("rank-detail").classList.add("hidden");
}

// ◀：档案页回到列表，列表里再按就关掉排行榜
function rankBack() {
  if (_rankDetailIdx >= 0) {
    _showRankList();
    return _renderRankList();
  }
  document.getElementById("rank-overlay").classList.add("hidden");
  if (document.getElementById("swipe-page")?.classList.contains("active"))
    startSwipeInterrupts();
  _resumeAfterOverlay();
}

// 换配色：排行榜开着时，头像跟着重画
document.addEventListener("themechange", () => {
  if (document.getElementById("rank-overlay").classList.contains("hidden")) return;
  _renderRankList();
  if (_rankDetailIdx >= 0) openRankDetail(_rankDetailIdx);
});

// ── 「我」：菜单 → 我的档案 / 语言 / 色调 ──
const _ME_TITLES = { menu: "我 Me", lang: "语言 Language", theme: "色调 Theme", admin: "后台 Admin" };
// 子页面按 ◀ 回到哪一页
const _ME_PARENT = { lang: "menu", theme: "menu", admin: "menu", adminUser: "admin", adminConvo: "adminUser" };
let _meView = "menu";

function openMePage() {
  stopSwipeInterrupts();
  _quietOverlayEnter();
  document.getElementById("me-admin-row").classList.toggle("hidden", !currentUser?.isAdmin);
  showMeView("menu");
  document.getElementById("me-overlay").classList.remove("hidden");
}

function closeMePage() {
  document.getElementById("me-overlay").classList.add("hidden");
  if (document.getElementById("swipe-page")?.classList.contains("active"))
    startSwipeInterrupts();
  _resumeAfterOverlay();
}

function showMeView(view) {
  _meView = view;
  document.querySelectorAll("#me-overlay .me-view").forEach((el) => {
    el.classList.toggle("hidden", el.id !== `me-view-${view}`);
  });
  if (_ME_TITLES[view]) document.getElementById("me-title").textContent = _ME_TITLES[view];
  if (view === "theme") {
    _buildSavedThemes();
    _buildThemePicker();
  }
  document.getElementById("me-overlay").scrollTop = 0;
}

// ◀：子页面回到上一页，菜单里再按就关掉
function meBack() {
  if (_meView === "menu") closeMePage();
  else showMeView(_ME_PARENT[_meView] || "menu");
}

// ── 后台（只有管理员）：所有人的档案、所有私信、重置密码 ──
let _adminUsers = [];
let _adminMessages = [];
let _adminUser = null;

function openAdmin() {
  showMeView("admin");
  document.getElementById("admin-users").innerHTML = `<p class="rank-empty">加载中… / Loading…</p>`;
  Promise.all([api("/admin/users").then((r) => r.json()), api("/admin/messages").then((r) => r.json())])
    .then(([users, msgs]) => {
      _adminUsers = Array.isArray(users) ? users : [];
      _adminMessages = Array.isArray(msgs) ? msgs : [];
      _renderAdminUsers();
    })
    .catch(() => {
      document.getElementById("admin-users").innerHTML = `<p class="rank-empty">加载失败 / Failed to load</p>`;
    });
}

function _renderAdminUsers() {
  const q = (document.getElementById("admin-search").value || "").trim().toLowerCase();
  const list = _adminUsers.filter(
    (u) => !q || String(u.name || "").toLowerCase().includes(q) || String(u.username).toLowerCase().includes(q),
  );
  document.getElementById("admin-users").innerHTML =
    `<p class="admin-count">${list.length} / ${_adminUsers.length}</p>` +
    list
      .map(
        (u) => `
      <button class="nes-btn admin-row" data-user="${escapeHtml(u.username)}" onclick="openAdminUser(this.dataset.user)">
        <span class="admin-row-main" data-noi18n><b>${escapeHtml(u.name || "—")}</b> <small>@${escapeHtml(u.username)}</small></span>
        <span class="admin-row-meta">${u.score ?? "—"} · ${iconImg("bubble", 2)} ${u.msgCount}</span>
      </button>`,
      )
      .join("");
}

function openAdminUser(username) {
  _adminUser = _adminUsers.find((u) => u.username === username);
  if (!_adminUser) return;
  showMeView("adminUser");
  document.getElementById("me-title").textContent = _adminUser.name || _adminUser.username;
  document.getElementById("admin-new-pw").value = "";
  // 按对方分组：每段对话一行
  const convos = {};
  _adminMessages
    .filter((m) => m.from === username || m.to === username)
    .forEach((m) => {
      const other = m.from === username ? m.to : m.from;
      const otherName = (m.from === username ? m.toName : m.fromName) || other;
      (convos[other] = convos[other] || { other, otherName, msgs: [] }).msgs.push(m);
    });
  const rows = Object.values(convos).sort((a, b) => b.msgs.length - a.msgs.length);
  document.getElementById("admin-convos").innerHTML = rows.length
    ? rows
        .map(
          (c) => `
      <button class="nes-btn admin-row" data-other="${escapeHtml(c.other)}" onclick="openAdminConvo(this.dataset.other)">
        <span class="admin-row-main" data-noi18n>↔ <b>${escapeHtml(c.otherName)}</b> <small>@${escapeHtml(c.other)}</small></span>
        <span class="admin-row-meta">${c.msgs.length}</span>
      </button>`,
        )
        .join("")
    : `<p class="rank-empty">没有私信 / No messages</p>`;
  // 档案：只看，不接长按 / 点按
  const card = document.getElementById("admin-user-card");
  card.innerHTML = renderCardHTML(_adminUser);
  attachSectionDragScroll(card);
}

function openAdminConvo(other) {
  const me = _adminUser?.username;
  const msgs = _adminMessages
    .filter((m) => (m.from === me && m.to === other) || (m.from === other && m.to === me))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  showMeView("adminConvo");
  document.getElementById("me-title").textContent = `${_adminUser.name || me} ↔ ${msgs[0]?.from === other ? msgs[0].fromName || other : msgs[0]?.toName || other}`;
  document.getElementById("admin-thread").innerHTML = msgs
    .map((m) => {
      const time = new Date(m.date).toLocaleString(_timeLocale(), { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
      return `
      <div class="bubble-row ${m.from === me ? "bubble-mine" : "bubble-theirs"}">
        <div class="bubble">
          <div class="bubble-text"${_noI18nAttr(m.content)}>${escapeHtml(m.content)}</div>
          <div class="bubble-time">${time}${m.read ? "" : " · " + L("未读", "unread")}</div>
        </div>
      </div>`;
    })
    .join("");
}

function adminResetPassword() {
  const pw = document.getElementById("admin-new-pw").value.trim();
  if (!_adminUser || !pw) return showAlert("请输入新密码\nPlease enter a new password.");
  api("/admin/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: _adminUser.username, newPassword: pw }),
  })
    .then((r) => {
      if (!r.ok) throw new Error();
      document.getElementById("admin-new-pw").value = "";
      showAlert(`已把 ${_adminUser.username} 的密码重置为：${pw}\nPassword for ${_adminUser.username} reset to: ${pw}`);
    })
    .catch(() => showAlert("重置失败\nReset failed."));
}

// 色调：我的配色
function _buildSavedThemes() {
  const esc = (x) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const list = savedThemes();
  document.getElementById("theme-saved").innerHTML = list
    .map(
      (t, i) => `
    <div class="theme-saved-item">
      <button class="nes-btn theme-swatch${sameColors(t, currentTheme) ? " selected" : ""}" data-i="${i}"
        onclick="setTheme({ id: 'custom', bg: savedThemes()[this.dataset.i].bg, ink: savedThemes()[this.dataset.i].ink })">
        <span class="theme-swatch-chip" style="background:${t.bg};color:${t.ink}">Aa</span>
      </button>
      <button class="theme-saved-name" data-i="${i}" onclick="openThemeName(Number(this.dataset.i))" aria-label="改名 Rename">
        <span class="theme-saved-name-text" data-noi18n>${esc(t.name || "")}</span><span class="theme-saved-name-pen">✎</span>
      </button>
      <button class="theme-saved-del" data-i="${i}" onclick="onRemoveSavedTheme(this.dataset.i)" aria-label="删除 Delete">✕</button>
    </div>`,
    )
    .join("");
  document.getElementById("theme-saved-empty").classList.toggle("hidden", list.length > 0);
}

function onSaveTheme() {
  const r = canSaveCurrentTheme();
  if (r === "dup") return showAlert("这个配色已经存过了\nThis palette is already saved.");
  if (r === "full")
    return showAlert(`最多存 ${SAVED_THEMES_MAX} 个，先删掉一个吧\nYou can save up to ${SAVED_THEMES_MAX}. Delete one first.`);
  openThemeName(null);
}

// 起名弹窗：index = null 是新存，数字是给已存的第几个改名
let _themeNameIndex = null;
function _defaultThemeName() {
  const preset = THEME_PRESETS.find((t) => sameColors(t, currentTheme));
  if (preset) return currentLang === "en" ? preset.en : preset.zh;
  const n = savedThemes().length + 1;
  return currentLang === "en" ? `Palette ${n}` : `配色 ${n}`;
}
function openThemeName(index) {
  _themeNameIndex = index;
  const t = index === null ? currentTheme : savedThemes()[index];
  if (!t) return;
  const chip = document.getElementById("theme-name-chip");
  chip.style.background = t.bg;
  chip.style.color = t.ink;
  document.getElementById("theme-name-title").innerHTML =
    index === null
      ? `<span class="zh">给这个配色起个名字</span><span class="en">Name this palette</span>`
      : `<span class="zh">改个名字</span><span class="en">Rename palette</span>`;
  const input = document.getElementById("theme-name-input");
  input.value = index === null ? _defaultThemeName() : t.name || "";
  document.getElementById("theme-name-overlay").classList.remove("hidden");
  input.focus();
  input.select();
}
function closeThemeName() {
  document.getElementById("theme-name-overlay").classList.add("hidden");
}
function confirmThemeName() {
  const name = document.getElementById("theme-name-input").value.trim();
  if (_themeNameIndex === null) saveCurrentTheme(name || _defaultThemeName());
  else renameSavedTheme(_themeNameIndex, name);
  closeThemeName();
  _buildSavedThemes();
}

function onRemoveSavedTheme(i) {
  removeSavedTheme(Number(i));
  _buildSavedThemes();
}

// 色调：预设 + 自己调
function _buildThemePicker() {
  const wrap = document.getElementById("theme-presets");
  wrap.innerHTML = THEME_PRESETS.map(
    (t) => `
    <button class="nes-btn theme-swatch${currentTheme.id === t.id ? " selected" : ""}" data-id="${t.id}"
      onclick="setTheme(THEME_PRESETS.find((x) => x.id === this.dataset.id))">
      <span class="theme-swatch-chip" style="background:${t.bg};color:${t.ink}">Aa</span>
      <span>${t.zh} ${t.en}</span>
    </button>`,
  ).join("");
  _syncCustomInputs();
}

function _syncCustomInputs() {
  document.getElementById("theme-custom-bg").value = currentTheme.bg;
  document.getElementById("theme-custom-ink").value = currentTheme.ink;
}

// 自定义：底色和墨色各改各的，改一个不动另一个
function onCustomThemeBg(bg) {
  setTheme({ id: "custom", bg, ink: document.getElementById("theme-custom-ink").value });
}
// 按一下才自动配：按现在的墨色配底色 / 按现在的底色配墨色
function onAutoBg() {
  const ink = document.getElementById("theme-custom-ink").value;
  setTheme({ id: "custom", bg: suggestBg(ink), ink });
}
function onAutoInk() {
  const bg = document.getElementById("theme-custom-bg").value;
  setTheme({ id: "custom", bg, ink: suggestInk(bg) });
}
function onCustomThemeInk(ink) {
  setTheme({ id: "custom", bg: document.getElementById("theme-custom-bg").value, ink });
}

document.addEventListener("themechange", () => {
  document.querySelectorAll("#theme-presets .theme-swatch").forEach((b) => {
    b.classList.toggle("selected", b.dataset.id === currentTheme.id);
  });
  const saved = savedThemes();
  document.querySelectorAll("#theme-saved .theme-swatch").forEach((b) => {
    const t = saved[b.dataset.i];
    b.classList.toggle("selected", !!t && sameColors(t, currentTheme));
  });
  // 点了预设 / 我的配色，取色框跟着变（自己正在拖的那个不用管，值本来就一样）
  _syncCustomInputs();
});

function _applyImpressionToGrid(grid, text) {
  if (!_isValidGrid(grid) || !text) return;
  const filled = [];
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const cell = grid[y][x];
      if (cell !== null && cell !== "/") filled.push({ x, y });
    }
  }
  if (filled.length < text.length) return;

  filled.sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));

  const reps = Math.min(
    Math.floor(20 / text.length) || 1,
    Math.floor(filled.length / text.length),
  );
  const used = new Set();

  for (let r = 0; r < reps; r++) {
    let placed = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      const start = Math.floor(
        Math.random() * (filled.length - text.length + 1),
      );
      let ok = true;
      for (let c = 0; c < text.length; c++) {
        if (used.has(start + c)) {
          ok = false;
          break;
        }
      }
      if (ok) {
        for (let c = 0; c < text.length; c++) {
          const { x, y } = filled[start + c];
          const alpha = _cellAlpha(grid[y][x]);
          grid[y][x] = alpha === 1 ? text[c] : [text[c], alpha];
          used.add(start + c);
        }
        placed = true;
        break;
      }
    }
    if (!placed) break;
  }
}

function impression(text) {
  if (!text) return;

  if (currentIndex >= profiles.length) {
    showAlert("没有更多兽人可以评论了 / No more anthros to comment on");
    return;
  }

  const profile = profiles[currentIndex];

  // Apply locally and re-render avatar immediately
  if (profile.grid) {
    _applyImpressionToGrid(profile.grid, text);
    showProfile();
  }

  // Persist to server in the background
  api("/impression", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      likedUsername: profile.username,
      commenterName: currentUser.name,
      impression: text,
    }),
  });
  _tutHook("imp-submit");
}

function openImpressionPopup() {
  if (currentIndex >= profiles.length) return;
  document.getElementById("swipe-impression-input").value = "";
  document.getElementById("swipe-impression-popup").classList.remove("hidden");
  _tutHook("imp-open");
}

function closeImpressionPopup() {
  document.getElementById("swipe-impression-popup").classList.add("hidden");
  _tutHook("imp-close");
}

function submitSwipeImpression() {
  const text = document.getElementById("swipe-impression-input").value.trim();
  if (!text) return;
  closeImpressionPopup();
  impression(text);
}

function closeSendMsgPopup() {
  document.getElementById("swipe-sendmsg-popup").classList.add("hidden");
}

function submitSwipeSendMsg() {
  const text = document.getElementById("swipe-sendmsg-input").value.trim();
  if (!text || !currentUser || currentIndex >= profiles.length) return;
  const target = profiles[currentIndex];
  _cacheOutbox(currentUser.username, currentUser.name, target.username, target.name, text);
  api("/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      from: currentUser.username,
      fromName: currentUser.name,
      to: target.username,
      toName: target.name,
      content: text,
    }),
  }).then(() => closeSendMsgPopup());
}

// ── Profile View Overlay ─────────────────────────────────────

function viewConvoProfile() {
  if (!convoTarget) return;
  fetchProfile(convoTarget.username).then((p) => {
    if (p) showProfileView(p);
  });
}

function showProfileView(p) {
  const container = document.getElementById("profile-view-content");
  container.innerHTML = renderCardHTML(p);
  attachSectionDragScroll(container);
  currentProfileInterpretations = p.interpretations || {};
  attachLabelHandlers(p.username, container);
  document.getElementById("profile-view-overlay").classList.remove("hidden");
}

function closeProfileView() {
  document.getElementById("profile-view-overlay").classList.add("hidden");
}

// 实时同步 currentText，避免手机端 blur 在 touchMoved 之后才触发的时序问题
document.getElementById("text-input").addEventListener("input", (e) => {
  currentText = e.target.value.trim();
});

// Enter（换行键）或失焦（完成键）时确认并转换已有 pixel 格子
document.getElementById("text-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    drawText();
    e.target.blur();
  }
});
document.getElementById("text-input").addEventListener("blur", () => {
  drawText();
});

// Enter 键发送消息，禁止换行
document.getElementById("convo-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendConvoMessage();
  }
});

document
  .getElementById("swipe-sendmsg-input")
  .addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitSwipeSendMsg();
    }
  });

document
  .getElementById("swipe-impression-input")
  .addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitSwipeImpression();
    }
  });
