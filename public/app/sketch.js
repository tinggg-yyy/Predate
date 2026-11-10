let tool = "brush";

let grid = [];
let currentText = "";

let history = []; // 每一笔的 diff 列表
let redoStack = []; // 撤销掉的笔：{x, y, oldVal, newVal}，重做时按 newVal 改回去；画了新的一笔就清空
let currentStroke = []; // 当前这笔中被修改的格子 {x, y, oldVal}
let strokeCells = new Set(); // 当前笔中已记录的格子，避免重复记录

// 画框尺寸和 Pixelgraphy 一样：手机上占屏幕宽度的 90%（Pixelgraphy 还要在里面扣掉 2px 的框）。
// 但不能超过填写页的内容宽度：app 最宽 420（.setup-content 的 max-width），左右各留 20 内边距、画框边框 2
const canvasSize = () => {
  const appW = Math.min(windowWidth, 420);
  return Math.floor(Math.max(200, Math.min(appW * 0.9, appW - 40 - 4)));
};

// 工具栏和画框一样宽
function _fitTools() {
  const tools = document.getElementById("tools");
  if (tools) tools.style.maxWidth = `${width}px`;
}

function setup() {
  let canvas = createCanvas(canvasSize(), canvasSize());
  canvas.parent("p5-canvas-container");
  attachPointerEvents(canvas.elt);
  _fitTools();
  clear();

  for (let y = 0; y < 32; y++) {
    grid[y] = [];
    for (let x = 0; x < 32; x++) {
      grid[y][x] = "/";
    }
  }
}

// 跟档案头像共用 drawPixelGrid（shared/card-data.js）：画的时候和生成出来的头像一模一样
function draw() {
  clear();
  drawPixelGrid(drawingContext, grid, currentText, width, pixelDensity());
}

// ── 画（和 Pixelgraphy 一样用 pointer 事件：手指、鼠标、触控笔都能画）──
// 只在画布上监听：手指从画框外开始划，页面照常上下滑动

let drawing = false;

// ── 工具栏：画笔 / 橡皮擦 / 撤销 / 重做 / 清空 ──
function setBrush() {
  tool = "brush";
  document.getElementById("brush-btn")?.classList.add("tool-active");
  document.getElementById("eraser-btn")?.classList.remove("tool-active");
}

function setEraser() {
  tool = "eraser";
  document.getElementById("eraser-btn")?.classList.add("tool-active");
  document.getElementById("brush-btn")?.classList.remove("tool-active");
}

function setClear() {
  const stroke = [];
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++)
      if (grid[y][x] !== "/") {
        stroke.push({ x, y, oldVal: grid[y][x] });
        grid[y][x] = "/";
      }
  if (stroke.length) {
    history.push(stroke); // 清空也能撤销
    redoStack = [];
  }
}

function setUndo() {
  if (history.length === 0) return;
  const stroke = history.pop();
  // 撤销前先记下现在的样子，重做时改回来
  redoStack.push(stroke.map((c) => ({ ...c, newVal: grid[c.y][c.x] })));
  for (const { x, y, oldVal } of stroke) grid[y][x] = oldVal;
}

// 重做：撤销点多了可以一步步改回来
function setRedo() {
  if (redoStack.length === 0) return;
  const stroke = redoStack.pop();
  for (const { x, y, newVal } of stroke) grid[y][x] = newVal;
  history.push(stroke.map(({ x, y, oldVal }) => ({ x, y, oldVal })));
}

// 触控笔（Apple Pencil 这类）的力度 → 深浅 1~4；轻轻画是浅的，用力画是深的
function pressureLevel(p) {
  if (p < 0.2) return 1;
  if (p < 0.4) return 2;
  if (p < 0.65) return 3;
  return 4;
}

// 在画布坐标 (mx, my) 所在的格子上画一下。
// pressure：触控笔的力度（0~1），有就按力度定深浅；鼠标、手指拿不到真实力度，传 null，还是逐级加深
function paintAt(mx, my, pressure = null) {
  const gx = floor((mx / width) * 32);
  const gy = floor((my / height) * 32);
  if (gx < 0 || gx >= 32 || gy < 0 || gy >= 32) return;

  const cur = grid[gy][gx];
  let newVal = cur;

  if (tool === "brush" && pressure !== null) {
    // 按力度定深浅，只会加深不会变浅（轻轻划过已经很深的格子不会把它擦淡）
    const want = pressureLevel(pressure);
    const empty = cur === "/" || cur === null;
    if (currentText !== "") {
      // 文字模式：空格、像素格、文字格都变成文字格（像素格保留原来的深浅）
      const lv = empty ? 0 : typeof cur === "number" ? cur : /^#[1-4]$/.test(cur) ? Number(cur.slice(1)) : 4;
      newVal = `#${Math.max(lv, want)}`;
    } else if (empty || typeof cur === "number") {
      // 像素模式：只画空格和像素格，文字格不动（和逐级加深一样）
      newVal = Math.max(empty ? 0 : cur, want);
    }
  } else if (tool === "brush") {
    if (currentText !== "") {
      // 文字模式：逐级加深
      if (cur === "/" || cur === null) newVal = "#1";
      else if (cur === "#1") newVal = "#2";
      else if (cur === "#2") newVal = "#3";
      else if (cur === "#3") newVal = "#4";
      else if (typeof cur === "number") newVal = `#${cur}`; // 已有像素格 → 同级文字格
      // "#4", "#", "text" stays
    } else {
      // 像素模式：逐级加深
      if (cur === "/" || cur === null) newVal = 1;
      else if (cur === 1) newVal = 2;
      else if (cur === 2) newVal = 3;
      else if (cur === 3) newVal = 4;
      // cur === 4 or "pixel" stays at max
    }
  } else if (tool === "eraser") {
    newVal = "/";
  }

  if (newVal !== cur) {
    // 只在首次修改时记录旧值，供撤销使用
    const key = `${gx},${gy}`;
    if (!strokeCells.has(key)) {
      strokeCells.add(key);
      currentStroke.push({ x: gx, y: gy, oldVal: cur });
    }
    grid[gy][gx] = newVal;
  }
}

// 把屏幕坐标换算成画布坐标
function canvasXY(e, el) {
  const r = el.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * width, y: ((e.clientY - r.top) / r.height) * height };
}

function endStroke() {
  if (!drawing) return;
  drawing = false;
  if (currentStroke.length > 0) {
    history.push(currentStroke);
    redoStack = [];
  }
  currentStroke = [];
  strokeCells = new Set();
}

// 只有触控笔给的是真实力度；鼠标按下永远是 0.5，手指在大部分手机上是 0 或 1
const penPressure = (e) => (e.pointerType === "pen" && e.pressure > 0 ? e.pressure : null);

function attachPointerEvents(el) {
  el.addEventListener("pointerdown", (e) => {
    if (e.button !== undefined && e.button > 0) return; // 只认左键 / 手指
    e.preventDefault();
    el.setPointerCapture?.(e.pointerId);
    drawing = true;
    currentStroke = [];
    strokeCells = new Set();
    const { x, y } = canvasXY(e, el);
    paintAt(x, y, penPressure(e));
  });
  el.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    e.preventDefault();
    // 手指快速划过时浏览器会合并事件，把中间的点也取出来，线不会断
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of events.length ? events : [e]) {
      const { x, y } = canvasXY(ev, el);
      if (x >= 0 && x <= width && y >= 0 && y <= height) paintAt(x, y, penPressure(ev));
    }
  });
  el.addEventListener("pointerup", endStroke);
  el.addEventListener("pointercancel", endStroke);
  el.addEventListener("lostpointercapture", endStroke);
  // 禁止长按弹出菜单 / iOS 放大镜
  el.addEventListener("contextmenu", (e) => e.preventDefault());
}

function windowResized() {
  resizeCanvas(canvasSize(), canvasSize());
  _fitTools();
}

// draw text on canvas based on currentText and update grid state
function drawText() {
  let input = document.getElementById("text-input").value.trim();

  if (input !== "") {
    currentText = input;
  }

  // 把已有的像素格子转成同级别的文字格子
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const cell = grid[y][x];
      if (cell === "pixel" || cell === 4) {
        grid[y][x] = "#4";
      } else if (cell === 3) {
        grid[y][x] = "#3";
      } else if (cell === 2) {
        grid[y][x] = "#2";
      } else if (cell === 1) {
        grid[y][x] = "#1";
      }
    }
  }
}
