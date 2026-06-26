// 截图覆盖层：选区 + 标注（矩形/椭圆/箭头/画笔/马赛克/文字）+ 撤销 + 钉图/保存/复制
const api = window.electronAPI;
const $ = (id) => document.getElementById(id);

const stage = $('stage');
const ctx = stage.getContext('2d');
const sizeLabel = $('sizeLabel');
const toolbar = $('toolbar');
const loupe = $('loupe');
const loupeCanvas = $('loupeCanvas');
const lctx = loupeCanvas.getContext('2d');
const loupeInfo = $('loupeInfo');
const textInput = $('textInput');
const hint = $('hint');

let baseImg = null;          // 截屏原图（设备像素）
let mosaicCanvas = null;     // 马赛克版（设备像素）
let cssW = 0, cssH = 0;      // 显示器 DIP 尺寸
let imgScale = 1;            // 设备像素 / DIP
let dispBounds = { x: 0, y: 0 };

let phase = 'idle';          // idle | selecting | ready
let sel = null;              // {x,y,w,h} DIP
let tool = null;             // rect|ellipse|arrow|pen|mosaic|text
let color = '#ff3b30';
let lineW = 4;
let shapes = [];
let cur = null;              // 正在绘制的 shape
let drag = null;             // 选区拖动/缩放/移动状态
let wins = [];               // 屏幕上各窗口矩形（DIP，显示器本地坐标）
let hoverWin = null;         // 当前悬停命中的窗口（微信式自动选窗）

const COLORS = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#0a84ff', '#ffffff', '#000000'];
const SIZES = [2, 4, 6];

/* ---------- 初始化 ---------- */
api.onCaptureInit((d) => {
  cssW = d.displayBounds.width; cssH = d.displayBounds.height;
  dispBounds = d.displayBounds;
  wins = d.windows || [];
  const dpr = window.devicePixelRatio || d.scaleFactor || 1;
  stage.width = Math.round(cssW * dpr); stage.height = Math.round(cssH * dpr);
  stage.style.width = cssW + 'px'; stage.style.height = cssH + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  buildToolbar();
  if (!d.image) { redraw(); return; }
  // 窗口位置枚举耗时较长，不阻塞截图覆盖层展示；主进程异步算完后补发
  if (typeof api.onCaptureWindowsUpdate === 'function') {
    api.onCaptureWindowsUpdate((updatedWins) => {
      wins = updatedWins || [];
      if (phase === 'idle' || phase === 'selecting') redraw();
    });
  }
  const img = new Image();
  img.onload = () => {
    baseImg = img;
    imgScale = img.width / cssW;
    buildMosaic();
    redraw();
  };
  img.src = d.image;
});

function buildMosaic() {
  mosaicCanvas = document.createElement('canvas');
  mosaicCanvas.width = baseImg.width; mosaicCanvas.height = baseImg.height;
  const mctx = mosaicCanvas.getContext('2d');
  const BLOCK = 12; // 设备像素
  const tw = Math.max(1, Math.round(baseImg.width / BLOCK));
  const th = Math.max(1, Math.round(baseImg.height / BLOCK));
  const tmp = document.createElement('canvas'); tmp.width = tw; tmp.height = th;
  tmp.getContext('2d').drawImage(baseImg, 0, 0, tw, th);
  mctx.imageSmoothingEnabled = false;
  mctx.drawImage(tmp, 0, 0, tw, th, 0, 0, baseImg.width, baseImg.height);
}

/* ---------- 工具栏构建 ---------- */
function buildToolbar() {
  const colors = $('colors');
  COLORS.forEach((c) => {
    const s = document.createElement('span');
    s.className = 'swatch' + (c === color ? ' active' : '');
    s.style.background = c; s.dataset.color = c;
    s.addEventListener('mousedown', (e) => {
      e.stopPropagation(); color = c;
      colors.querySelectorAll('.swatch').forEach(x => x.classList.toggle('active', x === s));
    });
    colors.appendChild(s);
  });
  const sizes = $('sizes');
  SIZES.forEach((sz, i) => {
    const d = document.createElement('span');
    d.className = 'size-dot' + (sz === lineW ? ' active' : '');
    const dot = 4 + i * 4;
    d.innerHTML = `<i style="width:${dot}px;height:${dot}px"></i>`;
    d.dataset.size = sz;
    d.addEventListener('mousedown', (e) => {
      e.stopPropagation(); lineW = sz;
      sizes.querySelectorAll('.size-dot').forEach(x => x.classList.toggle('active', x === d));
    });
    sizes.appendChild(d);
  });
  toolbar.querySelectorAll('.tbtn[data-tool]').forEach((b) => {
    b.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      tool = (tool === b.dataset.tool) ? null : b.dataset.tool;
      toolbar.querySelectorAll('.tbtn[data-tool]').forEach(x =>
        x.classList.toggle('active', x.dataset.tool === tool));
    });
  });
  toolbar.querySelectorAll('.tbtn[data-act]').forEach((b) => {
    b.addEventListener('mousedown', (e) => { e.stopPropagation(); doAction(b.dataset.act); });
  });
}

/* ---------- 绘制 ---------- */
function redraw() {
  ctx.clearRect(0, 0, cssW, cssH);
  if (baseImg) ctx.drawImage(baseImg, 0, 0, cssW, cssH);
  else { ctx.fillStyle = '#1c1c1e'; ctx.fillRect(0, 0, cssW, cssH); }
  // 暗化
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.fillRect(0, 0, cssW, cssH);

  // 预览框：已选区 → sel；否则未拖动时显示悬停窗口（微信式自动选窗）
  const previewing = !sel && (phase === 'idle' || (phase === 'selecting' && !(drag && drag.started)));
  const box = sel || (previewing ? hoverWin : null);
  if (!box) { sizeLabel.style.display = 'none'; return; }

  if (baseImg) {
    ctx.drawImage(baseImg, box.x * imgScale, box.y * imgScale, box.w * imgScale, box.h * imgScale,
      box.x, box.y, box.w, box.h);
  } else {
    ctx.clearRect(box.x, box.y, box.w, box.h);
  }
  // 标注（仅在已选区时，裁剪到选区）
  if (sel) {
    ctx.save();
    ctx.beginPath(); ctx.rect(sel.x, sel.y, sel.w, sel.h); ctx.clip();
    shapes.forEach(s => drawShape(ctx, s, 1, 0, 0));
    if (cur) drawShape(ctx, cur, 1, 0, 0);
    ctx.restore();
  }
  // 边框
  ctx.strokeStyle = '#0a84ff'; ctx.lineWidth = 1.5;
  ctx.strokeRect(box.x + .5, box.y + .5, box.w, box.h);
  setSizeLabel(box);
  if (sel && phase === 'ready') drawHandles();
}

function pickWin(p) {
  let best = null;
  for (const w of wins) {
    if (p.x >= w.x && p.x <= w.x + w.w && p.y >= w.y && p.y <= w.y + w.h) {
      if (!best || w.w * w.h < best.w * best.h) best = w;   // 取面积最小者≈最上层
    }
  }
  if (!best) return null;
  const x = Math.max(0, best.x), y = Math.max(0, best.y);
  return { x, y, w: Math.min(cssW, best.x + best.w) - x, h: Math.min(cssH, best.y + best.h) - y };
}

function drawHandles() {
  const pts = handlePoints();
  ctx.fillStyle = '#0a84ff';
  pts.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); });
}
function handlePoints() {
  const { x, y, w, h } = sel;
  return [
    { k: 'nw', x, y }, { k: 'n', x: x + w / 2, y }, { k: 'ne', x: x + w, y },
    { k: 'e', x: x + w, y: y + h / 2 }, { k: 'se', x: x + w, y: y + h },
    { k: 's', x: x + w / 2, y: y + h }, { k: 'sw', x, y: y + h }, { k: 'w', x, y: y + h / 2 }
  ];
}

function drawShape(c, s, scale, offX, offY) {
  const PX = (x) => (x - offX) * scale, PY = (y) => (y - offY) * scale;
  c.lineJoin = 'round'; c.lineCap = 'round';
  c.strokeStyle = s.color; c.fillStyle = s.color; c.lineWidth = (s.size || lineW) * scale;
  if (s.type === 'rect') {
    c.strokeRect(PX(s.x), PY(s.y), s.w * scale, s.h * scale);
  } else if (s.type === 'ellipse') {
    c.beginPath();
    c.ellipse(PX(s.x + s.w / 2), PY(s.y + s.h / 2), Math.abs(s.w / 2) * scale, Math.abs(s.h / 2) * scale, 0, 0, Math.PI * 2);
    c.stroke();
  } else if (s.type === 'arrow') {
    drawArrow(c, PX(s.x1), PY(s.y1), PX(s.x2), PY(s.y2), (s.size || lineW) * scale);
  } else if (s.type === 'pen') {
    c.beginPath();
    s.pts.forEach((p, i) => i ? c.lineTo(PX(p.x), PY(p.y)) : c.moveTo(PX(p.x), PY(p.y)));
    c.stroke();
  } else if (s.type === 'mosaic') {
    if (!mosaicCanvas) return;
    s.pts.forEach(p => {
      const r = s.size;
      c.save(); c.beginPath(); c.arc(PX(p.x), PY(p.y), r * scale, 0, Math.PI * 2); c.clip();
      c.drawImage(mosaicCanvas,
        (p.x - r) * imgScale, (p.y - r) * imgScale, 2 * r * imgScale, 2 * r * imgScale,
        PX(p.x - r), PY(p.y - r), 2 * r * scale, 2 * r * scale);
      c.restore();
    });
  } else if (s.type === 'text') {
    c.font = `${s.size * scale}px -apple-system, 'PingFang SC', sans-serif`;
    c.textBaseline = 'top';
    s.text.split('\n').forEach((line, i) => c.fillText(line, PX(s.x), PY(s.y) + i * s.size * 1.25 * scale));
  }
}
function drawArrow(c, x1, y1, x2, y2, w) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const head = Math.max(10, w * 3);
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  c.beginPath(); c.moveTo(x2, y2);
  c.lineTo(x2 - head * Math.cos(ang - Math.PI / 6), y2 - head * Math.sin(ang - Math.PI / 6));
  c.lineTo(x2 - head * Math.cos(ang + Math.PI / 6), y2 - head * Math.sin(ang + Math.PI / 6));
  c.closePath(); c.fill();
}

/* ---------- 鼠标交互 ---------- */
function pos(e) { return { x: e.clientX, y: e.clientY }; }
function inToolbar(e) { return e.target.closest('.toolbar, .text-input'); }
function inSel(p) { return sel && p.x >= sel.x && p.x <= sel.x + sel.w && p.y >= sel.y && p.y <= sel.y + sel.h; }
function hitHandle(p) {
  if (!sel) return null;
  return handlePoints().find(h => Math.abs(h.x - p.x) < 8 && Math.abs(h.y - p.y) < 8) || null;
}

window.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || inToolbar(e)) return;
  const p = pos(e);

  if (phase === 'idle') { phase = 'selecting'; sel = null; drag = { sx: p.x, sy: p.y, started: false }; hideHint(); return; }

  if (phase === 'ready') {
    // 文字工具：点击放置输入框
    if (tool === 'text' && inSel(p)) { startText(p); return; }
    // 标注工具：开始画
    if (tool && inSel(p)) {
      cur = newShape(tool, p); return;
    }
    // 无工具：缩放手柄 / 移动选区 / 重新框选
    const hh = hitHandle(p);
    if (hh) { drag = { mode: 'resize', k: hh.k, start: { ...sel }, sp: p }; return; }
    if (inSel(p)) { drag = { mode: 'move', start: { ...sel }, sp: p }; return; }
    // 选区外重新框选
    shapes = []; sel = null; hoverWin = pickWin(p); phase = 'selecting'; drag = { sx: p.x, sy: p.y, started: false };
    toolbar.style.display = 'none';
  }
});

window.addEventListener('mousemove', (e) => {
  const p = pos(e);
  if (phase === 'idle') { hoverWin = pickWin(p); updateLoupe(p); redraw(); return; }

  if (phase === 'selecting') {
    if (!drag.started && Math.hypot(p.x - drag.sx, p.y - drag.sy) > 4) drag.started = true;
    if (drag.started) sel = rectFrom(drag.sx, drag.sy, p.x, p.y);
    else hoverWin = pickWin(p);
    updateLoupe(p); redraw(); return;
  }
  if (phase === 'ready') {
    if (cur) { updateShape(cur, p); redraw(); return; }
    if (drag && drag.mode === 'move') {
      const dx = p.x - drag.sp.x, dy = p.y - drag.sp.y;
      sel = { ...drag.start, x: clamp(drag.start.x + dx, 0, cssW - drag.start.w), y: clamp(drag.start.y + dy, 0, cssH - drag.start.h) };
      positionToolbar(); redraw(); return;
    }
    if (drag && drag.mode === 'resize') { resizeSel(p); positionToolbar(); redraw(); return; }
  }
});

window.addEventListener('mouseup', (e) => {
  if (phase === 'selecting') {
    loupe.style.display = 'none';
    if (drag.started && sel && sel.w >= 4 && sel.h >= 4) {
      // 手动框选完成
    } else if (hoverWin && hoverWin.w >= 4 && hoverWin.h >= 4) {
      sel = hoverWin;          // 点击未拖动 → 自动选中悬停窗口
    } else {
      sel = null; phase = 'idle'; drag = null; redraw(); showHint(); return;
    }
    phase = 'ready'; drag = null; positionToolbar(); toolbar.style.display = 'flex'; redraw(); return;
  }
  if (phase === 'ready') {
    if (cur) { if (!isEmptyShape(cur)) shapes.push(cur); cur = null; redraw(); }
    drag = null;
  }
});

function newShape(t, p) {
  if (t === 'rect' || t === 'ellipse') return { type: t, x: p.x, y: p.y, w: 0, h: 0, color, size: lineW };
  if (t === 'arrow') return { type: 'arrow', x1: p.x, y1: p.y, x2: p.x, y2: p.y, color, size: lineW };
  if (t === 'pen') return { type: 'pen', pts: [p], color, size: lineW };
  if (t === 'mosaic') return { type: 'mosaic', pts: [p], size: Math.max(6, lineW * 3) };
  return null;
}
function updateShape(s, p) {
  if (s.type === 'rect' || s.type === 'ellipse') { const r = rectFrom(s.x0 ?? (s.x0 = s.x), s.y0 ?? (s.y0 = s.y), p.x, p.y); s.x = r.x; s.y = r.y; s.w = r.w; s.h = r.h; }
  else if (s.type === 'arrow') { s.x2 = p.x; s.y2 = p.y; }
  else if (s.type === 'pen' || s.type === 'mosaic') { s.pts.push(p); }
}
function isEmptyShape(s) {
  if (s.type === 'rect' || s.type === 'ellipse') return Math.abs(s.w) < 3 || Math.abs(s.h) < 3;
  if (s.type === 'arrow') return Math.hypot(s.x2 - s.x1, s.y2 - s.y1) < 4;
  if (s.type === 'pen' || s.type === 'mosaic') return s.pts.length < 2;
  return false;
}
function rectFrom(x1, y1, x2, y2) { return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) }; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function resizeSel(p) {
  const s = drag.start, k = drag.k; let x = s.x, y = s.y, r = s.x + s.w, b = s.y + s.h;
  if (k.includes('w')) x = p.x; if (k.includes('e')) r = p.x;
  if (k.includes('n')) y = p.y; if (k.includes('s')) b = p.y;
  sel = { x: Math.min(x, r), y: Math.min(y, b), w: Math.abs(r - x), h: Math.abs(b - y) };
}

/* ---------- 文字工具 ---------- */
let editingText = null;
function startText(p) {
  editingText = { x: p.x, y: p.y, size: 16 + (lineW - 2) * 5, color };
  textInput.style.display = 'block';
  textInput.style.left = p.x + 'px'; textInput.style.top = p.y + 'px';
  textInput.style.color = color; textInput.style.fontSize = editingText.size + 'px';
  textInput.value = ''; autoSize();
  setTimeout(() => textInput.focus(), 0);
}
textInput.addEventListener('input', autoSize);
function autoSize() { textInput.style.width = 'auto'; textInput.style.height = 'auto';
  textInput.style.width = Math.min(cssW - editingText.x, textInput.scrollWidth + 6) + 'px';
  textInput.style.height = textInput.scrollHeight + 'px'; }
textInput.addEventListener('blur', commitText);
textInput.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Escape') { e.preventDefault(); commitText(); }
});
function commitText() {
  if (!editingText) return;
  const v = textInput.value.replace(/\s+$/, '');
  if (v) shapes.push({ type: 'text', x: editingText.x, y: editingText.y + 2, text: v, color: editingText.color, size: editingText.size });
  editingText = null; textInput.style.display = 'none'; textInput.value = ''; redraw();
}

/* ---------- 选区标签 / 放大镜 ---------- */
function setSizeLabel(r) {
  if (!r) { sizeLabel.style.display = 'none'; return; }
  sizeLabel.style.display = 'block';
  sizeLabel.textContent = `${Math.round(r.w)} × ${Math.round(r.h)}`;
  let ly = r.y - 24; if (ly < 4) ly = r.y + 6;
  sizeLabel.style.left = r.x + 'px'; sizeLabel.style.top = ly + 'px';
}
function updateLoupe(p) {
  if (!baseImg) return;
  loupe.style.display = 'block';
  let lx = p.x + 16, ly = p.y + 16;
  if (lx + 128 > cssW) lx = p.x - 144; if (ly + 150 > cssH) ly = p.y - 166;
  loupe.style.left = lx + 'px'; loupe.style.top = ly + 'px';
  const span = 18; // 采样范围(设备像素)
  lctx.imageSmoothingEnabled = false;
  lctx.clearRect(0, 0, 120, 120);
  lctx.drawImage(baseImg, p.x * imgScale - span, p.y * imgScale - span, span * 2, span * 2, 0, 0, 120, 120);
  lctx.strokeStyle = 'rgba(10,132,255,.9)'; lctx.lineWidth = 1;
  lctx.beginPath(); lctx.moveTo(60, 0); lctx.lineTo(60, 120); lctx.moveTo(0, 60); lctx.lineTo(120, 60); lctx.stroke();
  try {
    const px = ctxPixel(p);
    loupeInfo.innerHTML = `(${Math.round(p.x)}, ${Math.round(p.y)})<br>${px}`;
  } catch (e) { loupeInfo.textContent = `(${Math.round(p.x)}, ${Math.round(p.y)})`; }
}
let _probe = null;
function ctxPixel(p) {
  if (!_probe) { _probe = document.createElement('canvas'); _probe.width = _probe.height = 1; }
  const pc = _probe.getContext('2d');
  pc.drawImage(baseImg, p.x * imgScale, p.y * imgScale, 1, 1, 0, 0, 1, 1);
  const d = pc.getImageData(0, 0, 1, 1).data;
  return '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/* ---------- 工具栏定位 ---------- */
function positionToolbar() {
  if (!sel) return;
  const tw = toolbar.offsetWidth || 420, th = toolbar.offsetHeight || 38;
  let x = sel.x + sel.w - tw; if (x < 4) x = 4; if (x + tw > cssW - 4) x = cssW - tw - 4;
  let y = sel.y + sel.h + 8; if (y + th > cssH - 4) y = sel.y - th - 8; if (y < 4) y = 4;
  toolbar.style.left = x + 'px'; toolbar.style.top = y + 'px';
}

/* ---------- 动作 ---------- */
function doAction(act) {
  if (act === 'undo') { if (editingText) commitText(); else shapes.pop(); redraw(); return; }
  if (act === 'cancel') { api.captureCancel(); return; }
  if (editingText) commitText();
  if (act === 'copy') api.captureCopy(exportPNG());
  else if (act === 'save') api.captureSave(exportPNG());
  else if (act === 'pin') api.capturePin({
    dataURL: exportPNG(),
    x: dispBounds.x + sel.x, y: dispBounds.y + sel.y, width: sel.w, height: sel.h
  });
}

function exportPNG() {
  const ex = document.createElement('canvas');
  ex.width = Math.round(sel.w * imgScale); ex.height = Math.round(sel.h * imgScale);
  const ec = ex.getContext('2d');
  if (baseImg) ec.drawImage(baseImg, sel.x * imgScale, sel.y * imgScale, sel.w * imgScale, sel.h * imgScale, 0, 0, ex.width, ex.height);
  shapes.forEach(s => drawShape(ec, s, imgScale, sel.x, sel.y));
  return ex.toDataURL('image/png');
}

/* ---------- 键盘 ---------- */
window.addEventListener('keydown', (e) => {
  if (editingText) return;
  if (e.key === 'Escape') { api.captureCancel(); }
  else if (e.key === 'Enter') { if (sel) doAction('copy'); }
  else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { shapes.pop(); redraw(); }
  else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (sel) doAction('save'); }
});

function showHint() { hint.style.display = 'block'; }
function hideHint() { hint.style.display = 'none'; }
