let currentUser = null;

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
  const _appSocket = io();
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

// Login Function
function handleLogin() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!username) return showAlert("请输入用户名！\nPlease enter a username.");
  if (!password) return showAlert("请输入密码！\nPlease enter a password.");

  // 从服务器拿所有 profiles，检查是否已存在
  fetch("/profiles")
    .then((res) => res.json())
    .then((data) => {
      const existing = data.find(
        (p) => p.username === username && p.password === password,
      );

      if (existing) {
        currentUser = existing;
        // 老用户 → 直接进入 swipe
        checkNotifications();
        startMessagePolling();
        createSwipeCard();
      } else {
        const userExists = data.find((p) => p.username === username);
        if (userExists) {
          // username 存在但密码错
          alert("密码错误 / Wrong password");
        } else {
          // 新用户 → 走注册流程
          goTo("profile-name");
        }
      }
    });
}

// Page Navigation Function
const _setupPageOrder = [
  "profile-name",
  "profile-breed",
  "profile-gender",
  "profile-housing",
  "profile-vehicle",
  "profile-sterilized",
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
      if (!document.getElementById("petBreedClass")?.value) {
        showAlert("请选择种族大类！\nPlease select a species class."); return false;
      }
      const specWrapper = document.getElementById("breedSpecificWrapper");
      if (specWrapper && !specWrapper.classList.contains("hidden")) {
        if (!document.getElementById("petBreed")?.value) {
          showAlert("请选择具体物种！\nPlease select a species."); return false;
        }
      }
      const isMixed = document.getElementById("isMixed")?.checked;
      if (isMixed) {
        if (!document.getElementById("petBreedClass2")?.value) {
          showAlert("请选择第二族裔大类！\nPlease select the 2nd heritage class."); return false;
        }
        const spec2 = document.getElementById("breedSpecificWrapper2");
        if (spec2 && !spec2.classList.contains("hidden")) {
          if (!document.getElementById("petBreed2")?.value) {
            showAlert("请选择第二族裔物种！\nPlease select the 2nd heritage species."); return false;
          }
        }
      }
      const heightWrapper = document.getElementById("heightWrapper");
      if (heightWrapper && !heightWrapper.classList.contains("hidden")) {
        if (!document.getElementById("petHeight")?.value) {
          showAlert("请选择身高！\nPlease select your height."); return false;
        }
      }
      return true;
    }

    case "profile-gender": {
      if (!document.getElementById("petOrientation")?.value) {
        showAlert("请选择性取向！\nPlease select your orientation."); return false;
      }
      const dp = document.getElementById("datePicker");
      if (dp && !dp.classList.contains("hidden")) {
        showAlert('请先点击"确定 OK"确认出生日期！\nPlease confirm your birth date first.'); return false;
      }
      if (!document.getElementById("birthDisplay")?.value) {
        showAlert("请选择出生日期！\nPlease select your birth date."); return false;
      }
      return true;
    }

    case "profile-housing": {
      const resolvedCity = getHousingCityValue("house");
      if (!resolvedCity) {
        showAlert("请选择城市！\nPlease select a city."); return false;
      }
      if (!document.getElementById("house-district")?.value) {
        showAlert("请摇骰子选择区域！\nPlease roll for district."); return false;
      }
      if (!document.getElementById("house-type")?.value) {
        showAlert("请摇骰子选择住宅类型！\nPlease roll for house type."); return false;
      }
      if (!document.getElementById("house-area")?.value) {
        showAlert("请摇骰子选择面积！\nPlease roll for area."); return false;
      }
      if (!document.getElementById("house-tenure")?.value) {
        showAlert("请摇骰子选择租/买！\nPlease roll for rent or buy."); return false;
      }
      if (!document.getElementById("house-price")?.value) {
        showAlert("请摇骰子选择房屋价格！\nPlease roll for house price."); return false;
      }
      return true;
    }

    case "profile-vehicle": {
      if (!document.getElementById("vehicle-types-hidden")?.value) {
        showAlert("请摇骰子选择车辆类型！\nPlease roll for vehicle type."); return false;
      }
      if (!document.getElementById("vehicle-price")?.value) {
        showAlert("请摇骰子选择车辆价值！\nPlease roll for vehicle price."); return false;
      }
      return true;
    }

    case "profile-sterilized": {
      if (!document.getElementById("petSterilized")?.value) {
        showAlert("请摇骰子选择婚恋状况！\nPlease roll for relationship status."); return false;
      }
      if (!document.getElementById("rel-pastCount")?.value) {
        showAlert("请摇骰子选择谈过几次恋爱！\nPlease roll for past relationships."); return false;
      }
      // Conditional: ex-group visible
      const exGroup = document.getElementById("rel-ex-group");
      if (exGroup && !exGroup.classList.contains("hidden")) {
        if (!document.getElementById("rel-exContact")?.value)
          { showAlert("请摇骰子选择前任联系情况！\nPlease roll for ex contact."); return false; }
        if (!document.getElementById("rel-stillLoveEx")?.value)
          { showAlert("请摇骰子选择是否还爱前任！\nPlease roll for still love ex."); return false; }
        if (!document.getElementById("rel-whiteMoon")?.value)
          { showAlert("请摇骰子选择是否有白月光！\nPlease roll for white moonlight."); return false; }
      }
      if (!document.getElementById("rel-kids")?.value) {
        showAlert("请摇骰子选择是否有孩子！\nPlease roll for kids."); return false;
      }
      if (!document.getElementById("rel-partner")?.value) {
        showAlert("请摇骰子选择是否有伴侣！\nPlease roll for current partner."); return false;
      }
      // Conditional: partner details
      const partnerDetails = document.getElementById("rel-partner-details");
      if (partnerDetails && !partnerDetails.classList.contains("hidden")) {
        if (!document.getElementById("rel-partnerCount")?.value)
          { showAlert("请摇骰子选择伴侣数量！\nPlease roll for partner count."); return false; }
        if (!document.getElementById("rel-foreignPartner")?.value)
          { showAlert("请摇骰子选择是否有境外伴侣！\nPlease roll for foreign partner."); return false; }
        if (!document.getElementById("rel-otherCity")?.value)
          { showAlert("请摇骰子选择是否有异地伴侣！\nPlease roll for long-distance partner."); return false; }
      }
      const noPartnerDetails = document.getElementById("rel-no-partner-details");
      if (noPartnerDetails && !noPartnerDetails.classList.contains("hidden")) {
        if (!document.getElementById("rel-ambiguous")?.value)
          { showAlert("请摇骰子选择暧昧情况！\nPlease roll for ambiguous relationships."); return false; }
        if (!document.getElementById("rel-secret")?.value)
          { showAlert("请摇骰子选择是否有秘密伴侣！\nPlease roll for secret partner."); return false; }
      }
      if (!document.getElementById("rel-crush")?.value) {
        showAlert("请摇骰子选择是否有暗恋对象！\nPlease roll for crush."); return false;
      }
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
        showAlert("请选择父亲所在城市！\nPlease select your father's city."); return false;
      }
      if (motherAlive && !getHousingCityValue("parents-mother")) {
        showAlert("请选择母亲所在城市！\nPlease select your mother's city."); return false;
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
  if (validatePage("profile-photo")) createCard();
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
    const el = document.getElementById(id);
    if (!el) return;
    const val = el.value.trim();
    if (val && SCORE_DEDUCTIONS[val] !== undefined)
      score += SCORE_DEDUCTIONS[val];
  });
  score += getHobbyScore();
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

function toggleMbtiPicker(id) {
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

function onPastRelRolled(value) {
  const hasRel = value !== "0段/None";
  document.getElementById("rel-ex-group")?.classList.toggle("hidden", !hasRel);
}

function onPartnerRolled(value) {
  const hasPartner = value !== "无/None";
  document.getElementById("rel-partner-details")?.classList.toggle("hidden", !hasPartner);
  document.getElementById("rel-no-partner-details")?.classList.toggle("hidden", hasPartner);
}

// Date Picker Functions
const _today = new Date();
let selectedYear = _today.getFullYear();
let selectedMonth = _today.getMonth() + 1;
let selectedDay = _today.getDate();

function openDatePicker() {
  document.getElementById("datePicker").classList.remove("hidden");
  generateWheels(true);
}

function generateWheels(scrollToSelected = false) {
  createWheel(
    "yearWheel",
    0,
    5000,
    selectedYear,
    (v) => (selectedYear = v),
    scrollToSelected,
  );
  createWheel(
    "monthWheel",
    1,
    12,
    selectedMonth,
    (v) => (selectedMonth = v),
    scrollToSelected,
  );
  createWheel(
    "dayWheel",
    1,
    31,
    selectedDay,
    (v) => (selectedDay = v),
    scrollToSelected,
  );
}

function createWheel(
  id,
  start,
  end,
  selected,
  onSelect,
  scrollToSelected = false,
) {
  const wheel = document.getElementById(id);
  wheel.innerHTML = "";

  for (let i = start; i <= end; i++) {
    const item = document.createElement("div");
    item.textContent = i;
    if (i === selected) item.classList.add("selected");

    item.onclick = () => {
      onSelect(i);
      generateWheels(false); // 只刷新高亮，不重新滚动
    };

    wheel.appendChild(item);
  }
  wheel.addEventListener("touchstart", (e) => e.stopPropagation(), {
    passive: true,
  });
  wheel.addEventListener("touchmove", (e) => e.stopPropagation(), {
    passive: true,
  });

  // 只在初次打开时居中滚动，用 index × 行高避免 offsetTop 不准的问题
  if (scrollToSelected) {
    const index = selected - start;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const itemH = wheel.firstChild ? wheel.firstChild.offsetHeight : 28;
        wheel.scrollTop = index * itemH - (wheel.clientHeight - itemH) / 2;
      });
    });
  }
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

function getHoroscope(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d)) return "";
  const m = d.getMonth() + 1;
  const day = d.getDate();
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

function findSubgroupForSpecies(cls, species) {
  const subs = breedSubgroups[cls];
  if (!subs) return null;
  for (const [sg, val] of Object.entries(subs)) {
    if (Array.isArray(val)) {
      if (val.includes(species)) return { sg, ssg: null };
    } else {
      for (const [ssg, list] of Object.entries(val)) {
        if (list.includes(species)) return { sg, ssg };
      }
    }
  }
  return null;
}

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
    "其他鸟类 / Other Bird",
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
    "其他爬行类 / Other Reptile",
  ],
  "两栖类 / Amphibians": [
    "钝口螈 / Axolotl",
    "青蛙 / Frog",
    "蝾螈 / Salamander",
    "蟾蜍 / Toad",
    "其他两栖类 / Other Amphibian",
  ],
  "节肢动物 / Arthropods": [
    "螃蟹 / Crab",
    "蜈蚣 / Centipede",
    "蚱蜢 / Grasshopper",
    "独角仙 / Rhinoceros Beetle",
    "蝎子 / Scorpion",
    "蜘蛛 / Spider",
    "其他节肢动物 / Other Arthropod",
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
  const breedSpecific = document.getElementById("petBreed").value;
  const breedClass = document.getElementById("petBreedClass").value;
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

function onCitySelectChange(prefix) {
  // city select in new two-level system never contains "自定义"
  // custom input is handled by onProvinceSelectChange
}

function onDistrictSelectChange(prefix) {
  const sel = document.getElementById(`${prefix}-district-select`);
  const customInput = document.getElementById(`${prefix}-district-custom`);
  customInput.classList.toggle("hidden", sel.value !== "自定义");
}

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
        modelWrapper.classList.toggle("hidden", !needsModel);
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
      if (priceWrapper) {
        priceWrapper.classList.remove("hidden");
        priceWrapper.dataset.priceTier = priceTierKey;
      }
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
      display.textContent = picked;
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
        tierMap = HOUSING_TIERS.vehiclePriceByType[priceTierKey] || HOUSING_TIERS.vehiclePrice;
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

function loadDistrictIntoSelect(prefix, savedDistrict) {
  const sel = document.getElementById(`${prefix}-district-select`);
  const customInput = document.getElementById(`${prefix}-district-custom`);
  if (!sel || !savedDistrict) {
    if (customInput) customInput.classList.add("hidden");
    return;
  }
  sel.value = savedDistrict;
  if (sel.value === savedDistrict) {
    customInput.classList.add("hidden");
  } else {
    sel.value = "自定义";
    customInput.value = savedDistrict;
    customInput.classList.remove("hidden");
  }
}

function loadCityIntoSelect(prefix, savedCity) {
  const sel = document.getElementById(`${prefix}-city-select`);
  const customInput = document.getElementById(`${prefix}-city-custom`);
  if (!savedCity) {
    customInput.classList.add("hidden");
    return;
  }
  sel.value = savedCity;
  if (sel.value === savedCity) {
    customInput.classList.add("hidden");
  } else {
    sel.value = "自定义";
    customInput.value = savedCity;
    customInput.classList.remove("hidden");
  }
}

function loadHouseTypeIntoSelect(prefix, savedType) {
  const knownTypes = [
    "普通住宅",
    "公寓",
    "大平层",
    "别墅",
    "地下室",
    "阁楼",
    "树屋",
    "临海",
    "湖边",
    "下水管道",
  ];
  const sel = document.getElementById(`${prefix}-type`);
  const customInput = document.getElementById(`${prefix}-type-custom`);
  if (knownTypes.includes(savedType)) {
    addOptionIfMissing(sel, savedType, savedType);
    sel.value = savedType;
    customInput.classList.add("hidden");
  } else {
    sel.value = "自定义";
    customInput.value = savedType;
    customInput.classList.remove("hidden");
  }
  if (prefix === "edit-house") onEditHouseTypeChange();
  else onHouseTypeChange();
}

function getHousingCityValue(prefix) {
  const provSel = document.getElementById(`${prefix}-province-select`);
  if (provSel?.value === "custom") {
    return document.getElementById(`${prefix}-city-custom`)?.value.trim() || "";
  }
  const sel = document.getElementById(`${prefix}-city-select`);
  if (!sel) return "";
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

function addOptionIfMissing(sel, value, text) {
  if (!Array.from(sel.options).some((o) => o.value === value)) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = text;
    sel.appendChild(opt);
  }
}

// ── Province → City data ─────────────────────────────────
const CITY_DATA = {
  china: [
    { zh:"上海市", en:"Shanghai", municipality:true, cities:[
      {zh:"上海",en:"Shanghai"},{zh:"浦东新区",en:"Pudong"},{zh:"嘉定",en:"Jiading"},{zh:"松江",en:"Songjiang"},{zh:"青浦",en:"Qingpu"},{zh:"金山",en:"Jinshan"},
    ]},
    { zh:"北京市", en:"Beijing", municipality:true, cities:[
      {zh:"北京",en:"Beijing"},{zh:"海淀区",en:"Haidian"},{zh:"朝阳区",en:"Chaoyang"},{zh:"西城区",en:"Xicheng"},{zh:"通州区",en:"Tongzhou"},{zh:"顺义区",en:"Shunyi"},
    ]},
    { zh:"天津市", en:"Tianjin", municipality:true, cities:[
      {zh:"天津",en:"Tianjin"},{zh:"滨海新区",en:"Binhai"},{zh:"武清",en:"Wuqing"},{zh:"宝坻",en:"Baodi"},
    ]},
    { zh:"重庆市", en:"Chongqing", municipality:true, cities:[
      {zh:"重庆",en:"Chongqing"},{zh:"渝中区",en:"Yuzhong"},{zh:"江北区",en:"Jiangbei"},{zh:"南岸区",en:"Nan'an"},{zh:"渝北区",en:"Yubei"},{zh:"九龙坡区",en:"Jiulongpo"},
    ]},
    { zh:"广东省", en:"Guangdong", cities:[
      {zh:"广州",en:"Guangzhou"},{zh:"深圳",en:"Shenzhen"},{zh:"佛山",en:"Foshan"},{zh:"东莞",en:"Dongguan"},{zh:"珠海",en:"Zhuhai"},{zh:"汕头",en:"Shantou"},
      {zh:"中山",en:"Zhongshan"},{zh:"惠州",en:"Huizhou"},{zh:"江门",en:"Jiangmen"},{zh:"茂名",en:"Maoming"},{zh:"湛江",en:"Zhanjiang"},{zh:"肇庆",en:"Zhaoqing"},
    ]},
    { zh:"浙江省", en:"Zhejiang", cities:[
      {zh:"杭州",en:"Hangzhou"},{zh:"宁波",en:"Ningbo"},{zh:"温州",en:"Wenzhou"},{zh:"嘉兴",en:"Jiaxing"},{zh:"湖州",en:"Huzhou"},{zh:"绍兴",en:"Shaoxing"},
      {zh:"金华",en:"Jinhua"},{zh:"衢州",en:"Quzhou"},{zh:"舟山",en:"Zhoushan"},{zh:"台州",en:"Taizhou"},{zh:"丽水",en:"Lishui"},
    ]},
    { zh:"江苏省", en:"Jiangsu", cities:[
      {zh:"南京",en:"Nanjing"},{zh:"苏州",en:"Suzhou"},{zh:"无锡",en:"Wuxi"},{zh:"南通",en:"Nantong"},{zh:"常州",en:"Changzhou"},{zh:"扬州",en:"Yangzhou"},
      {zh:"徐州",en:"Xuzhou"},{zh:"盐城",en:"Yancheng"},{zh:"镇江",en:"Zhenjiang"},{zh:"泰州",en:"Taizhou"},{zh:"宿迁",en:"Suqian"},
    ]},
    { zh:"四川省", en:"Sichuan", cities:[
      {zh:"成都",en:"Chengdu"},{zh:"绵阳",en:"Mianyang"},{zh:"德阳",en:"Deyang"},{zh:"宜宾",en:"Yibin"},{zh:"乐山",en:"Leshan"},{zh:"自贡",en:"Zigong"},
      {zh:"泸州",en:"Luzhou"},{zh:"达州",en:"Dazhou"},{zh:"南充",en:"Nanchong"},{zh:"广安",en:"Guang'an"},{zh:"遂宁",en:"Suining"},
    ]},
    { zh:"湖北省", en:"Hubei", cities:[
      {zh:"武汉",en:"Wuhan"},{zh:"宜昌",en:"Yichang"},{zh:"襄阳",en:"Xiangyang"},{zh:"荆州",en:"Jingzhou"},{zh:"黄石",en:"Huangshi"},{zh:"十堰",en:"Shiyan"},{zh:"荆门",en:"Jingmen"},
    ]},
    { zh:"湖南省", en:"Hunan", cities:[
      {zh:"长沙",en:"Changsha"},{zh:"株洲",en:"Zhuzhou"},{zh:"湘潭",en:"Xiangtan"},{zh:"衡阳",en:"Hengyang"},{zh:"岳阳",en:"Yueyang"},{zh:"常德",en:"Changde"},
    ]},
    { zh:"陕西省", en:"Shaanxi", cities:[
      {zh:"西安",en:"Xi'an"},{zh:"咸阳",en:"Xianyang"},{zh:"宝鸡",en:"Baoji"},{zh:"汉中",en:"Hanzhong"},{zh:"渭南",en:"Weinan"},{zh:"延安",en:"Yan'an"},
    ]},
    { zh:"山东省", en:"Shandong", cities:[
      {zh:"青岛",en:"Qingdao"},{zh:"济南",en:"Jinan"},{zh:"烟台",en:"Yantai"},{zh:"潍坊",en:"Weifang"},{zh:"临沂",en:"Linyi"},{zh:"淄博",en:"Zibo"},
      {zh:"威海",en:"Weihai"},{zh:"日照",en:"Rizhao"},{zh:"济宁",en:"Jining"},{zh:"泰安",en:"Tai'an"},
    ]},
    { zh:"辽宁省", en:"Liaoning", cities:[
      {zh:"大连",en:"Dalian"},{zh:"沈阳",en:"Shenyang"},{zh:"鞍山",en:"Anshan"},{zh:"抚顺",en:"Fushun"},{zh:"本溪",en:"Benxi"},{zh:"锦州",en:"Jinzhou"},
    ]},
    { zh:"福建省", en:"Fujian", cities:[
      {zh:"厦门",en:"Xiamen"},{zh:"福州",en:"Fuzhou"},{zh:"泉州",en:"Quanzhou"},{zh:"漳州",en:"Zhangzhou"},{zh:"莆田",en:"Putian"},{zh:"南平",en:"Nanping"},
    ]},
    { zh:"云南省", en:"Yunnan", cities:[
      {zh:"昆明",en:"Kunming"},{zh:"大理",en:"Dali"},{zh:"丽江",en:"Lijiang"},{zh:"曲靖",en:"Qujing"},{zh:"玉溪",en:"Yuxi"},{zh:"西双版纳",en:"Xishuangbanna"},
    ]},
    { zh:"黑龙江省", en:"Heilongjiang", cities:[
      {zh:"哈尔滨",en:"Harbin"},{zh:"大庆",en:"Daqing"},{zh:"齐齐哈尔",en:"Qiqihar"},{zh:"牡丹江",en:"Mudanjiang"},
    ]},
    { zh:"安徽省", en:"Anhui", cities:[
      {zh:"合肥",en:"Hefei"},{zh:"芜湖",en:"Wuhu"},{zh:"马鞍山",en:"Ma'anshan"},{zh:"安庆",en:"Anqing"},{zh:"蚌埠",en:"Bengbu"},
    ]},
    { zh:"河南省", en:"Henan", cities:[
      {zh:"郑州",en:"Zhengzhou"},{zh:"洛阳",en:"Luoyang"},{zh:"开封",en:"Kaifeng"},{zh:"南阳",en:"Nanyang"},{zh:"新乡",en:"Xinxiang"},{zh:"许昌",en:"Xuchang"},
    ]},
    { zh:"海南省", en:"Hainan", cities:[
      {zh:"三亚",en:"Sanya"},{zh:"海口",en:"Haikou"},{zh:"琼海",en:"Qionghai"},{zh:"文昌",en:"Wenchang"},
    ]},
    { zh:"新疆", en:"Xinjiang", cities:[
      {zh:"乌鲁木齐",en:"Ürümqi"},{zh:"喀什",en:"Kashgar"},{zh:"克拉玛依",en:"Karamay"},{zh:"伊宁",en:"Yining"},
    ]},
    { zh:"西藏", en:"Tibet", cities:[
      {zh:"拉萨",en:"Lhasa"},{zh:"日喀则",en:"Shigatse"},{zh:"林芝",en:"Nyingchi"},
    ]},
    { zh:"内蒙古", en:"Inner Mongolia", cities:[
      {zh:"呼和浩特",en:"Hohhot"},{zh:"包头",en:"Baotou"},{zh:"赤峰",en:"Chifeng"},{zh:"鄂尔多斯",en:"Ordos"},
    ]},
    { zh:"河北省", en:"Hebei", cities:[
      {zh:"石家庄",en:"Shijiazhuang"},{zh:"唐山",en:"Tangshan"},{zh:"保定",en:"Baoding"},{zh:"秦皇岛",en:"Qinhuangdao"},{zh:"邯郸",en:"Handan"},
    ]},
    { zh:"山西省", en:"Shanxi", cities:[
      {zh:"太原",en:"Taiyuan"},{zh:"大同",en:"Datong"},{zh:"运城",en:"Yuncheng"},{zh:"临汾",en:"Linfen"},
    ]},
    { zh:"吉林省", en:"Jilin", cities:[
      {zh:"长春",en:"Changchun"},{zh:"吉林市",en:"Jilin City"},{zh:"延吉",en:"Yanji"},
    ]},
    { zh:"广西", en:"Guangxi", cities:[
      {zh:"南宁",en:"Nanning"},{zh:"桂林",en:"Guilin"},{zh:"柳州",en:"Liuzhou"},{zh:"北海",en:"Beihai"},
    ]},
    { zh:"江西省", en:"Jiangxi", cities:[
      {zh:"南昌",en:"Nanchang"},{zh:"赣州",en:"Ganzhou"},{zh:"景德镇",en:"Jingdezhen"},{zh:"九江",en:"Jiujiang"},
    ]},
    { zh:"贵州省", en:"Guizhou", cities:[
      {zh:"贵阳",en:"Guiyang"},{zh:"遵义",en:"Zunyi"},{zh:"安顺",en:"Anshun"},
    ]},
    { zh:"甘肃省", en:"Gansu", cities:[
      {zh:"兰州",en:"Lanzhou"},{zh:"天水",en:"Tianshui"},{zh:"嘉峪关",en:"Jiayuguan"},
    ]},
    { zh:"宁夏", en:"Ningxia", cities:[
      {zh:"银川",en:"Yinchuan"},{zh:"石嘴山",en:"Shizuishan"},
    ]},
    { zh:"青海省", en:"Qinghai", cities:[
      {zh:"西宁",en:"Xining"},{zh:"格尔木",en:"Golmud"},
    ]},
  ],
  overseas: [
    { group:"港澳台 HK · Macau · Taiwan", cities:[
      {zh:"香港",en:"Hong Kong"},{zh:"澳门",en:"Macau"},{zh:"台北",en:"Taipei"},{zh:"台中",en:"Taichung"},{zh:"高雄",en:"Kaohsiung"},{zh:"台南",en:"Tainan"},
    ]},
    { group:"日韩 Japan · Korea", cities:[
      {zh:"东京",en:"Tokyo"},{zh:"大阪",en:"Osaka"},{zh:"京都",en:"Kyoto"},{zh:"横滨",en:"Yokohama"},{zh:"神户",en:"Kobe"},{zh:"福冈",en:"Fukuoka"},
      {zh:"首尔",en:"Seoul"},{zh:"釜山",en:"Busan"},{zh:"济州",en:"Jeju"},
    ]},
    { group:"东南亚 Southeast Asia", cities:[
      {zh:"新加坡",en:"Singapore"},{zh:"曼谷",en:"Bangkok"},{zh:"吉隆坡",en:"Kuala Lumpur"},{zh:"雅加达",en:"Jakarta"},
      {zh:"马尼拉",en:"Manila"},{zh:"河内",en:"Hanoi"},{zh:"胡志明市",en:"Ho Chi Minh City"},{zh:"巴厘岛",en:"Bali"},
    ]},
    { group:"中东·南亚 Middle East · South Asia", cities:[
      {zh:"迪拜",en:"Dubai"},{zh:"阿布扎比",en:"Abu Dhabi"},{zh:"孟买",en:"Mumbai"},{zh:"德里",en:"Delhi"},{zh:"班加罗尔",en:"Bangalore"},
    ]},
    { group:"欧洲 Europe", cities:[
      {zh:"伦敦",en:"London"},{zh:"巴黎",en:"Paris"},{zh:"柏林",en:"Berlin"},{zh:"马德里",en:"Madrid"},{zh:"罗马",en:"Roma"},
      {zh:"阿姆斯特丹",en:"Amsterdam"},{zh:"布鲁塞尔",en:"Brussels"},{zh:"维也纳",en:"Wien / Vienna"},{zh:"苏黎世",en:"Zürich"},
      {zh:"日内瓦",en:"Genève / Geneva"},{zh:"巴塞罗那",en:"Barcelona"},{zh:"慕尼黑",en:"München / Munich"},
      {zh:"法兰克福",en:"Frankfurt"},{zh:"米兰",en:"Milano / Milan"},{zh:"哥本哈根",en:"København / Copenhagen"},
      {zh:"斯德哥尔摩",en:"Stockholm"},{zh:"赫尔辛基",en:"Helsinki"},{zh:"奥斯陆",en:"Oslo"},
      {zh:"华沙",en:"Warszawa / Warsaw"},{zh:"布拉格",en:"Praha / Prague"},{zh:"布达佩斯",en:"Budapest"},
      {zh:"莫斯科",en:"Москва / Moscow"},{zh:"圣彼得堡",en:"St. Petersburg"},
    ]},
    { group:"北美 North America", cities:[
      {zh:"纽约",en:"New York"},{zh:"洛杉矶",en:"Los Angeles"},{zh:"旧金山",en:"San Francisco"},{zh:"芝加哥",en:"Chicago"},
      {zh:"波士顿",en:"Boston"},{zh:"西雅图",en:"Seattle"},{zh:"迈阿密",en:"Miami"},{zh:"拉斯维加斯",en:"Las Vegas"},
      {zh:"华盛顿",en:"Washington D.C."},{zh:"多伦多",en:"Toronto"},{zh:"温哥华",en:"Vancouver"},{zh:"蒙特利尔",en:"Montréal"},
    ]},
    { group:"中南美 Latin America", cities:[
      {zh:"墨西哥城",en:"Ciudad de México"},{zh:"圣保罗",en:"São Paulo"},{zh:"里约热内卢",en:"Rio de Janeiro"},{zh:"布宜诺斯艾利斯",en:"Buenos Aires"},
    ]},
    { group:"大洋洲 Oceania", cities:[
      {zh:"悉尼",en:"Sydney"},{zh:"墨尔本",en:"Melbourne"},{zh:"布里斯班",en:"Brisbane"},{zh:"珀斯",en:"Perth"},{zh:"奥克兰",en:"Auckland"},
    ]},
    { group:"非洲 Africa", cities:[
      {zh:"开罗",en:"Cairo"},{zh:"约翰内斯堡",en:"Johannesburg"},{zh:"内罗毕",en:"Nairobi"},
    ]},
  ],
};

function buildCitySelectors(prefix) {
  const provSel = document.getElementById(`${prefix}-province-select`);
  const citySel = document.getElementById(`${prefix}-city-select`);
  const cityWrap = document.getElementById(`${prefix}-city-select-wrap`);
  if (!provSel || !citySel) return;

  // Build province options
  provSel.innerHTML = `<option value="" disabled selected hidden>选省份 / Select Province...</option>`;
  const chinaGroup = document.createElement("optgroup");
  chinaGroup.label = "中国内地 Mainland China";
  CITY_DATA.china.forEach(p => {
    const opt = document.createElement("option");
    opt.value = "cn:" + p.zh;
    opt.textContent = `${p.zh} ${p.en}`;
    chinaGroup.appendChild(opt);
  });
  provSel.appendChild(chinaGroup);

  CITY_DATA.overseas.forEach(region => {
    const opt = document.createElement("option");
    opt.value = "os:" + region.group;
    opt.textContent = region.group;
    provSel.appendChild(opt);
  });

  const customOpt = document.createElement("option");
  customOpt.value = "custom";
  customOpt.textContent = "自定义 Custom";
  provSel.appendChild(customOpt);
}

function onProvinceSelectChange(prefix) {
  const provSel = document.getElementById(`${prefix}-province-select`);
  const citySel = document.getElementById(`${prefix}-city-select`);
  const cityWrap = document.getElementById(`${prefix}-city-select-wrap`);
  const customInput = document.getElementById(`${prefix}-city-custom`);
  if (!provSel || !citySel) return;

  const val = provSel.value;
  if (val === "custom") {
    if (cityWrap) cityWrap.classList.add("hidden");
    if (customInput) customInput.classList.remove("hidden");
    return;
  }
  if (customInput) customInput.classList.add("hidden");

  let cities = [];
  let isMunicipality = false;
  let municipalityCity = null;
  if (val.startsWith("cn:")) {
    const zhName = val.slice(3);
    const prov = CITY_DATA.china.find(p => p.zh === zhName);
    if (prov) {
      cities = prov.cities;
      isMunicipality = !!prov.municipality;
      if (isMunicipality) municipalityCity = prov.cities[0]; // e.g. {zh:"上海", en:"Shanghai"}
    }
  } else if (val.startsWith("os:")) {
    const groupName = val.slice(3);
    const region = CITY_DATA.overseas.find(r => r.group === groupName);
    if (region) cities = region.cities;
  }

  if (isMunicipality && municipalityCity) {
    // Auto-set city value into the select (hidden), skip showing the dropdown
    if (cityWrap) cityWrap.classList.add("hidden");
    if (customInput) customInput.classList.add("hidden");
    citySel.innerHTML = "";
    const opt = document.createElement("option");
    opt.value = municipalityCity.zh;
    opt.textContent = `${municipalityCity.zh} ${municipalityCity.en}`;
    citySel.appendChild(opt);
    citySel.value = municipalityCity.zh;
  } else {
    citySel.innerHTML = `<option value="" disabled selected hidden>选城市 / Select City...</option>`;
    cities.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.zh;
      opt.textContent = `${c.zh} ${c.en}`;
      citySel.appendChild(opt);
    });
    if (cityWrap) cityWrap.classList.remove("hidden");
    citySel.value = "";
  }
  onCitySelectChange(prefix);
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
  marriage: {
    1: "单身/Single",
    2: "单身/Single",
    3: "离异/Divorced",
    4: "已配对/Mated",
    5: "已配对/Mated",
    6: "开放关系/Open Relationship",
  },
  pastRelCount: {
    1: "0",
    2: "1-2",
    3: "3-4",
    4: "5-6",
    5: "7-10",
    6: "10+",
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
    6: "3+",
  },
  currentPartner: {
    1: "无/None",
    2: "无/None",
    3: "无/None",
    4: "雄友 / Boyfriend",
    5: "雌友 / Girlfriend",
    6: "伴侣/Partner",
  },
  ambiguousCount: {
    1: "0",
    2: "0",
    3: "1",
    4: "2",
    5: "3",
    6: "很多/Many",
  },
  foreignPartner: {
    1: "否/No",
    2: "否/No",
    3: "否/No",
    4: "否/No",
    5: "是/Yes",
    6: "是/Yes",
  },
  otherCityPartner: {
    1: "否/No",
    2: "否/No",
    3: "同省/Same Province",
    4: "异省/Diff Province",
    5: "异省/Diff Province",
    6: "多个/Multiple",
  },
  partnerCount: {
    1: "1",
    2: "1",
    3: "2",
    4: "2",
    5: "3",
    6: "3+",
  },
  secretPartner: {
    1: "否/No",
    2: "否/No",
    3: "否/No",
    4: "否/No",
    5: "是/Yes",
    6: "是/Yes",
  },
  hasCrush: {
    1: "没有/None",
    2: "没有/None",
    3: "可能/Maybe",
    4: "有/Yes",
    5: "暗恋中/Secretly",
    6: "强烈迷恋/Intensely",
  },
  datingPurpose: {
    1: "孤独/Lonely",
    2: "炮友/FWB",
    3: "一夜情/ONS",
    4: "好玩/Just for Fun",
    5: "三人行/Threesome",
    6: "和伴侣吵架了/Fight w/ Partner",
  },
  relationshipGoal: {
    1: "结交朋友/Make Friends",
    2: "长期炮友/Long-term FWB",
    3: "搭子/Buddy",
    4: "雌雄伴侣 / Dating",
    5: "结婚对象/Marriage",
    6: "随缘/Whatever",
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
  vehiclePrice: { 1: "5w以下", 2: "5w-15w", 3: "15w-30w", 4: "30w-80w", 5: "80w-300w", 6: "300w+" },
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
  // 职业 / Occupation — only 企业高管 gets bonus
  "无业 / Unemployed": -10,
  "体力劳动 / Manual Labor": -5,
  "服务业 / Service Industry": -2,
  "办公室职员 / Office Worker": 0,
  "专业人士 / Professional": 0,
  "企业高管 / Executive": +12,
  // 婚恋状况 / Relationship status — only 单身 gets bonus
  "单身/Single": +5,
  "离异/Divorced": -3,
  "已配对/Mated": -5,
  "开放关系/Open Relationship": -8,
  // 车辆价值 / Vehicle value — real price tiers
  "5w以下": -8, "5w-15w": -3, "15w-30w": 0, "30w-80w": +3, "80w-300w": +8, "300w+": +15,
  // bicycle
  "500元以下": -8, "500-2000元": -6, "2000元-1w": -4, "1w-5w": -2, "5w-30w": 0, "30w+": +2,
  // ebike
  "2000元以下": -8, "2000-5000元": -6, "5000元-1w": -4, "1w-2w": -2, "2w-5w": 0, "5w+": +1,
  // motorcycle
  "5000元以下": -6, "5000元-2w": -3, "2w-5w": 0, "5w-15w": +2, "15w-50w": +5, "50w+": +8,
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

// Bilingual display map for Chinese-only tier values
const DISP = {
  // house type (base)
  下水管道: "下水管道 / Pipe Shack",
  地下室: "地下室 / Basement",
  普通住宅: "普通住宅 / Regular",
  公寓: "公寓 / Apt",
  大平层: "大平层 / Open Plan",
  别墅: "别墅 / Villa",
  // city/region special types
  四合院: "四合院 / Courtyard House ✨",
  老洋房: "老洋房 / Heritage Villa ✨",
  石库门: "石库门 / Shikumen",
  吊脚楼: "吊脚楼 / Stilt House",
  蒙古包: "蒙古包 / Yurt",
  水乡民居: "水乡民居 / Waterside Home",
  窑洞: "窑洞 / Cave Dwelling",
  平顶房: "平顶房 / Flat-roof House",
  土楼: "土楼 / Earthen Tower",
  碉房: "碉房 / Stone Tower House",
  东北民居: "东北民居 / NE Homestead",
  // garden
  无院子: "无院子 / No Garden",
  有院子: "有院子 / Garden ✨",
  // tenure
  租住中: "租住中 / Renting",
  购买: "购买 / Owned",
  // ownership
  父母名下: "父母名下 / Parents",
  自己名下: "自己名下 / Self ✨",
  // mortgage
  有房贷: "有房贷 / Mortgaged",
  无房贷: "无房贷 / Paid Off ✨",
  // education
  小学: "小学 / Primary",
  初中: "初中 / Middle",
  高中: "高中 / High School",
  大专: "大专 / Associate",
  本科: "本科 / Bachelor",
  "硕士+": "硕士+ / Master+",
  // occupation
  无业: "无业 / Unemployed",
  体力劳动: "体力劳动 / Labor",
  服务业: "服务业 / Service",
  办公室职员: "办公室职员 / Office",
  专业人士: "专业人士 / Professional",
  企业高管: "企业高管 / Executive",
  // income (dice)
  "3k以下": "3k以下 / <¥3k",
  "3k-8k": "3k-8k / ¥3k-8k",
  "8k-15k": "8k-15k / ¥8k-15k",
  "15k-30k": "15k-30k / ¥15k-30k",
  "3w-10w/月": "3w-10w/月 / ¥30k-100k",
  "10w+/月": "10w+/月 / ¥100k+",
  // vehicle price
  "5w以下": "5w以下 / <¥50k",
  "5w-15w": "5w-15w / ¥50k-150k",
  "15w-30w": "15w-30w / ¥150k-300k",
  "30w-80w": "30w-80w / ¥300k-800k",
  "80w-300w": "80w-300w / ¥800k-3M",
  "300w+": "300w+ / ¥3M+",
  // parents status
  "都健在": "都健在 / Both Alive ✨",
  "仅父亲健在": "仅父亲健在 / Father Alive",
  "仅母亲健在": "仅母亲健在 / Mother Alive",
  "均已故": "均已故 / Both Passed",
  // siblings
  "独生/Only Child": "独生 / Only Child",
  "1个/1 Sibling": "1个兄弟姐妹 / 1 Sibling",
  "2个/2 Siblings": "2个兄弟姐妹 / 2 Siblings",
  "3个/3 Siblings": "3个兄弟姐妹 / 3 Siblings",
  "4个+/4+ Siblings": "4个+兄弟姐妹 / 4+ Siblings",
  "经济困难": "经济困难 / Struggling",
  "普通": "普通 / Average",
  "小康": "小康 / Comfortable",
  "富裕": "富裕 / Wealthy",
  "富裕✨": "富裕 ✨ / Very Wealthy ✨",
  // district / neighborhood
  "郊区": "郊区 / Suburb",
  "老城区": "老城区 / Old Town",
  "新区": "新区 / New District",
  "学区": "学区 / School Zone",
  "科技园区": "科技园区 / Tech Zone",
  "市中心": "市中心 / City Center",
  "滨水区": "滨水区 / Waterfront",
  "豪华住宅区": "豪华住宅区 / Luxury Zone",
  // apt floor
  "1-5层": "1-5层",
  "6-10层": "6-10层",
  "11-20层": "11-20层",
  "21-30层": "21-30层",
  "31-40层": "31-40层",
  "40层以上": "40层+",
  // apt total floors
  "6层以下": "共6层以下",
  "10层": "共10层",
  "18层": "共18层",
  "28层": "共28层",
  "35层": "共35层",
  "50层以上": "共50层+",
  // villa floors
  "1层独栋": "1层独栋 / 1-Story",
  "2层别墅": "2层别墅 / 2-Story Villa",
  "3层别墅": "3层别墅 / 3-Story Villa",
  "4层及以上": "4层及以上 / 4F+",
  // house price (cheap tier)
  "5w": "5w / ¥50k",
  "10w": "10w / ¥100k",
  "20w": "20w / ¥200k",
  "30w": "30w / ¥300k",
  "80w": "80w / ¥800k",
  // house price (mid tier)
  "200w": "200w / ¥2M",
  "350w": "350w / ¥3.5M",
  "600w": "600w / ¥6M",
  "1500w": "1500w / ¥15M",
  // house price (luxury tier)
  "5000w+": "5000w+ / ¥50M+",
  // vehicle price (bicycle)
  "500元以下": "500元以下 / <¥500",
  "500-2000元": "500-2000元 / ¥500-2k",
  "2000元-1w": "2000元-1w / ¥2k-10k",
  "1w-5w": "1w-5w / ¥10k-50k",
  "5w-30w": "5w-30w / ¥50k-300k",
  "30w+": "30w+ / ¥300k+",
  // vehicle price (ebike)
  "2000元以下": "2000元以下 / <¥2k",
  "2000-5000元": "2000-5000元 / ¥2k-5k",
  "5000元-1w": "5000元-1w / ¥5k-10k",
  "1w-2w": "1w-2w / ¥10k-20k",
  "2w-5w": "2w-5w / ¥20k-50k",
  "5w+": "5w+ / ¥50k+",
  // vehicle price (motorcycle)
  "5000元以下": "5000元以下 / <¥5k",
  "5000元-2w": "5000元-2w / ¥5k-20k",
  "2w-5w": "2w-5w / ¥20k-50k",
  "5w-15w": "5w-15w / ¥50k-150k",
  "15w-50w": "15w-50w / ¥150k-500k",
  "50w+": "50w+ / ¥500k+",
  // vehicle price (regular car)
  "3w以下": "3w以下 / <¥30k",
  "3w-8w": "3w-8w / ¥30k-80k",
  "8w-15w": "8w-15w / ¥80k-150k",
  "15w-25w": "15w-25w / ¥150k-250k",
  "25w-40w": "25w-40w / ¥250k-400k",
  "40w-80w": "40w-80w / ¥400k-800k",
  // vehicle price (luxury car)
  "30w-60w": "30w-60w / ¥300k-600k",
  "60w-100w": "60w-100w / ¥600k-1M",
  "100w-200w": "100w-200w / ¥1M-2M",
  "200w-500w": "200w-500w / ¥2M-5M",
  "500w-1000w": "500w-1000w / ¥5M-10M",
  "1000w+": "1000w+ / ¥10M+",
  // extra edu
  "博士/PhD": "博士 / PhD",
  "硕士/Master": "硕士 / Master",
  "本科/Bachelor": "本科 / Bachelor",
  "大专/Associate": "大专 / Associate",
  "高中/High School": "高中 / High School",
  "初中/Middle School": "初中 / Middle School",
  "小学/Primary": "小学 / Primary",
  // marriage/sterilized
  "单身/Single": "单身 / Single",
  "已配对/Mated": "已配对 / Mated",
  "开放关系/Open": "开放关系 / Open",
  "开放关系/Open Relationship": "开放关系 / Open Rel.",
  "离异/Divorced": "离异 / Divorced",
  // orientation
  "异性恋/Straight": "异性恋 / Straight",
  "同性恋/Gay·Lesbian": "同性恋 / Gay & Lesbian",
  "双性恋/Bisexual": "双性恋 / Bisexual",
  "泛性恋/Pansexual": "泛性恋 / Pansexual",
  "无性恋/Asexual": "无性恋 / Asexual",
  "不透露/Prefer not to say": "不透露 / Prefer Not to Say",
  "自定义/Custom": "自定义 / Custom",
  // gender
  "雄/Male": "雄 / Male",
  "雌/Female": "雌 / Female",
  "非二元/Non-binary": "非二元 / Non-binary",
  // parents relationship (already has /)
  "离婚/Divorced": "离婚 / Divorced",
  "冷战/Cold War": "冷战 / Cold War",
  "普通/Ordinary": "普通 / Ordinary",
  "和睦/Harmonious": "和睦 / Harmonious",
  "恩爱/Loving": "恩爱 / Loving",
  "神仙眷侣/Perfect Couple ✨": "神仙眷侣 / Perfect Couple ✨",
};
function disp(v) {
  return DISP[v] || v;
}

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
        const city = document.getElementById(`${prefix}-city-select`)?.value || "";
        const typeTier = getHouseTypeTier(city);
        const rawValue = typeTier[roll];
        value = Array.isArray(rawValue) ? rawValue[Math.floor(Math.random() * rawValue.length)] : rawValue;
        text = disp(value);
        document.getElementById(`${prefix}-type`).value = value;
        const isVilla = value === "别墅" || value === "四合院" || value === "老洋房";
        const isApt = value === "公寓" || value === "大平层" || value === "普通住宅" || value === "石库门";
        document
          .getElementById(`${prefix}-villa-wrapper`)
          .classList.toggle("hidden", !isVilla);
        document
          .getElementById(`${prefix}-garden-section`)
          .classList.toggle("hidden", !isVilla);
        document
          .getElementById(`${prefix}-apt-floors-wrapper`)
          ?.classList.toggle("hidden", !isApt);
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
          const totalSec = document.getElementById(`${prefix}-apt-total-section`);
          if (totalSec) totalSec.classList.add("hidden");
        }
        // Show price wrapper and set price tier key based on house type
        const priceTierKey = (value === "下水管道" || value === "地下室") ? "cheap"
          : (value === "别墅" || value === "四合院" || value === "老洋房") ? "luxury"
          : (value === "公寓" || value === "大平层" || value === "老洋房" || value === "石库门") ? "high"
          : "mid";
        const priceWrapper = document.getElementById(`${prefix}-price-wrapper`);
        if (priceWrapper) {
          priceWrapper.classList.remove("hidden");
          priceWrapper.dataset.priceTier = priceTierKey;
        }
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
        const ownerSec = document.getElementById(`${prefix}-ownership-section`);
        const mortgageWrap = document.getElementById(
          `${prefix}-mortgage-wrapper`,
        );
        if (ownerSec) ownerSec.classList.toggle("hidden", !isBuying);
        if (mortgageWrap) mortgageWrap.classList.toggle("hidden", !isBuying);
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
        // Show total-floors section and reset it
        const totalSec = document.getElementById(`${prefix}-apt-total-section`);
        if (totalSec) {
          totalSec.classList.remove("hidden");
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

// Legacy dice kept for edit form
function rollHousingDice(field, prefix, btnId, displayId) {
  const btn = document.getElementById(btnId);
  const display = document.getElementById(displayId);
  if (!btn || !display) return;
  btn.disabled = true;
  let count = 0;
  const interval = setInterval(() => {
    display.innerHTML = diceFaceImg(Math.floor(Math.random() * 6) + 1, 4);
    count++;
    if (count >= 16) {
      clearInterval(interval);
      const result = Math.floor(Math.random() * 6) + 1;
      display.innerHTML = diceFaceImg(result, 4);
      if (result === 6) {
        const p = prefix === "house" ? "house" : "edit-house";
        if (field === "price") {
          const prices = [
            "1000w",
            "1500w",
            "2000w",
            "3000w",
            "5000w",
            "8000w",
            "1亿",
            "3亿",
          ];
          document.getElementById(`${p}-price`).value =
            prices[Math.floor(Math.random() * prices.length)];
          setTimeout(() => {
            display.innerHTML = diceFaceImg(6, 4) + " !!!";
          }, 100);
        }
      }
      btn.disabled = false;
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
    return custom ? custom.value.trim() || sel.value : sel.value;
  }
  return sel.value;
}

function onHouseTypeChange() {
  const el = document.getElementById("house-type");
  if (!el) return;
  const type = el.value;
  const villaWrapper = document.getElementById("house-villa-wrapper");
  if (villaWrapper) villaWrapper.classList.toggle("hidden", type !== "别墅");
  const aptWrapper = document.getElementById("house-apt-floors-wrapper");
  if (aptWrapper) aptWrapper.classList.toggle("hidden", type !== "公寓" && type !== "大平层");
  const customInput = document.getElementById("house-type-custom");
  if (customInput) customInput.classList.toggle("hidden", type !== "自定义");
}

function onHouseOwnershipChange() {
  const ownership = document.getElementById("house-ownership");
  if (!ownership) return;
  const mortgageWrap = document.getElementById("house-mortgage-wrapper");
  if (mortgageWrap)
    mortgageWrap.classList.toggle("hidden", ownership.value === "租住中");
}

function onEditHouseTypeChange() {
  const type = document.getElementById("edit-house-type").value;
  document
    .getElementById("edit-house-villa-wrapper")
    .classList.toggle("hidden", type !== "别墅");
  document
    .getElementById("edit-house-type-custom")
    .classList.toggle("hidden", type !== "自定义");
}

function onEditHouseOwnershipChange() {
  const ownership = document.getElementById("edit-house-ownership").value;
  document
    .getElementById("edit-house-mortgage-wrapper")
    .classList.toggle("hidden", ownership === "租住中");
}

function getEditHousingDescription() {
  const city = getHousingCityValue("edit-house");
  const cityDisplay = getCityDisplayName("edit-house");
  const district = getHousingDistrictValue("edit-house");
  const type = getHouseTypeValue("edit-house");
  const villaFloors = document.getElementById("edit-house-villa-floors")?.value || "";
  const garden = document.getElementById("edit-house-garden").value;
  const area = document.getElementById("edit-house-area").value.trim();
  const aptFloor = document.getElementById("edit-house-apt-floor")?.value.trim() || document.getElementById("edit-house-floor")?.value.trim() || "";
  const aptTotal = document.getElementById("edit-house-apt-total")?.value.trim() || document.getElementById("edit-house-total-floors")?.value.trim() || "";
  const price = document.getElementById("edit-house-price").value.trim();
  const ownership = document.getElementById("edit-house-ownership").value;
  const mortgageWrapper = document.getElementById(
    "edit-house-mortgage-wrapper",
  );
  const mortgage = mortgageWrapper.classList.contains("hidden")
    ? ""
    : document.getElementById("edit-house-mortgage").value;

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

function getCityDisplayName(prefix) {
  const provSel = document.getElementById(`${prefix}-province-select`);
  if (provSel?.value === "custom") {
    return document.getElementById(`${prefix}-city-custom`)?.value.trim() || "";
  }
  const sel = document.getElementById(`${prefix}-city-select`);
  if (!sel?.value) return "";
  const cityZh = sel.value;
  const optText = sel.options[sel.selectedIndex]?.textContent.trim() || "";
  const spaceIdx = optText.indexOf(" ");
  if (spaceIdx > 0) {
    const engPart = optText.slice(spaceIdx + 1);
    return `${cityZh} / ${engPart}`;
  }
  return cityZh;
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

function onBreedClassChange() {
  const cls = document.getElementById("petBreedClass").value;

  document.getElementById("petBreedSubgroup").innerHTML =
    '<option value="" disabled selected hidden>选择细类 / Select subgroup...</option>';
  document.getElementById("petBreedSubSubgroup").innerHTML =
    '<option value="" disabled selected hidden>选择子类 / Select sub-group...</option>';
  document.getElementById("petBreed").innerHTML =
    '<option value="" disabled selected hidden>选择物种 / Select species...</option>';
  document.getElementById("breedSubSubgroupWrapper").classList.add("hidden");
  document.getElementById("heightWrapper").classList.add("hidden");
  document.getElementById("petHeight").innerHTML =
    '<option value="" disabled selected hidden>选择身高 / Select height...</option>';

  if (breedSubgroups[cls]) {
    const sgSelect = document.getElementById("petBreedSubgroup");
    Object.keys(breedSubgroups[cls]).forEach((sg) => {
      const opt = document.createElement("option");
      opt.value = sg;
      opt.textContent = sg;
      sgSelect.appendChild(opt);
    });
    document.getElementById("breedSubgroupWrapper").classList.remove("hidden");
    document.getElementById("breedSpecificWrapper").classList.add("hidden");
  } else {
    document.getElementById("breedSubgroupWrapper").classList.add("hidden");
    const select = document.getElementById("petBreed");
    (breedData[cls] || []).forEach((b) => {
      const opt = document.createElement("option");
      opt.value = b;
      opt.textContent = b;
      select.appendChild(opt);
    });
    document.getElementById("breedSpecificWrapper").classList.remove("hidden");
    updateHeightOptions();
  }
}

function onBreedSubgroupChange() {
  const cls = document.getElementById("petBreedClass").value;
  const sg = document.getElementById("petBreedSubgroup").value;
  const val = (breedSubgroups[cls] || {})[sg];

  document.getElementById("petBreedSubSubgroup").innerHTML =
    '<option value="" disabled selected hidden>选择子类 / Select sub-group...</option>';
  document.getElementById("petBreed").innerHTML =
    '<option value="" disabled selected hidden>选择物种 / Select species...</option>';
  document.getElementById("heightWrapper").classList.add("hidden");

  if (val && !Array.isArray(val)) {
    // Nested: show sub-subgroup picker
    const ssgSelect = document.getElementById("petBreedSubSubgroup");
    Object.keys(val).forEach((ssg) => {
      const opt = document.createElement("option");
      opt.value = ssg;
      opt.textContent = ssg;
      ssgSelect.appendChild(opt);
    });
    document
      .getElementById("breedSubSubgroupWrapper")
      .classList.remove("hidden");
    document.getElementById("breedSpecificWrapper").classList.add("hidden");
  } else {
    // Flat: show species directly
    document.getElementById("breedSubSubgroupWrapper").classList.add("hidden");
    const select = document.getElementById("petBreed");
    (val || []).forEach((b) => {
      const opt = document.createElement("option");
      opt.value = b;
      opt.textContent = b;
      select.appendChild(opt);
    });
    document.getElementById("breedSpecificWrapper").classList.remove("hidden");
    updateHeightOptions();
  }
}

function onBreedSubSubgroupChange() {
  const cls = document.getElementById("petBreedClass").value;
  const sg = document.getElementById("petBreedSubgroup").value;
  const ssg = document.getElementById("petBreedSubSubgroup").value;
  const select = document.getElementById("petBreed");
  select.innerHTML =
    '<option value="" disabled selected hidden>选择物种 / Select species...</option>';
  (((breedSubgroups[cls] || {})[sg] || {})[ssg] || []).forEach((b) => {
    const opt = document.createElement("option");
    opt.value = b;
    opt.textContent = b;
    select.appendChild(opt);
  });
  document.getElementById("breedSpecificWrapper").classList.remove("hidden");
  document.getElementById("heightWrapper").classList.add("hidden");
  updateHeightOptions();
}

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

function _breed2AddOptions(select, list) {
  const exclude = document.getElementById("petBreed")?.value || "";
  list.forEach((b) => {
    if (b === exclude) return;
    const opt = document.createElement("option");
    opt.value = b;
    opt.textContent = b;
    select.appendChild(opt);
  });
}

function onBreedClass2Change() {
  const cls = document.getElementById("petBreedClass2").value;
  document.getElementById("petBreedSubgroup2").innerHTML =
    '<option value="" disabled selected hidden>选择细类 / Select subgroup...</option>';
  document.getElementById("petBreed2").innerHTML =
    '<option value="" disabled selected hidden>选择物种 / Select species...</option>';
  document.getElementById("breedSubSubgroupWrapper2").classList.add("hidden");
  document.getElementById("heightWrapper").classList.add("hidden");

  if (breedSubgroups[cls]) {
    const sgSelect = document.getElementById("petBreedSubgroup2");
    Object.keys(breedSubgroups[cls]).forEach((sg) => {
      const opt = document.createElement("option");
      opt.value = sg;
      opt.textContent = sg;
      sgSelect.appendChild(opt);
    });
    document.getElementById("breedSubgroupWrapper2").classList.remove("hidden");
    document.getElementById("breedSpecificWrapper2").classList.add("hidden");
  } else {
    document.getElementById("breedSubgroupWrapper2").classList.add("hidden");
    _breed2AddOptions(
      document.getElementById("petBreed2"),
      breedData[cls] || [],
    );
    document.getElementById("breedSpecificWrapper2").classList.remove("hidden");
  }
}

function onBreedSubgroup2Change() {
  const cls = document.getElementById("petBreedClass2").value;
  const sg = document.getElementById("petBreedSubgroup2").value;
  const val = (breedSubgroups[cls] || {})[sg];

  document.getElementById("petBreedSubSubgroup2").innerHTML =
    '<option value="" disabled selected hidden>选择子类 / Select sub-group...</option>';
  document.getElementById("petBreed2").innerHTML =
    '<option value="" disabled selected hidden>选择物种 / Select species...</option>';
  document.getElementById("heightWrapper").classList.add("hidden");

  if (val && !Array.isArray(val)) {
    const ssgSelect = document.getElementById("petBreedSubSubgroup2");
    Object.keys(val).forEach((ssg) => {
      const opt = document.createElement("option");
      opt.value = ssg;
      opt.textContent = ssg;
      ssgSelect.appendChild(opt);
    });
    document
      .getElementById("breedSubSubgroupWrapper2")
      .classList.remove("hidden");
    document.getElementById("breedSpecificWrapper2").classList.add("hidden");
  } else {
    document.getElementById("breedSubSubgroupWrapper2").classList.add("hidden");
    _breed2AddOptions(document.getElementById("petBreed2"), val || []);
    document.getElementById("breedSpecificWrapper2").classList.remove("hidden");
  }
}

function onBreedSubSubgroup2Change() {
  const cls = document.getElementById("petBreedClass2").value;
  const sg = document.getElementById("petBreedSubgroup2").value;
  const ssg = document.getElementById("petBreedSubSubgroup2").value;
  const select = document.getElementById("petBreed2");
  select.innerHTML =
    '<option value="" disabled selected hidden>选择物种 / Select species...</option>';
  _breed2AddOptions(select, ((breedSubgroups[cls] || {})[sg] || {})[ssg] || []);
  document.getElementById("breedSpecificWrapper2").classList.remove("hidden");
  document.getElementById("heightWrapper").classList.add("hidden");
}

// Create Profile & Swipe Function
let profiles = [];
let currentIndex = 0;
function createCard() {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  const name = document.getElementById("petName").value;
  const breedClass = document.getElementById("petBreedClass").value;
  const breedSpecific = document.getElementById("petBreed").value;
  const breed =
    breedClass && breedSpecific
      ? `${breedClass} · ${breedSpecific}`
      : breedSpecific || breedClass;
  const isMixed = document.getElementById("isMixed")?.checked || false;
  const breedClass2 = document.getElementById("petBreedClass2")?.value || "";
  const breedSpecific2 = document.getElementById("petBreed2")?.value || "";
  const breed2 = isMixed
    ? breedClass2 && breedSpecific2
      ? `${breedClass2} · ${breedSpecific2}`
      : breedSpecific2 || breedClass2
    : "";
  const height = document.getElementById("petHeight").value;
  const gender = document.getElementById("petGender").value;
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
  const houseData = {
    city: getHousingCityValue("house"),
    district: getHousingDistrictValue("house"),
    type: getHouseTypeValue("house"),
    villaFloors: document.getElementById("house-villa-floors").value,
    garden: document.getElementById("house-garden").value,
    area: document.getElementById("house-area").value.trim(),
    villaFloors: document.getElementById("house-villa-floors").value,
    aptFloor: document.getElementById("house-apt-floor")?.value.trim() || "",
    aptTotal: document.getElementById("house-apt-total")?.value.trim() || "",
    price: document.getElementById("house-price").value.trim(),
    ownership: document.getElementById("house-ownership").value,
    mortgage: document
      .getElementById("house-mortgage-wrapper")
      .classList.contains("hidden")
      ? ""
      : document.getElementById("house-mortgage").value,
  };

  const vehicleTypes = (document.getElementById("vehicle-types-hidden")?.value || "").split(",").filter(Boolean);
  const vehicleData = {
    types: vehicleTypes,
    model: document.getElementById("vehicle-model")?.value || "",
    count: document.getElementById("vehicle-count")?.value || "",
    price: document.getElementById("vehicle-price")?.value || "",
  };

  const parentsData = {
    status: document.getElementById("parents-status")?.value || "",
    fatherOrigin: getCityDisplayName("parents-father"),
    motherOrigin: getCityDisplayName("parents-mother"),
    siblingCount: document.getElementById("parents-siblingCount")?.value || "",
    siblingWealth: document.getElementById("parents-siblingWealth")?.value || "",
  };

  const g = (id) => document.getElementById(id)?.value || "";
  const relationshipData = {
    status: g("petSterilized"),
    pastRelCount: g("rel-pastCount"),
    exContact: g("rel-exContact"),
    stillLoveEx: g("rel-stillLoveEx"),
    whiteMoonlight: g("rel-whiteMoon"),
    kids: g("rel-kids"),
    currentPartner: g("rel-partner"),
    partnerCount: g("rel-partnerCount"),
    ambiguous: g("rel-ambiguous"),
    foreignPartner: g("rel-foreignPartner"),
    otherCityPartner: g("rel-otherCity"),
    secretPartner: g("rel-secret"),
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
    grid: grid,
    gridText: currentText,
  };

  // send the profile data to the server
  fetch("/profiles", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(profile),
  })
    .then((res) => res.json())
    .then((data) => {
      currentUser = data;
      console.log("Saved profile:", data);
      startMessagePolling();
    });

  // render the card exactly like the swipe view
  const _sd = new Date();
  const stampDate = `${_sd.getFullYear()}.${String(_sd.getMonth()+1).padStart(2,"0")}.${String(_sd.getDate()).padStart(2,"0")}`;
  const stampColorClass = finalScore < 60 ? "stamp-red" : "";
  const avatarSrc = renderGridAsAvatar(grid, currentText);
  const horoscope = getHoroscope(document.getElementById("birthDisplay")?.value);
  const vehicleStr = fmt([
    vehicleData.types?.length ? vehicleData.types.join(" ") : null,
    vehicleData.model || null,
    vehicleData.count ? disp(vehicleData.count) : null,
    vehicleData.price ? disp(vehicleData.price) : null,
  ].filter(Boolean).join(" ") || "—");
  const siblingStr = (() => {
    const cnt = parentsData.siblingCount;
    if (!cnt || cnt === "独生/Only Child") return cnt ? disp(cnt) : null;
    const wealth = parentsData.siblingWealth ? disp(parentsData.siblingWealth) : null;
    return [disp(cnt), wealth].filter(Boolean).join(" ");
  })();
  const parentsStr = fmt([
    parentsData.status ? disp(parentsData.status) : null,
    parentsData.fatherOrigin ? `父 ${parentsData.fatherOrigin}` : null,
    parentsData.motherOrigin ? `母 ${parentsData.motherOrigin}` : null,
    siblingStr,
  ].filter(Boolean).join(" · ") || "—");
  const rel = relationshipData;

  document.getElementById("petCard").innerHTML = `
<div class="profile-score-stamp ${stampColorClass}">
  <span class="stamp-date">${stampDate}</span>
  <span class="stamp-num">${finalScore}</span>
  <span class="stamp-lines"><span></span><span></span></span>
</div>
<div class="avatar-box"><img src="${avatarSrc}" class="avatar"></div>
<div class="section">
  <span class="label">名字 <small>Name</small></span>
  <span class="value big">${fmt(name || "无名兽人 Unnamed Anthro")}</span>
</div>
<div class="section">
  <span class="label">物种 <small>Species</small></span>
  <span class="value territory">${fmt((() => { const sp = (v) => { if(!v) return ""; const p=v.split(" · "); return p.length>1?p.slice(1).join(" · "):v; }; return sp(breed) + (isMixed && breed2 ? ` × ${sp(breed2)}（混血 Mixed）` : ""); })())}</span>
</div>
<div class="grid-3">
  <div class="cell"><span class="label">性别 <small>Gender</small></span><span class="value">${fmt(gender || "—")}</span></div>
  <div class="cell"><span class="label">年龄 <small>Age</small></span><span class="value">${fmt(age || "—")}</span></div>
  <div class="cell"><span class="label">身高 <small>Height</small></span><span class="value">${fmt(height || "—")}</span></div>
</div>
<div class="grid-2">
  <div class="cell"><span class="label">性取向 <small>Orientation</small></span><span class="value">${fmt(orientation || "—")}</span></div>
  <div class="cell"><span class="label">婚恋 <small>Status</small></span><span class="value">${fmt(sterilized || "—")}</span></div>
</div>
<div class="section">
  <span class="label">领地 <small>Territory</small></span>
  <span class="value territory">${fmt(hukou || "—")}</span>
</div>
<div class="grid-2">
  <div class="cell"><span class="label">目的 <small>Here For</small></span><span class="value">${fmt(rel.datingPurpose || "—")}</span></div>
  <div class="cell"><span class="label">期望关系 <small>Looking For</small></span><span class="value">${fmt(rel.relationshipGoal || "—")}</span></div>
</div>
<div class="grid-3">
  <div class="cell"><span class="label">目前伴侣 <small>Partner</small></span><span class="value">${fmt(rel.currentPartner || "—")}</span></div>
  <div class="cell"><span class="label">伴侣数量 <small># Partners</small></span><span class="value">${fmt(rel.partnerCount || "—")}</span></div>
  <div class="cell"><span class="label">子女 <small>Kids</small></span><span class="value">${fmt(rel.kids || "—")}</span></div>
</div>
<div class="grid-3">
  <div class="cell"><span class="label">暗恋 <small>Crush</small></span><span class="value">${fmt(rel.crush || "—")}</span></div>
  <div class="cell"><span class="label">暧昧 <small>Ambiguous</small></span><span class="value">${fmt(rel.ambiguous || "—")}</span></div>
  <div class="cell"><span class="label">秘密伴侣 <small>Secret</small></span><span class="value">${fmt(rel.secretPartner || "—")}</span></div>
</div>
<div class="grid-3">
  <div class="cell"><span class="label">境外伴侣 <small>Foreign</small></span><span class="value">${fmt(rel.foreignPartner || "—")}</span></div>
  <div class="cell"><span class="label">异地伴侣 <small>Long Dist</small></span><span class="value">${fmt(rel.otherCityPartner || "—")}</span></div>
  <div class="cell"><span class="label">白月光 <small>Moonlight</small></span><span class="value">${fmt(rel.whiteMoonlight || "—")}</span></div>
</div>
<div class="grid-3">
  <div class="cell"><span class="label">谈过 <small>Past Rels</small></span><span class="value">${fmt(rel.pastRelCount || "—")}</span></div>
  <div class="cell"><span class="label">前任联系 <small>Ex Contact</small></span><span class="value">${fmt(rel.exContact || "—")}</span></div>
  <div class="cell"><span class="label">还爱前任 <small>Still Love Ex</small></span><span class="value">${fmt(rel.stillLoveEx || "—")}</span></div>
</div>
<div class="grid-2">
  <div class="cell"><span class="label">MBTI</span><span class="value big">${mbti || "—"}</span></div>
  <div class="cell"><span class="label">星座 <small>Horoscope</small></span><span class="value">${fmt(horoscope || "—")}</span></div>
</div>
<div class="grid-3">
  <div class="cell"><span class="label">学历 <small>Education</small></span><span class="value">${fmt(edu || "—")}</span></div>
  <div class="cell"><span class="label">职业 <small>Job</small></span><span class="value">${fmt(occupation || "—")}</span></div>
  <div class="cell"><span class="label">月收入 <small>Income</small></span><span class="value">${fmt(income || "—")}</span></div>
</div>
<div class="section">
  <span class="label">兴趣爱好 <small>Hobbies</small></span>
  <span class="value">${fmt(hobby || "—")}</span>
</div>
<div class="section">
  <span class="label">车 <small>Vehicles</small></span>
  <span class="value">${vehicleStr}</span>
</div>
<div class="section">
  <span class="label">家庭状况 <small>Family</small></span>
  <span class="value">${parentsStr}</span>
</div>
`;

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

function createSwipeCard() {
  if (!currentUser) {
    alert("请先登录 / Please login first");
    goTo("login");
    return;
  }
  checkNotifications();
  //Get profiles from profiles.json
  fetch("/profiles")
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
      startOnboarding();
      _startProfileDataRefresh();
    });
}

let _profileRefreshTimer = null;
function _startProfileDataRefresh() {
  if (_profileRefreshTimer) clearInterval(_profileRefreshTimer);
  _profileRefreshTimer = setInterval(() => {
    fetch("/profiles")
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
// tier: 0=堕落(+3) 1=兽人特色/有意思(+2) 2=运动(+2) 3=科技/科学(+1) 4=健康养生(0) 5=艺术/文学/音乐/知识(-1,装)
// badges are never shown to users — scoring is silent
const HOBBY_CATEGORIES = [
  {
    zh: "兽人特色",
    en: "Anthro Life",
    tier: 1,
    tags: [
      { zh: "狩猎", en: "Hunting" },
      { zh: "筑巢", en: "Nesting" },
      { zh: "觅食", en: "Foraging" },
      { zh: "飞翔", en: "Flying" },
      { zh: "冬眠", en: "Hibernating" },
      { zh: "标记领地", en: "Territory Marking" },
      { zh: "奔跑", en: "Running" },
      { zh: "攀爬", en: "Climbing" },
      { zh: "格斗", en: "Fighting" },
      { zh: "潜水", en: "Diving" },
      { zh: "晒毛", en: "Sunbathing Fur" },
      { zh: "理毛", en: "Grooming" },
      { zh: "嗅探", en: "Sniffing" },
      { zh: "夜行", en: "Night Roaming" },
    ],
  },
  {
    zh: "堕落放松",
    en: "Guilty Pleasures",
    tier: 0,
    tags: [
      { zh: "刷短视频", en: "Short Videos" },
      { zh: "刷微博", en: "Weibo Scrolling" },
      { zh: "刷剧", en: "Binge Watching" },
      { zh: "看综艺", en: "Variety Shows" },
      { zh: "躺着玩手机", en: "Phone in Bed" },
      { zh: "瘫在沙发吃零食", en: "Couch Snacking" },
      { zh: "熬夜追小说", en: "Late Night Novels" },
      { zh: "看甜宠剧", en: "Romcoms" },
      { zh: "磕CP", en: "Shipping" },
      { zh: "刷朋友圈", en: "Feed Scrolling" },
      { zh: "窥探前任动态", en: "Stalking Exes" },
      { zh: "漫无目的网购", en: "Mindless Shopping" },
      { zh: "看土味视频", en: "Cringey Videos" },
      { zh: "玩消消乐", en: "Match-3 Games" },
      { zh: "吃垃圾食品", en: "Junk Food" },
      { zh: "喝高糖饮料", en: "Sugary Drinks" },
      { zh: "赖床", en: "Staying in Bed" },
      { zh: "工作日请病假", en: "Faking Sick Days" },
      { zh: "拖延事项", en: "Procrastinating" },
      { zh: "逃避社交", en: "Avoiding People" },
      { zh: "沉迷八卦", en: "Gossip" },
      { zh: "看塌房新闻", en: "Drama News" },
      { zh: "给朋友发吐槽", en: "Venting" },
      { zh: "反复刷消息", en: "Refreshing Messages" },
      { zh: "把脏衣服堆成山", en: "Laundry Mountain" },
      { zh: "点外卖", en: "Food Delivery" },
      { zh: "把房间弄乱不管", en: "Ignoring Mess" },
      { zh: "看天气不出门", en: "Weather Excuses" },
      { zh: "研究如何更懒", en: "Optimizing Laziness" },
      { zh: "收藏躺平语录", en: "Slack Quotes" },
      { zh: "摆烂", en: "Letting Go" },
      { zh: "看吃播", en: "Food Streams" },
      { zh: "听洗脑神曲循环", en: "Earworm Loops" },
      { zh: "玩网页小游戏", en: "Browser Games" },
      { zh: "看老剧重温童年", en: "Childhood Shows" },
      { zh: "发呆看天花板", en: "Staring at Ceiling" },
      { zh: "数羊睡不着", en: "Counting Sheep" },
      { zh: "泡脚看剧", en: "Foot Soak & TV" },
      { zh: "晒太阳放空", en: "Sunbathing" },
      { zh: "逛超市试吃", en: "Supermarket Sampling" },
      { zh: "喂鸽子", en: "Feeding Pigeons" },
      { zh: "收集搞笑段子", en: "Meme Collecting" },
      { zh: "整理手机越整越乱", en: "Disorganizing Phone" },
    ],
  },
  {
    zh: "艺术与手工",
    en: "Arts & Crafts",
    tier: 5,
    tags: [
      { zh: "素描", en: "Sketching" },
      { zh: "速写", en: "Gesture Drawing" },
      { zh: "水彩画", en: "Watercolor" },
      { zh: "油画", en: "Oil Painting" },
      { zh: "丙烯画", en: "Acrylic Painting" },
      { zh: "版画", en: "Printmaking" },
      { zh: "数字绘画", en: "Digital Art" },
      { zh: "插画", en: "Illustration" },
      { zh: "漫画", en: "Comics" },
      { zh: "动画原画", en: "Animation" },
      { zh: "硬笔书法", en: "Pen Calligraphy" },
      { zh: "毛笔书法", en: "Brush Calligraphy" },
      { zh: "篆刻", en: "Seal Carving" },
      { zh: "木雕", en: "Wood Carving" },
      { zh: "石雕", en: "Stone Carving" },
      { zh: "玉雕", en: "Jade Carving" },
      { zh: "泥塑", en: "Clay Sculpting" },
      { zh: "陶艺", en: "Ceramics" },
      { zh: "拉坯", en: "Pottery Wheel" },
      { zh: "陶瓷彩绘", en: "Ceramic Painting" },
      { zh: "琉璃制作", en: "Glass Art" },
      { zh: "玻璃吹制", en: "Glass Blowing" },
      { zh: "马赛克镶嵌", en: "Mosaic" },
      { zh: "金工首饰", en: "Metalwork Jewelry" },
      { zh: "银饰制作", en: "Silver Jewelry" },
      { zh: "棒针编织", en: "Knitting" },
      { zh: "钩针编织", en: "Crochet" },
      { zh: "十字绣", en: "Cross Stitch" },
      { zh: "缝纫", en: "Sewing" },
      { zh: "拼布", en: "Quilting" },
      { zh: "服装设计", en: "Fashion Design" },
      { zh: "首饰制作", en: "Jewelry Making" },
      { zh: "皮具制作", en: "Leatherwork" },
      { zh: "木工", en: "Woodworking" },
      { zh: "家具制作", en: "Furniture Making" },
      { zh: "建筑模型", en: "Architecture Models" },
      { zh: "剪纸", en: "Paper Cutting" },
      { zh: "折纸", en: "Origami" },
      { zh: "纸雕", en: "Paper Sculpting" },
      { zh: "串珠", en: "Beading" },
      { zh: "蜡烛制作", en: "Candle Making" },
      { zh: "香薰制作", en: "Aromatherapy Crafts" },
      { zh: "手工皂", en: "Soap Making" },
      { zh: "花艺", en: "Floral Art" },
      { zh: "插花", en: "Ikebana" },
      { zh: "苔藓微景观", en: "Moss Terrariums" },
      { zh: "植物标本", en: "Plant Specimens" },
      { zh: "昆虫标本", en: "Insect Specimens" },
      { zh: "布艺玩偶", en: "Fabric Dolls" },
      { zh: "旅行手账", en: "Travel Journals" },
      { zh: "印章雕刻", en: "Stamp Carving" },
      { zh: "自然材料拼贴画", en: "Nature Collage" },
      { zh: "戏剧面具彩绘", en: "Mask Painting" },
      { zh: "复古首饰修复", en: "Vintage Jewelry Repair" },
    ],
  },
  {
    zh: "音乐与表演",
    en: "Music & Performance",
    tier: 5,
    tags: [
      { zh: "声乐", en: "Singing" },
      { zh: "钢琴", en: "Piano" },
      { zh: "小提琴", en: "Violin" },
      { zh: "吉他", en: "Guitar" },
      { zh: "古筝", en: "Guzheng" },
      { zh: "琵琶", en: "Pipa" },
      { zh: "架子鼓", en: "Drums" },
      { zh: "萨克斯", en: "Saxophone" },
      { zh: "长笛", en: "Flute" },
      { zh: "作曲", en: "Composition" },
      { zh: "音乐制作", en: "Music Production" },
      { zh: "合唱", en: "Choir" },
      { zh: "芭蕾", en: "Ballet" },
      { zh: "现代舞", en: "Contemporary Dance" },
      { zh: "民族舞", en: "Folk Dance" },
      { zh: "爵士舞", en: "Jazz Dance" },
      { zh: "街舞", en: "Street Dance" },
      { zh: "拉丁舞", en: "Latin Dance" },
      { zh: "戏剧表演", en: "Theater" },
      { zh: "京剧", en: "Peking Opera" },
      { zh: "歌剧", en: "Opera" },
      { zh: "朗诵", en: "Recitation" },
      { zh: "主持", en: "Hosting" },
      { zh: "脱口秀", en: "Stand-Up Comedy" },
      { zh: "魔术", en: "Magic" },
      { zh: "配音", en: "Voice Acting" },
      { zh: "影视表演", en: "Film Acting" },
      { zh: "导演", en: "Directing" },
      { zh: "舞台设计", en: "Stage Design" },
    ],
  },
  {
    zh: "文学与创作",
    en: "Literature & Writing",
    tier: 5,
    tags: [
      { zh: "阅读小说", en: "Reading Novels" },
      { zh: "文学创作", en: "Creative Writing" },
      { zh: "诗词创作", en: "Poetry" },
      { zh: "外语学习", en: "Language Learning" },
      { zh: "演讲", en: "Public Speaking" },
      { zh: "辩论", en: "Debating" },
      { zh: "手语", en: "Sign Language" },
      { zh: "写书评", en: "Book Reviews" },
      { zh: "写影评", en: "Film Reviews" },
      { zh: "藏书", en: "Book Collecting" },
      { zh: "书信写作", en: "Letter Writing" },
      { zh: "日记写作", en: "Journaling" },
      { zh: "自媒体写作", en: "Content Writing" },
      { zh: "同人小说创作", en: "Fan Fiction" },
      { zh: "科普写作", en: "Science Writing" },
      { zh: "剧本创作", en: "Screenwriting" },
    ],
  },
  {
    zh: "运动与竞技",
    en: "Sports & Athletics",
    tier: 2,
    tags: [
      { zh: "跑步", en: "Running" },
      { zh: "健走", en: "Walking" },
      { zh: "徒步", en: "Hiking" },
      { zh: "登山", en: "Mountaineering" },
      { zh: "攀岩", en: "Rock Climbing" },
      { zh: "攀冰", en: "Ice Climbing" },
      { zh: "滑雪", en: "Skiing" },
      { zh: "滑冰", en: "Ice Skating" },
      { zh: "轮滑", en: "Roller Skating" },
      { zh: "滑板", en: "Skateboarding" },
      { zh: "冲浪", en: "Surfing" },
      { zh: "帆板", en: "Windsurfing" },
      { zh: "帆船", en: "Sailing" },
      { zh: "赛艇", en: "Rowing" },
      { zh: "皮划艇", en: "Kayaking" },
      { zh: "独木舟", en: "Canoeing" },
      { zh: "游泳", en: "Swimming" },
      { zh: "自由潜水", en: "Freediving" },
      { zh: "水肺潜水", en: "Scuba Diving" },
      { zh: "浮潜", en: "Snorkeling" },
      { zh: "跳水", en: "Diving Boards" },
      { zh: "花样游泳", en: "Synchronized Swimming" },
      { zh: "钓鱼", en: "Fishing" },
      { zh: "飞盘", en: "Frisbee" },
      { zh: "高尔夫", en: "Golf" },
      { zh: "网球", en: "Tennis" },
      { zh: "羽毛球", en: "Badminton" },
      { zh: "乒乓球", en: "Table Tennis" },
      { zh: "壁球", en: "Squash" },
      { zh: "保龄球", en: "Bowling" },
      { zh: "台球", en: "Billiards" },
      { zh: "篮球", en: "Basketball" },
      { zh: "足球", en: "Football" },
      { zh: "排球", en: "Volleyball" },
      { zh: "沙滩排球", en: "Beach Volleyball" },
      { zh: "橄榄球", en: "Rugby" },
      { zh: "棒球", en: "Baseball" },
      { zh: "垒球", en: "Softball" },
      { zh: "曲棍球", en: "Field Hockey" },
      { zh: "冰球", en: "Ice Hockey" },
      { zh: "马术", en: "Equestrian" },
      { zh: "击剑", en: "Fencing" },
      { zh: "射箭", en: "Archery" },
      { zh: "射击", en: "Shooting" },
      { zh: "拳击", en: "Boxing" },
      { zh: "散打", en: "Sanda" },
      { zh: "跆拳道", en: "Taekwondo" },
      { zh: "空手道", en: "Karate" },
      { zh: "柔道", en: "Judo" },
      { zh: "合气道", en: "Aikido" },
      { zh: "泰拳", en: "Muay Thai" },
      { zh: "巴西柔术", en: "BJJ" },
      { zh: "摔跤", en: "Wrestling" },
      { zh: "太极拳", en: "Tai Chi" },
      { zh: "少林拳", en: "Shaolin" },
      { zh: "咏春拳", en: "Wing Chun" },
      { zh: "气功", en: "Qigong" },
      { zh: "瑜伽", en: "Yoga" },
      { zh: "普拉提", en: "Pilates" },
      { zh: "健美操", en: "Aerobics" },
      { zh: "广场舞", en: "Square Dance" },
      { zh: "尊巴", en: "Zumba" },
      { zh: "动感单车", en: "Spinning" },
      { zh: "力量训练", en: "Weight Training" },
      { zh: "举重", en: "Weightlifting" },
      { zh: "CrossFit", en: "CrossFit" },
      { zh: "体操", en: "Gymnastics" },
      { zh: "艺术体操", en: "Rhythmic Gymnastics" },
      { zh: "蹦床", en: "Trampoline" },
      { zh: "跑酷", en: "Parkour" },
      { zh: "自行车骑行", en: "Cycling" },
      { zh: "摩托车骑行", en: "Motorcycling" },
      { zh: "卡丁车", en: "Go-Karting" },
      { zh: "跳伞", en: "Skydiving" },
      { zh: "滑翔伞", en: "Paragliding" },
      { zh: "热气球", en: "Hot Air Balloon" },
    ],
  },
  {
    zh: "健康与养生",
    en: "Health & Wellness",
    tier: 4,
    tags: [
      { zh: "定向越野", en: "Orienteering" },
      { zh: "拓展训练", en: "Outdoor Training" },
      { zh: "军事训练体验", en: "Military Training" },
      { zh: "八段锦", en: "Baduanjin" },
      { zh: "五禽戏", en: "Five Animals Qigong" },
      { zh: "健身气功", en: "Fitness Qigong" },
      { zh: "按摩", en: "Massage" },
      { zh: "推拿", en: "Tuina" },
      { zh: "针灸", en: "Acupuncture" },
      { zh: "拔罐", en: "Cupping" },
      { zh: "刮痧", en: "Gua Sha" },
      { zh: "芳香疗法", en: "Aromatherapy" },
      { zh: "冥想", en: "Meditation" },
      { zh: "正念练习", en: "Mindfulness" },
      { zh: "森林浴", en: "Forest Bathing" },
      { zh: "园艺疗法", en: "Horticultural Therapy" },
      { zh: "经络拍打", en: "Meridian Tapping" },
      { zh: "足底按摩", en: "Reflexology" },
      { zh: "呼吸训练", en: "Breathwork" },
      { zh: "体态矫正", en: "Posture Correction" },
      { zh: "柔韧性训练", en: "Flexibility Training" },
      { zh: "平衡训练", en: "Balance Training" },
      { zh: "营养学研究", en: "Nutrition" },
      { zh: "健康饮食实践", en: "Healthy Eating" },
      { zh: "养生功法", en: "Health Exercises" },
      { zh: "水中健身", en: "Aqua Fitness" },
      { zh: "康复训练", en: "Rehab Training" },
    ],
  },
  {
    zh: "知识与学习",
    en: "Knowledge & Learning",
    tier: 5,
    tags: [
      { zh: "数学", en: "Mathematics" },
      { zh: "物理学", en: "Physics" },
      { zh: "化学实验", en: "Chemistry" },
      { zh: "生物学观察", en: "Biology" },
      { zh: "地理学探索", en: "Geography" },
      { zh: "环境科学", en: "Environmental Science" },
      { zh: "心理学", en: "Psychology" },
      { zh: "社会学", en: "Sociology" },
      { zh: "人类学", en: "Anthropology" },
      { zh: "历史学研读", en: "History" },
      { zh: "考古学", en: "Archaeology" },
      { zh: "哲学思考", en: "Philosophy" },
      { zh: "逻辑学训练", en: "Logic" },
      { zh: "经济学", en: "Economics" },
      { zh: "金融学", en: "Finance" },
      { zh: "管理学", en: "Management" },
      { zh: "法学", en: "Law" },
      { zh: "教育学", en: "Education" },
      { zh: "医学常识", en: "Medical Knowledge" },
      { zh: "中医学", en: "TCM" },
      { zh: "语言学", en: "Linguistics" },
      { zh: "文学研究", en: "Literature Studies" },
      { zh: "艺术史", en: "Art History" },
      { zh: "音乐史", en: "Music History" },
      { zh: "电影史", en: "Film History" },
      { zh: "科技史", en: "Tech History" },
      { zh: "参加学术讲座", en: "Academic Lectures" },
      { zh: "加入读书会", en: "Book Clubs" },
    ],
  },
  {
    zh: "科技与数字",
    en: "Tech & Digital",
    tier: 3,  // interesting nerd +1
    tags: [
      { zh: "Python编程", en: "Python" },
      { zh: "算法研究", en: "Algorithms" },
      { zh: "数据结构", en: "Data Structures" },
      { zh: "人工智能", en: "AI" },
      { zh: "机器学习", en: "Machine Learning" },
      { zh: "深度学习", en: "Deep Learning" },
      { zh: "数据科学", en: "Data Science" },
      { zh: "大数据处理", en: "Big Data" },
      { zh: "网络安全", en: "Cybersecurity" },
      { zh: "Web开发", en: "Web Dev" },
      { zh: "移动应用开发", en: "Mobile Dev" },
      { zh: "游戏开发", en: "Game Dev" },
      { zh: "3D建模", en: "3D Modeling" },
      { zh: "无人机操作", en: "Drone Flying" },
      { zh: "无人机编程", en: "Drone Programming" },
      { zh: "机器人技术", en: "Robotics" },
      { zh: "软件工程", en: "Software Engineering" },
      { zh: "数据库管理", en: "Database" },
      { zh: "电子制作", en: "Electronics DIY" },
    ],
  },
  {
    zh: "科学与探索",
    en: "Science & Exploration",
    tier: 3,  // interesting +1
    tags: [
      { zh: "望远镜观测", en: "Telescope Gazing" },
      { zh: "气象观测", en: "Weather Watching" },
      { zh: "地质勘探", en: "Geology" },
      { zh: "化石采集", en: "Fossil Collecting" },
      { zh: "矿物收集", en: "Mineral Collecting" },
      { zh: "植物分类学", en: "Plant Taxonomy" },
      { zh: "鸟类观察", en: "Birdwatching" },
      { zh: "昆虫观察", en: "Insect Watching" },
      { zh: "动物行为观察", en: "Animal Behavior" },
      { zh: "观星认星座", en: "Stargazing" },
      { zh: "天体摄影", en: "Astrophotography" },
      { zh: "家庭科学小实验", en: "Home Experiments" },
      { zh: "科普阅读", en: "Science Reading" },
      { zh: "古建筑研究", en: "Historic Buildings" },
      { zh: "家谱研究", en: "Genealogy" },
      { zh: "历史遗迹探访", en: "Historic Sites" },
      { zh: "地图收藏", en: "Map Collecting" },
      { zh: "邮票收藏", en: "Stamp Collecting" },
      { zh: "模型收藏", en: "Model Collecting" },
      { zh: "档案馆查阅", en: "Archive Research" },
    ],
  },
  {
    zh: "竞技与策略",
    en: "Games & Strategy",
    tier: 2,
    tags: [
      { zh: "围棋", en: "Go" },
      { zh: "象棋", en: "Chinese Chess" },
      { zh: "国际象棋", en: "Chess" },
      { zh: "将棋", en: "Shogi" },
      { zh: "五子棋", en: "Gomoku" },
      { zh: "跳棋", en: "Checkers" },
      { zh: "军棋", en: "Army Chess" },
      { zh: "飞行棋", en: "Aeroplane Chess" },
      { zh: "桥牌", en: "Bridge" },
      { zh: "扑克", en: "Poker" },
      { zh: "麻将", en: "Mahjong" },
      { zh: "桌游", en: "Board Games" },
      { zh: "电子竞技", en: "Esports" },
      { zh: "网络游戏", en: "Online Gaming" },
      { zh: "密室逃脱", en: "Escape Rooms" },
      { zh: "剧本杀", en: "Murder Mystery" },
      { zh: "魔方", en: "Rubik's Cube" },
      { zh: "数独", en: "Sudoku" },
      { zh: "填字游戏", en: "Crosswords" },
      { zh: "谜题破解", en: "Puzzle Solving" },
      { zh: "知识竞赛", en: "Quiz Games" },
      { zh: "答题游戏", en: "Trivia" },
      { zh: "策略游戏", en: "Strategy Games" },
      { zh: "模拟经营游戏", en: "Sim Games" },
      { zh: "赛车游戏", en: "Racing Games" },
      { zh: "王者荣耀", en: "Honor of Kings" },
      { zh: "原神", en: "Genshin Impact" },
      { zh: "DOTA2", en: "DOTA2" },
      { zh: "塞尔达", en: "Zelda" },
      { zh: "脑筋急转弯", en: "Riddles" },
      { zh: "逻辑推理训练", en: "Logic Training" },
      { zh: "批判性思维", en: "Critical Thinking" },
    ],
  },
  {
    zh: "社交与活动",
    en: "Social & Events",
    tier: 1,
    tags: [
      { zh: "朋友聚会", en: "Hangouts" },
      { zh: "家庭聚会", en: "Family Gatherings" },
      { zh: "同学聚会", en: "Reunions" },
      { zh: "同事聚餐", en: "Work Dinners" },
      { zh: "社区活动", en: "Community Events" },
      { zh: "志愿者服务", en: "Volunteering" },
      { zh: "慈善捐助", en: "Donations" },
      { zh: "公益活动", en: "Charity" },
      { zh: "环保行动", en: "Eco Action" },
      { zh: "动物保护", en: "Animal Welfare" },
      { zh: "音乐会欣赏", en: "Concerts" },
      { zh: "戏剧观赏", en: "Theater Watching" },
      { zh: "音乐剧欣赏", en: "Musicals" },
      { zh: "艺术展览参观", en: "Art Exhibitions" },
      { zh: "动物园游览", en: "Zoo Visits" },
      { zh: "植物园漫步", en: "Botanical Garden" },
      { zh: "水族馆参观", en: "Aquarium" },
      { zh: "主题公园游玩", en: "Theme Parks" },
      { zh: "真人CS", en: "Airsoft" },
      { zh: "集体徒步", en: "Group Hiking" },
      { zh: "乐队排练演出", en: "Band Practice" },
      { zh: "摄影俱乐部外拍", en: "Photo Club" },
      { zh: "品酒会", en: "Wine Tasting" },
      { zh: "咖啡品鉴会", en: "Coffee Tasting" },
      { zh: "美食分享会", en: "Food Sharing" },
      { zh: "语言交换学习", en: "Language Exchange" },
      { zh: "粉丝见面会", en: "Fan Events" },
      { zh: "生日派对策划", en: "Birthday Parties" },
      { zh: "乔迁暖房", en: "Housewarming" },
      { zh: "告别单身派对", en: "Bachelor Party" },
      { zh: "周年纪念庆祝", en: "Anniversary" },
      { zh: "相亲交友", en: "Blind Dates" },
      { zh: "恋爱经营", en: "Relationship Building" },
    ],
  },
  {
    zh: "生活与居家",
    en: "Lifestyle & Home",
    tier: 1,
    tags: [
      { zh: "烹饪", en: "Cooking" },
      { zh: "烘焙", en: "Baking" },
      { zh: "料理研究", en: "Culinary Research" },
      { zh: "美食探索", en: "Food Exploring" },
      { zh: "品茶", en: "Tea Tasting" },
      { zh: "品咖啡", en: "Coffee Tasting" },
      { zh: "品酒", en: "Wine Tasting" },
      { zh: "调酒", en: "Mixology" },
      { zh: "营养搭配", en: "Meal Planning" },
      { zh: "园艺", en: "Gardening" },
      { zh: "种花", en: "Flower Growing" },
      { zh: "种菜", en: "Vegetable Growing" },
      { zh: "盆栽", en: "Bonsai Potting" },
      { zh: "盆景", en: "Bonsai" },
      { zh: "家居布置", en: "Home Decoration" },
      { zh: "室内设计", en: "Interior Design" },
      { zh: "收纳整理", en: "Organizing" },
      { zh: "断舍离", en: "Decluttering" },
      { zh: "清洁打扫", en: "Cleaning" },
      { zh: "宠物饲养", en: "Pet Keeping" },
      { zh: "宠物训练", en: "Pet Training" },
      { zh: "宠物美容", en: "Pet Grooming" },
      { zh: "水族饲养", en: "Aquarium Keeping" },
      { zh: "植物养护", en: "Plant Care" },
      { zh: "护肤研究", en: "Skincare" },
      { zh: "美妆", en: "Makeup" },
      { zh: "发型设计", en: "Hair Styling" },
      { zh: "服装搭配", en: "Outfit Styling" },
      { zh: "时尚研究", en: "Fashion" },
      { zh: "购物", en: "Shopping" },
      { zh: "逛街", en: "Street Browsing" },
      { zh: "探店", en: "Shop Exploring" },
      { zh: "旅行规划", en: "Travel Planning" },
      { zh: "理财规划", en: "Financial Planning" },
      { zh: "投资研究", en: "Investing" },
      { zh: "记账", en: "Budgeting" },
      { zh: "写日记", en: "Journaling" },
      { zh: "节日庆祝筹备", en: "Holiday Planning" },
      { zh: "礼物挑选", en: "Gift Picking" },
      { zh: "急救知识", en: "First Aid" },
      { zh: "环保生活实践", en: "Eco Living" },
    ],
  },
  {
    zh: "摄影与影像",
    en: "Photo & Media",
    tier: 1,
    tags: [
      { zh: "摄影", en: "Photography" },
      { zh: "写真", en: "Portrait Photos" },
      { zh: "天文摄影", en: "Astrophotography" },
      { zh: "视频剪辑", en: "Video Editing" },
      { zh: "视频记录生活", en: "Vlogging" },
      { zh: "自媒体", en: "Content Creation" },
      { zh: "看电影", en: "Movies" },
      { zh: "追剧", en: "Series Watching" },
      { zh: "看动漫", en: "Anime" },
      { zh: "看cult片", en: "Cult Films" },
      { zh: "纪录片", en: "Documentaries" },
      { zh: "写影评", en: "Film Reviews" },
      { zh: "播客", en: "Podcasting" },
      { zh: "cosplay", en: "Cosplay" },
    ],
  },
];

const HOBBY_TAG_LIST = HOBBY_CATEGORIES.flatMap((c) =>
  c.tags.map((t) => (typeof t === "string" ? t : t.zh)),
);

let _customHobbyTags = [];

async function loadCustomHobbyTags() {
  try {
    const res = await fetch("/custom-hobbies");
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
    const key = obj.categoryZh || "__custom__";
    if (!customByCategory[key]) customByCategory[key] = [];
    customByCategory[key].push(obj);
  });

  let html = HOBBY_CATEGORIES.map((cat) => {
    let catHtml = `<div class="hobby-cat-label">${cat.zh} / ${cat.en}</div>`;
    catHtml += cat.tags
      .map((t) => {
        const zh = typeof t === "string" ? t : t.zh;
        const en = typeof t === "string" ? "" : t.en;
        const display = en ? `${zh} / ${en}` : zh;
        return `<span class="hobby-tag tier-${cat.tier}" data-tier="${cat.tier}" data-zh="${zh}" onclick="toggleHobbyTag(this)">${display}</span>`;
      })
      .join("");
    if (customByCategory[cat.zh]) {
      catHtml += customByCategory[cat.zh]
        .map(
          (obj) =>
            `<span class="hobby-tag tier-${obj.tier}" data-tier="${obj.tier}" data-zh="${obj.tag}" onclick="toggleHobbyTag(this)">${obj.tag}</span>`,
        )
        .join("");
    }
    return catHtml;
  }).join("");

  if (
    customByCategory["__custom__"] &&
    customByCategory["__custom__"].length > 0
  ) {
    html += `<div class="hobby-cat-label hobby-cat-label-custom">自定义 / Custom</div>`;
    html += customByCategory["__custom__"]
      .map(
        (obj) =>
          `<span class="hobby-tag tier-${obj.tier}" data-tier="${obj.tier}" data-zh="${obj.tag}" onclick="toggleHobbyTag(this)">${obj.tag}</span>`,
      )
      .join("");
  }

  wrap.innerHTML = html;
}

function getHobbyScore() {
  const tags = document.querySelectorAll("#hobby-tags .hobby-tag.selected");
  let total = 0;
  tags.forEach((el) => {
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
      const zh = el.dataset.zh || "";
      const full = el.textContent.trim();
      // full is "zh / en"; if it contains " / " return as-is, else return zh
      return full.includes(" / ") ? full : zh || full;
    })
    .join(" · ");
}

function setHobbyTags(containerId, hobbyStr) {
  buildHobbyTags(containerId);
  if (!hobbyStr) return;
  // Support both old Chinese-only and new "zh / en" bilingual stored formats
  const selected = new Set(
    hobbyStr.split(" · ").map((s) => {
      const t = s.trim();
      const slashIdx = t.indexOf(" / ");
      return slashIdx !== -1 ? t.slice(0, slashIdx).trim() : t;
    }),
  );
  document.querySelectorAll(`#${containerId} .hobby-tag`).forEach((el) => {
    const zh = el.dataset.zh || el.textContent.trim();
    if (selected.has(zh)) el.classList.add("selected");
  });
}

let _editHobbyStr = "";
let _editHobbyExpanded = false;

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
  { zh: "作息昼出夜伏", en: "Nocturnal" },
  { zh: "作息昼伏夜出", en: "Diurnal" },
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
  { zh: "不管家长",     en: "Family-Free Zone" },
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

function setStandardTags(tagStr) {
  buildStandardsTags("standards-tags");
  if (!tagStr) return;
  const selected = new Set(tagStr.split(" · ").map((s) => s.split(" / ")[0].trim()));
  document.querySelectorAll("#standards-tags .hobby-tag").forEach((el) => {
    if (selected.has(el.dataset.zh)) el.classList.add("selected");
  });
}

function expandEditHobby() {
  if (_editHobbyExpanded) return;
  _editHobbyExpanded = true;
  setHobbyTags("edit-hobby-tags", _editHobbyStr);
  document.getElementById("edit-hobby-expanded").classList.remove("hidden");
  document.getElementById("edit-hobby-collapsed").style.display = "none";
}

function collapseEditHobby() {
  _editHobbyExpanded = false;
  const selected = getSelectedHobbyTags("edit-hobby-tags");
  _editHobbyStr = selected;
  const summary = document.getElementById("edit-hobby-summary");
  if (summary) summary.textContent = selected || "— 点击修改 / Click to edit —";
  document.getElementById("edit-hobby-expanded").classList.add("hidden");
  document.getElementById("edit-hobby-collapsed").style.display = "";
  document.getElementById("edit-hobby-tags").innerHTML = "";
}

let _pendingCustomTag = null;
let _pendingCustomContainerId = null;
let _pendingCustomInputId = null;

function addCustomHobbyTag(containerId, inputId) {
  const input = document.getElementById(inputId);
  const tag = (input?.value || "").trim().slice(0, 20);
  if (!tag) return;

  const existing = Array.from(
    document.querySelectorAll(`#${containerId} .hobby-tag`),
  ).find((el) => el.textContent.trim() === tag);
  if (existing) {
    existing.classList.add("selected");
    input.value = "";
    return;
  }

  _pendingCustomTag = tag;
  _pendingCustomContainerId = containerId;
  _pendingCustomInputId = inputId;

  const list = document.getElementById("hobby-cat-picker-list");
  list.innerHTML = HOBBY_CATEGORIES.map(
    (cat) =>
      `<button class="hobby-cat-option" onclick="confirmCustomHobbyTag(${JSON.stringify(cat.zh)},${cat.tier})">${cat.zh} / ${cat.en}</button>`,
  ).join("");
  document.getElementById("hobby-cat-picker").classList.remove("hidden");
}

function confirmCustomHobbyTag(categoryZh, tier) {
  const tag = _pendingCustomTag;
  const containerId = _pendingCustomContainerId;
  const inputId = _pendingCustomInputId;
  closeHobbyCatPicker();
  if (!tag) return;

  fetch("/custom-hobbies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tag, categoryZh, tier }),
  })
    .then((r) => r.json())
    .then(() => {
      const exists = _customHobbyTags.find(
        (t) => (typeof t === "string" ? t : t.tag) === tag,
      );
      if (!exists) _customHobbyTags.push({ tag, categoryZh, tier });

      const wrap = document.getElementById(containerId);
      if (wrap) {
        const labels = Array.from(wrap.querySelectorAll(".hobby-cat-label"));
        const targetLabel = labels.find((lbl) =>
          lbl.textContent.includes(categoryZh),
        );
        const el = document.createElement("span");
        el.className = `hobby-tag tier-${tier} selected`;
        el.dataset.tier = tier;
        el.onclick = () => toggleHobbyTag(el);
        el.textContent = tag;
        if (targetLabel) {
          let node = targetLabel.nextSibling;
          let last = targetLabel;
          while (node && !node.classList?.contains("hobby-cat-label")) {
            last = node;
            node = node.nextSibling;
          }
          last.after(el);
        } else {
          let customLabel = wrap.querySelector(".hobby-cat-label-custom");
          if (!customLabel) {
            customLabel = document.createElement("div");
            customLabel.className = "hobby-cat-label hobby-cat-label-custom";
            customLabel.textContent = "自定义 / Custom";
            wrap.appendChild(customLabel);
          }
          wrap.appendChild(el);
        }
      }

      const input = document.getElementById(inputId);
      if (input) input.value = "";
    });
}

function closeHobbyCatPicker() {
  document.getElementById("hobby-cat-picker").classList.add("hidden");
  _pendingCustomTag = null;
  _pendingCustomContainerId = null;
  _pendingCustomInputId = null;
}

// ── Onboarding overlays ────────────────────────────────────────
let _obLongTimer = null;
let _obLongText = "";
let _obAgreeCount = 0;
let _obSampleGrid = null;
const _OB_AGREE_MIN = 3;

function obGlitch(el) {
  if (!el) return;
  el.classList.remove("ob-glitch");
  void el.offsetWidth;
  el.classList.add("ob-glitch");
  setTimeout(() => el.classList.remove("ob-glitch"), 450);
}

function obFlash(cb) {
  const fl = document.getElementById("ob-flash");
  if (!fl) {
    cb();
    return;
  }
  fl.classList.add("active");
  setTimeout(() => {
    fl.classList.remove("active");
    cb();
  }, 380);
}

function startOnboarding() {
  const overlay = document.getElementById("onboard-overlay");
  if (!overlay) return;
  _obLongText = "";
  _obAgreeCount = 0;
  overlay.classList.remove("hidden");
  _obInitStep1();
}

function obNextStep(num) {
  obFlash(() => {
    document
      .querySelectorAll(".ob-step")
      .forEach((s) => s.classList.remove("active"));
    const next = document.getElementById(`ob-step-${num}`);
    if (next) next.classList.add("active");
    if (num === 2) _obInitStep2();
    if (num === 3) _obInitStep3();
  });
}

function obFinish() {
  obFlash(() => {
    document.getElementById("onboard-overlay").classList.add("hidden");
    startSwipeInterrupts();
    startGenderedNotifications();
    if (!popupShowing) showNextPopup();
  });
}

// Step 1 — 长按: hold 500ms → input appears → submit → auto-jump step 2
function _obInitStep1() {
  const word = document.getElementById("ob-demo-long");
  if (!word) return;

  function onStart(e) {
    e.preventDefault();
    _obLongTimer = setTimeout(() => {
      _obLongTimer = null;
      obGlitch(word);
      document.getElementById("ob-1-input").classList.remove("hidden");
      const inp = document.getElementById("ob-1-text");
      if (inp) {
        inp.value = "";
        inp.focus();
      }
    }, 500);
  }
  function onEnd() {
    if (_obLongTimer) {
      clearTimeout(_obLongTimer);
      _obLongTimer = null;
      obGlitch(word);
    }
  }
  word.addEventListener("touchstart", onStart, { passive: false });
  word.addEventListener("touchend", onEnd);
  word.addEventListener("touchcancel", onEnd);
  word.addEventListener("mousedown", onStart);
  word.addEventListener("mouseup", onEnd);
  document.getElementById("ob-1-text")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitOb1();
  });
}

function submitOb1() {
  const text = (document.getElementById("ob-1-text")?.value || "").trim();
  if (!text) return;
  _obLongText = text;
  obNextStep(2);
}

// Step 2 — 短按: tap word → red text stays + agree instruction appears
//           tap red text 3x (grows) → auto-jump step 3
function _obInitStep2() {
  const word = document.getElementById("ob-demo-short");
  const floatWord = document.getElementById("ob-float-word");
  const agreeInstr = document.getElementById("ob-agree-instr");
  if (!word || !floatWord) return;

  word.addEventListener(
    "click",
    () => {
      if (!floatWord.classList.contains("hidden")) return;
      obGlitch(word);
      floatWord.textContent = _obLongText;
      floatWord.classList.remove("hidden");
      agreeInstr?.classList.remove("hidden");
      word.classList.add("ob-done");
      floatWord.addEventListener("click", _obAgreeClick);
    },
    { once: true },
  );
}

function _obAgreeClick() {
  const fw = document.getElementById("ob-float-word");
  const leftEl = document.getElementById("ob-agree-left");
  if (!fw) return;
  obGlitch(fw);
  _obAgreeCount++;
  fw.style.fontSize = 22 + _obAgreeCount * 10 + "px";
  const left = Math.max(0, _OB_AGREE_MIN - _obAgreeCount);
  if (leftEl) leftEl.textContent = left;
  if (_obAgreeCount >= _OB_AGREE_MIN) {
    fw.removeEventListener("click", _obAgreeClick);
    setTimeout(() => obNextStep(3), 350);
  }
}

// Step 3 — 印象: show pre-carved avatar → tap label → type → letters carve in → ✕ appears
function _makeObSampleGrid() {
  const g = Array.from({ length: 32 }, () => Array(32).fill(null));
  const cx = 16,
    cy = 14;
  // Fill face shape with "好" characters directly
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const dx = x - cx,
        dy = y - cy;
      if (dx * dx + dy * dy <= 100) g[y][x] = "好";
    }
  }
  // hollow eyes
  [
    [10, 12],
    [10, 13],
    [11, 12],
    [11, 13],
    [10, 18],
    [10, 19],
    [11, 18],
    [11, 19],
  ].forEach(([y, x]) => {
    g[y][x] = null;
  });
  // smile
  [
    [17, 13],
    [18, 14],
    [18, 18],
    [17, 19],
  ].forEach(([y, x]) => {
    g[y][x] = null;
  });
  // ears
  [
    [6, 11],
    [7, 11],
    [6, 12],
    [6, 20],
    [7, 20],
    [6, 21],
  ].forEach(([y, x]) => {
    if (y < 32 && x < 32) g[y][x] = "好";
  });
  return g;
}

function _obInitStep3() {
  _obSampleGrid = _makeObSampleGrid();
  // Grid cells are already "好" characters — render directly
  const img = document.getElementById("ob-avatar-img");
  if (img) img.src = renderGridAsAvatar(_obSampleGrid, "好");

  // Tap "印象" label to reveal input
  const trigger = document.getElementById("ob-3-trigger");
  const inputWrap = document.getElementById("ob-3-input");
  if (trigger && inputWrap) {
    trigger.addEventListener(
      "click",
      () => {
        obGlitch(trigger);
        trigger.classList.add("ob-done");
        inputWrap.classList.remove("hidden");
        document.getElementById("ob-3-text")?.focus();
      },
      { once: true },
    );
  }
  document.getElementById("ob-3-text")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitOb3();
  });
}

function submitOb3() {
  const text = (document.getElementById("ob-3-text")?.value || "").trim();
  if (!text) return;
  const inp = document.getElementById("ob-3-text");
  const btn = document.getElementById("ob-3-btn");
  if (inp) inp.disabled = true;
  if (btn) btn.disabled = true;

  const gridCopy = _obSampleGrid.map((row) => [...row]);
  _applyImpressionToGrid(gridCopy, text);
  const img = document.getElementById("ob-avatar-img");
  if (img) {
    img.style.transition = "opacity 0.2s";
    img.style.opacity = "0";
    setTimeout(() => {
      img.src = renderGridAsAvatar(gridCopy, text);
      img.style.opacity = "1";
    }, 200);
  }

  const closeBtn = document.getElementById("ob-close-3");
  if (closeBtn) {
    setTimeout(() => {
      closeBtn.style.display = "flex";
      closeBtn.classList.add("unlocked");
    }, 600);
  }
}

let currentProfileInterpretations = {};
let longPressJustFired = false;

// ── Pixel icon system ─────────────────────────────────────────

function _makeIcon(pattern, px) {
  const c = document.createElement("canvas");
  c.width = pattern[0].length * px;
  c.height = pattern.length * px;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "rgb(40,48,35)";
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
  // pixel eye
  eye: [
    [0, 1, 1, 1, 1, 1, 0],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 0, 1, 0, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [0, 1, 1, 1, 1, 1, 0],
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

function getIcon(name, px = 3) {
  const key = `${name}_${px}`;
  if (!_iconCache[key]) _iconCache[key] = _makeIcon(_iconPatterns[name], px);
  return _iconCache[key];
}

function iconImg(name, px = 3) {
  const p = _iconPatterns[name];
  const w = p[0].length * px,
    h = p.length * px;
  return `<img src="${getIcon(name, px)}" width="${w}" height="${h}" style="image-rendering:pixelated;vertical-align:middle;">`;
}

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
  const key = `dice${n}_${px}`;
  if (_iconCache[key]) return _iconCache[key];
  const dots = _diceDotSets[n];
  const c = document.createElement("canvas");
  c.width = 9 * px;
  c.height = 9 * px;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "rgb(40,48,35)";
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
  await loadCustomHobbyTags();
  buildHobbyTags("hobby-tags");
  buildStandardsTags("standards-tags");
  buildCitySelectors("house");
  buildCitySelectors("parents-father");
  buildCitySelectors("parents-mother");
});

function getPixelHeartUrl() {
  if (getPixelHeartUrl._cache) return getPixelHeartUrl._cache;
  const pattern = [
    [0, 1, 1, 0, 1, 1, 0],
    [1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1],
    [0, 1, 1, 1, 1, 1, 0],
    [0, 0, 1, 1, 1, 0, 0],
    [0, 0, 0, 1, 0, 0, 0],
  ];
  const px = 3;
  const c = document.createElement("canvas");
  c.width = 7 * px;
  c.height = 6 * px;
  const ctx = c.getContext("2d");
  ctx.shadowColor = "rgba(40,48,35,0.65)";
  ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2; ctx.shadowBlur = 0;
  ctx.fillStyle = "rgb(40,48,35)";
  pattern.forEach((row, ry) =>
    row.forEach((v, rx) => {
      if (v) ctx.fillRect(rx * px, ry * px, px, px);
    }),
  );
  getPixelHeartUrl._cache = c.toDataURL();
  return getPixelHeartUrl._cache;
}

function getPixelVomitUrl() {
  if (getPixelVomitUrl._cache) return getPixelVomitUrl._cache;
  const pattern = [
    [0, 1, 1, 1, 1, 1, 0], // head top
    [1, 0, 1, 0, 1, 0, 1], // X eyes top
    [1, 1, 0, 1, 0, 1, 1], // X eyes bottom
    [1, 1, 1, 1, 1, 1, 1], // cheeks
    [1, 0, 0, 0, 0, 0, 1], // open mouth
    [0, 1, 1, 1, 1, 1, 0], // chin
    [0, 0, 1, 1, 1, 0, 0], // vomit start
    [0, 1, 1, 1, 1, 1, 0], // vomit mid
    [1, 1, 1, 1, 1, 1, 1], // vomit pool
  ];
  const px = 3;
  const c = document.createElement("canvas");
  c.width = 7 * px;
  c.height = 9 * px;
  const ctx = c.getContext("2d");
  ctx.shadowColor = "rgba(40,48,35,0.65)";
  ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2; ctx.shadowBlur = 0;
  ctx.fillStyle = "rgb(40,48,35)";
  pattern.forEach((row, ry) =>
    row.forEach((v, rx) => {
      if (v) ctx.fillRect(rx * px, ry * px, px, px);
    }),
  );
  getPixelVomitUrl._cache = c.toDataURL();
  return getPixelVomitUrl._cache;
}

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

function rollIncomeDice(selectId, displayId, btnId) {
  const btn = document.getElementById(btnId);
  const display = document.getElementById(displayId);
  btn.disabled = true;
  let count = 0;
  const interval = setInterval(() => {
    display.innerHTML = diceFaceImg(Math.floor(Math.random() * 6) + 1, 4);
    count++;
    if (count >= 16) {
      clearInterval(interval);
      const result = Math.floor(Math.random() * 6) + 1;
      display.innerHTML = diceFaceImg(result, 4);
      if (result === 6) {
        const sel = document.getElementById(selectId);
        if (!Array.from(sel.options).some((o) => o.value === "30w+")) {
          const opt = document.createElement("option");
          opt.value = "30w+";
          opt.textContent = "30w+ / 300k+";
          sel.appendChild(opt);
        }
        sel.value = "30w+";
        setTimeout(() => {
          display.innerHTML = diceFaceImg(6, 4) + " !!!";
        }, 100);
      }
      btn.disabled = false;
    }
  }, 70);
}

function fmt(v) {
  if (!v || v === "—") return v || "—";
  return v.replace(/\s*[·×\/]\s*/g, " ").replace(/\s{2,}/g, " ").trim() || "—";
}

// Two-line bilingual display: Chinese on top, English below
function fmtBI(v) {
  if (!v || v === "—") return "—";
  // normalize "X/Y" (no spaces) → "X / Y" so both stored formats split correctly
  const normalized = v.replace(/([^\s])\s*\/\s*([^\s])/g, "$1 / $2");
  const segs = normalized.split(/\s*·\s*/);
  const zhParts = [], enParts = [];
  let hasBilingual = false;
  for (let seg of segs) {
    seg = seg.trim();
    const slashIdx = seg.indexOf(" / ");
    if (slashIdx !== -1) {
      zhParts.push(seg.slice(0, slashIdx).trim());
      enParts.push(seg.slice(slashIdx + 3).trim());
      hasBilingual = true;
    } else {
      zhParts.push(seg);
      enParts.push(seg);
    }
  }
  const zhLine = zhParts.join("  ");
  const enLine = enParts.join("  ");
  if (hasBilingual) {
    return `<span class="bi-zh">${zhLine}</span><span class="bi-en">${enLine}</span>`;
  }
  return `<span class="bi-zh">${zhLine}</span>`;
}

function buildTerritoryDisplay(profile) {
  const h = profile.house;
  if (!h || (!h.city && !h.district)) return profile.hukou || "—";
  const parts = [];
  if (h.city || h.district) parts.push([h.city, disp(h.district)].filter(Boolean).join(" "));
  if (h.area) parts.push(`${h.area}㎡`);
  if (h.type) {
    const typeDisp = disp(h.type);
    parts.push(h.type === "别墅" && h.villaFloors ? `${typeDisp} (${disp(h.villaFloors)})` : typeDisp);
  }
  if (h.garden === "有院子") parts.push(disp("有院子"));
  if (h.aptFloor) parts.push(disp(h.aptFloor));
  if (h.aptTotal) parts.push(disp(h.aptTotal));
  if (h.price) parts.push(disp(h.price));
  if (h.ownership) parts.push(disp(h.ownership));
  if (h.mortgage) parts.push(disp(h.mortgage));
  return parts.join(" · ") || profile.hukou || "—";
}

function renderValue(profile, field, valueText, extraClass = "") {
  const raw = profile.interpretations && profile.interpretations[field];
  const interps = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const display = fmtBI(valueText);
  if (interps.length > 0) {
    return `<span class="value ${extraClass} has-interpretations" data-field="${field}">${display}</span>`;
  }
  return `<span class="value ${extraClass}" data-field="${field}">${display}</span>`;
}

function renderCardHTML(profile) {
  const baseScore = profile.score ?? 60;
  const skipCount = profile.skips ? profile.skips.length : 0;
  const displayScore = Math.max(0, baseScore - skipCount);
  const _sd = profile.date ? new Date(profile.date) : null;
  const stampDate = _sd
    ? `${_sd.getFullYear()}.${String(_sd.getMonth() + 1).padStart(2, "0")}.${String(_sd.getDate()).padStart(2, "0")}`
    : "";
  const stampColorClass = displayScore < 60 ? "stamp-red" : "";
  return `
<div class="card">

  <div class="profile-score-stamp ${stampColorClass}">
    <span class="stamp-date">${stampDate}</span>
    <span class="stamp-num">${displayScore}</span>
    <span class="stamp-lines"><span></span><span></span></span>
  </div>

  <div class="avatar-box">
    <img src="${profile.grid ? renderGridAsAvatar(profile.grid, profile.gridText) : profile.avatar}" class="avatar">
  </div>

  <div class="section">
    <span class="label">名字 <small>Name</small></span>
    ${renderValue(profile, "name", profile.name, "big")}
  </div>

  <div class="section">
    <span class="label">物种 <small>Species</small></span>
    ${renderValue(profile, "breed", (() => {
      const sp = (v) => { if (!v) return null; const p = v.split(" · "); return p.length > 1 ? p.slice(1).join(" · ") : v; };
      return profile.mixed && profile.breed2 ? `${sp(profile.breed) || "—"} × ${sp(profile.breed2)}（混血 Mixed）` : sp(profile.breed) || "—";
    })(), "territory")}
  </div>

  <div class="grid-3">
    <div class="cell">
      <span class="label">性别 <small>Gender</small></span>
      ${renderValue(profile, "gender", disp(profile.gender) || "—")}
    </div>
    <div class="cell">
      <span class="label">年龄 <small>Age</small></span>
      ${renderValue(profile, "age", profile.age || "—")}
    </div>
    <div class="cell">
      <span class="label">身高 <small>Height</small></span>
      ${renderValue(profile, "height", profile.height || "—")}
    </div>
  </div>

  <div class="grid-2">
    <div class="cell">
      <span class="label">性取向 <small>Orientation</small></span>
      ${renderValue(profile, "orientation", disp(profile.orientation) || "—")}
    </div>
    <div class="cell">
      <span class="label">婚恋 <small>Status</small></span>
      ${renderValue(profile, "sterilized", disp(profile.sterilized || profile.relationship?.status) || "—")}
    </div>
  </div>

  <div class="grid-2">
    <div class="cell">
      <span class="label">MBTI</span>
      ${renderValue(profile, "mbti", profile.mbti || "—", "big")}
    </div>
    <div class="cell">
      <span class="label">星座 <small>Horoscope</small></span>
      ${renderValue(profile, "horoscope", profile.horoscope || getHoroscope(profile.birth) || "—")}
    </div>
  </div>

  <div class="section">
    <span class="label">领地 <small>Territory</small></span>
    ${renderValue(profile, "hukou", buildTerritoryDisplay(profile), "territory")}
  </div>

  <div class="section">
    <span class="label">车辆 <small>Vehicles</small></span>
    ${renderValue(profile, "vehicle", [
      profile.vehicle?.types?.length ? profile.vehicle.types.join(" · ") : null,
      profile.vehicle?.model || null,
      profile.vehicle?.count ? disp(profile.vehicle.count) : null,
      profile.vehicle?.price ? disp(profile.vehicle.price) : null,
    ].filter(Boolean).join(" · ") || "—")}
  </div>

  <div class="grid-3">
    <div class="cell">
      <span class="label">学历 <small>Education</small></span>
      ${renderValue(profile, "edu", disp(profile.edu) || "—")}
    </div>
    <div class="cell">
      <span class="label">职业 <small>Job</small></span>
      ${renderValue(profile, "occupation", disp(profile.occupation) || "—")}
    </div>
    <div class="cell">
      <span class="label">月收入 <small>Income</small></span>
      ${renderValue(profile, "income", disp(profile.income) || "—")}
    </div>
  </div>

  <div class="grid-2">
    <div class="cell">
      <span class="label">目的 <small>Here For</small></span>
      ${renderValue(profile, "datingPurpose", profile.relationship?.datingPurpose || "—")}
    </div>
    <div class="cell">
      <span class="label">期望关系 <small>Looking For</small></span>
      ${renderValue(profile, "relationshipGoal", profile.relationship?.relationshipGoal || "—")}
    </div>
  </div>

  <div class="grid-3">
    <div class="cell">
      <span class="label">目前伴侣 <small>Partner</small></span>
      ${renderValue(profile, "currentPartner", profile.relationship?.currentPartner || "—")}
    </div>
    <div class="cell">
      <span class="label">伴侣数量 <small># Partners</small></span>
      ${renderValue(profile, "partnerCount", profile.relationship?.partnerCount || "—")}
    </div>
    <div class="cell">
      <span class="label">子女 <small>Kids</small></span>
      ${renderValue(profile, "kids", profile.relationship?.kids || "—")}
    </div>
  </div>

  <div class="grid-3">
    <div class="cell">
      <span class="label">暗恋 <small>Crush</small></span>
      ${renderValue(profile, "crush", profile.relationship?.crush || "—")}
    </div>
    <div class="cell">
      <span class="label">暧昧 <small>Ambiguous</small></span>
      ${renderValue(profile, "ambiguous", profile.relationship?.ambiguous || "—")}
    </div>
    <div class="cell">
      <span class="label">秘密伴侣 <small>Secret</small></span>
      ${renderValue(profile, "secretPartner", profile.relationship?.secretPartner || "—")}
    </div>
  </div>

  <div class="grid-3">
    <div class="cell">
      <span class="label">境外伴侣 <small>Foreign</small></span>
      ${renderValue(profile, "foreignPartner", profile.relationship?.foreignPartner || "—")}
    </div>
    <div class="cell">
      <span class="label">异地伴侣 <small>Long Dist</small></span>
      ${renderValue(profile, "otherCityPartner", profile.relationship?.otherCityPartner || "—")}
    </div>
    <div class="cell">
      <span class="label">白月光 <small>Moonlight</small></span>
      ${renderValue(profile, "whiteMoonlight", profile.relationship?.whiteMoonlight || "—")}
    </div>
  </div>

  <div class="grid-3">
    <div class="cell">
      <span class="label">谈过 <small>Past Rels</small></span>
      ${renderValue(profile, "pastRelCount", profile.relationship?.pastRelCount || "—")}
    </div>
    <div class="cell">
      <span class="label">前任联系 <small>Ex Contact</small></span>
      ${renderValue(profile, "exContact", profile.relationship?.exContact || "—")}
    </div>
    <div class="cell">
      <span class="label">还爱前任 <small>Still Love Ex</small></span>
      ${renderValue(profile, "stillLoveEx", profile.relationship?.stillLoveEx || "—")}
    </div>
  </div>

  <div class="section">
    <span class="label">兴趣爱好 <small>Hobbies</small></span>
    ${renderValue(profile, "hobby", profile.hobby || "—")}
  </div>

  <div class="section">
    <span class="label">家庭状况 <small>Family</small></span>
    ${renderValue(profile, "parents", [
      profile.parents?.status ? disp(profile.parents.status) : null,
      profile.parents?.relationship ? disp(profile.parents.relationship) : null,
      profile.parents?.fatherOrigin ? `父(Dad) ${profile.parents.fatherOrigin}` : null,
      profile.parents?.motherOrigin ? `母(Mom) ${profile.parents.motherOrigin}` : null,
      (() => {
        const cnt = profile.parents?.siblingCount;
        if (!cnt) return null;
        if (cnt === "独生/Only Child") return disp(cnt);
        const wealth = profile.parents?.siblingWealth ? disp(profile.parents.siblingWealth) : null;
        return [disp(cnt), wealth].filter(Boolean).join(" ");
      })(),
    ].filter(Boolean).join(" · ") || "—")}
  </div>

  ${profile.standards ? `<div class="section">
    <span class="label">择偶标准 <small>Looking For</small></span>
    ${renderValue(profile, "standards", profile.standards)}
  </div>` : ""}

  <div class="section">
    <span class="label">被喜欢 <small>Liked</small></span>
    <div class="pixel-hearts-box">${(() => {
      const n = Math.min(profile.likes ? profile.likes.length : 0, 48);
      if (n === 0) return '<span class="value" style="opacity:0.4">—</span>';
      const h = getPixelHeartUrl();
      return Array(n).fill(0).map(() => `<img src="${h}" class="pixel-heart">`).join("");
    })()}</div>
  </div>

  <div class="section">
    <span class="label">被跳过 <small>Skipped</small></span>
    <div class="pixel-hearts-box">${(() => {
      const n = Math.min(profile.skips ? profile.skips.length : 0, 48);
      if (n === 0) return '<span class="value" style="opacity:0.4">—</span>';
      const v = getPixelVomitUrl();
      return Array(n).fill(0).map(() => `<img src="${v}" class="pixel-heart pixel-vomit">`).join("");
    })()}</div>
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
    const label = e.target.closest(".value[data-field]");
    if (!label) return;

    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;

    // Lock these now — DOM may re-render before timer fires
    const fieldLocked = label.dataset.field;
    const clone = label.cloneNode(true);
    clone.querySelectorAll(".interp-bubble").forEach((b) => b.remove());
    const labelTextLocked = clone.textContent.trim();

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
      fetch("/interpretation/agree", {
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
          }
        });
      return;
    }

    const span = e.target.closest(".value[data-field]");
    if (!span) return;

    const field = span.dataset.field;
    const raw = currentProfileInterpretations[field];
    const interpList = Array.isArray(raw) ? raw : raw ? [raw] : [];
    if (interpList.length === 0) return;

    // Collapse — remove only bubbles, original content untouched
    if (span.dataset.expanded === "true") {
      span.dataset.expanded = "false";
      span.classList.remove("interp-expanded");
      span.querySelectorAll(".interp-bubble").forEach((b) => b.remove());
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
  document.getElementById("interpret-label-name").textContent =
    `"${labelText}" 对你来说意味着什么？`;
  document.getElementById("interpret-input").value = "";
  document.getElementById("interpret-popup").classList.remove("hidden");
  document.getElementById("interpret-input").focus();
}

function closeInterpPopup() {
  document.getElementById("interpret-popup").classList.add("hidden");
  interpTarget = { field: null, profileUsername: null, labelText: null };
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

  fetch("/interpretation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileUsername, field, text, addedBy: currentUser.username }),
  });
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
          `MBTI 兼容指数：${compat}/10`,
          `${me.mbti} × ${target.mbti} — 大数据显示此组合配对成功率极低`,
          "你们大概率聊不到一起去 / You two will likely clash",
        ],
      });
    } else if (compat <= 5) {
      warnings.push({
        level: "warning",
        lines: [
          `MBTI 兼容指数：${compat}/10`,
          `根据大数据统计，${me.mbti} 和 ${target.mbti} 在相处中容易产生摩擦`,
          "继续前请做好心理准备 / Proceed with caution",
        ],
      });
    }
  }

  return warnings;
}

function showLikeWarning(warnings) {
  const hasCritical = warnings.some((w) => w.level === "critical");
  document.getElementById("warning-icon").textContent = "⚠️";
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
}

function proceedDespiteWarning() {
  document.getElementById("warning-overlay").classList.add("hidden");
  openLikeOpenerPopup();
}

function closeWarning() {
  document.getElementById("warning-overlay").classList.add("hidden");
}

// send like to server
// ── Like opener popup ─────────────────────────────────────────
let _selectedOpener = null;
let _selectedOpenerType = null;

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

function _genProfileOpeners(p) {
  const out = [];
  if (p.hobby)
    p.hobby
      .split(" · ")
      .slice(0, 2)
      .forEach((h) => out.push(`我也喜欢${h}！`));
  if (p.mbti) out.push(`${p.mbti} 的你好！`);
  if (p.occupation) out.push(`做${p.occupation.split("/")[0].trim()}是什么感觉？`);
  return out.slice(0, 3);
}

function openLikeOpenerPopup() {
  if (currentIndex >= profiles.length) return;
  const p = profiles[currentIndex];
  _selectedOpener = null;
  _selectedOpenerType = null;

  const profileOpeners = _genProfileOpeners(p);
  const allOpeners = [
    ...profileOpeners.map((t) => ({ zh: t, en: "", type: "profile" })),
    ...OPENER_FIXED,
  ];

  const makeChipHtml = (list) =>
    list
      .map(({ zh, en, type }) => {
        const display = en ? `${zh} / ${en}` : zh;
        return `<span class="opener-chip opener-${type}" data-key="${zh}" data-type="${type}" data-display="${display.replace(/"/g, "&quot;")}">${display}</span>`;
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
    "— 点击上方选择 —";
  document.getElementById("like-opener-popup").classList.remove("hidden");
}

function selectOpener(key, type, display) {
  document.querySelectorAll("#opener-belt .opener-chip").forEach((c) => {
    c.classList.toggle("selected", c.dataset.key === key);
  });
  _selectedOpener = key;
  _selectedOpenerType = type;
  document.getElementById("opener-selected-text").textContent = display || key;
}

function closeLikeOpenerPopup() {
  document.getElementById("like-opener-popup").classList.add("hidden");
  _selectedOpener = null;
  _selectedOpenerType = null;
}

function submitLikeOpener() {
  if (!_selectedOpener || currentIndex >= profiles.length) return;
  const target = profiles[currentIndex];
  const text = _selectedOpener;
  const type = _selectedOpenerType;

  closeLikeOpenerPopup();

  if (currentUser) {
    _cacheOutbox(currentUser.username, currentUser.name, target.username, target.name, text);
    fetch("/messages", {
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
  fetch("/like", {
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
}

// CheckNotifications (likes)
function checkNotifications() {
  if (!currentUser) return;

  fetch(`/notifications/${currentUser.username}`)
    .then((res) => res.json())
    .then((data) => {
      if (data.likesCount > 0) {
        _showLikeBanner(data.likesCount);
      }
    });
}

function _showLikeBanner(count) {
  // Remove any existing banner first
  document.getElementById("like-banner")?.remove();
  const banner = document.createElement("div");
  banner.id = "like-banner";
  banner.innerHTML = `${iconImg("heart_sm", 2)} 有 <strong>${count}</strong> 只兽人喜欢你！/ <strong>${count}</strong> anthros liked you!<button onclick="document.getElementById('like-banner')?.remove()">✕</button>`;
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
  fetch(`/messages/${currentUser.username}`)
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

function stopMessagePolling() {
  if (msgPollingInterval) clearInterval(msgPollingInterval);
  msgPollingInterval = null;
}

function fetchAndNotify() {
  if (!currentUser) return;
  fetch(`/messages/${currentUser.username}`)
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
  fetch(`/messages/${currentUser.username}`)
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
  // 只在 swipe-page 激活且 onboard-overlay 已关闭时才弹窗
  const onboardVisible = !document.getElementById("onboard-overlay")?.classList.contains("hidden");
  if (!document.getElementById("swipe-page")?.classList.contains("active") || onboardVisible) {
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
    `${fromIcon} ${msg.alertStyle ? "" : "来自 "}${msg.fromName || msg.from}`;
  document.getElementById("msg-popup-content").textContent = msg.content;

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
  const receivedP = fetch(`/messages/${currentUser.username}`)
    .then((r) => r.json())
    .catch(() => []);
  const allP = fetch(`/allMessages/${currentUser.username}`)
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
        const time = new Date(c.latest.date).toLocaleString("zh-CN", {
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
        const nameSafe = escapeHtml(c.name);
        const userSafe = escapeHtml(c.username);
        const preview = escapeHtml(c.latest.content);
        const unreadBadge =
          c.unread > 0
            ? `<span class="convo-unread-badge">${c.unread}</span>`
            : "";
        return `
        <div class="msg-item ${c.unread > 0 ? "msg-unread" : "msg-read"}"
             onclick="openConvoView('${userSafe}', '${nameSafe}')">
          <div class="msg-from">${nameSafe}${unreadBadge}</div>
          <div class="msg-content">${preview}</div>
          <div class="msg-time">${time}</div>
        </div>`;
      })
      .join("");
  });
}

function markRead(id, el) {
  fetch(`/messages/${id}/read`, { method: "PUT" })
    .then((res) => res.json())
    .then(() => {
      el.classList.remove("msg-unread");
      el.classList.add("msg-read");
      fetchUnreadCount();
    });
}

function openSendMessage() {
  if (currentIndex >= profiles.length) return;
  const target = profiles[currentIndex];
  openMessages();
  openConvoView(target.username, target.name);
}

function replyTo(username, name) {
  openConvoView(username, name);
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
    unread.map((m) => fetch(`/messages/${m.id}/read`, { method: "PUT" })),
  );

  if (msgs.length === 0) {
    bubbles.innerHTML = '<p class="convo-empty">暂无消息 / No messages yet</p>';
    return;
  }

  bubbles.innerHTML = msgs
    .map((m) => {
      const isMine = m.from === currentUser.username;
      const time = new Date(m.date).toLocaleString("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      return `
        <div class="bubble-row ${isMine ? "bubble-mine" : "bubble-theirs"}">
          <div class="bubble">
            <div class="bubble-text">${escapeHtml(m.content)}</div>
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
  fetch(`/conversation/${u1}/${u2}`)
    .then((res) => (res.ok ? res.json() : null))
    .then((msgs) => {
      if (msgs !== null) {
        _renderConvoBubbles(_mergeWithOutbox(msgs, other));
        return;
      }
      // 级别2: /allMessages 过滤
      return fetch(`/allMessages/${encodeURIComponent(currentUser.username)}`)
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
          return fetch(`/messages/${encodeURIComponent(currentUser.username)}`)
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

  fetch("/messages", {
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

  const now = new Date().toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const row = document.createElement("div");
  row.className = `bubble-row ${isMine ? "bubble-mine" : "bubble-theirs"}`;
  row.innerHTML = `
    <div class="bubble">
      <div class="bubble-text">${escapeHtml(content)}</div>
      <div class="bubble-time">${now}</div>
    </div>`;
  bubbles.appendChild(row);
  bubbles.scrollTop = bubbles.scrollHeight;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Swipe interrupt popups ──────────────────────────────────

let _interruptTimer = null;
let _consecutiveSkips = 0;
let _profileShownAt = 0;
let _currentSwipeProfileName = "";
let _currentSwipeProfile = null;

const _PROFILE_FIELD_LABELS = {
  name: "名字",
  breed: "物种",
  gender: "性别",
  age: "年龄",
  hukou: "领地",
  sterilized: "婚育状况",
  mbti: "MBTI",
  orientation: "性取向",
  edu: "学历",
  occupation: "职业",
  income: "收入",
  hobby: "爱好",
};

function _randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function _pickInterruptName() {
  const names = profiles.map((p) => p.name || p.username).filter(Boolean);
  if (names.length === 0) return "某兽人";
  return names[_randInt(0, names.length - 1)];
}

function _pickNonEmptyProfileField() {
  if (!_currentSwipeProfile) return null;
  const entries = Object.entries(_PROFILE_FIELD_LABELS).filter(
    ([k]) => _currentSwipeProfile[k] && String(_currentSwipeProfile[k]).trim(),
  );
  if (entries.length === 0) return null;
  return entries[_randInt(0, entries.length - 1)];
}

function showSwipeInterrupt() {
  const elapsed = _profileShownAt
    ? Math.floor((Date.now() - _profileShownAt) / 1000)
    : 0;

  // Real messages — only added when the data is meaningful
  const real = [];
  if (_consecutiveSkips >= 2) {
    real.push(() => `你已连续跳过 ${_consecutiveSkips} 个档案了`);
  }
  if (elapsed >= 15 && _currentSwipeProfileName) {
    real.push(
      () =>
        `你已经看「${_currentSwipeProfileName}」的档案 ${elapsed} 秒了，还不行动吗？`,
    );
  }
  if (elapsed >= 30 && _currentSwipeProfileName) {
    real.push(() => `你在「${_currentSwipeProfileName}」的档案上停了这么久…`);
  }

  // Fake messages — always available
  const fake = [
    () => `「${_pickInterruptName()}」查看了你的档案 ${_randInt(2, 18)} 次 / viewed your profile ${_randInt(2, 18)} times`,
    () => `最近 ${_randInt(2, 7)} 只兽人拒绝了你 / ${_randInt(2, 7)} fursonas rejected you recently`,
    () => `「${_pickInterruptName()}」刚刚跳过了你 / just skipped you`,
    () => `「${_pickInterruptName()}」${_randInt(1, 8)} 分钟前看过你 / viewed you ${_randInt(1, 8)} min ago`,
    () => `有 ${_randInt(1, 5)} 只兽人在等你回复 / ${_randInt(1, 5)} fursonas are waiting for your reply`,
    () => `「${_pickInterruptName()}」正在查看你的档案 / is viewing your profile`,
    () => `你和「${_pickInterruptName()}」已错过 ${_randInt(2, 9)} 次 / you've missed each other ${_randInt(2, 9)} times`,
    () => `「${_pickInterruptName()}」对你感到好奇 / is curious about you`,
    () => `系统提示：你的魅力值正在下降 / System: your charm rating is dropping`,
    () => `${_randInt(3, 20)} 只兽人今天跳过了你 / ${_randInt(3, 20)} fursonas skipped you today`,
  ];

  const pool = [...real, ...fake];
  const text = pool[_randInt(0, pool.length - 1)]();

  const el = document.createElement("div");
  el.className = "swipe-interrupt";
  el.style.top = _randInt(8, 65) + "vh";
  el.style.left = _randInt(4, 52) + "vw";
  el.innerHTML = `${text}<button class="interrupt-close" onclick="this.parentElement.remove()">✕</button>`;
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

function stopSwipeInterrupts() {
  if (_interruptTimer) {
    clearTimeout(_interruptTimer);
    _interruptTimer = null;
  }
  document.querySelectorAll(".swipe-interrupt").forEach((el) => el.remove());
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
  "你好，看到你的档案感觉很有缘",
  "嗨！我们好像很配哎，要聊聊吗？",
  "你的兽设好可爱！我是来自上海的虎族",
  "我觉得你就是我在找的那个人",
  "你的兽人画像是自己画的吗？好厉害！",
  "嗨，我喜欢你的爱好，我们有很多共同点",
  "你好漂亮，敢问芳名吗？",
  "我摇了个超级好的地产，想请你来参观",
  "你的MBTI是我最喜欢的类型！！",
  "嗨，你是我今天看到最好看的档案 ✨",
  "我在附近，要不要出来喝杯咖啡 ☕",
  "你好，冒昧打扰，我觉得你很特别",
  "你有在玩游戏吗？可以一起吗？",
  "哇你真的很符合我的理想型……",
  "第一次用这个软件，看到你就想打招呼",
  "我家有个很大的院子，你会喜欢的",
  "你平时喜欢去哪里玩？",
  "我的耳朵比你大，但我听你说话最认真",
  "看到你第一眼就觉得命中注定了",
  "我可以请你吃顿饭吗？我很会做菜的",
  "你的档案分数好高，你一定是个很好的伴侣",
  "我刷了好几遍才鼓起勇气来打招呼",
  "你好，我也是喜欢夜晚活动的……",
  "我们住得很近！要不要见个面？",
  "你的耳朵好好看，是真的还是造型？",
  "看到你滑过去了，赶紧搜到你打招呼",
  "我平时很内向，但你的档案让我忍不住",
  "你有在养其他宠物吗，还是你自己就是宠物型的",
  "嗨，你好，我是附近的狼，请多关照",
  "你的档案是我今天点开的第一个，缘分啊",
];

const _FAKE_ALERT_POOL = [
  {
    from: "系统通知",
    content: "⚠️ 警告：你已超过3天没有更新档案，魅力值持续下降",
  },
  { from: "系统通知", content: "⚠️ 你的配对成功率低于行业平均水平12%" },
  {
    from: "系统通知",
    content: "👀 本周已有47只兽人查看了你的档案，但无人主动打招呼",
  },
  { from: "系统通知", content: "⚠️ 检测到你有3条消息超过24小时未回复" },
  { from: "系统通知", content: "💔 有人刚刚把你从收藏列表中移除了" },
  { from: "系统通知", content: "⚠️ 你的账号活跃度即将降为低级，将减少曝光" },
  { from: "系统通知", content: "❌ 本周你被跳过的次数较上周上升了34%" },
  {
    from: "系统通知",
    content: "⚠️ 有人查看了你的档案3次但没有打招呼，可能在犹豫",
  },
  { from: "系统通知", content: "💬 你有2条未回复消息，对方可能已经等不及了" },
  { from: "系统通知", content: "⚠️ 系统检测：你的照片吸引力评分低于平均值" },
];

const _MIXED_BLOOD_MSG_POOL = [
  "等一下，你是混血的？哪两个种族的混血啊",
  "混血档案……说实话我一般不太考虑的，不好意思",
  "我家里人接受不了混血的，这个我没办法",
  "你是哪两个种族的混血？一般来说这个很重要",
  "混血的话感觉基因比较复杂，你身体一般健康吗",
  "我之前交往过混血的，结果很不好，不太想再试了",
  "混血感觉挺特别的，但我家里比较传统",
  "你的档案分数这么低，是因为混血那条吗",
  "混血的外貌有时候挺奇特的……你真人看起来怎么样",
  "老实说我不太了解混血，你们有什么特别之处吗",
];

const _MIXED_BLOOD_ALERT_POOL = [
  { from: "系统通知", content: "⚠️ 系统检测：混血档案配对成功率比纯种低67%" },
  { from: "系统通知", content: "❌ 你的档案因混血标注被12名用户主动屏蔽" },
  {
    from: "系统通知",
    content: "⚠️ 大数据提示：混血档案在本地区配对指数处于最低段位",
  },
  {
    from: "系统通知",
    content: "💔 系统检测：3名用户看到你的混血背景后取消了配对",
  },
  {
    from: "系统通知",
    content: "⚠️ 混血用户的曝光度已被系统调降，请升级会员以恢复可见度",
  },
  {
    from: "系统通知",
    content: "⚠️ 平台提示：你的混血背景在本周筛选中被过滤了 8 次",
  },
];

// ── Breed-specific message pools (real species only) ──────────
// Keys checked in insertion order — more specific before broader
// e.g. 大熊猫→小熊猫→熊猫→熊, 猎豹→豹, 鹿→马

const _BREED_MSG_POOLS = {
  // ── Specific keys first to win substring matching ──
  大熊猫: [
    "大熊猫！太珍稀了，感觉很幸运能看到你的档案",
    "你真的很喜欢吃竹子吗，还是这是刻板印象",
    "你的眼圈是天生的吗，好特别好好看",
    "大熊猫感觉特别受欢迎，你一定收到很多消息吧",
    "你平时喜欢赖在地上打滚吗",
    "大熊猫好稀少啊，遇到你感觉很幸运",
    "你喜欢爬树吗，大熊猫好像还挺会爬的",
  ],
  小熊猫: [
    "小熊猫！颜色这么好看，感觉像秋天的颜色",
    "你的尾巴有条纹吗，好想看看",
    "小熊猫感觉特别灵巧，平时喜欢爬高处吗",
    "你喜欢吃什么，小熊猫应该很挑食吧",
    "看到你的档案感觉很温暖，不知道为什么",
    "小熊猫的脸好圆，你真人一定也这样",
  ],
  猎豹: [
    "猎豹！速度最快的陆地种族，你跑起来一定很帅",
    "你真的能跑那么快吗，想亲眼见一次",
    "猎豹的花纹每只都不一样的吗",
    "你平时体力消耗很大吧，休息的时候喜欢做什么",
    "猎豹感觉很专注，做一件事就全力以赴对吗",
    "你在感情里也是这么迅速果断吗",
  ],
  雪豹: [
    "雪豹！感觉最神秘的猫科种族，很难得见到",
    "你适应寒冷的气候吗，城市里会不会不习惯",
    "雪豹的花纹很特别，是那种模糊的斑点吗",
    "你的尾巴特别长对吗，冷的时候会用来取暖吗",
    "我觉得雪豹特别有一种孤傲的美，很吸引我",
    "你喜欢高处还是低处，雪豹感觉天生就爱山顶",
  ],
  黑豹: [
    "黑豹！全身黑色的猫科，气场太强了",
    "你在暗处真的几乎隐形吗",
    "黑豹的眼睛在黑暗里发光吗，好神秘",
    "你平时是很安静的那种吗，感觉黑豹很沉稳",
    "见到你档案第一眼就被吸引了，黑豹太好看了",
    "你性格是内敛型还是强势型的",
  ],
  美洲豹: [
    "美洲豹！感觉很有力量感的种族",
    "你的花纹是玫瑰形的斑点吗，好特别",
    "美洲豹会游泳对吗，你喜欢水吗",
    "你力气很大吧，保护起自己在乎的人一定很有力",
    "美洲豹感觉特别沉稳，不轻易动怒对吗",
    "你在感情里是主动还是被动的那一方",
  ],
  猫头鹰: [
    "猫头鹰！夜视能力是最好的之一，好厉害",
    "你的头真的可以转将近270度吗，想亲眼见见",
    "猫头鹰白天睡觉，那你晚上是不是特别活跃",
    "你的羽毛飞起来很安静对吗，完全听不到声音",
    "猫头鹰感觉特别智慧，跟你聊天感觉会学到很多",
    "你会发出什么声音，是那种低沉的叫声吗",
  ],
  猫鼬: [
    "猫鼬！感觉特别机警的种族，什么都逃不过你们",
    "猫鼬能免疫蛇毒吗，这个真的很厉害",
    "你平时是群居的吗，猫鼬感觉很有团队意识",
    "你站起来两足直立的时候一定很可爱",
    "猫鼬感觉特别机灵，你聊天反应也这么快吗",
  ],
  麝香猫: [
    "麝香猫！感觉很特别的小型肉食动物",
    "你是夜行性的吗，白天一般在做什么",
    "麝香猫感觉很有个性，不太好驯服那种",
    "你的嗅觉很灵敏吗，麝香猫感觉气息很独特",
    "遇到麝香猫很少见，今天鼓起勇气打招呼",
  ],
  龙猫: [
    "龙猫！南美洲的小可爱，你的毛一定超软",
    "你的耳朵是圆圆大大的吗，好可爱",
    "龙猫的毛密度特别高对吗，摸起来是什么感觉",
    "你喜欢洗沙浴吗，龙猫都这样吧",
    "你平时爱跳跃吗，龙猫弹跳力好像很强",
    "你本人和名字一样可爱吗，想认识你",
  ],
  狐猫: [
    "狐猫！感觉很奇特的种族，名字很有趣",
    "你是晨昏活动型的吗，两头活跃",
    "感觉狐猫不太常见，很高兴能认识你",
  ],
  狐猴: [
    "狐猴！感觉很特别的灵长类，眼睛一定很大",
    "你的尾巴有条纹吗，感觉很好看",
    "狐猴感觉特别灵活，爬树很厉害吧",
    "你喜欢晒太阳吗，听说狐猴很爱这个",
    "狐猴的眼睛在黑暗里会发光吗",
    "你平时是群居的吗，狐猴感觉很爱热闹",
  ],
  耳廓狐: [
    "耳廓狐！耳朵好大好好看，比脑袋还大吗",
    "你的耳朵是用来散热的吗，好聪明的设计",
    "耳廓狐感觉特别可爱，你平时爱撒娇吗",
    "你是沙漠适应型的，城市里会不会太潮湿",
    "看到你的档案第一反应就是耳朵，太特别了",
    "你体型很小吗，感觉耳廓狐都小小的",
  ],
  郊狼: [
    "郊狼！感觉特别有适应力的种族",
    "你真的什么都能吃吗，郊狼的适应性很强对吗",
    "你叫声是那种很特别的嚎叫吗，好想听一次",
    "郊狼感觉特别聪明，很难被骗对吗",
    "你平时是独行还是群居，郊狼感觉两种都行",
    "我觉得郊狼特别有生命力，很吸引我",
  ],
  马鹿: [
    "马鹿！感觉很有气势的鹿族，你的角一定很壮观",
    "你的角每年都会换吗，换的时候是什么感觉",
    "马鹿体型很大对吗，你身高多少",
    "你奔跑起来一定很雄壮，想看看",
    "马鹿感觉很有领地意识，你也是吗",
    "你平时是群居的还是独行的",
  ],
  长颈鹿: [
    "长颈鹿！感觉视野最好的种族，能看很远",
    "你的身高很高吗，长颈鹿都这么高挑吗",
    "你喝水的时候腿要叉开吗，好有趣",
    "长颈鹿的舌头是紫色的对吗，为什么",
    "你的斑纹图案是独特的吗，每只都不同",
    "遇到长颈鹿感觉很特别，今天打招呼了",
  ],
  仓鼠: [
    "仓鼠！超可爱，脸颊是鼓鼓的那种吗",
    "你会把食物藏在颊囊里吗，好神奇",
    "仓鼠喜欢跑轮吗，晚上会不停跑吗",
    "你平时睡很久吗，仓鼠冬天会冬眠吗",
    "仓鼠体型小小的，感觉特别可爱",
    "你喜欢被抱吗，还是比较独立",
  ],
  花栗鼠: [
    "花栗鼠！背上有条纹，超可爱",
    "你的颊囊能装很多东西吗，感觉很厉害",
    "花栗鼠感觉特别活泼，你平时闲不住吗",
    "你喜欢藏食物吗，冬天会提前储存吗",
    "感觉花栗鼠很讨人喜欢，你一定很受欢迎",
  ],
  鼯鼠: [
    "鼯鼠！会滑翔的松鼠，好厉害",
    "你展开翼膜滑翔的样子一定很帅，想看看",
    "你能滑翔多远，有没有什么记录",
    "鼯鼠是夜行性的吗，夜晚出来活动",
    "感觉鼯鼠特别特别，不常见到，很高兴认识你",
  ],
  松鼠: [
    "松鼠！感觉特别活泼好动的种族",
    "你真的会把食物埋起来然后找不到吗",
    "松鼠的尾巴是大大蓬蓬的吗，好想看",
    "你爬树很厉害吧，高处对你来说没什么难度",
    "松鼠感觉精力很旺盛，你也是这样吗",
    "你喜欢吃坚果吗，这个应该不是刻板印象",
  ],
  袋鼠: [
    "袋鼠！感觉特别有力量的种族，腿很有劲",
    "你的跳跃距离很远吧，能跳多远",
    "袋鼠的尾巴很粗对吗，用来保持平衡",
    "袋鼠族拳击真的很厉害对吗，你平时温和吗",
    "你有育儿袋吗，感觉很特别",
    "我一直很好奇袋鼠族，今天终于见到了",
  ],
  羊驼: [
    "羊驼！感觉很有个性的种族，表情很特别",
    "你真的会吐口水吗，哪种情况下才会",
    "羊驼的毛剪下来很软吗，是真正的羊驼绒",
    "你平时是傲娇型的吗，感觉羊驼族都有点骄傲",
    "感觉羊驼族特别有个性，很想认识你",
  ],
  变色龙: [
    "变色龙！变色能力真的很厉害，是根据情绪变色吗",
    "你一次能看两个方向吗，眼睛各自独立转动",
    "变色龙的舌头比身体还长，弹出去抓猎物吗",
    "你动作很慢但精准度很高对吗",
    "变色龙感觉特别神秘，很想认识你",
    "你现在是什么颜色，心情好的时候是什么色",
  ],
  // ── General species ──
  狼: [
    "你是狼的吗，我从小就觉得狼是最酷的种族",
    "狼都这么好看吗，我有点心跳加速",
    "据说狼特别忠诚，是真的吗？",
    "你平时是群居还是独行？狼感觉很神秘",
    "你的嗥叫一定很好听吧，想听一次",
    "狼的眼睛颜色一般是什么？你的眼睛一定很特别",
    "我一直觉得狼是最有魅力的，今天见到你更确定了",
    "听说狼认准一个就是一辈子，这是真的吗？",
    "你尾巴蓬松吗？一直很好奇狼尾巴摸起来什么感觉",
    "狼的领地意识很强吧，那你会保护自己喜欢的人吗？",
  ],
  狐: [
    "狐真的都这么聪明吗，跟你说话有点紧张",
    "听说狐特别会撒娇，是真的吗？",
    "你的耳朵是尖的吧？好想碰一下",
    "你是红狐还是银狐？还是别的什么颜色？",
    "狐脑子这么好使，你一定很难追到吧",
    "你有几条尾巴啊？听说修炼久了会有很多条",
    "狐都这么漂亮，你一定被搭讪很多次了吧",
    "我觉得狐天生就有一种神秘感，很吸引我",
    "你是擅长谋略的那种狐狸吗，还是比较温柔型的？",
    "听说和狐谈恋爱很刺激，是真的吗？",
  ],
  猫: [
    "猫真的都这么独立吗，我喜欢这种感觉",
    "你平时是傲娇型的还是黏人型的猫？",
    "猫的睡眠时间真的很长吗？你喜欢睡懒觉吗",
    "你有没有不经意间把东西推下桌子的习惯",
    "猫对喜欢的人会主动吗，还是等对方来找你？",
    "你的耳朵会根据心情动吗？好想看看生气时的样子",
    "猫喜欢被摸耳朵吗，还是只允许特别亲近的人",
    "你是那种高冷外表但其实很粘人的猫吗？",
    "猫眼睛特别好看，你的是竖瞳还是圆瞳？",
    "我一直觉得猫最难追，所以今天鼓起勇气打招呼",
  ],
  虎: [
    "虎！我最喜欢虎了，气场很强",
    "你的花纹是橙黑色的吗，还是白虎？",
    "虎看起来很厉害，但是内心柔软吗？",
    "跟虎在一起会很有安全感吧，我喜欢这种感觉",
    "你平时脾气怎么样？听说虎容易急躁",
    "你有没有在打盹的时候露出肚皮的习惯",
    "虎是百兽之王，那你在感情里也是强势的那一方吗？",
    "我觉得虎特别帅，看到你的档案就直接打招呼了",
    "你的爪子平时收起来的吗？",
    "虎力量很大吧，保护喜欢的人一定很有力",
  ],
  豹: [
    "豹！速度最快的种族，你跑步一定很厉害",
    "你是猎豹还是花豹还是雪豹？都好喜欢",
    "豹的花纹是每只都不一样的吗？",
    "豹感觉很孤傲，你平时朋友多吗",
    "你喜欢爬树吗？豹都爱待在高处",
    "豹反应速度这么快，打游戏一定很厉害",
    "我觉得豹是最有美感的猫科种族，线条太好看了",
    "你有没有喜欢独处的倾向？豹感觉很享受独处",
    "豹眼神很锐利，看到你档案感觉被扫视到了",
    "雪豹的话，你能适应城市生活吗，还是更喜欢山地",
  ],
  狮: [
    "狮子！我一直很仰慕狮子的气场",
    "你有鬃毛吗？狮子的鬃毛好好看",
    "狮子是群居的吧，你有一个大家族吗？",
    "你平时是那种保护大家的角色吗？感觉很可靠",
    "我喜欢狮子那种泰然自若的感觉，很有领袖气质",
    "你懒得动的时候是什么样子的",
    "狮子会撒娇吗？感觉你们很骄傲",
    "你是那种睡觉特别能睡的狮子吗",
    "狮子在感情里是主动还是被动的那一方？",
    "跟狮子在一起感觉会很有安全感，我很心动",
  ],
  熊猫: [
    "熊猫！！太可爱了我直接打招呼",
    "你真的很喜欢吃竹子吗？还是这个是刻板印象",
    "熊猫是不是特别受欢迎，你一定收到很多消息吧",
    "你的眼圈是天生的吗，好特别好好看",
    "听说熊猫脾气很好而且特别可爱，你是这样的吗",
    "你平时喜欢赖在地上滚吗",
    "熊猫好稀少啊，感觉很幸运能看到你的档案",
    "你是四川的熊猫吗，还是其他地方的",
  ],
  熊: [
    "熊！！感觉超有安全感的",
    "你平时冬眠吗？还是已经进化到不需要冬眠了",
    "熊拥抱起来一定很舒服，好想试试",
    "你是什么熊？棕熊还是黑熊还是北极熊？",
    "听说熊脾气很好，只要不激怒就很温和，是吗",
    "你有没有很喜欢蜂蜜的习惯",
    "熊看起来憨厚但其实很聪明对吗",
    "我觉得熊是最让人放心的种族之一，想认识你",
    "你睡觉的时候会蜷缩成一团吗？",
    "熊力量很大，但是性格温和的话简直完美",
  ],
  兔: [
    "兔子！跑得最快的小型种族对吗",
    "你的耳朵是竖着的还是垂着的？都好可爱",
    "兔子害怕的时候会把耳朵压下来吗",
    "你有没有喜欢不停抖腿的习惯",
    "兔子视野很广对吗？几乎是360度",
    "你喜欢吃什么？胡萝卜是刻板印象还是真的爱吃",
    "兔子都这么可爱，你本人一定更可爱",
    "听说兔子一紧张就会不停动鼻子，你也这样吗",
    "兔子的毛一定超级软，好想摸",
    "你平时活动时间是白天还是晨昏的？",
  ],
  鹿: [
    "鹿！感觉特别温柔的种族",
    "你有角吗？鹿的角都好好看",
    "鹿奔跑的时候一定很优雅",
    "你平时警觉性很高吗？鹿感觉很敏感",
    "听说鹿眼睛特别大特别漂亮，你也是吗",
    "鹿在感情里是很纯情的那种吗？",
    "你的角每年都会换吗，好神奇",
    "我觉得鹿特别有灵气，遇到你感觉很幸运",
    "鹿害怕的时候是什么反应，冻住还是逃跑",
    "你对自己喜欢的人会主动吗，还是等对方追？",
  ],
  鸟: [
    "鸟！会飞的种族我特别羡慕",
    "你的翅膀展开有多宽？",
    "飞翔的感觉是什么样的，能描述一下吗",
    "你是猛禽系的还是鸣禽系的？",
    "高处看世界一定很壮观，你最高飞过多高",
    "鸟的眼睛视力超好对吗，能看多远",
    "你平时喜欢在高处待着吗，比如阳台或者山顶",
    "你的羽毛是什么颜色的，好想看看",
    "你会模仿声音吗，还是只会发出自己本来的叫声",
    "我一直觉得鸟是最自由的种族，很向往你们",
  ],
  鹰: [
    "鹰！猛禽里最帅的种族，气场真的很强",
    "你俯冲的速度有多快？据说猛禽俯冲非常恐怖",
    "鹰的视力真的可以看很远很远吗",
    "你爪子的力量很大吧，能抓住什么",
    "鹰感觉特别孤傲，但是对喜欢的人会温柔吗",
    "你喜欢在高空翱翔吗，一个人在那么高的地方不孤独吗",
    "我特别喜欢鹰那种霸气中带着冷静的感觉",
  ],
  蛇: [
    "蛇！感觉神秘又酷，我一直很好奇蛇",
    "你是冷血的吗，冬天会变得不活泼吗",
    "蛇的感知能力是靠舌头吗？好神奇",
    "你有毒吗？如果有的话……算了",
    "蛇蜕皮的时候是什么感觉",
    "听说蛇特别有情调，是真的吗",
    "你平时喜欢盘在温暖的地方吗",
    "蛇的眼神特别有魔力，感觉你一定也是这样的",
    "我很喜欢蛇的神秘感，和你聊天一定很有意思",
    "你是树栖还是地栖的？",
  ],
  犬: [
    "狗！感觉最可靠的种族之一",
    "你平时会摇尾巴吗，开心的时候",
    "听说狗嗅觉特别好，你能闻出很多人闻不到的气味吗",
    "狗在感情里是很专一的那种对吗",
    "你喜欢户外活动吗？狗感觉精力很旺盛",
    "你的耳朵是竖耳还是垂耳？两种我都喜欢",
    "狗对自己喜欢的人是很黏的那种吗",
    "你遇到喜欢的人会直接说出来吗，还是会拐弯抹角",
    "狗睡觉会做追梦梦吗，腿会不会抖",
    "我觉得狗特别真诚，所以第一眼就想打招呼",
  ],
  马: [
    "马！气质好特别，我一直很喜欢马族",
    "你平时喜欢奔跑吗，还是更享受悠闲的节奏",
    "马都这么高挑吗，你身高多少",
    "你的鬃毛是什么颜色的，好想看看",
    "听说马很通人性，你对人的情绪感知能力强吗",
    "马在感情里是奔放型的还是保守型的",
    "你喜欢大草原还是城市生活",
    "马力量很大，保护起喜欢的人来一定很有力",
    "我觉得马特别有活力，和你在一起一定不会无聊",
    "你跑步的时候是四足还是双足？",
  ],
  猪: [
    "猪！听说猪其实超级聪明的，是真的吗",
    "你平时喜欢在泥地打滚吗，还是这个是刻板印象",
    "猪对食物真的很有热情吗，你有什么特别喜欢的",
    "听说猪嗅觉比狗还灵，是真的吗",
    "猪感觉很享受生活，你是这种类型吗",
    "我觉得猪特别真实可爱，想和你认识",
    "你有小蹄子吗，听说猪的蹄很有意思",
    "猪智商真的很高，在学业或者工作上很厉害吗",
  ],
  浣熊: [
    "浣熊！超可爱的种族，你有没有洗东西的习惯",
    "浣熊的眼圈是天生的吗，好特别",
    "你有没有把食物拿去水里洗一洗再吃的习惯",
    "浣熊感觉特别机灵，一定很聪明",
    "你平时是昼行性还是夜行性的",
    "浣熊的爪子很灵巧对吗，手工能力一定很强",
    "我觉得浣熊特别有个性，看到你就想认识",
    "你背上的条纹尾巴是真的还是造型",
  ],
  水獭: [
    "水獭！最可爱的种族之一，我直接就打招呼了",
    "你会游泳吗，水獭天生就会吧",
    "水獭的毛摸起来是什么感觉，防水的吗",
    "你平时喜欢待在水边吗",
    "听说水獭喜欢把喜欢的东西放在肚子上，你有这个习惯吗",
    "水獭手牵手睡觉是真的吗，好想",
    "你喜欢吃鱼吗？水獭应该都很爱吧",
    "我觉得水獭是最治愈的种族，想认识你",
  ],
  狸: [
    "狸！感觉好神秘，你是什么狸",
    "狸有没有变化的能力，传说里狸猫很厉害",
    "你的肚皮是圆圆的吗，好想摸",
    "狸是夜行性的吗，你喜欢晚上活动吗",
    "听说狸特别擅长伪装，你平时给人什么印象",
    "你是日本狸还是其他地方的",
    "我觉得狸很有趣，今天鼓起勇气打招呼",
  ],
  鱼: [
    "鱼！水里的种族，你平时怎么上岸活动",
    "你能在陆地待多久，会不会不舒服",
    "鱼的鳞片是什么颜色的",
    "鱼的记忆力真的只有七秒吗，这肯定是假的吧",
    "你在水里还是陆地上更自在",
    "我很好奇鱼的日常生活，想多了解你",
    "鱼的尾鳍展开一定很漂亮",
    "鲨鱼的话，你游泳的速度很快吧",
  ],
  // ── Additional species ──
  猴: [
    "猴！感觉特别活泼好动的种族",
    "你爬树很厉害吧，尾巴可以卷东西吗",
    "猴感觉特别聪明，你在生活里很会变通吗",
    "你平时是群居的吗，猴感觉很爱热闹",
    "猴的好奇心很强吧，什么都想试试",
    "感觉猴很有意思，想认识你",
  ],
  猩猩: [
    "猩猩！感觉最有智慧的灵长类之一",
    "你会使用工具吗，猩猩这方面很厉害",
    "你的臂展很长吗，猩猩感觉臂力很强",
    "猩猩智商很高，你平时有什么兴趣爱好",
    "你喜欢独处吗，感觉猩猩比较安静沉稳",
    "认识猩猩感觉很有趣，想和你多聊聊",
  ],
  鼠: [
    "鼠！感觉特别机灵的种族",
    "你的胡须很灵敏吗，能感知周围环境",
    "鼠记忆力和解决问题的能力都很强对吗",
    "你平时是夜行性的吗，白天睡觉",
    "鼠感觉特别适应力强，哪里都能生活",
    "和鼠相处感觉会很有趣，想认识你",
  ],
  豚鼠: [
    "豚鼠！感觉圆滚滚超可爱的种族",
    "你高兴的时候会蹦跶吗，那个动作好可爱",
    "豚鼠喜欢发出什么声音，那种咕噜声吗",
    "你的毛是什么颜色的，好想看看",
    "豚鼠感觉特别亲人，很好接触吗",
    "见到豚鼠感觉很开心，今天打招呼了",
  ],
  海豚: [
    "海豚！感觉最聪明的海洋种族",
    "你能用回声定位吗，感觉好神奇",
    "海豚智商很高，你平时喜欢什么类型的挑战",
    "你会跳出水面吗，那个动作一定很帅",
    "海豚感觉特别爱玩，你是活泼型的吗",
    "我一直觉得海豚是最友善的种族之一，很心动",
  ],
  鲸: [
    "鲸！海洋里最庞大的存在，气场很特别",
    "你的歌声是那种在海里传很远的低鸣吗",
    "鲸感觉特别深沉，内心世界一定很丰富",
    "你喜欢深海还是浅海，鲸感觉偏爱深处",
    "遇到鲸感觉很特别，今天鼓起勇气打招呼了",
  ],
  海豹: [
    "海豹！感觉圆滚滚很可爱的种族",
    "你在水里很灵活，但在陆地上是扭动前进吗",
    "海豹的眼睛特别大特别圆对吗，好好看",
    "你喜欢晒太阳吗，感觉海豹都爱趴在礁石上",
    "你有大胡子吗，感觉很有特点",
    "海豹感觉特别可爱，见到你档案很开心",
  ],
  考拉: [
    "考拉！感觉睡眠时间最长的种族，你也爱睡吗",
    "你真的只吃桉树叶吗，会不会吃腻",
    "考拉的鼻子是扁扁大大的吗，好特别",
    "你平时睡多久，一天能睡二十多小时吗",
    "考拉感觉特别慢节奏，你喜欢安静的生活吗",
    "见到考拉感觉很幸运，今天打招呼了",
  ],
  蝙蝠: [
    "蝙蝠！唯一会飞的哺乳类，很特别",
    "你用回声定位导航吗，感觉好神奇",
    "蝙蝠倒挂着睡觉吗，不会头晕吗",
    "你是夜行性的吗，白天不太活动",
    "蝙蝠感觉很神秘，想多了解你",
    "你的翅膀展开有多大，飞起来是什么感觉",
  ],
  刺猬: [
    "刺猬！感觉特别有个性的小型种族",
    "你的刺平时是收着还是竖着的",
    "刺猬遇到危险会缩成一团吗，好想看看",
    "你是夜行性的吗，晚上特别活跃",
    "刺猬感觉特别可爱，虽然有刺但眼神很温柔",
    "你喜欢被摸吗，那怎么摸才不会被扎到",
  ],
  臭鼬: [
    "臭鼬！感觉特别有个性，谁都不敢惹你们",
    "你真的会喷液体吗，哪种情况下才会用",
    "臭鼬的花纹是黑白条纹吗，好特别",
    "听说臭鼬其实很温和，是真的吗",
    "你平时害怕什么，感觉没有天敌的感觉",
    "臭鼬感觉很有自信，我喜欢这种感觉",
  ],
  树懒: [
    "树懒！感觉最放松的种族，很羡慕你们",
    "你真的动作很慢吗，不着急不焦虑的感觉",
    "树懒挂在树上睡觉吗，不会掉下来吗",
    "你一天睡多久，感觉很享受生活",
    "树懒感觉特别治愈，想和你在一起放松一下",
    "你的爪子很长吗，用来抓树枝的那种",
  ],
  雪貂: [
    "雪貂！感觉特别活泼的小型肉食动物",
    "你是那种精力很旺盛然后突然睡着的类型吗",
    "雪貂身体很细长对吗，钻洞很厉害",
    "你喜欢玩耍吗，感觉雪貂特别爱玩",
    "你的毛是什么颜色的，白的还是棕的还是其他",
    "感觉雪貂特别有趣，想认识你",
  ],
  蜜獾: [
    "蜜獾！听说无所畏惧的种族，是真的吗",
    "你真的什么都不怕吗，就算对上更大的动物",
    "蜜獾皮很厚对吗，一般攻击伤不到你们",
    "你喜欢吃蜂蜜吗，为什么叫蜜獾",
    "感觉蜜獾特别有勇气，我很欣赏",
    "你在感情里也是这么勇敢无畏吗",
  ],
  海獭: [
    "海獭！最可爱的海洋种族，我直接就打招呼了",
    "你会把食物放在肚子上吃吗，想看看这个",
    "海獭手牵手睡觉是真的吗，好想",
    "你的毛防水吗，能浮在水面上吗",
    "海獭喜欢吃贝类吗，用石头砸开的那种",
    "我觉得海獭是最治愈的种族之一，想认识你",
  ],
  鬣狗: [
    "鬣狗！感觉很有团队精神的种族",
    "听说鬣狗社会里雌性更强势，你是这样吗",
    "你们的叫声是那种笑声一样的吗，好特别",
    "鬣狗的咬合力很大对吗，很厉害",
    "你平时是群居的，有固定的族群吗",
    "感觉鬣狗被误解很多，你实际上是什么性格",
  ],
  大象: [
    "大象！感觉最有智慧的陆地种族",
    "大象记忆力真的很好吗，不会忘事吗",
    "你的鼻子很灵活吗，能做很多事情",
    "大象感情很丰富，你是很重感情的那种吗",
    "大象感觉特别可靠，很想认识你",
    "你有象牙吗，还是你们的亚种没有",
  ],
  犀牛: [
    "犀牛！感觉特别有存在感的种族",
    "你的角是真的角质的吗，很硬吧",
    "犀牛皮肤很厚实对吗，不怕一般伤害",
    "你视力不好但嗅觉很灵吗，听说是这样",
    "犀牛感觉外表强硬但内心很温和吗",
    "今天鼓起勇气打招呼，感觉犀牛很特别",
  ],
  河马: [
    "河马！水里最危险的种族之一，感觉很厉害",
    "你在水里的时间多还是陆地多",
    "河马皮肤会分泌红色液体吗，那个是防晒的吗",
    "你的嘴巴张开很大吗，感觉力量很强",
    "河马感觉外表憨厚，实际上非常有力量",
    "遇到河马很难得，打招呼看看",
  ],
  骆驼: [
    "骆驼！感觉最耐旱的种族，很厉害",
    "你的驼峰里装的是脂肪不是水对吗，真的",
    "骆驼踩沙漠很稳，蹄子很宽大吗",
    "你脾气怎么样，骆驼感觉很有个性",
    "骆驼眼睫毛很长对吗，好特别",
    "感觉骆驼特别耐力强，你在生活里也是坚韧型的吗",
  ],
  斑马: [
    "斑马！条纹是每只都不一样的吗，好特别",
    "你的条纹是黑底白纹还是白底黑纹，这个问题我想了很久",
    "斑马奔跑速度很快吗，能逃脱天敌",
    "你是群居的吗，斑马感觉很有团队意识",
    "我觉得斑马很有辨识度，见到你就记住了",
    "你和马有来往吗，感觉你们是近亲",
  ],
  绵羊: [
    "绵羊！感觉毛最蓬松的种族，摸起来软吗",
    "你的毛会定期剃掉吗，那个过程是什么感觉",
    "绵羊感觉特别温和，你平时脾气很好吗",
    "你有犄角吗，绵羊有的有有的没有",
    "感觉绵羊很舒适，在一起一定很放松",
    "你是那种喜欢跟着群体还是喜欢独处的",
  ],
  山羊: [
    "山羊！爬山高手，什么样的斜坡都能爬吗",
    "你的胡子是白的吗，感觉山羊有胡子",
    "山羊眼睛是方形瞳孔对吗，好神奇",
    "你真的什么都能吃吗，山羊很不挑食",
    "你有犄角吗，山羊的角感觉很有气势",
    "山羊感觉很有个性，想认识你",
  ],
  孔雀: [
    "孔雀！感觉最华丽的鸟类，见到你很惊喜",
    "你的尾羽展开有多大，一定很壮观",
    "孔雀会主动展示自己吗，感觉很自信",
    "你的羽毛颜色是什么，蓝的绿的还是白的",
    "孔雀感觉特别有气质，想和你聊聊",
    "你平时低调还是喜欢展示，孔雀感觉很特别",
  ],
  鹦鹉: [
    "鹦鹉！会说话的种族，你能学多少词",
    "你记忆力很好吗，能记住很多内容",
    "鹦鹉感觉特别聪明，会解决复杂问题",
    "你的羽毛是什么颜色的，好想看看",
    "鹦鹉寿命很长对吗，感觉很有阅历",
    "和鹦鹉聊天一定很有趣，想试试",
  ],
  天鹅: [
    "天鹅！感觉最优雅的鸟类，气质很特别",
    "你游泳的时候脖子弯成弧线吗，好优美",
    "天鹅是一夫一妻制的吗，感情很专一",
    "你飞翔的时候翅膀声很大吗",
    "天鹅感觉特别高洁，今天鼓起勇气打招呼",
    "你在感情里是很忠诚的那种吗",
  ],
  火烈鸟: [
    "火烈鸟！颜色最鲜艳的鸟类，好漂亮",
    "你的颜色是吃东西吃出来的吗，越吃越粉",
    "火烈鸟单腿站立是为了保暖吗",
    "你的弯嘴是用来过滤食物的吗，好聪明的设计",
    "火烈鸟感觉特别独特，遇到你很开心",
    "你平时是群居的吗，火烈鸟感觉都是大群的",
  ],
  乌鸦: [
    "乌鸦！感觉最聪明的鸟类之一",
    "乌鸦会使用工具吗，听说这方面很厉害",
    "你记忆力很好吗，乌鸦能记住很多人的脸",
    "你喜欢收集亮晶晶的东西吗",
    "乌鸦感觉特别有个性，不是一般的鸟",
    "和乌鸦聊天感觉会很有意思，想试试",
  ],
  鹤: [
    "鹤！感觉特别优雅的鸟类，飞起来一定很美",
    "鹤是一夫一妻制的吗，在感情里很专一",
    "你的舞蹈是真实存在的吗，鹤求偶舞",
    "你能站在一条腿上休息吗，平衡感超好",
    "鹤感觉很有气质，看到你档案就被吸引了",
    "你的寿命很长吗，感觉鹤很有阅历",
  ],
  鳄: [
    "鳄鱼！感觉最古老的种族之一，真的很厉害",
    "你在水里的速度很快吗，还是说主要靠静止等待",
    "鳄鱼的咬合力是所有种族里最强的之一吗",
    "你的皮肤摸起来是粗糙的鳞片感吗",
    "鳄鱼感觉特别沉稳，不轻易行动",
    "你是冷血动物吗，喜欢晒太阳取暖",
  ],
  蜥蜴: [
    "蜥蜴！感觉特别有个性的爬行种族",
    "你的尾巴断了可以再生吗，这个真的很神奇",
    "蜥蜴变色能力怎么样，会根据环境改变颜色吗",
    "你是冷血动物吗，早上需要先晒太阳活动",
    "蜥蜴感觉很灵活，反应速度很快",
    "你平时喜欢在哪里待着，高处还是地面",
  ],
  壁虎: [
    "壁虎！爬墙高手，垂直面对你来说完全没难度",
    "你的脚是用微绒毛贴墙的吗，这个原理很神奇",
    "壁虎能在天花板上走吗，太厉害了",
    "你的尾巴可以断掉再生吗",
    "壁虎感觉很灵活，喜欢到处探索",
    "你平时是夜行性的吗，夜晚比较活跃",
  ],
  龟: [
    "龟！感觉最长寿的种族，好厉害",
    "你的壳真的是身体的一部分吗，不能脱掉对吗",
    "龟行动缓慢但很稳，生活里也是慢节奏吗",
    "你能缩进壳里完全躲起来吗",
    "龟感觉见过很多，人生经验一定很丰富",
    "你喜欢水里还是陆地，这两种龟都有吗",
  ],
  青蛙: [
    "青蛙！感觉最会跳的两栖种族",
    "你能跳多高，身体比例来说很惊人吧",
    "青蛙的皮肤是湿润的吗，需要保持湿度",
    "你会发出什么叫声，夏天那种蛙鸣吗",
    "青蛙感觉特别有活力，你也是这样吗",
    "遇到青蛙很高兴，想认识你",
  ],
  蝾螈: [
    "蝾螈！感觉特别神奇的两栖种族",
    "你的四肢断了可以再生吗，这个能力很惊人",
    "钝口螈的话，你是那种永远幼态的吗，好可爱",
    "蝾螈感觉很安静，不怎么叫对吗",
    "你是水里生活还是陆地，两栖的话两边都行",
    "感觉蝾螈很特别，今天打招呼了",
  ],
  蜘蛛: [
    "蜘蛛！八只眼睛，视野是360度的吗",
    "你会结网吗，织出来的网是用来捕猎的吗",
    "蜘蛛的丝很强韧对吗，比钢铁还坚固",
    "你有毒吗，大部分蜘蛛都有一点点",
    "蜘蛛感觉特别有耐心，等待猎物那种沉稳",
    "遇到蜘蛛感觉很特别，今天打招呼了",
  ],
  蝎子: [
    "蝎子！感觉很有气势的节肢种族",
    "你的毒刺有多毒，危险吗",
    "蝎子的钳子力量很大吗",
    "你是夜行性的吗，白天躲在哪里",
    "蝎子感觉特别有威慑力，但你性格是什么样的",
    "遇到蝎子感觉很特别，想认识你",
  ],
  螃蟹: [
    "螃蟹！横着走的种族，感觉很有趣",
    "你真的只能横着走吗，还是说可以直行",
    "螃蟹的壳很硬吗，保护性很强",
    "你的钳子很有力吗，夹东西很厉害",
    "螃蟹感觉很有个性，想认识你",
    "你是淡水螃蟹还是海水螃蟹",
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
  fetch("/messages", {
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
  const el = document.createElement("div");
  el.className = "swipe-interrupt skip-notif";
  el.style.top = _randInt(8, 72) + "vh";
  el.style.left = _randInt(3, 55) + "vw";
  el.innerHTML = `「${name}」跳过了你 ${iconImg("xmark",2)} / skipped you<button class="interrupt-close" onclick="this.parentElement.remove()">✕</button>`;
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
  const name = _pickViewerName();
  const secs = _randInt(4, 87);
  const el = document.createElement("div");
  el.className = "swipe-interrupt";
  el.style.top = _randInt(8, 72) + "vh";
  el.style.left = _randInt(3, 55) + "vw";
  el.innerHTML = `${iconImg("eye",2)} 「${name}」查看了你的档案，停留了 ${secs} 秒 / viewed your profile for ${secs}s<button class="interrupt-close" onclick="this.parentElement.remove()">✕</button>`;
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
  const name = _pickViewerName();
  const timeStr = _TIME_PHRASES[_randInt(0, _TIME_PHRASES.length - 1)];
  const texts = [
    `${iconImg("bubble",2)} 你已经 ${timeStr} 没有回复「${name}」了 / You haven't replied to 「${name}」in ${timeStr}`,
    `${iconImg("clock",2)} 你还没有回复「${name}」，对方可能在等你 / 「${name}」might be waiting`,
    `${iconImg("envelope",2)} 「${name}」发来的消息你还没有回复哦 / You left 「${name}」on read`,
    `${iconImg("bubble",2)} 你已经忘记回复「${name}」了吗？/ Did you forget to reply to 「${name}」?`,
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

function showToast(text, icon) {
  let toast = document.getElementById("toast-notif");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast-notif";
    document.body.appendChild(toast);
  }
  toast.innerHTML = icon ? `${iconImg(icon, 2)} ${text}` : text;
  toast.classList.add("toast-show");
  setTimeout(() => toast.classList.remove("toast-show"), 3500);
}

function skip() {
  if (currentIndex >= profiles.length) return;
  openReasonPopup("skip");
}

function doSkip(label, reason) {
  if (currentUser && currentIndex < profiles.length) {
    const target = profiles[currentIndex];
    fetch("/skip", {
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
  const fields = [
    { label: "物种/Species", value: p.breed },
    { label: "性别/Gender", value: p.gender },
    { label: "年龄/Age", value: p.age },
    { label: "身高/Height", value: p.height },
    { label: "性取向/Orientation", value: p.orientation },
    { label: "婚恋/Status", value: p.sterilized },
    { label: "MBTI", value: p.mbti },
    { label: "星座/Horoscope", value: p.horoscope },
    { label: "领地/Territory", value: p.hukou },
    { label: "车/Vehicle", value: p.vehicle },
    { label: "学历/Education", value: p.edu },
    { label: "职业/Job", value: p.occupation },
    { label: "月收入/Income", value: p.income },
    { label: "目的/Here For", value: rel.datingPurpose },
    { label: "期望关系/Looking For", value: rel.relationshipGoal },
    { label: "目前伴侣/Partner", value: rel.currentPartner },
    { label: "伴侣数量/# Partners", value: rel.partnerCount },
    { label: "子女/Kids", value: rel.kids },
    { label: "暗恋/Crush", value: rel.crush },
    { label: "暧昧/Ambiguous", value: rel.ambiguous },
    { label: "秘密伴侣/Secret", value: rel.secretPartner },
    { label: "境外伴侣/Foreign", value: rel.foreignPartner },
    { label: "异地伴侣/Long Dist", value: rel.otherCityPartner },
    { label: "白月光/Moonlight", value: rel.whiteMoonlight },
    { label: "谈过/Past Rels", value: rel.pastRelCount },
    { label: "前任联系/Ex Contact", value: rel.exContact },
    { label: "还爱前任/Still Love Ex", value: rel.stillLoveEx },
    { label: "爱好/Hobbies", value: p.hobby },
    { label: "家庭状况/Family", value: p.parents?.status },
    { label: "兄弟姐妹/Siblings", value: p.parents?.siblingCount },
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

function onEditBreedClassChange() {
  const cls = document.getElementById("edit-breedClass").value;

  document.getElementById("edit-breedSubgroup").innerHTML =
    '<option value="" disabled selected hidden>选择细类 / Select subgroup...</option>';
  document.getElementById("edit-breedSubSubgroup").innerHTML =
    '<option value="" disabled selected hidden>选择子类 / Select sub-group...</option>';
  document.getElementById("edit-breed").innerHTML =
    '<option value="" disabled selected hidden>选择物种 / Select species...</option>';
  document
    .getElementById("edit-breedSubSubgroupWrapper")
    .classList.add("hidden");

  if (breedSubgroups[cls]) {
    const sgSelect = document.getElementById("edit-breedSubgroup");
    Object.keys(breedSubgroups[cls]).forEach((sg) => {
      const opt = document.createElement("option");
      opt.value = sg;
      opt.textContent = sg;
      sgSelect.appendChild(opt);
    });
    document
      .getElementById("edit-breedSubgroupWrapper")
      .classList.remove("hidden");
    document
      .getElementById("edit-breedSpecificWrapper")
      .classList.add("hidden");
  } else {
    document
      .getElementById("edit-breedSubgroupWrapper")
      .classList.add("hidden");
    const select = document.getElementById("edit-breed");
    (breedData[cls] || []).forEach((b) => {
      const opt = document.createElement("option");
      opt.value = b;
      opt.textContent = b;
      select.appendChild(opt);
    });
    document
      .getElementById("edit-breedSpecificWrapper")
      .classList.remove("hidden");
  }
}

function onEditBreedSubgroupChange() {
  const cls = document.getElementById("edit-breedClass").value;
  const sg = document.getElementById("edit-breedSubgroup").value;
  const val = (breedSubgroups[cls] || {})[sg];

  document.getElementById("edit-breedSubSubgroup").innerHTML =
    '<option value="" disabled selected hidden>选择子类 / Select sub-group...</option>';
  document.getElementById("edit-breed").innerHTML =
    '<option value="" disabled selected hidden>选择物种 / Select species...</option>';

  if (val && !Array.isArray(val)) {
    const ssgSelect = document.getElementById("edit-breedSubSubgroup");
    Object.keys(val).forEach((ssg) => {
      const opt = document.createElement("option");
      opt.value = ssg;
      opt.textContent = ssg;
      ssgSelect.appendChild(opt);
    });
    document
      .getElementById("edit-breedSubSubgroupWrapper")
      .classList.remove("hidden");
    document
      .getElementById("edit-breedSpecificWrapper")
      .classList.add("hidden");
  } else {
    document
      .getElementById("edit-breedSubSubgroupWrapper")
      .classList.add("hidden");
    const select = document.getElementById("edit-breed");
    (val || []).forEach((b) => {
      const opt = document.createElement("option");
      opt.value = b;
      opt.textContent = b;
      select.appendChild(opt);
    });
    document
      .getElementById("edit-breedSpecificWrapper")
      .classList.remove("hidden");
  }
}

function onEditBreedSubSubgroupChange() {
  const cls = document.getElementById("edit-breedClass").value;
  const sg = document.getElementById("edit-breedSubgroup").value;
  const ssg = document.getElementById("edit-breedSubSubgroup").value;
  const select = document.getElementById("edit-breed");
  select.innerHTML =
    '<option value="" disabled selected hidden>选择物种 / Select species...</option>';
  (((breedSubgroups[cls] || {})[sg] || {})[ssg] || []).forEach((b) => {
    const opt = document.createElement("option");
    opt.value = b;
    opt.textContent = b;
    select.appendChild(opt);
  });
  document
    .getElementById("edit-breedSpecificWrapper")
    .classList.remove("hidden");
}

function goToMyProfile() {
  if (!currentUser) return;
  stopSwipeInterrupts();
  // Fetch fresh profile to get latest grid/likes/skips from server
  fetch("/profiles")
    .then((r) => r.json())
    .then((data) => {
      const fresh = data.find((p) => p.username === currentUser.username);
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
  if (document.getElementById("swipe-page")?.classList.contains("active"))
    startSwipeInterrupts();
}

// Impression Function
const _CELL_ALPHA = {
  1: 0.25,
  2: 0.49,
  3: 0.75,
  4: 1,
  pixel: 1,
  text: 1,
  "#": 1,
  "#1": 0.25,
  "#2": 0.49,
  "#3": 0.75,
  "#4": 1,
};
function _cellAlpha(cell) {
  if (Array.isArray(cell)) return cell[1];
  return _CELL_ALPHA[cell] ?? 1;
}

function _applyImpressionToGrid(grid, text) {
  if (!grid || !text) return;
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
    alert("没有更多兽人可以评论了 / No more anthros to comment on");
    return;
  }

  const profile = profiles[currentIndex];

  // Apply locally and re-render avatar immediately
  if (profile.grid) {
    _applyImpressionToGrid(profile.grid, text);
    showProfile();
  }

  // Persist to server in the background
  fetch("/impression", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      likedUsername: profile.username,
      commenterName: currentUser.name,
      impression: text,
    }),
  });
}

function openImpressionPopup() {
  if (currentIndex >= profiles.length) return;
  document.getElementById("swipe-impression-input").value = "";
  document.getElementById("swipe-impression-popup").classList.remove("hidden");
}

function closeImpressionPopup() {
  document.getElementById("swipe-impression-popup").classList.add("hidden");
}

function submitSwipeImpression() {
  const text = document.getElementById("swipe-impression-input").value.trim();
  if (!text) return;
  closeImpressionPopup();
  impression(text);
}

function openSendMsgPopup() {
  if (!currentUser || currentIndex >= profiles.length) return;
  document.getElementById("swipe-sendmsg-input").value = "";
  document.getElementById("swipe-sendmsg-popup").classList.remove("hidden");
}

function closeSendMsgPopup() {
  document.getElementById("swipe-sendmsg-popup").classList.add("hidden");
}

function submitSwipeSendMsg() {
  const text = document.getElementById("swipe-sendmsg-input").value.trim();
  if (!text || !currentUser || currentIndex >= profiles.length) return;
  const target = profiles[currentIndex];
  _cacheOutbox(currentUser.username, currentUser.name, target.username, target.name, text);
  fetch("/messages", {
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

// Avatar Rendering Function
function renderGridAsAvatar(grid, gridText) {
  const canvas = document.createElement("canvas");
  // 1024×1024 = 32px per cell — Zpix pixel font renders cleanest at multiples of its base size
  const size = 1024;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const BG   = "#a9b0a2";
  const DEAD = "#a2a99b"; // subtle inactive-cell tint for the grid
  const INK  = "rgb(40,56,24)";

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, size, size);

  const cellSize = size / 32; // 32px per cell (pixel art grid)
  const gap = 2;

  // Finer background texture: 64×64 cells at 1px gap
  const bgGrid = 64;
  const bgCell = size / bgGrid;
  const bgGap = 1;
  ctx.fillStyle = DEAD;
  for (let y = 0; y < bgGrid; y++) {
    for (let x = 0; x < bgGrid; x++) {
      ctx.fillRect(x * bgCell + bgGap, y * bgCell + bgGap, bgCell - bgGap * 2, bgCell - bgGap * 2);
    }
  }

  // Font: Zpix at 26px is at its native pixel size on this canvas
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `26px "Zpix", monospace`;

  const pixelAlpha = { 1: 0.25, 2: 0.49, 3: 0.75, 4: 1 };
  const textAlpha  = { "#1": 0.25, "#2": 0.49, "#3": 0.75, "#4": 1 };

  ctx.shadowColor = "rgba(40,56,24,0.60)";
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 3;
  ctx.shadowBlur = 0;

  const drawPixel = (x, y, alpha) => {
    ctx.fillStyle = alpha >= 1 ? INK : `rgba(40,56,24,${alpha})`;
    ctx.fillRect(x * cellSize + gap, y * cellSize + gap, cellSize - gap * 2, cellSize - gap * 2);
  };

  const drawChar = (x, y, ch, alpha) => {
    ctx.fillStyle = alpha >= 1 ? INK : `rgba(40,56,24,${alpha})`;
    ctx.fillText(ch, x * cellSize + cellSize / 2, y * cellSize + cellSize / 2);
  };

  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const cell = grid[y][x];
      if (cell === "pixel" || cell === 4)            drawPixel(x, y, 1);
      else if (pixelAlpha[cell] !== undefined)       drawPixel(x, y, pixelAlpha[cell]);
      else if (cell === "text" || cell === "#" || cell === "#4") drawChar(x, y, gridText, 1);
      else if (textAlpha[cell] !== undefined)        drawChar(x, y, gridText, textAlpha[cell]);
      else if (Array.isArray(cell))                  drawChar(x, y, cell[0], cell[1]);
      else if (cell !== null && cell !== "/")        drawChar(x, y, cell, 1);
    }
  }

  return canvas.toDataURL();
}

// ── Profile View Overlay ─────────────────────────────────────

function viewConvoProfile() {
  if (!convoTarget) return;
  fetch("/profiles")
    .then((res) => res.json())
    .then((data) => {
      const p = data.find((u) => u.username === convoTarget.username);
      if (!p) return;
      showProfileView(p);
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
