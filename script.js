// -----------------------------
// Canvas Draw — single-file logic
// -----------------------------

/* Elements */
const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d');
const colorPicker = document.getElementById('colorPicker');
const brushSizeInput = document.getElementById('brushSize');
const brushPreview = document.getElementById('brushPreview');
const toolBrush = document.getElementById('toolBrush');
const toolEraser = document.getElementById('toolEraser');
const toolShapes = document.getElementById('toolShapes');
const shapesDropdown = document.getElementById('shapesDropdown');
const shapeButtons = document.querySelectorAll('.shapeOption');
const toolText = document.getElementById('toolText');
const toolFill = document.getElementById('toolFill');
const bgImageInput = document.getElementById('bgImageInput');

const clearBtn = document.getElementById('clearBtn');
const undoBtn = document.getElementById('undo');
const redoBtn = document.getElementById('redo');
const downloadBtn = document.getElementById('download');
const darkToggle = document.getElementById('darkToggle');
const replayBtn = document.getElementById('replayBtn');

const hiddenTextInput = document.getElementById('hiddenTextInput');

/* Canvas sizing */
function setCanvasSize() {
  // Save existing content to temp canvas
  const temp = document.createElement('canvas');
  temp.width = canvas.width || 800;
  temp.height = canvas.height || 600;
  temp.getContext('2d').drawImage(canvas, 0, 0);

  // Set new sizes
  const maxWidth = Math.min(window.innerWidth * 0.95, 1100);
  const width = Math.max(600, Math.floor(maxWidth));
  const height = Math.max(400, Math.floor(window.innerHeight * 0.65));

  canvas.width = width;
  canvas.height = height;

  // redraw previous
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(temp, 0, 0, temp.width, temp.height, 0, 0, canvas.width, canvas.height);
}
setCanvasSize();
window.addEventListener('resize', () => {
  setCanvasSize();
  // After resize, ensure we push a state so undo works well
  saveState();
});

/* State */
let currentTool = 'brush'; // 'brush' | 'eraser' | 'shape' | 'text' | 'fill'
let currentShape = 'rect'; // when shape chosen
let brushColor = colorPicker.value;
let brushSize = Number(brushSizeInput.value);
let isDrawing = false;
let isReplaying = false;
let startPos = null; // for shapes
let lastPos = null; // for stroke
let bgImage = null;

/* Undo/Redo stacks using ImageData */
const undoStack = [];
const redoStack = [];

/* Timelapse strokes recording */
const strokes = []; // each stroke: {type:'stroke'|'shape'|'text'|'fill'|'bg', color, size, points:[], shape, start, end, text, bgDataURL}

/* Helpers */
function pushStroke(stroke) {
  if (isReplaying) return; // don't record during replay
  strokes.push(stroke);
}

function setCompositeMode() {
  if (currentTool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out'; // actually erase
  } else {
    ctx.globalCompositeOperation = 'source-over'; // normal drawing
  }
}

function saveState() {
  // store current canvas pixel data
  try {
    undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (undoStack.length > 50) undoStack.shift();
    redoStack.length = 0;
  } catch (e) {
    // fallback: ignore (shouldn't happen)
    console.warn('saveState failed', e);
  }
}

function restoreImageData(imgData) {
  if (!imgData) return;
  ctx.putImageData(imgData, 0, 0);
}

/* Initial blank state */
ctx.fillStyle = '#ffffff';
ctx.fillRect(0, 0, canvas.width, canvas.height);
saveState();

/* Brush preview */
function updateBrushPreview(show, x=0, y=0) {
  if (!show) {
    brushPreview.style.display = 'none';
    return;
  }
  brushPreview.style.display = 'block';
  brushPreview.style.left = x + 'px';
  brushPreview.style.top = y + 'px';
  brushPreview.style.width = brushSize + 'px';
  brushPreview.style.height = brushSize + 'px';
  brushPreview.style.background = currentTool === 'eraser' ? '#ffffff' : brushColor;
  brushPreview.style.border = currentTool === 'eraser' ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(0,0,0,0.12)';
  brushPreview.style.boxShadow = '0 0 0 2px rgba(0,0,0,0.04)';
  if (currentTool === 'eraser') {
  brushPreview.style.background = 'rgba(255,255,255,0.2)';
  brushPreview.style.border = '1px solid rgba(255,255,255,0.5)';
}
}

/* Position helpers */
function getPointerPos(e) {
  if (e.touches && e.touches.length) e = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  return { x: (e.clientX - rect.left), y: (e.clientY - rect.top) };
}

/* Drawing freehand */
function beginStroke(e) {
  if (isReplaying) return;
  isDrawing = true;
  setCompositeMode();
  startPos = getPointerPos(e);
  lastPos = startPos;
  ctx.beginPath();
  ctx.moveTo(startPos.x, startPos.y);

  // start a new stroke record
  currentStroke = {
    type: 'stroke',
    color: currentTool === 'eraser' ? '#ffffff' : brushColor,
    size: brushSize,
    points: [{x:startPos.x, y:startPos.y}]
  };
}

function continueStroke(e) {
  if (!isDrawing || isReplaying) return;
  setCompositeMode();
  const p = getPointerPos(e);
  ctx.lineWidth = brushSize;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = currentTool === 'eraser' ? '#ffffff' : brushColor;

  ctx.lineTo(p.x, p.y);
  ctx.stroke();

  // record point
  currentStroke.points.push({x:p.x, y:p.y});
  lastPos = p;
}

function endStroke(e) {
  if (!isDrawing || isReplaying) return;
  isDrawing = false;
  ctx.closePath();
  ctx.globalCompositeOperation = 'source-over';
  pushStroke(currentStroke);
  saveState();
}

/* Shape tools (preview while dragging & commit on mouseup) */
let previewCanvas = null;
function ensurePreviewCanvas() {
  if (!previewCanvas) {
    previewCanvas = document.createElement('canvas');
    previewCanvas.style.position = 'absolute';
    previewCanvas.style.left = canvas.offsetLeft + 'px';
    previewCanvas.style.top = canvas.offsetTop + 'px';
    previewCanvas.width = canvas.width;
    previewCanvas.height = canvas.height;
    previewCanvas.style.pointerEvents = 'none';
    previewCanvas.getContext('2d').clearRect(0,0,previewCanvas.width, previewCanvas.height);
    canvas.parentElement.appendChild(previewCanvas);
  }
}

function clearPreview() {
  if (previewCanvas) {
    previewCanvas.getContext('2d').clearRect(0,0,previewCanvas.width, previewCanvas.height);
  }
}

function drawShapePreview(type, sx, sy, ex, ey, color, size) {
  ensurePreviewCanvas();
  const pctx = previewCanvas.getContext('2d');
  pctx.clearRect(0,0,previewCanvas.width, previewCanvas.height);
  pctx.lineWidth = size;
  pctx.strokeStyle = color;
  pctx.fillStyle = color;
  pctx.beginPath();
  if (type === 'rect') {
    const w = ex - sx, h = ey - sy;
    pctx.rect(sx, sy, w, h);
    pctx.stroke();
  } else if (type === 'circle') {
    const cx = (sx + ex)/2, cy = (sy + ey)/2;
    const rx = Math.abs(ex - sx)/2, ry = Math.abs(ey - sy)/2;
    const r = Math.max(1, Math.sqrt(rx*rx + ry*ry));
    pctx.arc(cx, cy, r, 0, Math.PI*2);
    pctx.stroke();
  } else if (type === 'line') {
    pctx.moveTo(sx, sy);
    pctx.lineTo(ex, ey);
    pctx.stroke();
  }
  pctx.closePath();
}

/* Commit shape onto main canvas */
function commitShape(type, sx, sy, ex, ey) {
  const color = brushColor;
  ctx.lineWidth = brushSize;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.beginPath();
  if (type === 'rect') {
    ctx.rect(sx, sy, ex - sx, ey - sy);
    ctx.stroke();
  } else if (type === 'circle') {
    const cx = (sx + ex)/2, cy = (sy + ey)/2;
    const rx = Math.abs(ex - sx)/2, ry = Math.abs(ey - sy)/2;
    const r = Math.max(1, Math.sqrt(rx*rx + ry*ry));
    ctx.arc(cx, cy, r, 0, Math.PI*2);
    ctx.stroke();
  } else if (type === 'line') {
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }
  ctx.closePath();

  // record shape stroke
  pushStroke({
    type: 'shape',
    shape: type,
    start: {x:sx, y:sy},
    end: {x:ex, y:ey},
    color: brushColor,
    size: brushSize
  });
  saveState();
}

/* Text tool */
function placeTextAt(x,y) {
  // show hidden input near the canvas (offscreen visually but used to capture text)
  hiddenTextInput.style.left = (x + canvas.getBoundingClientRect().left) + 'px';
  hiddenTextInput.style.top = (y + canvas.getBoundingClientRect().top) + 'px';
  hiddenTextInput.style.position = 'fixed';
  hiddenTextInput.value = '';
  hiddenTextInput.style.opacity = '1';
  hiddenTextInput.focus();

  // on enter, draw the text
  const onEnter = (ev) => {
    if (ev.key === 'Enter') {
      const txt = hiddenTextInput.value;
      if (txt.trim()) {
        ctx.fillStyle = brushColor;
        ctx.font = `${Math.max(12, brushSize * 3)}px sans-serif`;
        ctx.fillText(txt, x, y);
        pushStroke({type: 'text', x, y, text: txt, color: brushColor, size: brushSize});
        saveState();
      }
      hiddenTextInput.blur();
      hiddenTextInput.style.opacity = '0';
      hiddenTextInput.removeEventListener('keydown', onEnter);
    }
  };
  hiddenTextInput.addEventListener('keydown', onEnter);
}

// Paint-bucket flood fill
function floodFill(startX, startY, fillColor) {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  const targetOffset = (startY * canvas.width + startX) * 4;
  const targetColor = [
    data[targetOffset],
    data[targetOffset + 1],
    data[targetOffset + 2],
    data[targetOffset + 3],
  ];

  const fill = hexToRgba(fillColor);

  if (colorsMatch(targetColor, fill)) return; // same color → skip

  const stack = [[startX, startY]];
  while (stack.length) {
    const [x, y] = stack.pop();
    const idx = (y * canvas.width + x) * 4;

    if (!matchTargetColor(data, idx, targetColor)) continue;

    setPixel(data, idx, fill);

    // Push neighbors
    if (x > 0) stack.push([x - 1, y]);
    if (x < canvas.width - 1) stack.push([x + 1, y]);
    if (y > 0) stack.push([x, y - 1]);
    if (y < canvas.height - 1) stack.push([x, y + 1]);
  }

  ctx.putImageData(imageData, 0, 0);
  saveState();
  pushStroke({ type: 'fill', color: fillColor });
}

/* --- helpers --- */
function hexToRgba(hex) {
  const bigint = parseInt(hex.slice(1), 16);
  return [ (bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255, 255 ];
}

function colorsMatch(a, b) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function matchTargetColor(data, idx, target) {
  return (
    data[idx] === target[0] &&
    data[idx + 1] === target[1] &&
    data[idx + 2] === target[2] &&
    data[idx + 3] === target[3]
  );
}

function setPixel(data, idx, fill) {
  data[idx] = fill[0];
  data[idx + 1] = fill[1];
  data[idx + 2] = fill[2];
  data[idx + 3] = fill[3];
}


function setBackgroundImage(img) {
  // draw image to fill entire canvas proportionally, then draw previous content on top
  const copy = document.createElement('canvas');
  copy.width = canvas.width;
  copy.height = canvas.height;
  copy.getContext('2d').drawImage(canvas, 0, 0);

  // draw image stretched to cover
  ctx.clearRect(0,0,canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  // draw previous on top
  ctx.drawImage(copy, 0, 0);
  // store bg image base64 so replay can reapply
  const dataURL = imgToDataURL(img);
  pushStroke({type:'bg', dataURL});
  saveState();
  bgImage = img;
}

function imgToDataURL(img) {
  const t = document.createElement('canvas');
  t.width = img.width;
  t.height = img.height;
  t.getContext('2d').drawImage(img, 0, 0);
  return t.toDataURL('image/png');
}

/* Undo / Redo */
undoBtn.addEventListener('click', () => {
  if (undoStack.length > 1) {
    redoStack.push(undoStack.pop());
    const img = undoStack[undoStack.length - 1];
    restoreImageData(img);
  }
});

redoBtn.addEventListener('click', () => {
  if (redoStack.length > 0) {
    const img = redoStack.pop();
    undoStack.push(img);
    restoreImageData(img);
  }
});

/* Clear */
clearBtn.addEventListener('click', () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // fill white background for a clean look
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  pushStroke({type:'fill', color:'#ffffff'});
  saveState();
});

/* Download */
downloadBtn.addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = 'drawing.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
});

/* Dark mode toggle */
darkToggle.addEventListener('click', () => {
  const doc = document.documentElement;
  if (doc.getAttribute('data-theme') === 'dark') {
    doc.removeAttribute('data-theme');
  } else {
    doc.setAttribute('data-theme', 'dark');
  }
});

/* Tool toggles */
toolBrush.addEventListener('click', () => { currentTool = 'brush'; toolBrush.setAttribute('aria-pressed','true'); toolEraser.setAttribute('aria-pressed','false'); });
toolEraser.addEventListener('click', () => { currentTool = 'eraser'; toolEraser.setAttribute('aria-pressed','true'); toolBrush.setAttribute('aria-pressed','false'); });

/* Shapes dropdown simple toggle */
toolShapes.addEventListener('click', (ev) => {
  const open = shapesDropdown.getAttribute('aria-hidden') === 'true';
  shapesDropdown.setAttribute('aria-hidden', open ? 'false' : 'true');
});

/* Handle shape selection */
shapeButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    currentTool = 'shape';
    currentShape = btn.dataset.shape;
    shapesDropdown.setAttribute('aria-hidden','true');
    toolBrush.setAttribute('aria-pressed','false');
    toolEraser.setAttribute('aria-pressed','false');
  });
});

/* Text */
toolText.addEventListener('click', () => {
  currentTool = 'text';
  toolBrush.setAttribute('aria-pressed','false');
  toolEraser.setAttribute('aria-pressed','false');
});

/* Fill */
toolFill.addEventListener('click', () => {
  currentTool = 'fill';
});

/* BG image input */
bgImageInput.addEventListener('change', (ev) => {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = () => {
      setBackgroundImage(img);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
});

/* Color & size updates */
colorPicker.addEventListener('input', (e) => {
  brushColor = e.target.value;
});
brushSizeInput.addEventListener('input', (e) => {
  brushSize = Number(e.target.value);
  updateBrushPreview(true, lastMouseX, lastMouseY);
});

/* Pointer move to update preview */
let lastMouseX = 0, lastMouseY = 0;
function onPointerMove(e) {
  const rect = canvas.getBoundingClientRect();
  let clientX = e.clientX, clientY = e.clientY;
  if (e.touches && e.touches[0]) { clientX = e.touches[0].clientX; clientY = e.touches[0].clientY; }
  lastMouseX = clientX - rect.left;
  lastMouseY = clientY - rect.top;
  if (lastMouseX >=0 && lastMouseY >=0 && lastMouseX <= canvas.width && lastMouseY <= canvas.height) {
    updateBrushPreview(true, clientX - rect.left, clientY - rect.top);
  } else {
    updateBrushPreview(false);
  }

  // if drawing with shape tool show preview
  if (currentTool === 'shape' && isDrawing && startPos) {
    drawShapePreview(currentShape, startPos.x, startPos.y, lastMouseX, lastMouseY, brushColor, brushSize);
  }
}

/* Pointer down/up handlers (works for mouse & touch) */
let currentStroke = null;

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  const pos = getPointerPosFromEvent(e);
  if (currentTool === 'brush' || currentTool === 'eraser') {
    beginStroke(e);
  } else if (currentTool === 'shape') {
    isDrawing = true;
    startPos = getPointerPosFromEvent(e);
    ensurePreviewCanvas();
  } else if (currentTool === 'text') {
    const p = getPointerPosFromEvent(e);
    placeTextAt(p.x, p.y);
  } else if (currentTool === 'fill') {
  const { x, y } = getPointerPosFromEvent(e);
  floodFill(Math.floor(x), Math.floor(y), brushColor);
}
});

canvas.addEventListener('pointermove', (e) => {
  onPointerMove(e);
  if (currentTool === 'brush' || currentTool === 'eraser') {
    if (isDrawing) continueStroke(e);
  } else if (currentTool === 'shape') {
    if (isDrawing && startPos) {
      const p = getPointerPosFromEvent(e);
      drawShapePreview(currentShape, startPos.x, startPos.y, p.x, p.y, brushColor, brushSize);
    }
  }
});

canvas.addEventListener('pointerup', (e) => {
  const p = getPointerPosFromEvent(e);
  if (currentTool === 'brush' || currentTool === 'eraser') {
    endStroke(e);
  } else if (currentTool === 'shape') {
    if (startPos) {
      commitShape(currentShape, startPos.x, startPos.y, p.x, p.y);
      clearPreview();
      isDrawing = false;
      startPos = null;
    }
  }
});

/* Helper to unify pointer/touch/mouse */
function getPointerPosFromEvent(e) {
  if (e.touches && e.touches[0]) e = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

/* Touch support mapping pointer events */
canvas.addEventListener('pointercancel', () => {
  isDrawing = false;
  clearPreview();
});

/* Also support legacy mouse/touch events for broad compatibility */
canvas.addEventListener('touchstart', (e)=>{ e.preventDefault(); }, {passive:false});

/* Hide brush preview when leaving canvas */
canvas.addEventListener('mouseleave', () => updateBrushPreview(false));
canvas.addEventListener('mouseenter', (e) => updateBrushPreview(true, lastMouseX, lastMouseY));

/* Recording finished strokes: (done in commit functions & endStroke) */

// ---------------- Timelapse Replay ----------------
async function replayTimelapse() {
  if (isReplaying) return;
  isReplaying = true;

  // save current canvas to restore afterwards (optional)
  const saved = ctx.getImageData(0,0,canvas.width, canvas.height);

  // clear to white
  ctx.clearRect(0,0,canvas.width, canvas.height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0,0,canvas.width, canvas.height);

  // step through strokes
  for (let i=0;i<strokes.length;i++){
    const s = strokes[i];
    if (s.type === 'stroke') {
      // replay a stroke by drawing points sequentially
      await replayStrokePoints(s);
    } else if (s.type === 'shape') {
      // small pause then draw shape
      await pause(150);
      commitShapeReplay(s);
      await pause(80);
    } else if (s.type === 'text') {
      await pause(120);
      ctx.fillStyle = s.color;
      ctx.font = `${Math.max(12, s.size * 3)}px sans-serif`;
      ctx.fillText(s.text, s.x, s.y);
    } else if (s.type === 'fill') {
      // fill color under existing
      await pause(70);
      ctx.fillStyle = s.color;
      ctx.fillRect(0,0,canvas.width, canvas.height);
    } else if (s.type === 'bg') {
      await pause(100);
      // recreate image from dataURL
      await new Promise((res)=> {
        const img = new Image();
        img.onload = () => {
          ctx.clearRect(0,0,canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          res();
        };
        img.src = s.dataURL;
      });
    }
  }

  isReplaying = false;
  // Save the replayed result as a state
  saveState();
}

function commitShapeReplay(s) {
  ctx.lineWidth = s.size;
  ctx.strokeStyle = s.color;
  ctx.beginPath();
  if (s.shape === 'rect') {
    ctx.rect(s.start.x, s.start.y, s.end.x - s.start.x, s.end.y - s.start.y);
    ctx.stroke();
  } else if (s.shape === 'circle') {
    const cx = (s.start.x + s.end.x)/2, cy = (s.start.y + s.end.y)/2;
    const rx = Math.abs(s.end.x - s.start.x)/2, ry = Math.abs(s.end.y - s.start.y)/2;
    const r = Math.max(1, Math.sqrt(rx*rx + ry*ry));
    ctx.arc(cx, cy, r, 0, Math.PI*2);
    ctx.stroke();
  } else if (s.shape === 'line') {
    ctx.moveTo(s.start.x, s.start.y);
    ctx.lineTo(s.end.x, s.end.y);
    ctx.stroke();
  }
  ctx.closePath();
}

function replayStrokePoints(s) {
  return new Promise((resolve) => {
    if (!s.points || s.points.length === 0) { resolve(); return; }
    ctx.lineWidth = s.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = s.color;
    ctx.beginPath();
    const pts = s.points;
    ctx.moveTo(pts[0].x, pts[0].y);
    let idx = 1;
    function step() {
      if (idx >= pts.length) {
        ctx.stroke();
        ctx.closePath();
        resolve();
        return;
      }
      ctx.lineTo(pts[idx].x, pts[idx].y);
      ctx.stroke();
      idx++;
      // small delay between points for visible timelapse effect
      setTimeout(step, 12);
    }
    step();
  });
}

function pause(ms) { return new Promise(res => setTimeout(res, ms)); }

/* Wire replay button */
replayBtn.addEventListener('click', () => {
  replayTimelapse();
});

// ---------------- Utility: convert current canvas to dataURL and save BG if used ----------------
// (we already push bg on setBackgroundImage)

/* Convert pointer events above to stroke recording for 'stroke' type */
function beginStroke(e) {
  if (isReplaying) return;
  isDrawing = true;
  startPos = getPointerPosFromEvent(e);
  lastPos = startPos;
  ctx.beginPath();
  ctx.moveTo(startPos.x, startPos.y);

  currentStroke = {
    type: 'stroke',
    color: currentTool === 'eraser' ? '#ffffff' : brushColor,
    size: brushSize,
    points: [{x:startPos.x, y:startPos.y}]
  };
}

function continueStroke(e) {
  if (!isDrawing || isReplaying) return;
  const p = getPointerPosFromEvent(e);
  ctx.lineWidth = brushSize;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = currentTool === 'eraser' ? '#ffffff' : brushColor;

  ctx.lineTo(p.x, p.y);
  ctx.stroke();

  currentStroke.points.push({x:p.x, y:p.y});
  lastPos = p;
}

function endStroke(e) {
  if (!isDrawing || isReplaying) return;
  isDrawing = false;
  ctx.closePath();
  pushStroke(currentStroke);
  saveState();
}

/* Replacing earlier definitions was intentional to keep record consistent */

/* Commit a shape when user finishes drag (we already had commitShape) but ensure shape record is same */
function commitShape(type, sx, sy, ex, ey) {
  ctx.lineWidth = brushSize;
  ctx.strokeStyle = brushColor;
  ctx.fillStyle = brushColor;
  ctx.beginPath();
  if (type === 'rect') {
    ctx.rect(sx, sy, ex - sx, ey - sy);
    ctx.stroke();
  } else if (type === 'circle') {
    const cx = (sx + ex)/2, cy = (sy + ey)/2;
    const rx = Math.abs(ex - sx)/2, ry = Math.abs(ey - sy)/2;
    const r = Math.max(1, Math.sqrt(rx*rx + ry*ry));
    ctx.arc(cx, cy, r, 0, Math.PI*2);
    ctx.stroke();
  } else if (type === 'line') {
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }
  ctx.closePath();

  pushStroke({
    type: 'shape',
    shape: type,
    start: {x:sx, y:sy},
    end: {x:ex, y:ey},
    color: brushColor,
    size: brushSize
  });
  saveState();
}

/* Text placement (ensure same record shape) */
function placeTextAt(x,y) {
  hiddenTextInput.style.left = (x + canvas.getBoundingClientRect().left) + 'px';
  hiddenTextInput.style.top = (y + canvas.getBoundingClientRect().top) + 'px';
  hiddenTextInput.style.position = 'fixed';
  hiddenTextInput.value = '';
  hiddenTextInput.style.opacity = '1';
  hiddenTextInput.focus();

  const onKey = (ev) => {
    if (ev.key === 'Enter') {
      const txt = hiddenTextInput.value;
      if (txt.trim()) {
        ctx.fillStyle = brushColor;
        ctx.font = `${Math.max(12, brushSize * 3)}px sans-serif`;
        ctx.fillText(txt, x, y);
        pushStroke({type: 'text', x, y, text: txt, color: brushColor, size: brushSize});
        saveState();
      }
      hiddenTextInput.blur();
      hiddenTextInput.style.opacity = '0';
      hiddenTextInput.removeEventListener('keydown', onKey);
    }
  };
  hiddenTextInput.addEventListener('keydown', onKey);
}

/* Background image setter used earlier */
function setBackgroundImage(img) {
  const copy = document.createElement('canvas');
  copy.width = canvas.width;
  copy.height = canvas.height;
  copy.getContext('2d').drawImage(canvas, 0, 0);

  ctx.clearRect(0,0,canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  ctx.drawImage(copy, 0, 0);

  const dataURL = imgToDataURL(img);
  pushStroke({type:'bg', dataURL});
  saveState();
  bgImage = img;
}

/* Helper to convert image to dataURL (used for replay) */
function imgToDataURL(img) {
  const t = document.createElement('canvas');
  t.width = img.width;
  t.height = img.height;
  t.getContext('2d').drawImage(img, 0, 0);
  return t.toDataURL('image/png');
}

/* Finally wire pointer events to default handlers (already bound above using pointer events) */
// Keep pointerdown/move/up listeners already set earlier

/* Extra: pointer events delegation to ensure capture on mobile */
canvas.addEventListener('pointerdown', (ev)=>{ ev.preventDefault(); });
canvas.style.touchAction = 'none';

/* Update brush preview visibility initially */
updateBrushPreview(false);

/* Keep brush preview following pointer with pointermove on document for reliability */
document.addEventListener('pointermove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  if (x>=0 && y>=0 && x <= canvas.width && y <= canvas.height) {
    updateBrushPreview(true, x, y);
  } else {
    updateBrushPreview(false);
  }
});

// ===== TOOL ACTIVE HIGHLIGHT =====
const allToolButtons = [
  toolBrush, toolEraser, toolText, toolFill, toolShapes
];
shapeButtons.forEach(b => allToolButtons.push(b));

function setActiveTool(btn) {
  allToolButtons.forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

// Example: integrate into your existing handlers
toolBrush.addEventListener('click', () => setActiveTool(toolBrush));
toolEraser.addEventListener('click', () => setActiveTool(toolEraser));
toolText.addEventListener('click', () => setActiveTool(toolText));
toolFill.addEventListener('click', () => setActiveTool(toolFill));
toolShapes.addEventListener('click', () => setActiveTool(toolShapes));

shapeButtons.forEach(b => {
  b.addEventListener('click', () => setActiveTool(toolShapes));
});
