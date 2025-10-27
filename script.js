// -----------------------------
// Canvas Draw — single-file logic with layered canvases
// -----------------------------

// State variables declared first to avoid TDZ
let bgImage = null;
let bgCanvas = null; // Bottom canvas for background image
let drawingCanvas = null; // Top canvas for user drawings
let previewCanvas = null;
let currentTool = 'brush'; // 'brush' | 'eraser' | 'shape' | 'text' | 'fill'
let currentShape = 'rect'; // when shape chosen
let brushColor = '#000000';
let brushSize = 6;
let isDrawing = false;
let isReplaying = false;
let startPos = null; // for shapes
let lastPos = null; // for stroke
const undoStack = [];
const redoStack = [];
const strokes = []; // each stroke: {type:'stroke'|'shape'|'text'|'fill'|'bg', color, size, points:[], shape, start, end, text, bgDataURL}

// Debug: list the IDs your script expects
const expectedIDs = [
  "colorPicker", "brushSize", "toolBrush", "toolEraser", "shapesWrap", "toolShapes",
  "shapesDropdown", "bgImageInput", "canvasWrap", "drawingCanvas", "brushPreview",
  "clearBtn", "undo", "redo", "download", "darkToggle", "replayBtn", "hiddenTextInput"
];
expectedIDs.forEach(id => {
  if (!document.getElementById(id)) {
    console.warn("MISSING element with id:", id);
  }
});

/* Elements */
const drawingCanvasEl = document.getElementById('drawingCanvas');
const drawingCtx = drawingCanvasEl?.getContext('2d');
const bgCanvasEl = document.getElementById('bgCanvas');
const bgCtx = bgCanvasEl?.getContext('2d');
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
const canvasWrap = document.getElementById('canvasWrap');

/* Initialize element-dependent values */
if (colorPicker) brushColor = colorPicker.value;
if (brushSizeInput) brushSize = Number(brushSizeInput.value);

/* Canvas sizing */
function setCanvasSize() {
  console.log('setCanvasSize called');
  if (!drawingCtx || !bgCtx) {
    console.error('Canvas contexts not available');
    return;
  }
  const temp = document.createElement('canvas');
  temp.width = drawingCanvasEl.width || 800;
  temp.height = drawingCanvasEl.height || 600;
  temp.getContext('2d').drawImage(drawingCanvasEl, 0, 0);
  drawingCanvasEl.width = Math.max(600, Math.floor(Math.min(window.innerWidth * 0.95, 1100)));
  drawingCanvasEl.height = Math.max(400, Math.floor(Math.min(window.innerHeight * 0.65)));
  bgCanvasEl.width = drawingCanvasEl.width;
  bgCanvasEl.height = drawingCanvasEl.height;
  drawingCtx.clearRect(0, 0, drawingCanvasEl.width, drawingCanvasEl.height);
  if (bgImage && bgImage.complete && bgImage.naturalWidth > 0) {
    bgCtx.clearRect(0, 0, bgCanvasEl.width, bgCanvasEl.height);
    try {
      bgCtx.drawImage(bgImage, 0, 0, bgCanvasEl.width, bgCanvasEl.height);
      console.log('Background image redrawn after resize');
    } catch (err) {
      console.error('Error redrawing background image:', err);
      bgCtx.fillStyle = '#ffffff';
      bgCtx.fillRect(0, 0, bgCanvasEl.width, bgCanvasEl.height);
    }
  } else {
    bgCtx.fillStyle = '#ffffff';
    bgCtx.fillRect(0, 0, bgCanvasEl.width, bgCanvasEl.height);
  }
  drawingCtx.drawImage(temp, 0, 0, temp.width, temp.height, 0, 0, drawingCanvasEl.width, drawingCanvasEl.height);
  drawingCtx.globalCompositeOperation = 'source-over';
}

if (drawingCanvasEl && drawingCtx && bgCanvasEl && bgCtx) {
  setCanvasSize();
  window.addEventListener('resize', () => {
    setCanvasSize();
    saveState();
  });
}

/* Initial blank state */
if (bgCtx && drawingCtx) {
  bgCtx.fillStyle = '#ffffff';
  bgCtx.fillRect(0, 0, bgCanvasEl.width, bgCanvasEl.height);
  drawingCtx.clearRect(0, 0, drawingCanvasEl.width, drawingCanvasEl.height);
  saveState();
} else {
  console.error('Canvas context initialization failed');
}

/* Helpers */
function pushStroke(stroke) {
  if (isReplaying) return;
  strokes.push(stroke);
}

function setCompositeMode() {
  if (!drawingCtx) {
    console.error('Drawing context not available');
    return;
  }
  if (currentTool === 'eraser') {
    drawingCtx.globalCompositeOperation = 'destination-out';
    console.log('Eraser mode: globalCompositeOperation = destination-out');
  } else {
    drawingCtx.globalCompositeOperation = 'source-over';
    console.log('Non-eraser mode: globalCompositeOperation = source-over');
  }
}

function saveState() {
  if (!drawingCtx) return;
  try {
    undoStack.push(drawingCtx.getImageData(0, 0, drawingCanvasEl.width, drawingCanvasEl.height));
    if (undoStack.length > 50) undoStack.shift();
    redoStack.length = 0;
  } catch (e) {
    console.warn('saveState failed', e);
  }
}

function restoreImageData(imgData) {
  if (!imgData || !drawingCtx) return;
  try {
    drawingCtx.putImageData(imgData, 0, 0);
  } catch (err) {
    console.error('Error restoring image data:', err);
  }
}

/* Brush preview */
function updateBrushPreview(show, x = 0, y = 0) {
  if (!brushPreview) return;
  if (!show) {
    brushPreview.style.display = 'none';
    return;
  }
  brushPreview.style.display = 'block';
  brushPreview.style.left = x + 'px';
  brushPreview.style.top = y + 'px';
  brushPreview.style.width = brushSize + 'px';
  brushPreview.style.height = brushSize + 'px';
  const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
  if (currentTool === 'eraser') {
    // Use a semi-transparent white preview in dark mode, gray in light mode
    brushPreview.style.background = isDarkMode ? 'rgba(255,255,255,0.3)' : 'rgba(200,200,200,0.3)';
    brushPreview.style.border = isDarkMode
      ? '1px solid rgba(255,255,255,0.6)'
      : '1px solid rgba(0,0,0,0.2)';
  } else {
    brushPreview.style.background = brushColor;
    brushPreview.style.border = isDarkMode
      ? '1px solid rgba(255,255,255,0.4)'
      : '1px solid rgba(0,0,0,0.12)';
  }
  brushPreview.style.boxShadow = isDarkMode
    ? '0 0 0 2px rgba(255,255,255,0.1)'
    : '0 0 0 2px rgba(0,0,0,0.04)';
}

/* Position helpers */
function getPointerPosFromEvent(e) {
  if (e.touches && e.touches[0]) e = e.touches[0];
  const rect = drawingCanvasEl.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

/* Drawing freehand */
let currentStroke = null;
function beginStroke(e) {
  if (isReplaying || !drawingCtx) return;
  isDrawing = true;
  setCompositeMode();
  startPos = getPointerPosFromEvent(e);
  lastPos = startPos;
  drawingCtx.beginPath();
  drawingCtx.moveTo(startPos.x, startPos.y);
  currentStroke = {
    type: 'stroke',
    color: currentTool === 'eraser' ? '#000000' : brushColor,
    size: brushSize,
    points: [{ x: startPos.x, y: startPos.y }],
    isEraser: currentTool === 'eraser' // Explicitly mark eraser strokes
  };
}

function continueStroke(e) {
  if (!isDrawing || isReplaying || !drawingCtx) return;
  setCompositeMode();
  const p = getPointerPosFromEvent(e);
  drawingCtx.lineWidth = brushSize;
  drawingCtx.lineCap = 'round';
  drawingCtx.lineJoin = 'round';
  drawingCtx.strokeStyle = currentTool === 'eraser' ? '#000000' : brushColor;
  drawingCtx.lineTo(p.x, p.y);
  drawingCtx.stroke();
  currentStroke.points.push({ x: p.x, y: p.y });
  lastPos = p;
}

function endStroke(e) {
  if (!isDrawing || isReplaying || !drawingCtx) return;
  isDrawing = false;
  drawingCtx.closePath();
  pushStroke(currentStroke);
  saveState();
  drawingCtx.globalCompositeOperation = 'source-over';
}

/* Shape tools (preview while dragging & commit on mouseup) */
function ensurePreviewCanvas() {
  try {
    if (!previewCanvas) {
      console.log('Creating previewCanvas');
      previewCanvas = document.createElement('canvas');
      previewCanvas.style.position = 'absolute';
      previewCanvas.style.left = drawingCanvasEl.offsetLeft + 'px';
      previewCanvas.style.top = drawingCanvasEl.offsetTop + 'px';
      previewCanvas.width = drawingCanvasEl.width;
      previewCanvas.height = drawingCanvasEl.height;
      previewCanvas.style.pointerEvents = 'none';
      previewCanvas.style.zIndex = '1000';
      previewCanvas.style.background = 'transparent';
      canvasWrap.appendChild(previewCanvas);
    }
    const pctx = previewCanvas.getContext('2d');
    if (!pctx) throw new Error('Failed to get previewCanvas context');
    pctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  } catch (err) {
    console.error('Error in ensurePreviewCanvas:', err);
  }
}

function clearPreview() {
  try {
    if (previewCanvas) {
      console.log('Clearing preview canvas');
      const pctx = previewCanvas.getContext('2d');
      pctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      previewCanvas.style.background = 'transparent';
      if (!isDrawing && currentTool !== 'shape') {
        previewCanvas.remove();
        previewCanvas = null;
      }
    }
  } catch (err) {
    console.error('Error in clearPreview:', err);
  }
}

function drawShapePreview(type, sx, sy, ex, ey, color, size) {
  try {
    console.log('Drawing shape preview:', type, sx, sy, ex, ey);
    ensurePreviewCanvas();
    if (!previewCanvas) throw new Error('previewCanvas not initialized');
    const pctx = previewCanvas.getContext('2d');
    pctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    pctx.lineWidth = size;
    pctx.strokeStyle = color;
    pctx.fillStyle = color;
    pctx.beginPath();
    if (type === 'rect') {
      const w = ex - sx, h = ey - sy;
      pctx.rect(sx, sy, w, h);
      pctx.stroke();
    } else if (type === 'circle') {
      const cx = (sx + ex) / 2, cy = (sy + ey) / 2;
      const rx = Math.abs(ex - sx) / 2, ry = Math.abs(ey - sy) / 2;
      const r = Math.max(1, Math.sqrt(rx * rx + ry * ry));
      pctx.arc(cx, cy, r, 0, Math.PI * 2);
      pctx.stroke();
    } else if (type === 'line') {
      pctx.moveTo(sx, sy);
      pctx.lineTo(ex, ey);
      pctx.stroke();
    }
    pctx.closePath();
  } catch (err) {
    console.error('Error in drawShapePreview:', err);
    clearPreview();
  }
}

function commitShape(type, sx, sy, ex, ey) {
  console.log('Committing shape:', type, sx, sy, ex, ey);
  if (!drawingCtx) return;
  const tempImageData = drawingCtx.getImageData(0, 0, drawingCanvasEl.width, drawingCanvasEl.height);
  try {
    setCompositeMode();
    drawingCtx.lineWidth = brushSize;
    drawingCtx.strokeStyle = brushColor;
    drawingCtx.fillStyle = brushColor;
    drawingCtx.beginPath();
    if (type === 'rect') {
      drawingCtx.rect(sx, sy, ex - sx, ey - sy);
      drawingCtx.stroke();
    } else if (type === 'circle') {
      const cx = (sx + ex) / 2, cy = (sy + ey) / 2;
      const rx = Math.abs(ex - sx) / 2, ry = Math.abs(ey - sy) / 2;
      const r = Math.max(1, Math.sqrt(rx * rx + ry * ry));
      drawingCtx.arc(cx, cy, r, 0, Math.PI * 2);
      drawingCtx.stroke();
    } else if (type === 'line') {
      drawingCtx.moveTo(sx, sy);
      drawingCtx.lineTo(ex, ey);
      drawingCtx.stroke();
    }
    drawingCtx.closePath();
    drawingCtx.globalCompositeOperation = 'source-over';
    pushStroke({
      type: 'shape',
      shape: type,
      start: { x: sx, y: sy },
      end: { x: ex, y: ey },
      color: brushColor,
      size: brushSize
    });
    saveState();
  } catch (err) {
    console.error('Error in commitShape:', err);
    drawingCtx.putImageData(tempImageData, 0, 0);
    drawingCtx.globalCompositeOperation = 'source-over';
    return;
  }
}

/* Text tool */
function placeTextAt(x, y) {
  console.log('placeTextAt called at:', x, y);
  if (!hiddenTextInput) {
    console.error('hiddenTextInput not found');
    return;
  }
  hiddenTextInput.classList.add('text-active');
  const rect = drawingCanvasEl.getBoundingClientRect();
  hiddenTextInput.style.left = (x + rect.left) + 'px';
  hiddenTextInput.style.top = (y + rect.top) + 'px';
  hiddenTextInput.style.position = 'fixed';
  hiddenTextInput.value = '';
  hiddenTextInput.style.opacity = '1';
  hiddenTextInput.focus();
  console.log('Text input positioned at:', hiddenTextInput.style.left, hiddenTextInput.style.top);
  const onKey = (ev) => {
    if (ev.key === 'Enter') {
      const txt = hiddenTextInput.value;
      if (txt.trim()) {
        console.log('Rendering text:', txt);
        drawingCtx.save();
        drawingCtx.globalCompositeOperation = 'source-over';
        drawingCtx.fillStyle = brushColor;
        drawingCtx.font = `${Math.max(12, brushSize * 3)}px sans-serif`;
        drawingCtx.fillText(txt, x, y);
        drawingCtx.restore();
        pushStroke({ type: 'text', x, y, text: txt, color: brushColor, size: brushSize });
        saveState();
      }
      hiddenTextInput.classList.remove('text-active');
      hiddenTextInput.style.opacity = '0';
      hiddenTextInput.style.left = '-9999px';
      hiddenTextInput.style.top = '-9999px';
      hiddenTextInput.blur();
      hiddenTextInput.removeEventListener('keydown', onKey);
      console.log('Text input hidden');
    }
  };
  hiddenTextInput.addEventListener('keydown', onKey);
}

/* Paint-bucket flood fill */
function floodFill(startX, startY, fillColor) {
  if (!drawingCtx || !drawingCanvasEl) {
    console.error('Flood fill aborted: Missing drawing context or canvas');
    return;
  }
  try {
    // Ensure coordinates are within canvas bounds
    startX = Math.floor(startX);
    startY = Math.floor(startY);
    if (startX < 0 || startX >= drawingCanvasEl.width || startY < 0 || startY >= drawingCanvasEl.height) {
      console.warn('Flood fill aborted: Start position out of bounds', startX, startY);
      return;
    }

    const imageData = drawingCtx.getImageData(0, 0, drawingCanvasEl.width, drawingCanvasEl.height);
    const data = imageData.data;
    const targetOffset = (startY * drawingCanvasEl.width + startX) * 4;
    const targetColor = [
      data[targetOffset],
      data[targetOffset + 1],
      data[targetOffset + 2],
      data[targetOffset + 3]
    ];
    const fill = hexToRgba(fillColor);

    // Check if the target pixel is already the fill color
    if (colorsMatch(targetColor, fill)) {
      console.log('Flood fill skipped: Target color matches fill color');
      return;
    }

    // Stack-based flood fill
    const stack = [[startX, startY]];
    while (stack.length) {
      const [x, y] = stack.pop();
      const idx = (y * drawingCanvasEl.width + x) * 4;
      if (x < 0 || x >= drawingCanvasEl.width || y < 0 || y >= drawingCanvasEl.height) continue;
      if (!matchTargetColor(data, idx, targetColor)) continue;

      setPixel(data, idx, fill);

      // Push neighboring pixels
      stack.push([x - 1, y]);
      stack.push([x + 1, y]);
      stack.push([x, y - 1]);
      stack.push([x, y + 1]);
    }

    drawingCtx.putImageData(imageData, 0, 0);
    console.log('Flood fill completed with color:', fillColor);
    pushStroke({ type: 'fill', color: fillColor });
    saveState();
  } catch (err) {
    console.error('Error in floodFill:', err);
  }
}

/* Background image handling */
function setBackgroundImage(img) {
  console.log('setBackgroundImage called with img:', img);
  if (!bgCtx) {
    console.error('Background context not available');
    return;
  }
  try {
    if (!img || !img.complete || img.naturalWidth === 0) {
      throw new Error('Invalid or unloaded image');
    }
    bgImage = img;
    bgCtx.clearRect(0, 0, bgCanvasEl.width, bgCanvasEl.height);
    bgCtx.drawImage(img, 0, 0, bgCanvasEl.width, bgCanvasEl.height);
    console.log('Drawing background image to bgCanvas');
    drawingCtx.clearRect(0, 0, drawingCanvasEl.width, drawingCanvasEl.height);
    const dataURL = imgToDataURL(img);
    if (!dataURL) throw new Error('Failed to generate Data URL');
    pushStroke({ type: 'bg', dataURL });
    saveState();
    console.log('Background image set successfully');
  } catch (err) {
    console.error('Error setting background image:', err);
    bgImage = null;
    bgCtx.fillStyle = '#ffffff';
    bgCtx.fillRect(0, 0, bgCanvasEl.width, bgCanvasEl.height);
    drawingCtx.clearRect(0, 0, drawingCanvasEl.width, drawingCanvasEl.height);
    saveState();
  }
}

function imgToDataURL(img) {
  try {
    console.log('Generating Data URL for image');
    const t = document.createElement('canvas');
    t.width = drawingCanvasEl.width;
    t.height = drawingCanvasEl.height;
    const tCtx = t.getContext('2d');
    if (!tCtx) throw new Error('Failed to get temporary canvas context');
    tCtx.drawImage(img, 0, 0, drawingCanvasEl.width, drawingCanvasEl.height);
    const dataURL = t.toDataURL('image/png');
    console.log('Data URL generated:', dataURL.substring(0, 50) + '...');
    return dataURL;
  } catch (err) {
    console.error('Error in imgToDataURL:', err);
    return null;
  }
}

/* --- helpers --- */
function hexToRgba(hex) {
  try {
    // Remove '#' and parse hex color
    const bigint = parseInt(hex.slice(1), 16);
    return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255, 255];
  } catch (err) {
    console.error('Error in hexToRgba:', err);
    return [0, 0, 0, 255]; // Fallback to black
  }
}
function colorsMatch(a, b) {
  // Compare RGB and alpha values
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
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

/* Undo / Redo */
if (undoBtn) {
  undoBtn.addEventListener('click', () => {
    if (undoStack.length > 1) {
      redoStack.push(undoStack.pop());
      const img = undoStack[undoStack.length - 1];
      restoreImageData(img);
    }
  });
}

if (redoBtn) {
  redoBtn.addEventListener('click', () => {
    if (redoStack.length > 0) {
      const img = redoStack.pop();
      undoStack.push(img);
      restoreImageData(img);
    }
  });
}

/* Clear */
if (clearBtn) {
  clearBtn.addEventListener('click', () => {
    if (!drawingCtx) return;
    drawingCtx.clearRect(0, 0, drawingCanvasEl.width, drawingCanvasEl.height);
    pushStroke({ type: 'fill', color: '#ffffff' });
    saveState();
  });
}

/* Download */
if (downloadBtn) {
  downloadBtn.addEventListener('click', () => {
    try {
      const composite = document.createElement('canvas');
      composite.width = drawingCanvasEl.width;
      composite.height = drawingCanvasEl.height;
      const compCtx = composite.getContext('2d');
      compCtx.drawImage(bgCanvasEl, 0, 0);
      compCtx.drawImage(drawingCanvasEl, 0, 0);
      const link = document.createElement('a');
      link.download = 'drawing.png';
      link.href = composite.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Error in download:', err);
    }
  });
}

/* Dark mode toggle */
if (darkToggle) {
  darkToggle.addEventListener('click', () => {
    const doc = document.documentElement;
    if (doc.getAttribute('data-theme') === 'dark') {
      doc.removeAttribute('data-theme');
    } else {
      doc.setAttribute('data-theme', 'dark');
    }
  });
}

/* Tool toggles */
function resetShapeState() {
  isDrawing = false;
  startPos = null;
  clearPreview();
  if (drawingCtx) drawingCtx.globalCompositeOperation = 'source-over';
  updateBrushPreview(false);
}

const allToolButtons = [toolBrush, toolEraser, toolText, toolFill, toolShapes].filter(Boolean);
shapeButtons.forEach(b => allToolButtons.push(b));

function setActiveTool(btn) {
  allToolButtons.forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

if (toolBrush) {
  toolBrush.addEventListener('click', () => {
    currentTool = 'brush';
    setCompositeMode();
    resetShapeState();
    setActiveTool(toolBrush);
  });
}

if (toolEraser) {
  toolEraser.addEventListener('click', () => {
    currentTool = 'eraser';
    setCompositeMode();
    resetShapeState();
    setActiveTool(toolEraser);
  });
}

if (toolShapes) {
  toolShapes.addEventListener('click', () => {
    const open = shapesDropdown.getAttribute('aria-hidden') === 'true';
    shapesDropdown.setAttribute('aria-hidden', open ? 'false' : 'true');
    setActiveTool(toolShapes);
  });
}

if (shapeButtons) {
  shapeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      currentTool = 'shape';
      currentShape = btn.dataset.shape;
      setCompositeMode();
      shapesDropdown.setAttribute('aria-hidden', 'true');
      setActiveTool(toolShapes);
    });
  });
}

if (toolText) {
  toolText.addEventListener('click', () => {
    currentTool = 'text';
    setCompositeMode();
    resetShapeState();
    setActiveTool(toolText);
  });
}

if (toolFill) {
  toolFill.addEventListener('click', () => {
    currentTool = 'fill';
    setCompositeMode();
    resetShapeState();
    setActiveTool(toolFill);
  });
}

/* BG image input */
if (bgImageInput) {
  console.log('Attaching bgImageInput event listener');
  bgImageInput.addEventListener('change', (ev) => {
    console.log('bgImageInput change event triggered');
    const file = ev.target.files[0];
    if (!file) {
      console.log('No file selected');
      return;
    }
    console.log('Selected file:', file.name, file.type, file.size);
    if (!file.type.startsWith('image/')) {
      console.error('Selected file is not an image:', file.type);
      return;
    }
    const reader = new FileReader();
    reader.onload = function (e) {
      console.log('FileReader onload triggered, data length:', e.target.result.length);
      const img = new Image();
      img.onload = () => {
        console.log('Image loaded successfully:', img.width, 'x', img.height);
        setBackgroundImage(img);
      };
      img.onerror = () => {
        console.error('Failed to load image:', file.name);
      };
      img.src = e.target.result;
      console.log('Image src set to Data URL');
    };
    reader.onerror = () => {
      console.error('Failed to read file:', file.name);
    };
    reader.readAsDataURL(file);
    console.log('Reading file as Data URL');
  });
} else {
  console.error('bgImageInput element not found');
}

/* Color & size updates */
if (colorPicker) {
  colorPicker.addEventListener('input', (e) => {
    brushColor = e.target.value;
  });
}

if (brushSizeInput) {
  brushSizeInput.addEventListener('input', (e) => {
    brushSize = Number(e.target.value);
    updateBrushPreview(true, lastMouseX, lastMouseY);
  });
}

/* Pointer move to update preview */
let lastMouseX = 0, lastMouseY = 0;
function onPointerMove(e) {
  const rect = drawingCanvasEl.getBoundingClientRect();
  let clientX = e.clientX, clientY = e.clientY;
  if (e.touches && e.touches[0]) {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  }
  lastMouseX = clientX - rect.left;
  lastMouseY = clientY - rect.top;
  if (lastMouseX >= 0 && lastMouseY >= 0 && lastMouseX <= drawingCanvasEl.width && lastMouseY <= drawingCanvasEl.height) {
    updateBrushPreview(true, lastMouseX, lastMouseY);
  } else {
    updateBrushPreview(false);
  }
  if (currentTool === 'shape' && isDrawing && startPos) {
    drawShapePreview(currentShape, startPos.x, startPos.y, lastMouseX, lastMouseY, brushColor, brushSize);
  }
}

/* Pointer down/up handlers */
if (drawingCanvasEl) {
drawingCanvasEl.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    const pos = getPointerPosFromEvent(ev);
    console.log('pointerdown:', currentTool, pos);
    if (currentTool === 'brush' || currentTool === 'eraser') {
      beginStroke(ev);
    } else if (currentTool === 'shape') {
      isDrawing = true;
      startPos = pos;
      ensurePreviewCanvas();
    } else if (currentTool === 'text') {
      placeTextAt(pos.x, pos.y);
    } else if (currentTool === 'fill') {
      floodFill(pos.x, pos.y, brushColor);
    }
  });

  drawingCanvasEl.addEventListener('pointermove', (e) => {
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

  drawingCanvasEl.addEventListener('pointerup', (e) => {
    const p = getPointerPosFromEvent(e);
    if (currentTool === 'brush' || currentTool === 'eraser') {
      endStroke(e);
    } else if (currentTool === 'shape') {
      if (startPos) {
        try {
          console.log('Committing shape at:', startPos, p);
          commitShape(currentShape, startPos.x, startPos.y, p.x, p.y);
          clearPreview();
        } catch (err) {
          console.error('Error committing shape:', err);
          if (drawingCtx) drawingCtx.globalCompositeOperation = 'source-over';
        }
        isDrawing = false;
        startPos = null;
      }
    }
    updateBrushPreview(false);
    setCompositeMode();
  });

  drawingCanvasEl.addEventListener('pointercancel', () => {
    isDrawing = false;
    startPos = null;
    clearPreview();
    if (drawingCtx) drawingCtx.globalCompositeOperation = 'source-over';
    updateBrushPreview(false);
  });

  drawingCanvasEl.addEventListener('touchstart', (e) => {
    e.preventDefault();
  }, { passive: false });

  drawingCanvasEl.addEventListener('mouseleave', () => updateBrushPreview(false));
  drawingCanvasEl.addEventListener('mouseenter', (e) => updateBrushPreview(true, lastMouseX, lastMouseY));
}

/* Timelapse Replay */
async function replayTimelapse() {
  if (isReplaying || !drawingCtx || !bgCtx || !drawingCanvasEl || !bgCanvasEl) {
    console.error('Replay aborted: Missing canvas contexts or elements');
    return;
  }
  isReplaying = true;
  console.log('Starting replayTimelapse with', strokes.length, 'strokes');

  // Reset both canvases
  drawingCtx.clearRect(0, 0, drawingCanvasEl.width, drawingCanvasEl.height);
  bgCtx.clearRect(0, 0, bgCanvasEl.width, bgCanvasEl.height);
  bgCtx.fillStyle = '#ffffff';
  bgCtx.fillRect(0, 0, bgCanvasEl.width, bgCanvasEl.height);
  bgImage = null;

  // Ensure canvas visibility and layering
  bgCanvasEl.style.zIndex = '1';
  drawingCanvasEl.style.zIndex = '2';
  bgCanvasEl.style.display = 'block';
  drawingCanvasEl.style.display = 'block';

  for (let i = 0; i < strokes.length; i++) {
    const s = strokes[i];
    console.log('Replaying stroke', i, 'type:', s.type);
    try {
      if (s.type === 'stroke') {
        await replayStrokePoints(s);
      } else if (s.type === 'shape') {
        await pause(150);
        commitShapeReplay(s);
        await pause(80);
      } else if (s.type === 'text') {
        await pause(120);
        drawingCtx.save();
        drawingCtx.globalCompositeOperation = 'source-over';
        drawingCtx.fillStyle = s.color;
        drawingCtx.font = `${Math.max(12, s.size * 3)}px sans-serif`;
        drawingCtx.fillText(s.text, s.x, s.y);
        drawingCtx.restore();
      } else if (s.type === 'fill') {
        await pause(70);
        drawingCtx.fillStyle = s.color;
        drawingCtx.fillRect(0, 0, drawingCanvasEl.width, drawingCanvasEl.height);
      } else if (s.type === 'bg') {
        await pause(100);
        await new Promise((res) => {
          const img = new Image();
          img.onload = () => {
            console.log('Replay: Loading background image');
            bgImage = img;
            try {
              bgCtx.clearRect(0, 0, bgCanvasEl.width, bgCanvasEl.height);
              bgCtx.drawImage(img, 0, 0, bgCanvasEl.width, bgCanvasEl.height);
              drawingCtx.clearRect(0, 0, drawingCanvasEl.width, drawingCanvasEl.height);
              console.log('Replay: Background image drawn');
            } catch (err) {
              console.error('Replay: Error drawing background image:', err);
              bgCtx.fillStyle = '#ffffff';
              bgCtx.fillRect(0, 0, bgCanvasEl.width, bgCanvasEl.height);
            }
            res();
          };
          img.onerror = () => {
            console.error('Replay: Failed to load background image:', s.dataURL.substring(0, 50) + '...');
            bgCtx.fillStyle = '#ffffff';
            bgCtx.fillRect(0, 0, bgCanvasEl.width, bgCanvasEl.height);
            res();
          };
          img.src = s.dataURL;
        });
      }
    } catch (err) {
      console.error('Error replaying stroke', i, ':', err);
    }
  }
  console.log('Replay completed');
  isReplaying = false;
  saveState();
}

function commitShapeReplay(s) {
  if (!drawingCtx) return;
  try {
    drawingCtx.lineWidth = s.size;
    drawingCtx.strokeStyle = s.color;
    drawingCtx.beginPath();
    if (s.shape === 'rect') {
      drawingCtx.rect(s.start.x, s.start.y, s.end.x - s.start.x, s.end.y - s.start.y);
      drawingCtx.stroke();
    } else if (s.shape === 'circle') {
      const cx = (s.start.x + s.end.x) / 2, cy = (s.start.y + s.end.y) / 2;
      const rx = Math.abs(s.end.x - s.start.x) / 2, ry = Math.abs(s.end.y - s.start.y) / 2;
      const r = Math.max(1, Math.sqrt(rx * rx + ry * ry));
      drawingCtx.arc(cx, cy, r, 0, Math.PI * 2);
      drawingCtx.stroke();
    } else if (s.shape === 'line') {
      drawingCtx.moveTo(s.start.x, s.start.y);
      drawingCtx.lineTo(s.end.x, s.end.y);
      drawingCtx.stroke();
    }
    drawingCtx.closePath();
    drawingCtx.globalCompositeOperation = 'source-over';
  } catch (err) {
    console.error('Error in commitShapeReplay:', err);
  }
}

function replayStrokePoints(s) {
  return new Promise((resolve) => {
    if (!s.points || s.points.length === 0 || !drawingCtx) {
      console.warn('Skipping invalid stroke:', s);
      resolve();
      return;
    }
    console.log('Replaying stroke points, color:', s.color, 'size:', s.size, 'isEraser:', s.isEraser);
    drawingCtx.lineWidth = s.size;
    drawingCtx.lineCap = 'round';
    drawingCtx.lineJoin = 'round';
    drawingCtx.globalCompositeOperation = s.isEraser ? 'destination-out' : 'source-over';
    if (!s.isEraser) {
      drawingCtx.strokeStyle = s.color;
    }
    drawingCtx.beginPath();
    const pts = s.points;
    drawingCtx.moveTo(pts[0].x, pts[0].y);
    let idx = 1;
    function step() {
      if (idx >= pts.length) {
        drawingCtx.stroke();
        drawingCtx.closePath();
        drawingCtx.globalCompositeOperation = 'source-over';
        resolve();
        return;
      }
      drawingCtx.lineTo(pts[idx].x, pts[idx].y);
      drawingCtx.stroke();
      idx++;
      setTimeout(step, 12);
    }
    step();
  });
}

function pause(ms) {
  return new Promise(res => setTimeout(res, ms));
}

if (replayBtn) {
  replayBtn.addEventListener('click', () => {
    replayTimelapse();
  });
}

/* Document-level pointermove for brush preview */
document.addEventListener('pointermove', (e) => {
  if (!drawingCanvasEl) return;
  const rect = drawingCanvasEl.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  if (x >= 0 && y >= 0 && x <= drawingCanvasEl.width && y <= drawingCanvasEl.height) {
    updateBrushPreview(true, x, y);
  } else {
    updateBrushPreview(false);
  }
});

if (drawingCanvasEl) {
  drawingCanvasEl.style.touchAction = 'none';
}

updateBrushPreview(false);