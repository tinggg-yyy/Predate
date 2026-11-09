let tool = "brush";

let grid = [];
let currentText = "";

let history = []; // 每一笔的 diff 列表
let currentStroke = []; // 当前这笔中被修改的格子 {x, y, oldVal}
let strokeCells = new Set(); // 当前笔中已记录的格子，避免重复记录

// 画框边长取 32 的整数倍：每一格都是整数像素，格子边缘不会糊
const canvasSize = () => Math.max(32, Math.floor((windowWidth * 4) / 5 / 32) * 32);

function setup() {
  let canvas = createCanvas(canvasSize(), canvasSize());
  canvas.parent("p5-canvas-container");
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

// P5 touch events: https://p5js.org/reference/#Touch

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
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      grid[y][x] = "/";
    }
  }
}

function setUndo() {
  if (history.length === 0) return;
  const stroke = history.pop();
  for (const { x, y, oldVal } of stroke) {
    grid[y][x] = oldVal;
  }
}

// 这一笔是否从画框内开始：画框内 → 画图；画框外 → 让页面正常上下滑动
let touchInCanvas = false;

// Touch start: Reset current stroke data
function touchStarted() {
  currentStroke = [];
  strokeCells = new Set();
  touchInCanvas =
    touches.length > 0 &&
    touches[0].x >= 0 && touches[0].x <= width &&
    touches[0].y >= 0 && touches[0].y <= height;
}

// Touch move: Modify cells based on tool type and record changes
function touchMoved() {
  const photoPage = document.getElementById("profile-photo");
  if (!photoPage.classList.contains("active")) {
    return true;
  }

  // 手指从画框外开始 → 不拦截，页面可以滚动
  if (!touchInCanvas) return true;

  if (touches.length === 0) return;

  let x = touches[0].x;
  let y = touches[0].y;

  // limit x,y within canvas
  if (x < 0 || x > width || y < 0 || y > height) {
    return false;
  }
  // Map touch coordinates to grid coordinates
  let petX = floor((x / width) * 32);
  let petY = floor((y / height) * 32);
  if (petX >= 0 && petX < 32 && petY >= 0 && petY < 32) {
    const cur = grid[petY][petX];
    let newVal = cur;

    if (tool === "brush") {
      if (currentText !== "") {
        // 文字模式：逐级加深
        if (cur === "/" || cur === null) {
          newVal = "#1";
        } else if (cur === "#1") {
          newVal = "#2";
        } else if (cur === "#2") {
          newVal = "#3";
        } else if (cur === "#3") {
          newVal = "#4";
        } else if (typeof cur === "number") {
          newVal = `#${cur}`; // 已有像素格 → 同级文字格
        }
        // "#4", "#", "text" stays
      } else {
        // 像素模式：逐级加深
        if (cur === "/" || cur === null) {
          newVal = 1;
        } else if (cur === 1) {
          newVal = 2;
        } else if (cur === 2) {
          newVal = 3;
        } else if (cur === 3) {
          newVal = 4;
        }
        // cur === 4 or "pixel" stays at max
      }
    } else if (tool === "eraser") {
      newVal = "/";
    }

    if (newVal !== cur) {
      // 只在首次修改时记录旧值，供撤销使用
      const key = `${petX},${petY}`;
      if (!strokeCells.has(key)) {
        strokeCells.add(key);
        currentStroke.push({ x: petX, y: petY, oldVal: cur });
      }
      grid[petY][petX] = newVal;
    }
  }

  return false;
}

// Touch end: add the current stroke to the history stack and reset it for the next stroke.
function touchEnded() {
  if (currentStroke.length > 0) {
    history.push(currentStroke);
    currentStroke = [];
    strokeCells = new Set();
  }
}

function windowResized() {
  resizeCanvas(canvasSize(), canvasSize());
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
