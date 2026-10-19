let petCanvas;
let tool = "brush";

let grid = [];
let currentText = "";

let history = []; // 每一笔的 diff 列表
let currentStroke = []; // 当前这笔中被修改的格子 {x, y, oldVal}
let strokeCells = new Set(); // 当前笔中已记录的格子，避免重复记录

function setup() {
  let canvas = createCanvas((windowWidth * 4) / 5, (windowWidth * 4) / 5);
  canvas.parent("p5-canvas-container");
  clear();
  petCanvas = createGraphics(32, 32);
  petCanvas.clear();

  for (let y = 0; y < 32; y++) {
    grid[y] = [];
    for (let x = 0; x < 32; x++) {
      grid[y][x] = "/";
    }
  }

  ////墨水屏效果 ink paper effect
  // petCanvas.pixelDensity(1);
  // pixelDensity(1);
}

function draw() {
  clear();

  let cellSize = width / 32;
  const pixelAlpha = { 1: 65, 2: 125, 3: 190, 4: 255 };
  const textAlpha  = { "#1": 65, "#2": 125, "#3": 190, "#4": 255 };

  // Pre-number text cells in row-major order for multi-char distribution
  const textCellIdx = {};
  if (currentText.length > 1) {
    let idx = 0;
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const c = grid[y][x];
        if (c === "text" || c === "#" || textAlpha[c] !== undefined) {
          textCellIdx[`${x},${y}`] = idx++;
        }
      }
    }
  }

  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      let cell = grid[y][x];

      if (cell === "pixel" || cell === 4) {
        fill(40, 48, 35, 255); noStroke();
        drawingContext.shadowColor = "rgba(40,48,35,0.60)";
        drawingContext.shadowOffsetX = 2; drawingContext.shadowOffsetY = 2; drawingContext.shadowBlur = 0;
        rect(x * cellSize, y * cellSize, cellSize, cellSize);
        drawingContext.shadowColor = "rgba(0,0,0,0)";
      } else if (pixelAlpha[cell] !== undefined) {
        fill(40, 48, 35, pixelAlpha[cell]); noStroke();
        drawingContext.shadowColor = "rgba(40,48,35,0.60)";
        drawingContext.shadowOffsetX = 2; drawingContext.shadowOffsetY = 2; drawingContext.shadowBlur = 0;
        rect(x * cellSize, y * cellSize, cellSize, cellSize);
        drawingContext.shadowColor = "rgba(0,0,0,0)";
      } else if (cell === "text" || cell === "#" || cell === "#4") {
        const ch = currentText.length > 1
          ? currentText[(textCellIdx[`${x},${y}`] ?? 0) % currentText.length]
          : currentText;
        fill(40, 48, 35, 255);
        textAlign(CENTER, CENTER); textSize(cellSize);
        drawingContext.shadowColor = "rgba(40,48,35,0.60)";
        drawingContext.shadowOffsetX = 2; drawingContext.shadowOffsetY = 2; drawingContext.shadowBlur = 0;
        text(ch, x * cellSize + cellSize / 2, y * cellSize + cellSize / 2);
        drawingContext.shadowColor = "rgba(0,0,0,0)";
      } else if (textAlpha[cell] !== undefined) {
        const ch = currentText.length > 1
          ? currentText[(textCellIdx[`${x},${y}`] ?? 0) % currentText.length]
          : currentText;
        fill(40, 48, 35, textAlpha[cell]);
        textAlign(CENTER, CENTER); textSize(cellSize);
        drawingContext.shadowColor = "rgba(40,48,35,0.60)";
        drawingContext.shadowOffsetX = 2; drawingContext.shadowOffsetY = 2; drawingContext.shadowBlur = 0;
        text(ch, x * cellSize + cellSize / 2, y * cellSize + cellSize / 2);
        drawingContext.shadowColor = "rgba(0,0,0,0)";
      } else if (cell !== null && cell !== "/") {
        fill(40, 48, 35, 255);
        textAlign(CENTER, CENTER); textSize(cellSize);
        drawingContext.shadowColor = "rgba(40,48,35,0.60)";
        drawingContext.shadowOffsetX = 2; drawingContext.shadowOffsetY = 2; drawingContext.shadowBlur = 0;
        text(cell, x * cellSize + cellSize / 2, y * cellSize + cellSize / 2);
        drawingContext.shadowColor = "rgba(0,0,0,0)";
      }
    }
  }
  // 网格线（增加拓麻歌子 LCD 质感）
  stroke(40, 48, 35, 22);
  strokeWeight(0.5);
  for (let i = 0; i <= 32; i++) {
    line(i * cellSize, 0, i * cellSize, height);
    line(0, i * cellSize, width, i * cellSize);
  }
  noStroke();
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
  petCanvas.clear();
}

function setUndo() {
  if (history.length === 0) return;
  const stroke = history.pop();
  for (const { x, y, oldVal } of stroke) {
    grid[y][x] = oldVal;
  }
}

// Touch start: Reset current stroke data
function touchStarted() {
  currentStroke = [];
  strokeCells = new Set();
}

// Touch move: Modify cells based on tool type and record changes
function touchMoved() {
  const photoPage = document.getElementById("profile-photo");
  if (!photoPage.classList.contains("active")) {
    return true;
  }

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
  resizeCanvas((windowWidth * 4) / 5, (windowWidth * 4) / 5);
}

//generate data url from p5 canvas
function generateAvatarUrl() {
  const dataUrl = document
    .querySelector("#p5-canvas-container canvas")
    .toDataURL("image/png");
  return dataUrl;

  // const dataUrl = petCanvas.elt.toDataURL("image/png");
  // console.log("Avatar URL:", dataUrl);
  // return dataUrl;

  // let exportCanvas = createGraphics(512, 512);
  // exportCanvas.clear();

  // let cellSize = 512 / 32;

  // exportCanvas.textAlign(CENTER, CENTER);
  // exportCanvas.textSize(cellSize);
  // exportCanvas.fill(0);
  // exportCanvas.noStroke();

  // for (let y = 0; y < 32; y++) {
  //   for (let x = 0; x < 32; x++) {
  //     let cell = grid[y][x];

  //     if (cell !== null) {
  //       if (cell === "pixel" && currentText !== "") {
  //         cell = currentText;
  //       }

  //       exportCanvas.text(
  //         cell,
  //         x * cellSize + cellSize / 2,
  //         y * cellSize + cellSize / 2,
  //       );
  //     }
  //   }
  // }

  // return exportCanvas.elt.toDataURL("image/png");
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
