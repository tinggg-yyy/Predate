// ── 配色（色调）──────────────────────────────────────────────
// 整套配色只由两个颜色决定：底色 bg + 墨色 ink（文字、线条、像素图标）。
// 按钮底色、阴影线、深色、浅色这些都按比例混出来，和原版灰绿配色基本一致。
// 预设配色在 THEME_PRESETS；自定义 = 用户自己选的 bg / ink。

const _THEME_KEY = "predate_theme";

const THEME_PRESETS = [
  // 默认配色：必须排第一个（没选过配色的人用 THEME_PRESETS[0]）
  { id: "gameboy", zh: "原版灰绿", en: "GameBoy", bg: "#a9b0a2", ink: "#283023" },
  { id: "night", zh: "夜间", en: "Night", bg: "#23281f", ink: "#c8d4b8" },
  // 有梗的配色和对比跳色交错排
  { id: "brat", zh: "brat", en: "brat", bg: "#8ace00", ink: "#000000" },
  { id: "lemon", zh: "柠檬紫", en: "Lemon Grape", bg: "#f2e14c", ink: "#3b1f6b" },
  { id: "bsod", zh: "蓝屏", en: "Blue Screen", bg: "#0000aa", ink: "#ffffff" },
  { id: "mint", zh: "薄荷樱桃", en: "Mint Cherry", bg: "#a6e3c4", ink: "#a3122c" },
  { id: "lucky", zh: "发财红", en: "Lucky Red", bg: "#c8161d", ink: "#f7d36b" },
  { id: "tangerine", zh: "橘子海军", en: "Tangerine Navy", bg: "#ff9f4a", ink: "#102a6b" },
  { id: "dopamine", zh: "多巴胺", en: "Dopamine", bg: "#ff7a00", ink: "#3a0a99" },
  { id: "bubblegum", zh: "泡泡糖", en: "Bubblegum", bg: "#ffb6d2", ink: "#0f5132" },
  { id: "maillard", zh: "美拉德", en: "Maillard", bg: "#8b5a3c", ink: "#f3e2c7" },
  { id: "sky", zh: "天空橙", en: "Sky Orange", bg: "#93d2f5", ink: "#9a3300" },
  { id: "riso", zh: "孔版印刷", en: "Riso", bg: "#ff48b0", ink: "#13308c" },
  { id: "lime", zh: "荧光绿", en: "Neon Lime", bg: "#c8f542", ink: "#5a128a" },
  { id: "blueprint", zh: "蓝图", en: "Blueprint", bg: "#1d4f91", ink: "#dce9ff" },
  { id: "tiffany", zh: "蒂芙尼", en: "Tiffany", bg: "#86d8cf", ink: "#7a1f3d" },
  { id: "sticky", zh: "便利贴", en: "Sticky Note", bg: "#ffe97a", ink: "#3d3a33" },
  { id: "tomato", zh: "番茄", en: "Tomato", bg: "#e8463f", ink: "#fff1cf" },
  { id: "receipt", zh: "小票", en: "Receipt", bg: "#f6f4ee", ink: "#5e4f86" },
  { id: "klein", zh: "克莱因蓝", en: "Klein Blue", bg: "#1f3fae", ink: "#ffd23f" },
  { id: "forest", zh: "墨绿金", en: "Forest Gold", bg: "#1f3d2b", ink: "#e8c55c" },
  { id: "terminal", zh: "黑客", en: "Terminal", bg: "#0d120d", ink: "#3dff6e" },
  { id: "cyber", zh: "赛博", en: "Cyber", bg: "#1c0d33", ink: "#ff5ad9" },
  // 柔和的
  { id: "sakura", zh: "樱花粉", en: "Sakura", bg: "#e3b9c0", ink: "#4a2230" },
  { id: "deepsea", zh: "深海蓝", en: "Deep Sea", bg: "#9fb3c2", ink: "#1c2a38" },
  { id: "amber", zh: "琥珀橙", en: "Amber", bg: "#d9b27c", ink: "#3d2610" },
  { id: "lavender", zh: "薰衣草", en: "Lavender", bg: "#b9b0d0", ink: "#2c2440" },
  { id: "paper", zh: "旧报纸", en: "Newsprint", bg: "#e4dfd2", ink: "#2a2a2a" },
];

const _hexToRgb = (hex) => {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const _rgbToHex = (rgb) => "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
// a 往 b 走 t 那么多（t=0 就是 a，t=1 就是 b）
const _mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const _WHITE = [255, 255, 255];

// 由底色 + 墨色推出整套 CSS 变量
function themePalette(bgHex, inkHex) {
  const bg = _hexToRgb(bgHex);
  const ink = _hexToRgb(inkHex);
  const line = _mix(ink, bg, 0.12);
  const panel = _mix(bg, _WHITE, 0.25);
  const rgbStr = (c) => c.map(Math.round).join(" ");
  return {
    "--c-bg": _rgbToHex(bg),
    "--c-btn-bg": _rgbToHex(_mix(bg, _WHITE, 0.12)),
    "--c-text": _rgbToHex(ink),
    "--c-btn-shadow": _rgbToHex(line),
    "--c-dark": _rgbToHex(_mix(ink, bg, 0.25)),
    "--c-mid": _rgbToHex(_mix(ink, bg, 0.7)),
    "--c-light": _rgbToHex(_mix(bg, _WHITE, 0.55)),
    // 头像背景格子：比底色稍微深一点点
    "--c-dead": _rgbToHex(_mix(bg, ink, 0.05)),
    "--ink-rgb": rgbStr(ink),
    "--line-rgb": rgbStr(line),
    "--panel-rgb": rgbStr(panel),
  };
}

// 「自动」按钮：按一个颜色配另一个同色相的颜色（这个浅 → 配很深的；这个深 → 配很浅的）
function _hslPartner(hex, darkL, lightL, maxS) {
  const [r, g, b] = _hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  const targetL = l > 0.45 ? darkL : lightL;
  const targetS = Math.min(s, maxS);
  // HSL → RGB
  const q = targetL < 0.5 ? targetL * (1 + targetS) : targetL + targetS - targetL * targetS;
  const p = 2 * targetL - q;
  const hue = (t) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return _rgbToHex([hue(h + 1 / 3), hue(h), hue(h - 1 / 3)].map((v) => v * 255));
}
// 按底色配墨色：墨色要很深或很浅，颜色淡一点
const suggestInk = (bgHex) => _hslPartner(bgHex, 0.15, 0.82, 0.35);
// 按墨色配底色：底色不用那么极端（浅底像原版灰绿那种亮度），可以更鲜艳一点
const suggestBg = (inkHex) => _hslPartner(inkHex, 0.15, 0.72, 0.45);

// 现在的配色：{ id, bg, ink }（id 是预设名或 "custom"）
let currentTheme = THEME_PRESETS[0];
try {
  const saved = JSON.parse(localStorage.getItem(_THEME_KEY) || "null");
  if (saved?.id === "custom" && saved.bg && saved.ink) currentTheme = saved;
  else if (saved?.id) currentTheme = THEME_PRESETS.find((t) => t.id === saved.id) || currentTheme;
} catch (_) {}

function _applyThemeVars(theme) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(themePalette(theme.bg, theme.ink))) root.style.setProperty(k, v);
  root.dataset.theme = theme.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.bg);
}
_applyThemeVars(currentTheme);

function setTheme(theme) {
  currentTheme = theme;
  _applyThemeVars(theme);
  try {
    localStorage.setItem(_THEME_KEY, JSON.stringify(theme.id === "custom" ? theme : { id: theme.id }));
  } catch (_) {}
  // 像素图标、头像、画板这些画在 canvas 上的东西，收到这个事件后按新墨色重画
  document.dispatchEvent(new CustomEvent("themechange", { detail: theme }));
}

// 我的配色：用户自己存下来的 { name, bg, ink }，只存在这个浏览器里，最多 12 个
const _SAVED_KEY = "predate_theme_saved";
const SAVED_THEMES_MAX = 12;
const SAVED_THEME_NAME_MAX = 12;
function savedThemes() {
  try {
    const list = JSON.parse(localStorage.getItem(_SAVED_KEY) || "[]");
    return Array.isArray(list) ? list.filter((t) => t?.bg && t?.ink) : [];
  } catch (_) {
    return [];
  }
}
function _writeSavedThemes(list) {
  try {
    localStorage.setItem(_SAVED_KEY, JSON.stringify(list));
  } catch (_) {}
}
const sameColors = (a, b) => a.bg.toLowerCase() === b.bg.toLowerCase() && a.ink.toLowerCase() === b.ink.toLowerCase();
const _cleanThemeName = (name) => String(name || "").trim().slice(0, SAVED_THEME_NAME_MAX);
// 现在的配色能不能存：返回 "ok" / "dup"（已经存过）/ "full"
function canSaveCurrentTheme() {
  const list = savedThemes();
  if (list.some((t) => sameColors(t, currentTheme))) return "dup";
  if (list.length >= SAVED_THEMES_MAX) return "full";
  return "ok";
}
function saveCurrentTheme(name) {
  if (canSaveCurrentTheme() !== "ok") return;
  const list = savedThemes();
  list.push({ name: _cleanThemeName(name), bg: currentTheme.bg, ink: currentTheme.ink });
  _writeSavedThemes(list);
}
function renameSavedTheme(i, name) {
  const list = savedThemes();
  if (!list[i]) return;
  list[i].name = _cleanThemeName(name);
  _writeSavedThemes(list);
}
function removeSavedTheme(i) {
  const list = savedThemes();
  list.splice(i, 1);
  _writeSavedThemes(list);
}

// 画 canvas 用的墨色 / 底色（画板每一帧每个格子都会调用，按配色缓存，不重复解析）
let _inkCache = { hex: null, rgb: null };
function themeInkRGB() {
  if (_inkCache.hex !== currentTheme.ink) _inkCache = { hex: currentTheme.ink, rgb: _hexToRgb(currentTheme.ink) };
  return _inkCache.rgb;
}
function themeInk(alpha = 1) {
  const [r, g, b] = themeInkRGB();
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}
function themeBg() {
  return currentTheme.bg;
}
