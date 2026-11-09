const express = require("express");
// const http = require("http"); // we try to make HTTPS work

const https = require("https");
// to read certificates from the filesystem (fs)
const fs = require("fs");
const { spawn } = require("child_process");

function generateAvatar(name) {
  const py = spawn("python3", ["generate_avatars.py", "--name", name]);
  py.stderr.on("data", (d) => console.error("[avatar]", d.toString()));
}

const app = express(); // the server "app", the server behaviour

const portHTTPS = process.env.PORT || 4000; // port for https

// app / web 页面：自动给本地 css/js 加版本号（= 文件最后修改时间），改了文件就会拿到新的，不用手动改 ?v=
const path = require("path");
function serveIndex(dir, req, res) {
  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8").replace(
    /(src|href)="([\w./-]+\.(?:js|css))(?:\?v=[^"]*)?"/g,
    (m, attr, file) => {
      try {
        const v = Math.floor(fs.statSync(path.join(dir, file)).mtimeMs).toString(36);
        return `${attr}="${file}?v=${v}"`;
      } catch (_) {
        return m;
      }
    },
  );
  // 页面本身不缓存，每次打开都拿最新的版本号
  res.set("Cache-Control", "no-cache");
  res.type("html").send(html);
}
for (const page of ["app", "web"]) {
  const dir = path.join(__dirname, "public", page);
  app.get([`/${page}`, `/${page}/`, `/${page}/index.html`], (req, res) =>
    req.path === `/${page}` ? res.redirect(`${page}/`) : serveIndex(dir, req, res),
  );
}

// returning to the client anything that is
// inside the public folder
app.use(
  express.static("public", {
    // 其他文件每次都先问服务器有没有变（没变只回 304，几乎没有流量）
    setHeaders: (res) => res.set("Cache-Control", "no-cache"),
  }),
);
// app.use(express.json());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Serialize profiles with grid rows compacted to one line each (32 cells per row)
function stringifyProfiles(profiles) {
  let json = JSON.stringify(profiles, null, 2);
  // Collapse inner grid row arrays to one line (matches any string cell or null)
  json = json.replace(/\[\n(\s+"[^"]*",?\n)+\s+\]/g, (match) => {
    const items = match.match(/"[^"]*"/g);
    return '[' + items.join(',') + ']';
  });
  return json;
}

// array for all profiles
let profiles;

try {
  let data = fs.readFileSync("profiles.json");
  profiles = JSON.parse(data);
  console.log("Loaded profiles");
} catch (e) {
  profiles = [];
}

// array for custom hobby tags
let customHobbies;
try {
  customHobbies = JSON.parse(fs.readFileSync("custom-hobbies.json"));
} catch (e) {
  customHobbies = [];
}

function loadCustomHobbies() {
  try { customHobbies = JSON.parse(fs.readFileSync("custom-hobbies.json", "utf8")); } catch (_) {}
}

app.get("/custom-hobbies", (req, res) => {
  loadCustomHobbies();
  res.json(customHobbies);
});

app.post("/custom-hobbies", (req, res) => {
  if (!requireUser(req, res)) return;
  loadCustomHobbies();
  const { tag, categoryZh, tier } = req.body;
  if (!tag || typeof tag !== "string") return res.status(400).json({ error: "Missing tag" });
  // 自定义标签不能有标点符号（和网页那边的规则一致）
  const clean = tag.replace(/[^\p{L}\p{N}\s]/gu, "").trim().slice(0, 20);
  if (!clean) return res.json({ success: true, hobbies: customHobbies });
  const exists = customHobbies.find((t) => (typeof t === "string" ? t : t.tag) === clean);
  if (exists) return res.json({ success: true, hobbies: customHobbies });
  const entry = categoryZh ? { tag: clean, categoryZh, tier: tier !== undefined ? tier : 1 } : clean;
  customHobbies.push(entry);
  fs.writeFileSync("custom-hobbies.json", JSON.stringify(customHobbies, null, 2));
  res.json({ success: true, hobbies: customHobbies });
});

// ── 种族库：用户自定义的大类 / 细类 / 子类 / 物种 ──
// 每条：{ cls, sg, ssg, species }，网页加载时合并进下拉选项
let customBreeds;
try {
  customBreeds = JSON.parse(fs.readFileSync("custom-breeds.json"));
} catch (e) {
  customBreeds = [];
}

function loadCustomBreeds() {
  try { customBreeds = JSON.parse(fs.readFileSync("custom-breeds.json", "utf8")); } catch (_) {}
}

app.get("/custom-breeds", (req, res) => {
  loadCustomBreeds();
  res.json(customBreeds);
});

app.post("/custom-breeds", (req, res) => {
  if (!requireUser(req, res)) return;
  loadCustomBreeds();
  const { cls, sg, ssg, species, custom = {} } = req.body || {};
  // 自定义的那几级去掉标点（和网页规则一致）；原本库里的名字（如「鸟类 / Birds」）保持原样
  const clean = (v, isCustom) => {
    let s = String(v || "").replace(/[<>]/g, "");
    if (isCustom) s = s.replace(/[^\p{L}\p{N}\s]/gu, "");
    return s.trim().slice(0, 40);
  };
  const entry = {
    cls: clean(cls, custom.cls),
    sg: clean(sg, custom.sg),
    ssg: clean(ssg, custom.ssg),
    species: clean(species, custom.species),
  };
  if (!entry.cls || !entry.species) return res.status(400).json({ error: "Missing class or species" });
  const exists = customBreeds.some(
    (b) => b.cls === entry.cls && b.sg === entry.sg && b.ssg === entry.ssg && b.species === entry.species,
  );
  if (!exists) {
    customBreeds.push(entry);
    fs.writeFileSync("custom-breeds.json", JSON.stringify(customBreeds, null, 2));
  }
  res.json({ success: true });
});

// array for all messages
let messages;

try {
  let data = fs.readFileSync("messages.json");
  messages = JSON.parse(data);
  console.log("Loaded messages");
} catch (e) {
  messages = [];
}

// 档案里所有文字去掉 < >，防止被当成网页代码（网页显示时也会转义，这里是第二道防线）
function stripTags(value) {
  if (typeof value === "string") return value.replace(/[<>]/g, "");
  if (Array.isArray(value)) return value.map(stripTags);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = stripTags(v);
    return out;
  }
  return value;
}

// 发给客户端的档案一律去掉密码，密码只留在服务器上
function publicProfile(p) {
  const { password, likers, skippers, openerBonusTo, ...rest } = p;
  return rest;
}

// ── 密码：加密存储（scrypt + 随机盐），文件里只有「scrypt$盐$哈希」，看不到真实密码 ──
const crypto = require("crypto");
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(pw), salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}
function checkPassword(stored, pw) {
  if (typeof stored !== "string") return false;
  if (!stored.startsWith("scrypt$")) return stored === String(pw); // 还没迁移的旧明文
  const [, salt, hash] = stored.split("$");
  const test = crypto.scryptSync(String(pw), salt, 64);
  const real = Buffer.from(hash, "hex");
  return real.length === test.length && crypto.timingSafeEqual(real, test);
}
// 启动时把旧的明文密码全部换成加密的（只做一次，之后文件里就没有明文了）
(function migratePasswords() {
  let changed = 0;
  profiles.forEach((p) => {
    if (typeof p.password === "string" && !p.password.startsWith("scrypt$")) {
      p.password = hashPassword(p.password);
      changed++;
    }
  });
  if (changed) {
    fs.writeFileSync("profiles.json", stringifyProfiles(profiles));
    console.log(`Encrypted ${changed} plaintext passwords`);
  }
})();

// ── 登录令牌：登录 / 注册成功后发一个随机令牌，之后的请求带上它（Authorization: Bearer 令牌）──
// 存在 sessions.json，服务器重启也不会让大家掉线；30 天不用就失效
const SESSION_DAYS = 30;
let sessions = {};
try { sessions = JSON.parse(fs.readFileSync("sessions.json", "utf8")); } catch (_) {}
function saveSessions() {
  fs.writeFileSync("sessions.json", JSON.stringify(sessions));
}
function createSession(username) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions[token] = { username, exp: Date.now() + SESSION_DAYS * 864e5 };
  saveSessions();
  return token;
}
// 这个请求是谁发的（没登录 / 令牌失效 → null）
function authUser(req) {
  const m = /^Bearer (\w+)$/.exec(req.get("Authorization") || "");
  const s = m && sessions[m[1]];
  if (!s) return null;
  if (s.exp < Date.now()) {
    delete sessions[m[1]];
    saveSessions();
    return null;
  }
  s.exp = Date.now() + SESSION_DAYS * 864e5; // 用着就续期
  return s.username;
}

// ── 管理员（创作者）：admin.json 里列出的用户名，能看所有人的档案和私信、重置密码 ──
function adminList() {
  try { return JSON.parse(fs.readFileSync("admin.json", "utf8")).admins || []; } catch (_) { return []; }
}
const isAdmin = (username) => !!username && adminList().includes(username);

// 需要登录的接口用：没登录直接回 401
function requireUser(req, res) {
  const u = authUser(req);
  if (!u) res.status(401).json({ error: "Please log in" });
  return u;
}
// 只有本人或管理员能做
function requireSelfOrAdmin(req, res, username) {
  const u = requireUser(req, res);
  if (!u) return null;
  if (u !== username && !isAdmin(u)) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  return u;
}
// 登录 / 注册成功回给自己的：档案 + 令牌 + 是不是管理员
function selfPayload(p, token) {
  return { ...publicProfile(p), token, isAdmin: isAdmin(p.username) };
}
// 分数是手机端算的，不封顶也不封底（正常填表最高 361、最低 −205）；
// 只挡掉 ±1000 以外的数，那只可能是绕过页面伪造的请求
// 开场白和加减分（和 app 用同一个文件）
const { OPENER_SCORES, openerType } = require("./public/shared/openers.js");
const clampScore = (n) => Math.max(-1000, Math.min(1000, Math.round(Number(n) || 0)));

// POST /login — 由服务器比对账号密码，只回答对不对，不把别人的密码发出去
app.post("/login", function (req, res) {
  try { profiles = JSON.parse(fs.readFileSync("profiles.json", "utf8")); } catch (_) {}
  const { username, password } = req.body || {};
  const profile = profiles.find((p) => String(p.username).trim() === String(username || "").trim());
  if (!profile) return res.status(404).json({ error: "User not found" });
  if (!checkPassword(profile.password, password)) {
    return res.status(401).json({ error: "Wrong password" });
  }
  // 旧明文密码登录成功时顺便加密
  if (!String(profile.password).startsWith("scrypt$")) {
    profile.password = hashPassword(password);
    fs.writeFileSync("profiles.json", stringifyProfiles(profiles));
  }
  res.json(selfPayload(profile, createSession(profile.username)));
});

// GET /me — 浏览器记住的令牌还有效吗？有效就直接登录
app.get("/me", function (req, res) {
  const u = requireUser(req, res);
  if (!u) return;
  const p = reloadProfiles().find((x) => x.username === u);
  if (!p) return res.status(404).json({ error: "User not found" });
  const token = /^Bearer (\w+)$/.exec(req.get("Authorization"))[1];
  res.json(selfPayload(p, token));
});

// POST /logout — 令牌作废
app.post("/logout", function (req, res) {
  const m = /^Bearer (\w+)$/.exec(req.get("Authorization") || "");
  if (m && sessions[m[1]]) {
    delete sessions[m[1]];
    saveSessions();
  }
  res.json({ success: true });
});

function reloadProfiles() {
  try { profiles = JSON.parse(fs.readFileSync("profiles.json", "utf8")); } catch (_) {}
  return profiles;
}

app.get("/profiles", function (req, res) {
  res.json(reloadProfiles().map(publicProfile));
});

// GET /profiles/activity — 只给每个人的名字、分数、like / skip / 印象（不含画、档案内容），供 app 每 30 秒、大屏每 10 秒同步
app.get("/profiles/activity", function (req, res) {
  res.json(reloadProfiles().map((p) => ({
    username: p.username,
    name: p.name,
    score: p.score,
    likes: p.likes || [],
    skips: p.skips || [],
    interpretations: p.interpretations || {},
  })));
});

// GET /profiles/:username — 只取一个人的完整档案（不含密码）
app.get("/profiles/:username", function (req, res) {
  const name = String(req.params.username).trim();
  const p = reloadProfiles().find((x) => String(x.username).trim() === name);
  if (!p) return res.status(404).json({ error: "User not found" });
  res.json(publicProfile(p));
});

app.post("/profiles", function (req, res) {
  // this function is being called whenever the server
  // receives a HTTP POST request for /profiles
  // - the data the client sent is in req.body
  console.log(req.body);
  // 文字去掉 < >（密码保持原样，否则含 < > 的密码会登不上）
  let profile = { ...stripTags(req.body), password: req.body.password };
  if (!profile.username || !profile.password) return res.status(400).json({ error: "Missing username or password" });
  profile.score = clampScore(profile.score);
  // 喜欢 / 跳过 / 解读这些只能由别人产生，注册时带过来的一律不要
  ["likes", "skips", "likers", "skippers", "interpretations", "impressions", "isAdmin", "token", "openerBonusTo"].forEach((k) => delete profile[k]);

  // 以文件为准，避免内存里的旧数据覆盖
  try { profiles = JSON.parse(fs.readFileSync("profiles.json", "utf8")); } catch (_) {}

  // 同一个账号只能有一份档案：已存在就更新那一份，不再新增（防止重复提交）
  const existing = profiles.find((p) => String(p.username).trim() === String(profile.username || "").trim());
  if (existing) {
    if (!checkPassword(existing.password, profile.password)) {
      return res.status(409).json({ error: "Username already taken" });
    }
    // 分数在第一次生成档案时就定了，之后只会被开场白、被跳过改变；重新提交不能改（否则谁都能把自己刷到第一）
    const locked = ["id", "date", "password", "score"];
    Object.keys(profile).forEach((key) => {
      if (!locked.includes(key)) existing[key] = profile[key];
    });
    fs.writeFileSync("profiles.json", stringifyProfiles(profiles));
    if (existing.grid && existing.name) generateAvatar(existing.name);
    return res.json(selfPayload(existing, createSession(existing.username)));
  }

  // let's add some additional information
  profile.date = new Date().toISOString();
  profile.password = hashPassword(profile.password);
  profile.id =
    profiles.length > 0 ? Math.max(...profiles.map((p) => p.id)) + 1 : 1;

  // add it the messages array
  profiles.push(profile);
  // and save all current messages to a file (for permanence)
  fs.writeFileSync("profiles.json", stringifyProfiles(profiles));
  // generate avatar PNG in the background
  if (profile.grid && profile.name) generateAvatar(profile.name);
  // its a good practice return the final message to the client
  res.json(selfPayload(profile, createSession(profile.username)));
});

// POST /like — 记录一个 like
app.post("/like", function (req, res) {
  const me = requireUser(req, res);
  if (!me) return;
  try { profiles = JSON.parse(fs.readFileSync("profiles.json", "utf8")); } catch (_) {}
  const { likedUsername } = req.body;
  // 喜欢的人是谁由令牌决定，不信客户端传来的名字
  const likerPetName = profiles.find((p) => p.username === me)?.name || me;

  // 找到被 like 的 profile
  let likedProfile = profiles.find((p) => p.username === likedUsername);
  if (!likedProfile)
    return res.status(404).json({ error: "Profile not found" });

  // 初始化 likes 数组
  if (!likedProfile.likes) likedProfile.likes = [];

  // 避免同一人重复 like：按账号去重（likers 只存在服务器，不发给客户端），同名的不同用户各算一次
  if (!likedProfile.likers) likedProfile.likers = [];
  if (!likedProfile.likers.includes(me)) {
    likedProfile.likers.push(me);
    likedProfile.likes.push(likerPetName);
  }

  // 保存到文件
  fs.writeFileSync("profiles.json", stringifyProfiles(profiles));

  // 实时广播 like 事件
  io.emit("like-event", {
    name: likedProfile.name,
    username: likedProfile.username,
    by: likerPetName,
    likesCount: likedProfile.likes.length,
    label: req.body.label || "",
    reason: req.body.reason || "",
  });

  res.json({ success: true, likesCount: likedProfile.likes.length });
});

// POST /skip — 记录 skip，广播弹幕
app.post("/skip", function (req, res) {
  const me = requireUser(req, res);
  if (!me) return;
  try { profiles = JSON.parse(fs.readFileSync("profiles.json", "utf8")); } catch (_) {}
  const { skippedUsername } = req.body;
  const skipperPetName = profiles.find((p) => p.username === me)?.name || me;
  const skippedProfile = profiles.find((p) => p.username === skippedUsername);
  if (skippedProfile) {
    if (!skippedProfile.skips) skippedProfile.skips = [];
    if (!skippedProfile.skippers) skippedProfile.skippers = [];
    if (!skippedProfile.skippers.includes(me)) {
      skippedProfile.skippers.push(me);
      skippedProfile.skips.push(skipperPetName);
    }
    fs.writeFileSync("profiles.json", stringifyProfiles(profiles));
    io.emit("skip-event", {
      name: skippedProfile.name,
      username: skippedProfile.username,
      by: skipperPetName,
      skipsCount: skippedProfile.skips.length,
      label: req.body.label || "",
      reason: req.body.reason || "",
    });
  }
  res.json({ success: true });
});

// GET /notifications/:username — 获取被 like 的通知
app.get("/notifications/:username", function (req, res) {
  const username = req.params.username;
  if (!requireSelfOrAdmin(req, res, username)) return;
  const profile = reloadProfiles().find((p) => p.username === username);
  if (!profile) return res.status(404).json({ error: "Not found" });

  res.json({
    likesCount: profile.likes ? profile.likes.length : 0,
    likedBy: profile.likes || [],
  });
});

// POST /impression — 记录一个印象
app.post("/impression", function (req, res) {
  const me = requireUser(req, res);
  if (!me) return;
  reloadProfiles();
  const { likedUsername } = req.body;
  const commenterName = profiles.find((p) => p.username === me)?.name || me;
  // 印象会刻进对方的画里：去掉 < >、限制长度
  const impression = String(req.body.impression || "").replace(/[<>]/g, "").slice(0, 20);

  let profile = profiles.find((p) => p.username === likedUsername);
  if (!profile) return res.status(404).json({ error: "Not found" });

  if (!profile.impressions) profile.impressions = [];

  profile.impressions.push({
    from: commenterName,
    impression: impression,
    date: new Date().toISOString(),
  });

  // 画必须是完整的 32×32（旧档案里有空的画 []，直接跳过，不然会报错）
  const gridOk = Array.isArray(profile.grid) && profile.grid.length === 32 &&
    profile.grid.every((row) => Array.isArray(row) && row.length === 32);
  if (gridOk && impression) {
    // 只收集视觉上有内容的格子（排除 null 和橡皮擦标记 "/"）
    let filledCells = [];
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const cell = profile.grid[y][x];
        if (cell !== null && cell !== "/") {
          filledCells.push({ x, y });
        }
      }
    }

    if (filledCells.length >= impression.length) {
      const CELL_ALPHA = { 1: 0.25, 2: 0.49, 3: 0.75, 4: 1, "pixel": 1, "text": 1, "#": 1,
        "#1": 0.25, "#2": 0.49, "#3": 0.75, "#4": 1 };
      const cellAlpha = (cell) => {
        if (Array.isArray(cell)) return cell[1];
        return CELL_ALPHA[cell] ?? 1;
      };
      filledCells.sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x);
      const reps = Math.min(Math.floor(20 / impression.length) || 1, Math.floor(filledCells.length / impression.length));
      const used = new Set();
      for (let r = 0; r < reps; r++) {
        let placed = false;
        for (let attempt = 0; attempt < 60; attempt++) {
          const start = Math.floor(Math.random() * (filledCells.length - impression.length + 1));
          let ok = true;
          for (let c = 0; c < impression.length; c++) {
            if (used.has(start + c)) { ok = false; break; }
          }
          if (ok) {
            for (let c = 0; c < impression.length; c++) {
              const { x, y } = filledCells[start + c];
              const alpha = cellAlpha(profile.grid[y][x]);
              profile.grid[y][x] = alpha === 1 ? impression[c] : [impression[c], alpha];
              used.add(start + c);
            }
            placed = true;
            break;
          }
        }
        if (!placed) break;
      }
    }
  }

  fs.writeFileSync("profiles.json", stringifyProfiles(profiles));
  res.json({ success: true });
});

// PUT /profiles/:username — 更新自己的 profile
app.put("/profiles/:username", function (req, res) {
  const username = req.params.username;
  const me = requireSelfOrAdmin(req, res, username);
  if (!me) return;
  const updates = stripTags(req.body);
  const profile = reloadProfiles().find((p) => p.username === username);
  if (!profile) return res.status(404).json({ error: "Not found" });

  // 本人不能改别人给的喜欢 / 跳过 / 解读，也不能改分数；管理员可以
  const locked = ["username", "password", "id", "date", "likers", "skippers", "openerBonusTo"];
  if (!isAdmin(me)) locked.push("likes", "skips", "interpretations", "impressions", "score");
  Object.keys(updates).forEach((key) => {
    if (!locked.includes(key)) profile[key] = updates[key];
  });

  try {
    fs.writeFileSync("profiles.json", stringifyProfiles(profiles));
  } catch (e) {
    console.error("Failed to write profiles.json:", e);
    return res.status(500).json({ error: "Failed to save" });
  }
  res.json(publicProfile(profile));
});

// POST /interpretation — 给某个 profile 的某个字段添加解读
app.post("/interpretation", function (req, res) {
  const me = requireUser(req, res);
  if (!me) return;
  try { profiles = JSON.parse(fs.readFileSync("profiles.json", "utf8")); } catch (_) {}
  const { profileUsername, field } = req.body;
  const text = String(req.body.text || "").replace(/[<>]/g, "").trim().slice(0, 40);
  const addedBy = profiles.find((p) => p.username === me)?.name || me;
  if (!text || typeof field !== "string" || !/^[\w-]+$/.test(field)) return res.status(400).json({ error: "Bad input" });

  // 不能给自己的档案写解读
  if (profileUsername === me) return res.status(403).json({ error: "Can't interpret your own profile" });
  let profile = profiles.find((p) => p.username === profileUsername);
  if (!profile) return res.status(404).json({ error: "Not found" });

  if (!profile.interpretations) profile.interpretations = {};
  // Support multiple interpretations per field — store as array
  if (!Array.isArray(profile.interpretations[field])) {
    profile.interpretations[field] = profile.interpretations[field]
      ? [profile.interpretations[field]]
      : [];
  }
  const list = profile.interpretations[field];
  // 有人写过一模一样的看法 → 不另起一句，算给那句点一次赞（每人最多 2 次，和 /interpretation/agree 一样）
  const norm = (t) => String(t || "").trim().replace(/\s+/g, " ").toLowerCase();
  const interpIndex = list.findIndex((it) => norm(it.text) === norm(text));
  if (interpIndex >= 0) {
    const interp = list[interpIndex];
    if (!interp.agreedBy) interp.agreedBy = {};
    const myCount = interp.agreedBy[me] || 0;
    if (myCount < 2) {
      interp.agreedBy[me] = myCount + 1;
      interp.agrees = (interp.agrees || 0) + 1;
      fs.writeFileSync("profiles.json", stringifyProfiles(profiles));
      io.emit("interpretation-agree-event", { profileUsername, field, interpIndex, agrees: interp.agrees });
    }
    return res.json({ success: true, merged: true, interpIndex, agrees: interp.agrees || 0 });
  }
  list.push({ text, addedBy });

  fs.writeFileSync("profiles.json", stringifyProfiles(profiles));
  io.emit("interpretation-event", { profileUsername, field, text, addedBy });
  res.json({ success: true });
});

// POST /interpretation/agree — 给某个解读点赞（每人最多2次）
app.post("/interpretation/agree", function (req, res) {
  const agreeingUser = requireUser(req, res);
  if (!agreeingUser) return;
  try { profiles = JSON.parse(fs.readFileSync("profiles.json", "utf8")); } catch (_) {}
  const { profileUsername, field, interpIndex } = req.body;
  // 别人写在自己档案上的解读，自己不能点赞
  if (profileUsername === agreeingUser) return res.status(403).json({ error: "Can't agree on your own profile" });
  const profile = profiles.find((p) => p.username === profileUsername);
  if (!profile) return res.status(404).json({ error: "Not found" });
  const arr = profile.interpretations?.[field];
  if (!Array.isArray(arr) || !arr[interpIndex]) return res.status(404).json({ error: "Not found" });

  const interp = arr[interpIndex];
  if (!interp.agreedBy) interp.agreedBy = {};
  const myCount = interp.agreedBy[agreeingUser] || 0;
  if (myCount >= 2) return res.json({ limited: true, agrees: interp.agrees || 0 });

  interp.agreedBy[agreeingUser] = myCount + 1;
  interp.agrees = (interp.agrees || 0) + 1;

  fs.writeFileSync("profiles.json", stringifyProfiles(profiles));
  io.emit("interpretation-agree-event", { profileUsername, field, interpIndex, agrees: interp.agrees });
  res.json({ success: true, agrees: interp.agrees });
});

// POST /messages — 发送消息
app.post("/messages", function (req, res) {
  const me = requireUser(req, res);
  if (!me) return;
  const { from, fromName, to, toName } = req.body;
  const content = String(req.body.content || "").replace(/[<>]/g, "").slice(0, 500);
  if (!from || !to || !content)
    return res.status(400).json({ error: "Missing fields" });
  // 只能以自己的名义发；「别人发给我」的那种是 app 自己生成的骚扰消息，只能发到自己的收件箱
  if (from !== me && to !== me && !isAdmin(me)) return res.status(403).json({ error: "Forbidden" });

  const msg = {
    id: messages.length > 0 ? Math.max(...messages.map((m) => m.id)) + 1 : 1,
    from,
    fromName,
    to,
    toName,
    content,
    date: new Date().toISOString(),
    read: false,
  };

  messages.push(msg);
  fs.writeFileSync("messages.json", JSON.stringify(messages, null, 2));

  // 点喜欢时发的开场白：按 shared/openers.js 的分类给发送的人加减分，存进档案（排行榜跟着变）。
  // 扣分每发一次都算；加分对同一个人只算一次（openerBonusTo 记着加过分的人），防止对着同一个人刷分
  let scoreDelta = 0;
  let sender = null;
  if (req.body.opener && from === me && to !== me) {
    const pts = OPENER_SCORES[openerType(content)] || 0;
    sender = reloadProfiles().find((p) => p.username === me);
    if (pts && sender) {
      if (pts < 0) scoreDelta = pts;
      else {
        sender.openerBonusTo ||= [];
        if (!sender.openerBonusTo.includes(to)) {
          sender.openerBonusTo.push(to);
          scoreDelta = pts;
        }
      }
      if (scoreDelta) {
        sender.score = clampScore((sender.score ?? 60) + scoreDelta);
        fs.writeFileSync("profiles.json", stringifyProfiles(profiles));
      }
    }
  }
  res.json(scoreDelta ? { ...msg, scoreDelta, score: sender.score } : msg);
});

// GET /messages/:username — 获取某用户收到的消息
app.get("/messages/:username", function (req, res) {
  const username = req.params.username;
  if (!requireSelfOrAdmin(req, res, username)) return;
  const userMessages = messages.filter((m) => m.to === username);
  res.json(userMessages);
});

// GET /allMessages/:username — 获取某用户所有收发消息
app.get("/allMessages/:username", function (req, res) {
  const username = req.params.username;
  if (!requireSelfOrAdmin(req, res, username)) return;
  const all = messages.filter((m) => m.from === username || m.to === username);
  res.json(all);
});

// GET /conversation/:user1/:user2 — 获取两人之间的完整对话
app.get("/conversation/:user1/:user2", function (req, res) {
  const { user1, user2 } = req.params;
  const me = requireUser(req, res);
  if (!me) return;
  if (me !== user1 && me !== user2 && !isAdmin(me)) return res.status(403).json({ error: "Forbidden" });
  const convo = messages
    .filter(
      (m) =>
        (m.from === user1 && m.to === user2) ||
        (m.from === user2 && m.to === user1),
    )
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  res.json(convo);
});

// PUT /messages/:id/read — 标记消息为已读
app.put("/messages/:id/read", function (req, res) {
  const id = parseInt(req.params.id);
  const msg = messages.find((m) => m.id === id);
  if (!msg) return res.status(404).json({ error: "Not found" });
  if (!requireSelfOrAdmin(req, res, msg.to)) return;
  msg.read = true;
  fs.writeFileSync("messages.json", JSON.stringify(messages, null, 2));
  res.json({ success: true });
});

// ── 管理员后台（只有 admin.json 里的账号能用）──
function requireAdmin(req, res) {
  const u = requireUser(req, res);
  if (!u) return null;
  if (!isAdmin(u)) {
    res.status(403).json({ error: "Admins only" });
    return null;
  }
  return u;
}
// 所有人的档案（不含密码）+ 每人收发了多少私信
app.get("/admin/users", function (req, res) {
  if (!requireAdmin(req, res)) return;
  res.json(reloadProfiles().map((p) => ({
    ...publicProfile(p),
    msgCount: messages.filter((m) => m.from === p.username || m.to === p.username).length,
  })));
});
// 所有私信
app.get("/admin/messages", function (req, res) {
  if (!requireAdmin(req, res)) return;
  res.json(messages);
});
// 重置某人的密码（看不到旧密码，只能设一个新的），并让这个人在所有设备上重新登录
app.post("/admin/reset-password", function (req, res) {
  if (!requireAdmin(req, res)) return;
  const { username, newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 1) return res.status(400).json({ error: "Missing new password" });
  const p = reloadProfiles().find((x) => x.username === username);
  if (!p) return res.status(404).json({ error: "User not found" });
  p.password = hashPassword(newPassword);
  fs.writeFileSync("profiles.json", stringifyProfiles(profiles));
  Object.keys(sessions).forEach((t) => { if (sessions[t].username === username) delete sessions[t]; });
  saveSessions();
  res.json({ success: true });
});

// ── 排行榜（app 用）：服务器算好前十名再发，不用下载所有人的档案 ──
// 规则和大屏 web 一样：分数 − 被跳过次数
app.get("/ranking", function (req, res) {
  const score = (p) => (p.score ?? 60) - (p.skips?.length || 0);
  res.json(reloadProfiles()
    .filter((p) => p.name)
    .sort((a, b) => score(b) - score(a))
    .slice(0, 10)
    .map(publicProfile));
});

// ── 自定义选项库：大家自定义过的性别 / 性取向 / 城市，生成档案时存进来，之后所有人都能选到 ──
// 城市还要记下是在哪一级选的「自定义」：path = [洲, 国家, 省/州]（中文名，到哪一级就记到哪一级）
let customOptions = { gender: [], orientation: [], city: [] };
function loadCustomOptions() {
  try { customOptions = { gender: [], orientation: [], city: [], ...JSON.parse(fs.readFileSync("custom-options.json", "utf8")) }; } catch (_) {}
  return customOptions;
}
app.get("/custom-options", (req, res) => res.json(loadCustomOptions()));
app.post("/custom-options", (req, res) => {
  if (!requireUser(req, res)) return;
  loadCustomOptions();
  const clean = (v) => String(v || "").replace(/[^\p{L}\p{N}\s]/gu, "").trim().slice(0, 20);
  const { gender, orientation, city } = req.body || {};
  const addTo = (list, v) => { if (v && !list.includes(v)) list.push(v); };
  addTo(customOptions.gender, clean(gender));
  addTo(customOptions.orientation, clean(orientation));
  if (city && clean(city.name)) {
    const entry = { name: clean(city.name), path: (Array.isArray(city.path) ? city.path : []).slice(0, 3).map((x) => String(x).replace(/[<>]/g, "").slice(0, 40)) };
    if (!customOptions.city.some((c) => c.name === entry.name && c.path.join("|") === entry.path.join("|"))) customOptions.city.push(entry);
  }
  fs.writeFileSync("custom-options.json", JSON.stringify(customOptions, null, 2));
  res.json({ success: true });
});

// Creating object of key and certificate
// for SSL
const isProd = fs.existsSync("/etc/letsencrypt/live/tinggg.live/privkey.pem");
const options = {
  key: fs.readFileSync(isProd ? "/etc/letsencrypt/live/tinggg.live/privkey.pem" : "localhost-key.pem"),
  cert: fs.readFileSync(isProd ? "/etc/letsencrypt/live/tinggg.live/fullchain.pem" : "localhost.pem"),
};

const HTTPSserver = https.createServer(options, app);
const { Server } = require("socket.io");
const io = new Server(HTTPSserver);

// Creating servers and make them listen at their ports:
HTTPSserver.listen(portHTTPS, function (req, res) {
  console.log("HTTPS Server started at port", portHTTPS);
});

// if we ALSO serve on http we can incommend this, but right now we don't
// http.createServer(app).listen(portHTTP, function (req, res) {
//     console.log("HTTP Server started at port", portHTTP);
// });
