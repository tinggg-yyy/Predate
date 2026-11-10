// 网站挂在哪个路径下：本地是 ""，服务器上是 "/predate"（tinggg.live/predate/app/）
// 所有接口请求和 socket.io 都要加上这个前缀
const PREDATE_BASE = location.pathname.replace(/\/(app|web)(\/.*)?$/, "");

// ── 档案卡共用的数据和格式化 ──────────────────────────────────
// app（手机）和 web（大屏排行榜）都加载这个文件，保证两边档案卡的内容、顺序、中英文完全一致。
// 改档案卡显示什么，改这里的 cardValues 就行。
// 依赖：GEO_DATA（app/geo-data.js，用来查城市英文名；没加载就只显示中文城市名）

// 用户写的文字放进 innerHTML 前一律先转义，防止被当成网页代码执行
function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

// Bilingual display map for Chinese-only tier values
const DISP = {
  // house type (base)
  下水管道: "下水管道 / Pipe Shack",
  地下室: "地下室 / Basement",
  普通住宅: "普通住宅 / Regular Home",
  公寓: "公寓 / Apartment",
  大平层: "大平层 / Luxury Flat",
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
  小学: "小学 / Primary School",
  初中: "初中 / Middle School",
  高中: "高中 / High School",
  大专: "大专 / Associate",
  本科: "本科 / Bachelor",
  "硕士+": "硕士+ / Master+",
  // occupation
  无业: "无业 / Unemployed",
  体力劳动: "体力劳动 / Manual Labor",
  服务业: "服务业 / Service Industry",
  办公室职员: "办公室职员 / Office Worker",
  专业人士: "专业人士 / Professional",
  企业高管: "企业高管 / Executive",
  // income (dice)
  "3k以下": "3k以下 / <¥3k",
  "3k-8k": "3k-8k / ¥3k-8k",
  "8k-15k": "8k-15k / ¥8k-15k",
  "15k-30k": "15k-30k / ¥15k-30k",
  "3w-10w/月": "3w-10w / ¥30k-100k",
  "10w+/月": "10w+ / ¥100k+",
  // vehicle price
  "5w以下": "5w以下 / <¥50k",
  "5w-15w": "5w-15w / ¥50k-150k",
  "15w-30w": "15w-30w / ¥150k-300k",
  "30w-80w": "30w-80w / ¥300k-800k",
  "80w-300w": "80w-300w / ¥800k-3,000k",
  "300w+": "300w+ / ¥3,000k+",
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
  "1-5层": "1-5层 / Floor 1-5",
  "6-10层": "6-10层 / Floor 6-10",
  "11-20层": "11-20层 / Floor 11-20",
  "21-30层": "21-30层 / Floor 21-30",
  "31-40层": "31-40层 / Floor 31-40",
  "40层以上": "40层+ / Floor 40+",
  // apt total floors
  "6层以下": "共6层以下 / Under 6 Floors",
  "10层": "共10层 / 10 Floors",
  "18层": "共18层 / 18 Floors",
  "28层": "共28层 / 28 Floors",
  "35层": "共35层 / 35 Floors",
  "50层以上": "共50层+ / 50+ Floors",
  // villa floors
  "1层独栋": "1层独栋 / 1-Story House",
  "2层别墅": "2层别墅 / 2-Story Villa",
  "3层别墅": "3层别墅 / 3-Story Villa",
  "4层及以上": "4层及以上 / 4+ Story Villa",
  // house price (cheap tier)
  "5w": "5w / ¥50k",
  "10w": "10w / ¥100k",
  "20w": "20w / ¥200k",
  "30w": "30w / ¥300k",
  "80w": "80w / ¥800k",
  // house price (mid tier)
  "200w": "200w / ¥2,000k",
  "350w": "350w / ¥3,500k",
  "600w": "600w / ¥6,000k",
  "1500w": "1500w / ¥15,000k",
  // house price (luxury tier)
  "5000w+": "5000w+ / ¥50,000k+",
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
  "60w-100w": "60w-100w / ¥600k-1,000k",
  "100w-200w": "100w-200w / ¥1,000k-2,000k",
  "200w-500w": "200w-500w / ¥2,000k-5,000k",
  "500w-1000w": "500w-1000w / ¥5,000k-10,000k",
  "1000w+": "1000w+ / ¥10,000k+",
  // extra edu
  "博士/PhD": "博士 / PhD",
  "硕士/Master": "硕士 / Master",
  "本科/Bachelor": "本科 / Bachelor",
  "大专/Associate": "大专 / Associate",
  "高中/High School": "高中 / High School",
  "初中/Middle School": "初中 / Middle School",
  "小学/Primary": "小学 / Primary School",
  // marriage/sterilized
  "单身/Single": "单身 / Single",
  "恋爱中/Dating": "恋爱中 / In a Relationship",
  "已婚/Married": "已婚 / Married",
  "已配对/Mated": "已配对 / Mated",
  "开放关系/Open": "开放关系 / Open Relationship",
  "开放关系/Open Relationship": "开放关系 / Open Relationship",
  "离异/Divorced": "离异 / Divorced",
  // 绝育
  "未绝育/Not Sterilized": "未绝育 / Not Sterilized",
  "已绝育/Sterilized": "已绝育 / Sterilized",
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

// 「1.5w元」「3000元」「3w+」→「¥15k」「¥3k」「¥30k+」
function _cnMoneyEn(t) {
  const m = String(t).match(/^([\d.]+)(w|万)?元?(\+)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]) * (m[2] ? 10000 : 1);
  // 英文一律用 k（1w = 10k），大数加千分位：3000w → ¥30,000k
  const s = n >= 1000 ? `${(+(n / 1000).toFixed(1)).toLocaleString("en-US")}k` : `${n}`;
  return `¥${s}${m[3] || ""}`;
}

// 年龄：「1岁9个月 / 1 yr 9 mo」，不满一岁「7个月 / 7 mo」
function ageText(years, months) {
  const yr = years === 1 ? "yr" : "yrs";
  if (years === 0) return `${months}个月 / ${months} mo`;
  if (!months) return `${years}岁 / ${years} ${yr}`;
  return `${years}岁${months}个月 / ${years} ${yr} ${months} mo`;
}
// 档案卡上的年龄。老档案只存了数字（2026-05 起没带单位）：「1.9」= 1 岁 9 个月，「23」= 23 岁。
// 那时不满一岁只存月数，整数分不出是岁还是月，一律当岁
function fmtAge(a) {
  const s = String(a ?? "").trim();
  const m = s.match(/^(\d+)(?:\.(\d+))?$/);
  if (!m) return s || "—";
  return ageText(Number(m[1]), m[2] ? Number(m[2]) : 0);
}

function disp(v) {
  if (DISP[v]) return DISP[v];
  if (typeof v !== "string") return v;
  if (v.includes("/")) {
    // 不在翻译表里的「中文/English」：斜杠两边补上空格，和表里的写法一样（只有一个斜杠时才补）
    const m = v.match(/^([^/]*[\u4e00-\u9fff][^/]*?)\s*\/\s*([^/\u4e00-\u9fff]+)$/);
    return m ? `${m[1]} / ${m[2]}` : v;
  }
  // 租金：「月租1w元」→「月租1w元 / Rent ¥10k Monthly」
  const rent = v.match(/^月租(.+)$/);
  if (rent && _cnMoneyEn(rent[1])) return `${v} / Rent ${_cnMoneyEn(rent[1])} Monthly`;
  // 房价「3000w」、旧档案里的「1000万」「3辆」
  if (/^[\d.]+(w|万)\+?$/.test(v)) return `${v} / ${_cnMoneyEn(v)}`;
  const cnt = v.match(/^(\d+\+?)辆$/);
  if (cnt) return `${v} / ${cnt[1]} Vehicle${cnt[1] === "1" ? "" : "s"}`;
  // 车型：「Toyota Corolla 丰田卡罗拉」→「丰田卡罗拉 / Toyota Corolla」
  const car = v.match(/^([^\u4e00-\u9fff]+?)\s+([\u4e00-\u9fff].*)$/);
  if (car) return `${car[2]} / ${car[1]}`;
  return v;
}

// Two-line bilingual display: Chinese on top, English below
function fmtBI(v) {
  if (!v || v === "—") return "—";
  // "\n" 分组：每组各自一行中文 + 一行英文
  if (v.includes("\n")) {
    return v.split("\n").filter((g) => g.trim()).map(fmtBI).join("");
  }
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
  // 内容可能来自用户输入，转义后再拼进 HTML
  const zhLine = escapeHtml(zhParts.join("  "));
  const enLine = escapeHtml(enParts.join("  "));
  if (hasBilingual) {
    return `<span class="bi-zh">${zhLine}</span><span class="bi-en">${enLine}</span>`;
  }
  return `<span class="bi-zh">${zhLine}</span>`;
}

// 城市中文名 → 英文名（从 GEO_DATA 里查；自定义城市查不到就返回 null）
let _cityEnMap = null;

function cityEn(zh) {
  if (typeof GEO_DATA === "undefined") return null;
  if (!_cityEnMap) {
    _cityEnMap = new Map();
    const addCities = (str) => str.split(";").forEach((c) => {
      const [z, e] = c.split("|");
      if (e && !_cityEnMap.has(z)) _cityEnMap.set(z, e);
    });
    (function walk(nodes) {
      for (const n of nodes) {
        if (typeof n[1] === "string") addCities(n[1]);
        else if (Array.isArray(n[1])) walk(n[1]);
      }
    })(GEO_DATA);
  }
  return _cityEnMap.get(zh) || null;
}

// 旧档案里存成只有中文的内置爱好（如「看cult片」），补上英文；自定义爱好原样显示
function _hobbyWithEn(str) {
  if (!str) return str;
  return str.split(/\s*·\s*/).map((seg) => {
    if (seg.includes("/")) return seg;
    for (const c of HOBBY_CATEGORIES) {
      const t = c.tags.find((t) => typeof t !== "string" && t.zh === seg);
      if (t) return `${t.zh} / ${t.en}`;
    }
    return seg;
  }).join(" · ");
}

function buildTerritoryDisplay(profile) {
  const h = profile.house;
  if (!h || (!h.city && !h.district)) return profile.hukou || "—";
  const parts = [];
  if (h.city || h.district) {
    // 「沈阳 郊区」：中文行和英文行各自带上城市名（Shenyang Suburb），不会只剩 Suburb
    const [dZh, dEn] = (disp(h.district) || "").split(" / ");
    const zh = [h.city, dZh].filter(Boolean).join(" ");
    const en = [h.city && (cityEn(h.city) || h.city), dEn || dZh].filter(Boolean).join(" ");
    parts.push(zh === en ? zh : `${zh} / ${en}`);
  }
  // 顺序和填写页一样：类型 → 院子 → 面积 → 楼层 → 租/买 → 产权 → 房贷 → 价格
  if (h.type) {
    const typeDisp = disp(h.type);
    if (h.type === "别墅" && h.villaFloors) {
      // 「别墅 (2层别墅) / Villa (2-Story Villa)」：中英文各自带括号
      const [tZh, tEn] = typeDisp.split(" / ");
      const [fZh, fEn] = disp(h.villaFloors).split(" / ");
      parts.push(`${tZh} (${fZh}) / ${tEn || tZh} (${fEn || fZh})`);
    } else parts.push(typeDisp);
  }
  if (h.garden === "有院子") parts.push(disp("有院子"));
  if (h.area) parts.push(`${h.area}㎡`);
  if (h.aptFloor) parts.push(disp(h.aptFloor));
  if (h.aptTotal) parts.push(disp(h.aptTotal));
  if (h.tenure) parts.push(disp(h.tenure));
  // 旧档案没有 tenure，租房时 ownership 存的是「租住中」，照常显示
  if (h.ownership && h.ownership !== h.tenure) parts.push(disp(h.ownership));
  if (h.mortgage) parts.push(disp(h.mortgage));
  if (h.price) parts.push(disp(h.price));
  return parts.join(" · ") || profile.hukou || "—";
}

// "A · B · C · D · E" 分排：每排最多 3 个，平均分配、前排多
// 4 个 → 2+2，5 个 → 3+2，6 个 → 3+3（每排一行中文 + 一行英文，见 fmtBI）
// perRow：每排最多几项（手机 3 项；大屏比较宽，可以多放）
function _splitIntoRows(text, perRow = 3) {
  const items = (text || "").split(/\s*·\s*/).filter(Boolean);
  const rows = items.length ? Math.max(1, Math.ceil(items.length / perRow)) : 0;
  const groups = [];
  let i = 0;
  for (let r = 0; r < rows; r++) {
    const size = Math.ceil((items.length - i) / (rows - r));
    groups.push(items.slice(i, i + size).join(" · "));
    i += size;
  }
  return groups.join("\n") || "—";
}

// 父母籍贯："上海 / Shanghai" → 中文行「父-上海」，英文行「Dad-Shanghai」
function _parentOriginBI(zhLabel, enLabel, origin) {
  if (!origin) return null;
  const [zh, en] = origin.split(/\s*\/\s*/);
  return `${zhLabel}-${zh} / ${enLabel}-${en || zh}`;
}

const REL_SHIP_NONE = "都没有 / None";

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
      { zh: "晒毛", en: "Fur Sunbathing" },
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
      { zh: "看cult片", en: "Cult Films" },
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
      { zh: "跳水", en: "Springboard Diving" },
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
      { zh: "盆栽", en: "Potted Plants" },
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
      { zh: "纪录片", en: "Documentaries" },
      { zh: "写影评", en: "Film Reviews" },
      { zh: "播客", en: "Podcasting" },
      { zh: "cosplay", en: "Cosplay" },
    ],
  },
];

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

// Avatar Rendering Function
// 画是不是完整的 32×32（有两个旧档案存了空的画 []）
function _isValidGrid(g) {
  return Array.isArray(g) && g.length === 32 && g.every((row) => Array.isArray(row) && row.length === 32);
}

// 空白画布：画坏了 / 没画的档案就显示空格子，不报错
const _blankGrid = () => Array.from({ length: 32 }, () => Array(32).fill("/"));

// ── 32×32 像素格：档案头像（app / 大屏）和画图页共用，保证两边长得一模一样 ──
// 和 Pixelgraphy 一样：浅色底，像素填满一格，字放在格子正中，最上面盖一层淡淡的深色格子线
const _PIXEL_CELL = { 1: 1, 2: 1, 3: 1, 4: 1, pixel: 1 };
const _TEXT_CELL = { text: 1, "#": 1, "#1": 1, "#2": 1, "#3": 1, "#4": 1 };
const _GRID_LINE_ALPHA = 22 / 255; // 格子线深浅（和 Pixelgraphy 一样）

// 配色：app 里跟着配色走（theme.js）；大屏 web 没有配色，用原版灰绿
function _pixelGridColors() {
  if (typeof themeInk !== "function") return { bg: "#a9b0a2", ink: (a) => `rgba(40,56,24,${a})` };
  return { bg: themeBg(), ink: themeInk };
}

// 字形的实际边界（不是字体的行高）：用来把字摆到格子正中
const _glyphBoxCache = new Map();
function _glyphBox(ctx, ch) {
  const key = ctx.font + "|" + ch;
  let box = _glyphBoxCache.get(key);
  if (!box) {
    const m = ctx.measureText(ch);
    box = {
      left: m.actualBoundingBoxLeft, w: m.actualBoundingBoxLeft + m.actualBoundingBoxRight,
      ascent: m.actualBoundingBoxAscent, h: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent,
    };
    // 字体还没加载完时量到的是后备字体，先不缓存
    if (!document.fonts || document.fonts.check(ctx.font)) _glyphBoxCache.set(key, box);
  }
  return box;
}

// 在 ctx 上画整张 32×32 的画，边长 size（CSS 像素）；dpr：画布的像素密度（画图页 p5 是 pixelDensity()）
// 线粗、阴影、字号都按格子大小的固定比例：大小不同的画布（画图页 / 头像大图 / 排行榜小图）看起来比例一样
function drawPixelGrid(ctx, grid, gridText, size, dpr = 1) {
  if (!_isValidGrid(grid)) grid = _blankGrid();
  const { bg, ink } = _pixelGridColors();
  const snap = (v) => Math.max(1, Math.round(v * dpr)) / dpr;
  const cell = size / 32;
  const shadow = snap((cell * 3) / 32);
  const text = gridText || "";

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  // 字和格子一样大（头像大图一格 36px → 36px，正好是 Zpix 点阵 12px 的三倍）
  ctx.font = `${snap(cell)}px "Zpix", monospace`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = ink(0.6);
  ctx.shadowOffsetX = shadow * dpr; // canvas 的阴影偏移是物理像素，不跟着缩放走
  ctx.shadowOffsetY = shadow * dpr;
  ctx.shadowBlur = 0;

  // 好几个字的词：按从左到右、从上到下的顺序，一格放一个字轮流排
  let textIdx = 0;
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const c = grid[y][x];
      if (c === null || c === "/" || c === "") continue;
      ctx.fillStyle = ink(_cellAlpha(c));
      let ch = "";
      if (_TEXT_CELL[c]) ch = text.length > 1 ? text[textIdx++ % text.length] : text;
      else if (!_PIXEL_CELL[c]) ch = Array.isArray(c) ? c[0] : String(c);
      // 像素格，或者文字格轮到的是空格：填满这一格
      if (!ch.trim()) {
        ctx.fillRect(x * cell, y * cell, cell, cell);
        continue;
      }
      const b = _glyphBox(ctx, ch);
      ctx.fillText(ch, x * cell + (cell - b.w) / 2 + b.left, y * cell + (cell - b.h) / 2 + b.ascent);
    }
  }

  // 格子线盖在最上面（拓麻歌子 LCD 质感），线粗是格子的 1/18（画图页一格 9px → 0.5px）
  ctx.shadowColor = "rgba(0,0,0,0)";
  ctx.strokeStyle = ink(_GRID_LINE_ALPHA);
  ctx.lineWidth = cell / 18;
  ctx.beginPath();
  for (let i = 0; i <= 32; i++) {
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, size);
    ctx.moveTo(0, i * cell);
    ctx.lineTo(size, i * cell);
  }
  ctx.stroke();
  ctx.restore();
}

// outSize：输出图片的边长。默认 1152（档案卡大图，一格 36px）；排行榜列表的小头像用小尺寸，画得快、占内存少。
// 直接按 outSize 画（不是画大再缩）
// 空白画布但不要换成大字的人（账号）：保持空白
const _BLANK_AVATAR_KEEP = new Set(["neonnneon"]);

function renderGridAsAvatar(grid, gridText, outSize = 1152, username = "") {
  const canvas = document.createElement("canvas");
  canvas.width = outSize;
  canvas.height = outSize;
  // 以前交了空白画布的老档案：把他写的字描成格子画（每一格放他的字，和平常「用字来画」一样），
  // 不是一块空格子（只是显示，不改数据）
  const blank = !_isValidGrid(grid) || grid.flat().every((c) => c === "/" || c === null || c === "");
  if (blank && gridText && !_BLANK_AVATAR_KEEP.has(username)) grid = _wordGrid(String(gridText).trim());
  drawPixelGrid(canvas.getContext("2d"), grid, gridText, outSize);
  return canvas.toDataURL();
}

// 把一个字 / 词描在 32×32 的格子上，笔画经过的格子变成文字格「#4」。
// 字号先试 Zpix 点阵最清楚的 24、12px；一行放不下就拆成两三行（「nonsense」→「nons / ense」）
function _wordGrid(word) {
  const N = 32;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d");
  const chars = [...word];
  const fits = ({ lines, px }) => {
    g.font = `${px}px "Zpix", monospace`;
    return lines.length * px <= 30 && lines.every((l) => g.measureText(l).width <= 30);
  };
  const layouts = [];
  for (const px of [24, 12])
    for (let k = 1; k <= Math.min(3, chars.length); k++) {
      const per = Math.ceil(chars.length / k);
      layouts.push({ px, lines: Array.from({ length: k }, (_, i) => chars.slice(i * per, (i + 1) * per).join("")).filter(Boolean) });
    }
  let pick = layouts.find(fits);
  if (!pick) {
    // 太长了：一行，字号缩到放得下
    pick = { lines: [word], px: 11 };
    while (pick.px > 5 && !fits(pick)) pick.px--;
  }
  g.font = `${pick.px}px "Zpix", monospace`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const top = (N - pick.lines.length * pick.px) / 2;
  pick.lines.forEach((l, i) => g.fillText(l, N / 2, top + pick.px * (i + 0.5)));
  const d = g.getImageData(0, 0, N, N).data;
  return Array.from({ length: N }, (_, y) => Array.from({ length: N }, (_, x) => (d[(y * N + x) * 4 + 3] > 110 ? "#4" : "/")));
}

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
  const themed = typeof themeInk === "function";
  ctx.shadowColor = themed ? themeInk(0.65) : "rgba(40,48,35,0.65)";
  ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2; ctx.shadowBlur = 0;
  ctx.fillStyle = themed ? themeInk() : "rgb(40,48,35)";
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
  const themed = typeof themeInk === "function";
  ctx.shadowColor = themed ? themeInk(0.65) : "rgba(40,48,35,0.65)";
  ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2; ctx.shadowBlur = 0;
  ctx.fillStyle = themed ? themeInk() : "rgb(40,48,35)";
  pattern.forEach((row, ry) =>
    row.forEach((v, rx) => {
      if (v) ctx.fillRect(rx * px, ry * px, px, px);
    }),
  );
  getPixelVomitUrl._cache = c.toDataURL();
  return getPixelVomitUrl._cache;
}

// ── 总资产评估（A8.3 这种写法：A 后面是资产的位数，小数点后是最高位的数字）──
// 「3w-10w/月」「500-2000元」「5000w+」「3k以下」→ 人民币金额（区间取中间值，以下取一半，+ 多算三成）
function _moneyOf(str) {
  if (!str) return 0;
  const t = String(str).split("/")[0];
  const toks = [...t.matchAll(/([\d.]+)\s*(k|w|万|元)?/g)].map((m) => ({ n: parseFloat(m[1]), u: m[2] }));
  if (!toks.length) return 0;
  // 「500-2000元」：前一个数没写单位，跟后一个数一样
  for (let i = toks.length - 2; i >= 0; i--) if (!toks[i].u) toks[i].u = toks[i + 1].u;
  const unit = { k: 1000, w: 10000, 万: 10000, 元: 1 };
  const vals = toks.map((x) => x.n * (unit[x.u] || 1));
  let v = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (/以下/.test(t)) v *= 0.5;
  else if (/\+/.test(t)) v *= 1.3;
  return v;
}

// 总资产 = 房子（买的才算；父母名下算一半，有房贷算六成）+ 车（单价 × 数量）+ 存款（月收入 × 12 × 3 年）
function totalAssets(profile) {
  const h = profile.house || {};
  const v = profile.vehicle || {};
  const bought = h.tenure ? h.tenure === "购买" : h.ownership && h.ownership !== "租住中";
  let house = 0;
  if (bought && h.price && !/^月租/.test(h.price)) {
    house = _moneyOf(h.price);
    if (h.ownership === "父母名下") house *= 0.5;
    if (h.mortgage === "有房贷") house *= 0.6;
  }
  const count = parseInt(v.count, 10) || (v.price ? 1 : 0);
  const car = _moneyOf(v.price) * count;
  const savings = _moneyOf(profile.income) * 12 * 3;
  const amount = Math.round(house + car + savings);
  if (amount < 1) return { amount: 0, level: "A0", text: "A0（零资产） / A0 (No Assets)" };
  const digits = String(amount).length;
  const level = `A${digits}.${String(amount)[0]}`;
  const zh = amount >= 1e8 ? `${+(amount / 1e8).toFixed(1)}亿` : amount >= 1e4 ? `${Math.round(amount / 1e4)}万` : `${amount}元`;
  const en = amount >= 1000 ? `¥${Math.round(amount / 1000).toLocaleString("en-US")}k` : `¥${amount}`;
  return { amount, level, text: `${level}（约${zh}） / ${level} (≈${en})` };
}

// 档案卡每一栏要显示的文字（「中文 / English」格式，\n 分行），app 和 web 都从这里取
// perRow：整栏内容每排最多几项（app 3 项，大屏 5 项）
// 物种：「哺乳类 / Mammals · 豚鼠 / Guinea Pig」只显示物种那段；混血两段各自中英文
function cardBreed(p) {
  const sp = (v) => { if (!v) return null; const s = v.split(" · "); return s.length > 1 ? s.slice(1).join(" · ") : v; };
  let breed = sp(p.breed) || "—";
  if (p.mixed && p.breed2) {
    const [aZh, aEn] = breed.split(/\s*\/\s*/);
    const [bZh, bEn] = sp(p.breed2).split(/\s*\/\s*/);
    breed = `${aZh} × ${bZh}（混血） / ${aEn || aZh} × ${bEn || bZh} (Mixed)`;
  }
  return breed;
}

function cardValues(profile, { perRow = 3 } = {}) {
  const rowsOf = (text) => _splitIntoRows(text, perRow);
  const p = profile || {};
  const rel = p.relationship || {};
  const par = p.parents || {};
  const score = (p.score ?? 60) - (p.skips ? p.skips.length : 0);
  const sd = p.date ? new Date(p.date) : null;

  const breed = cardBreed(p);

  // 感情经历：按填写顺序，只显示有内容的项（旧档案里的伴侣相关字段也照常显示），每行最多 3 格
  const relItems = [
    ["谈过", "Past Rels", "pastRelCount"],
    ["前任联系", "Ex Contact", "exContact"],
    ["还爱前任", "Still Love Ex", "stillLoveEx"],
    ["白月光", "Moonlight", "whiteMoonlight"],
    ["子女", "Kids", "kids"],
    ["暗恋", "Crush", "crush"],
    ["目前伴侣", "Partner", "currentPartner"],
    ["伴侣数量", "# Partners", "partnerCount"],
    ["暧昧", "Ambiguous", "ambiguous"],
    ["秘密伴侣", "Secret", "secretPartner"],
    ["境外伴侣", "Foreign", "foreignPartner"],
    ["异地伴侣", "Long Dist", "otherCityPartner"],
  ].filter(([, , key]) => rel[key]).map(([zh, en, key]) => [zh, en, key, rel[key]]);
  // 没谈过恋爱（没有前任那两项）：谈过 + 子女一行（都是数字），暗恋 + 白月光一行
  if (!rel.exContact && !rel.stillLoveEx) {
    const order = ["pastRelCount", "kids", "crush", "whiteMoonlight"];
    const rank = (key) => (order.includes(key) ? order.indexOf(key) : order.length);
    relItems.sort((a, b) => rank(a[2]) - rank(b[2]));
  }
  // 每行最多 3 格，但不让一格单独一行：4 格排 2+2，5 格 3+2，7 格 3+2+2
  const relRows = [];
  const nRows = Math.ceil(relItems.length / 3);
  for (let r = 0, i = 0; r < nRows; r++) {
    const size = Math.floor(relItems.length / nRows) + (r < relItems.length % nRows ? 1 : 0);
    relRows.push(relItems.slice(i, i + size));
    i += size;
  }

  // 其他关系 ship：选了「都没有」或没填就不显示
  const ships = (rel.ships || "").split(" · ").filter((v) => v && v !== REL_SHIP_NONE);

  const v = p.vehicle || {};
  const family = [
    // 第一组：父母状况 + 关系 + 籍贯
    [
      par.status ? disp(par.status) : null,
      par.relationship ? disp(par.relationship) : null,
      _parentOriginBI("父", "Dad", par.fatherOrigin),
      _parentOriginBI("母", "Mom", par.motherOrigin),
    ].filter(Boolean).join(" · "),
    // 第二组（换行）：兄弟姐妹 / 独生
    (() => {
      const cnt = par.siblingCount;
      if (!cnt) return null;
      if (cnt === "独生/Only Child") return disp(cnt);
      return [disp(cnt), par.siblingWealth ? disp(par.siblingWealth) : null].filter(Boolean).join(" · ");
    })(),
  ].filter(Boolean).join("\n") || "—";

  return {
    score,
    stampDate: sd ? `${sd.getFullYear()}.${String(sd.getMonth() + 1).padStart(2, "0")}.${String(sd.getDate()).padStart(2, "0")}` : "",
    avatar: p.grid || !p.avatar ? renderGridAsAvatar(p.grid, p.gridText, undefined, p.username) : p.avatar,
    name: p.name,
    breed,
    gender: disp(p.gender) || "—",
    age: p.age ? fmtAge(p.age) : "—",
    height: p.height || "—",
    orientation: disp(p.orientation) || "—",
    status: disp(p.sterilized || rel.status) || "—",
    // 老档案没有这一项：档案卡上就不显示这一格
    neutered: p.neutered ? disp(p.neutered) : "",
    ships: ships.length ? rowsOf(ships.join(" · ")) : "",
    mbti: p.mbti || "—",
    horoscope: p.horoscope || getHoroscope(p.birth) || "—",
    territory: rowsOf(buildTerritoryDisplay(p)),
    vehicle: rowsOf([
      v.types?.length ? v.types.join(" · ") : null,
      v.model ? disp(v.model) : null,
      // 数量：「2」→「2辆 / 2 Vehicles」
      v.count ? disp(/^\d+\+?$/.test(v.count) ? `${v.count}辆` : v.count) : null,
      v.price ? disp(v.price) : null,
    ].filter(Boolean).join(" · ")),
    edu: disp(p.edu) || "—",
    occupation: disp(p.occupation) || "—",
    income: disp(p.income) || "—",
    datingPurpose: rel.datingPurpose || "—",
    relationshipGoal: rel.relationshipGoal || "—",
    relRows,
    hobby: rowsOf(_hobbyWithEn(p.hobby)),
    family,
    standards: p.standards ? rowsOf(p.standards) : "",
    // 总资产只写等级（A8.3），不写金额和英文
    assets: totalAssets(p).level,
    likes: p.likes ? p.likes.length : 0,
    skips: p.skips ? p.skips.length : 0,
  };
}
