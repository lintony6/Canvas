// === Canvas Setup ===
const canvas = document.getElementById("drawingCanvas");
const ctx = canvas.getContext("2d");

function resizeCanvas() {
  const temp = document.createElement("canvas");
  temp.width = canvas.width;
  temp.height = canvas.height;
  temp.getContext("2d").drawImage(canvas, 0, 0);

  canvas.width = window.innerWidth * 0.8;
  canvas.height = window.innerHeight * 0.6;

  ctx.drawImage(temp, 0, 0);
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

// === Drawing Variables ===
let drawing = false;
let brushColor = document.getElementById("colorPicker").value;
let brushSize = document.getElementById("brushSize").value;
let isErasing = false;

// Undo / Redo stacks
const undoStack = [];
const redoStack = [];

// Save initial state
saveState();

// === Drawing Logic ===
function startDraw(e) {
  drawing = true;
  ctx.beginPath();
  const { x, y } = getPos(e);
  ctx.moveTo(x, y);
}

function endDraw() {
  if (!drawing) return;
  drawing = false;
  ctx.closePath();
  saveState();
}

function draw(e) {
  if (!drawing) return;
  const { x, y } = getPos(e);
  ctx.lineWidth = brushSize;
  ctx.lineCap = "round";
  ctx.strokeStyle = isErasing ? "#ffffff" : brushColor;
  ctx.lineTo(x, y);
  ctx.stroke();
}

function getPos(e) {
  if (e.touches) e = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

// === Save / Undo / Redo ===
function saveState() {
  undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  if (undoStack.length > 20) undoStack.shift(); // limit history
  redoStack.length = 0;
}

document.getElementById("undo").addEventListener("click", () => {
  if (undoStack.length > 1) {
    redoStack.push(undoStack.pop());
    const prev = undoStack[undoStack.length - 1];
    ctx.putImageData(prev, 0, 0);
  }
});

document.getElementById("redo").addEventListener("click", () => {
  if (redoStack.length > 0) {
    const next = redoStack.pop();
    undoStack.push(next);
    ctx.putImageData(next, 0, 0);
  }
});

// === Tool Controls ===
document.getElementById("colorPicker").addEventListener("change", (e) => {
  brushColor = e.target.value;
  isErasing = false;
  document.getElementById("eraser").style.background = "#007bff";
});

document.getElementById("brushSize").addEventListener("input", (e) => {
  brushSize = e.target.value;
});

document.getElementById("eraser").addEventListener("click", () => {
  isErasing = !isErasing;
  document.getElementById("eraser").style.background = isErasing ? "#d9534f" : "#007bff";
});

document.getElementById("clear").addEventListener("click", () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  saveState();
});

document.getElementById("download").addEventListener("click", () => {
  const link = document.createElement("a");
  link.download = "drawing.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
});

// === Mouse Events ===
canvas.addEventListener("mousedown", startDraw);
canvas.addEventListener("mouseup", endDraw);
canvas.addEventListener("mousemove", draw);

// === Touch Events (mobile) ===
canvas.addEventListener("touchstart", startDraw);
canvas.addEventListener("touchend", endDraw);
canvas.addEventListener("touchmove", draw);
