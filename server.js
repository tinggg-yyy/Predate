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

// returning to the client anything that is
// inside the public folder
app.use(express.static("public"));
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

app.get("/custom-hobbies", (req, res) => res.json(customHobbies));

app.post("/custom-hobbies", (req, res) => {
  const { tag, categoryZh, tier } = req.body;
  if (!tag || typeof tag !== "string") return res.status(400).json({ error: "Missing tag" });
  const clean = tag.trim().slice(0, 20);
  if (!clean) return res.json({ success: true, hobbies: customHobbies });
  const exists = customHobbies.find((t) => (typeof t === "string" ? t : t.tag) === clean);
  if (exists) return res.json({ success: true, hobbies: customHobbies });
  const entry = categoryZh ? { tag: clean, categoryZh, tier: tier !== undefined ? tier : 1 } : clean;
  customHobbies.push(entry);
  fs.writeFileSync("custom-hobbies.json", JSON.stringify(customHobbies, null, 2));
  res.json({ success: true, hobbies: customHobbies });
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

app.get("/profiles", function (req, res) {
  try {
    const data = JSON.parse(fs.readFileSync("profiles.json", "utf8"));
    profiles = data; // keep in-memory in sync
    res.json(data);
  } catch (_) {
    res.json(profiles);
  }
});

app.post("/profiles", function (req, res) {
  // this function is being called whenever the server
  // receives a HTTP POST request for /profiles
  // - the data the client sent is in req.body
  console.log(req.body);
  let profile = req.body;
  // let's add some additional information
  profile.date = new Date().toISOString();
  profile.id =
    profiles.length > 0 ? Math.max(...profiles.map((p) => p.id)) + 1 : 1;

  // add it the messages array
  profiles.push(profile);
  // and save all current messages to a file (for permanence)
  fs.writeFileSync("profiles.json", stringifyProfiles(profiles));
  // generate avatar PNG in the background
  if (profile.grid && profile.name) generateAvatar(profile.name);
  // its a good practice return the final message to the client
  res.json(profile);
});

// POST /like — 记录一个 like
app.post("/like", function (req, res) {
  try { profiles = JSON.parse(fs.readFileSync("profiles.json", "utf8")); } catch (_) {}
  const { likerUsername, likerPetName, likedUsername } = req.body;

  // 找到被 like 的 profile
  let likedProfile = profiles.find((p) => p.username === likedUsername);
  if (!likedProfile)
    return res.status(404).json({ error: "Profile not found" });

  // 初始化 likes 数组
  if (!likedProfile.likes) likedProfile.likes = [];

  // 避免同一人重复 like
  if (!likedProfile.likes.includes(likerPetName)) {
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
  try { profiles = JSON.parse(fs.readFileSync("profiles.json", "utf8")); } catch (_) {}
  const { skipperPetName, skippedUsername } = req.body;
  const skippedProfile = profiles.find((p) => p.username === skippedUsername);
  if (skippedProfile) {
    if (!skippedProfile.skips) skippedProfile.skips = [];
    if (!skippedProfile.skips.includes(skipperPetName)) {
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
  const profile = profiles.find((p) => p.username === username);
  if (!profile) return res.status(404).json({ error: "Not found" });

  res.json({
    likesCount: profile.likes ? profile.likes.length : 0,
    likedBy: profile.likes || [],
  });
});

// POST /impression — 记录一个印象
app.post("/impression", function (req, res) {
  const { likedUsername, commenterName, impression } = req.body;

  let profile = profiles.find((p) => p.username === likedUsername);
  if (!profile) return res.status(404).json({ error: "Not found" });

  if (!profile.impressions) profile.impressions = [];

  profile.impressions.push({
    from: commenterName,
    impression: impression,
    date: new Date().toISOString(),
  });

  if (profile.grid && impression) {
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
  const updates = req.body;
  const profile = profiles.find((p) => p.username === username);
  if (!profile) return res.status(404).json({ error: "Not found" });

  const locked = ["username", "password", "id", "date"];
  Object.keys(updates).forEach((key) => {
    if (!locked.includes(key)) profile[key] = updates[key];
  });

  try {
    fs.writeFileSync("profiles.json", stringifyProfiles(profiles));
  } catch (e) {
    console.error("Failed to write profiles.json:", e);
    return res.status(500).json({ error: "Failed to save" });
  }
  res.json(profile);
});

// POST /interpretation — 给某个 profile 的某个字段添加解读
app.post("/interpretation", function (req, res) {
  try { profiles = JSON.parse(fs.readFileSync("profiles.json", "utf8")); } catch (_) {}
  const { profileUsername, field, text, addedBy } = req.body;

  let profile = profiles.find((p) => p.username === profileUsername);
  if (!profile) return res.status(404).json({ error: "Not found" });

  if (!profile.interpretations) profile.interpretations = {};
  // Support multiple interpretations per field — store as array
  if (!Array.isArray(profile.interpretations[field])) {
    profile.interpretations[field] = profile.interpretations[field]
      ? [profile.interpretations[field]]
      : [];
  }
  profile.interpretations[field].push({ text, addedBy });

  fs.writeFileSync("profiles.json", stringifyProfiles(profiles));
  io.emit("interpretation-event", { profileUsername, field, text, addedBy });
  res.json({ success: true });
});

// POST /interpretation/agree — 给某个解读点赞（每人最多2次）
app.post("/interpretation/agree", function (req, res) {
  try { profiles = JSON.parse(fs.readFileSync("profiles.json", "utf8")); } catch (_) {}
  const { profileUsername, field, interpIndex, agreeingUser } = req.body;
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
  const { from, fromName, to, toName, content } = req.body;
  if (!from || !to || !content)
    return res.status(400).json({ error: "Missing fields" });

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
  res.json(msg);
});

// GET /messages/:username — 获取某用户收到的消息
app.get("/messages/:username", function (req, res) {
  const username = req.params.username;
  const userMessages = messages.filter((m) => m.to === username);
  res.json(userMessages);
});

// GET /allMessages/:username — 获取某用户所有收发消息
app.get("/allMessages/:username", function (req, res) {
  const username = req.params.username;
  const all = messages.filter((m) => m.from === username || m.to === username);
  res.json(all);
});

// GET /conversation/:user1/:user2 — 获取两人之间的完整对话
app.get("/conversation/:user1/:user2", function (req, res) {
  const { user1, user2 } = req.params;
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
  msg.read = true;
  fs.writeFileSync("messages.json", JSON.stringify(messages, null, 2));
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
