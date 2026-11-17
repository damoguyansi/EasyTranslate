// 截图标注覆盖层：自动识别窗口 / 框选、7 种标注、放大镜取色、二维码识别、复制 / 保存 / 钉图
import { api } from '../ui/api.js';
import { hydrateIcons } from '../ui/icons.js';
import { decodeQrFrom } from '../ui/qr.js';
import { clamp, normRect, hitHandle, moveRect, resizeRect, pickWindow, HANDLES } from './geometry.js';

hydrateIcons();
const $ = (id) => document.getElementById(id);
const stage = $('stage');
const ctx = stage.getContext('2d');
const toolbar = $('toolbar');
const props = $('props');
const sizeEl = $('size');
const loupe = $('loupe');
const lctx = $('loupeCanvas').getContext('2d', { willReadFrequently: true });
const textInput = $('textInput');
const hint = $('hint');

const COLORS = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#0a84ff', '#af52de', '#ffffff', '#1c1c1e'];
const SIZES = [2, 4, 7];

let S; // 会话状态
function freshState() {
  return {
    image: null, // ImageBitmap（设备像素）
    mosaic: null,
    W: innerWidth,
    H: innerHeight,
    k: 1, // 设备像素 / CSS 像素
    mode: 'annotate',
    phase: 'idle', // idle | dragging | ready
    windows: [],
    hover: null,
    sel: null,
    drag: null,
    tool: null,
    color: COLORS[0],
    size: SIZES[1],
    shapes: [],
    cur: null,
    counter: 1,
    pointer: { x: -1, y: -1 },
    text: null
  };
}
S = freshState();

/* ================= 生命周期 ================= */
api.on('capture:open', async (msg) => {
  reset();
  S.mode = msg.mode || 'annotate';
  S.W = msg.width;
  S.H = msg.height;
  const blob = new Blob([msg.png], { type: 'image/png' });
  S.image = await createImageBitmap(blob);
  S.k = S.image.width / S.W;
  const dpr = window.devicePixelRatio || msg.scaleFactor || 1;
  stage.width = Math.round(S.W * dpr);
  stage.height = Math.round(S.H * dpr);
  stage.style.width = S.W + 'px';
  stage.style.height = S.H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  S.windows = [{ x: 0, y: 0, w: S.W, h: S.H }];
  hint.textContent = S.mode === 'qr' ? '框选二维码区域，自动识别' : '单击选择窗口 · 拖动框选区域 · Esc 退出';
  document.body.classList.remove('hidden-ui');
  draw();
  requestAnimationFrame(() => requestAnimationFrame(() => api.send('capture:ready')));
});

api.on('capture:windows', (rects) => {
  S.windows = [...(rects || []), { x: 0, y: 0, w: S.W, h: S.H }];
  if (S.phase === 'idle' && S.pointer.x >= 0) {
    S.hover = pickWindow(S.windows, S.pointer);
    schedule();
  }
});

api.on('capture:reset', reset);

function reset() {
  S.image?.close?.();
  S = freshState();
  ctx.clearRect(0, 0, stage.width, stage.height);
  toolbar.classList.remove('show');
  props.classList.remove('show');
  sizeEl.style.display = 'none';
  loupe.style.display = 'none';
  textInput.style.display = 'none';
  hint.textContent = '';
  document.querySelectorAll('#tools button').forEach((b) => b.classList.remove('on'));
  buildProps();
}

/* ================= 绘制 ================= */
let raf = 0;
function schedule() {
  if (!raf) raf = requestAnimationFrame(() => ((raf = 0), draw()));
}

function draw() {
  const { W, H, image } = S;
  ctx.clearRect(0, 0, W, H);
  if (!image) return;
  ctx.drawImage(image, 0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.fillRect(0, 0, W, H);

  const box = S.sel || (S.phase === 'idle' ? S.hover : null);
  if (!box) {
    sizeEl.style.display = 'none';
    return;
  }
  const k = S.k;
  ctx.drawImage(image, box.x * k, box.y * k, box.w * k, box.h * k, box.x, box.y, box.w, box.h);
  if (S.sel) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
    for (const s of S.shapes) drawShape(ctx, s, 1, 0, 0);
    if (S.cur) drawShape(ctx, S.cur, 1, 0, 0);
    ctx.restore();
  }
  ctx.lineWidth = S.sel ? 1 : 2.5;
  ctx.strokeStyle = '#0a84ff';
  ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);
  if (S.sel && S.phase === 'ready' && !S.tool) {
    for (const h of HANDLES(S.sel)) {
      ctx.beginPath();
      ctx.arc(h.x, h.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#0a84ff';
      ctx.stroke();
    }
  }
  sizeEl.style.display = 'block';
  sizeEl.textContent = `${Math.round(box.w * k)} × ${Math.round(box.h * k)}`;
  sizeEl.style.left = clamp(box.x, 4, W - 90) + 'px';
  sizeEl.style.top = (box.y > 26 ? box.y - 24 : box.y + 6) + 'px';
}

function ensureMosaic() {
  if (S.mosaic) return S.mosaic;
  const { image } = S;
  const block = Math.max(8, Math.round(10 * S.k));
  const tw = Math.max(1, Math.ceil(image.width / block));
  const th = Math.max(1, Math.ceil(image.height / block));
  const small = new OffscreenCanvas(tw, th);
  small.getContext('2d').drawImage(image, 0, 0, tw, th);
  const big = new OffscreenCanvas(image.width, image.height);
  const bctx = big.getContext('2d');
  bctx.imageSmoothingEnabled = false;
  bctx.drawImage(small, 0, 0, tw, th, 0, 0, image.width, image.height);
  return (S.mosaic = big);
}

function drawShape(c, s, scale, ox, oy) {
  const X = (x) => (x - ox) * scale;
  const Y = (y) => (y - oy) * scale;
  c.save();
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.strokeStyle = c.fillStyle = s.color;
  c.lineWidth = s.size * scale;
  switch (s.type) {
    case 'rect':
      c.strokeRect(X(s.x), Y(s.y), s.w * scale, s.h * scale);
      break;
    case 'ellipse':
      c.beginPath();
      c.ellipse(X(s.x + s.w / 2), Y(s.y + s.h / 2), (s.w / 2) * scale, (s.h / 2) * scale, 0, 0, Math.PI * 2);
      c.stroke();
      break;
    case 'arrow': {
      const x1 = X(s.x1), y1 = Y(s.y1), x2 = X(s.x2), y2 = Y(s.y2);
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const len = Math.hypot(x2 - x1, y2 - y1);
      const head = Math.min(len * 0.6, Math.max(12, s.size * 3.6) * scale);
      const bx = x2 - head * 0.8 * Math.cos(ang), by = y2 - head * 0.8 * Math.sin(ang);
      c.beginPath();
      c.moveTo(x1, y1);
      c.lineTo(bx, by);
      c.stroke();
      c.beginPath();
      c.moveTo(x2, y2);
      c.lineTo(x2 - head * Math.cos(ang - 0.45), y2 - head * Math.sin(ang - 0.45));
      c.lineTo(x2 - head * Math.cos(ang + 0.45), y2 - head * Math.sin(ang + 0.45));
      c.closePath();
      c.fill();
      break;
    }
    case 'pen':
      c.beginPath();
      s.pts.forEach((p, i) => (i ? c.lineTo(X(p.x), Y(p.y)) : c.moveTo(X(p.x), Y(p.y))));
      c.stroke();
      break;
    case 'mosaic': {
      // 用沿笔迹排列的圆形作为裁剪区域，把预先生成的马赛克层贴进去
      const m = ensureMosaic();
      const r = (s.size / 2) * scale;
      const path = new Path2D();
      const dot = (x, y) => {
        path.moveTo(x + r, y);
        path.arc(x, y, r, 0, Math.PI * 2);
      };
      let prev = null;
      for (const p of s.pts) {
        const x = X(p.x);
        const y = Y(p.y);
        if (prev) {
          const steps = Math.max(1, Math.ceil(Math.hypot(x - prev.x, y - prev.y) / Math.max(1, r / 2)));
          for (let i = 1; i <= steps; i++) dot(prev.x + ((x - prev.x) * i) / steps, prev.y + ((y - prev.y) * i) / steps);
        } else dot(x, y);
        prev = { x, y };
      }
      c.clip(path);
      c.imageSmoothingEnabled = false;
      c.drawImage(m, X(0), Y(0), (m.width / S.k) * scale, (m.height / S.k) * scale);
      break;
    }
    case 'text': {
      c.font = `600 ${s.size * scale}px -apple-system, 'PingFang SC', sans-serif`;
      c.textBaseline = 'top';
      c.lineWidth = Math.max(2, s.size * 0.12) * scale;
      c.strokeStyle = s.color === '#ffffff' ? 'rgba(0,0,0,.45)' : 'rgba(255,255,255,.6)';
      s.text.split('\n').forEach((line, i) => {
        const ty = Y(s.y) + i * s.size * 1.25 * scale;
        c.strokeText(line, X(s.x), ty);
        c.fillText(line, X(s.x), ty);
      });
      break;
    }
    case 'number': {
      const r = (10 + s.size * 1.6) * scale;
      c.beginPath();
      c.arc(X(s.x), Y(s.y), r, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = s.color === '#ffffff' || s.color === '#ffcc00' ? '#1c1c1e' : '#fff';
      c.font = `700 ${r * 1.1}px -apple-system, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(String(s.n), X(s.x), Y(s.y) + r * 0.05);
      break;
    }
  }
  c.restore();
}

/* ================= 放大镜 ================= */
function updateLoupe(p) {
  if (!S.image || S.phase === 'ready') {
    loupe.style.display = 'none';
    return;
  }
  loupe.style.display = 'block';
  let lx = p.x + 18;
  let ly = p.y + 22;
  if (lx + 140 > S.W) lx = p.x - 154;
  if (ly + 126 > S.H) ly = p.y - 140;
  loupe.style.left = lx + 'px';
  loupe.style.top = ly + 'px';
  const sx = Math.round(p.x * S.k);
  const sy = Math.round(p.y * S.k);
  lctx.imageSmoothingEnabled = false;
  lctx.fillStyle = '#000';
  lctx.fillRect(0, 0, 132, 96);
  lctx.drawImage(S.image, sx - 11, sy - 8, 22, 16, 0, 0, 132, 96);
  lctx.strokeStyle = 'rgba(10,132,255,.9)';
  lctx.lineWidth = 1;
  lctx.strokeRect(60.5, 42.5, 6, 6);
  const px = lctx.getImageData(63, 45, 1, 1).data;
  const hex = '#' + [px[0], px[1], px[2]].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
  S.color_under = hex;
  $('loupePos').textContent = `${Math.round(p.x)}, ${Math.round(p.y)}`;
  $('loupeColor').innerHTML = `<i style="background:${hex}"></i>${hex}`;
}

/* ================= 工具栏 ================= */
function buildProps() {
  $('sizes').innerHTML = SIZES.map(
    (s, i) => `<span class="size-dot ${s === S.size ? 'on' : ''}" data-size="${s}"><i style="width:${4 + i * 3}px;height:${4 + i * 3}px"></i></span>`
  ).join('');
  $('colors').innerHTML = COLORS.map(
    (c) => `<span class="swatch ${c === S.color ? 'on' : ''}" data-color="${c}" style="background:${c}"></span>`
  ).join('');
}
buildProps();

props.addEventListener('mousedown', (e) => {
  e.stopPropagation();
  const sz = e.target.closest('[data-size]');
  const col = e.target.closest('[data-color]');
  if (sz) S.size = Number(sz.dataset.size);
  if (col) S.color = col.dataset.color;
  if (S.text) {
    S.text.color = S.color;
    S.text.size = textSize();
    styleTextInput();
  }
  buildProps();
});

toolbar.addEventListener('mousedown', (e) => {
  e.stopPropagation();
  e.preventDefault();
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.tool) setTool(S.tool === b.dataset.tool ? null : b.dataset.tool);
  else if (b.dataset.act) act(b.dataset.act);
});

function setTool(t) {
  commitText();
  S.tool = t;
  document.querySelectorAll('#tools button').forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
  props.classList.toggle('show', !!t);
  placeToolbar();
  document.body.style.cursor = t === 'text' ? 'text' : 'crosshair';
  schedule();
}

function placeToolbar() {
  if (!S.sel) return;
  toolbar.classList.add('show');
  const tw = toolbar.offsetWidth;
  const th = toolbar.offsetHeight;
  const { x, y, w, h } = S.sel;
  let tx = clamp(x + w - tw, 6, S.W - tw - 6);
  let ty = y + h + 8;
  const room = props.classList.contains('show') ? th * 2 + 14 : th + 8;
  if (ty + room > S.H) ty = y - room;
  if (ty < 6) ty = clamp(y + h - room - 6, 6, S.H - room);
  toolbar.style.left = tx + 'px';
  toolbar.style.top = ty + 'px';
  if (props.classList.contains('show')) {
    props.style.left = tx + 'px';
    props.style.top = ty + th + 6 + 'px';
  }
}

/* ================= 文字 ================= */
function textSize() {
  return { 2: 16, 4: 22, 7: 32 }[S.size] || 22;
}
function styleTextInput() {
  const t = S.text;
  textInput.style.left = t.x - 3 + 'px';
  textInput.style.top = t.y - 1 + 'px';
  textInput.style.color = t.color;
  textInput.style.fontSize = t.size + 'px';
  textInput.style.fontWeight = '600';
  autoSizeText();
}
function autoSizeText() {
  textInput.style.width = '0px';
  textInput.style.height = '0px';
  textInput.style.width = Math.min(S.W - S.text.x, textInput.scrollWidth + 12) + 'px';
  textInput.style.height = textInput.scrollHeight + 'px';
}
function startText(p) {
  commitText();
  S.text = { x: p.x, y: p.y, color: S.color, size: textSize() };
  textInput.value = '';
  textInput.style.display = 'block';
  styleTextInput();
  setTimeout(() => textInput.focus(), 0);
}
function commitText() {
  if (!S.text) return;
  const v = textInput.value.replace(/\s+$/, '');
  if (v) S.shapes.push({ type: 'text', x: S.text.x, y: S.text.y, text: v, color: S.text.color, size: S.text.size });
  S.text = null;
  textInput.style.display = 'none';
  textInput.value = '';
  schedule();
}
textInput.addEventListener('input', autoSizeText);
textInput.addEventListener('mousedown', (e) => e.stopPropagation());
textInput.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
    e.preventDefault();
    commitText();
  }
});

/* ================= 鼠标 ================= */
const pt = (e) => ({ x: clamp(e.clientX, 0, S.W), y: clamp(e.clientY, 0, S.H) });
const inside = (p, r) => r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

window.addEventListener('mousedown', (e) => {
  if (!S.image) return;
  if (e.button === 2) {
    // 右键：已有选区 → 清除重选；否则退出
    if (S.sel) return reselect();
    return api.send('capture:cancel');
  }
  if (e.button !== 0) return;
  const p = pt(e);
  if (S.phase === 'idle') {
    S.phase = 'dragging';
    S.drag = { kind: 'new', start: p, moved: false };
    hint.textContent = '';
    return;
  }
  if (S.phase !== 'ready') return;
  if (S.tool) {
    if (!inside(p, S.sel)) return;
    if (S.tool === 'text') return startText(p);
    commitText();
    const base = { color: S.color, size: S.size };
    if (S.tool === 'rect' || S.tool === 'ellipse') S.cur = { type: S.tool, ...base, x: p.x, y: p.y, w: 0, h: 0, ox: p.x, oy: p.y };
    else if (S.tool === 'arrow') S.cur = { type: 'arrow', ...base, x1: p.x, y1: p.y, x2: p.x, y2: p.y };
    else if (S.tool === 'pen') S.cur = { type: 'pen', ...base, pts: [p] };
    else if (S.tool === 'mosaic') S.cur = { type: 'mosaic', color: '#000', size: S.size * 5 + 6, pts: [p] };
    else if (S.tool === 'number') {
      S.shapes.push({ type: 'number', ...base, x: p.x, y: p.y, n: S.counter++ });
      schedule();
    }
    return;
  }
  const h = hitHandle(S.sel, p);
  if (h) S.drag = { kind: 'resize', handle: h, start: p, orig: { ...S.sel } };
  else if (inside(p, S.sel)) S.drag = { kind: 'move', start: p, orig: { ...S.sel } };
  else reselect(p);
});

function reselect(p) {
  commitText();
  S.shapes = [];
  S.counter = 1;
  S.sel = null;
  S.tool = null;
  setTool(null);
  toolbar.classList.remove('show');
  props.classList.remove('show');
  if (p) {
    S.phase = 'dragging';
    S.drag = { kind: 'new', start: p, moved: false };
  } else {
    S.phase = 'idle';
    S.drag = null;
    S.hover = pickWindow(S.windows, S.pointer);
  }
  schedule();
}

window.addEventListener('mousemove', (e) => {
  if (!S.image) return;
  const p = pt(e);
  S.pointer = p;
  if (S.phase === 'idle') {
    const h = pickWindow(S.windows, p);
    if (h !== S.hover) {
      S.hover = h;
      schedule();
    } else if (!S.hover) schedule();
    updateLoupe(p);
    return;
  }
  if (S.phase === 'dragging' && S.drag) {
    if (!S.drag.moved && Math.hypot(p.x - S.drag.start.x, p.y - S.drag.start.y) > 3) S.drag.moved = true;
    if (S.drag.moved) S.sel = normRect(S.drag.start.x, S.drag.start.y, p.x, p.y);
    updateLoupe(p);
    schedule();
    return;
  }
  if (S.phase === 'ready') {
    if (S.cur) {
      const c = S.cur;
      if (c.type === 'rect' || c.type === 'ellipse') {
        let x2 = p.x;
        let y2 = p.y;
        if (e.shiftKey) {
          const d = Math.max(Math.abs(x2 - c.ox), Math.abs(y2 - c.oy));
          x2 = c.ox + Math.sign(x2 - c.ox || 1) * d;
          y2 = c.oy + Math.sign(y2 - c.oy || 1) * d;
        }
        Object.assign(c, normRect(c.ox, c.oy, x2, y2));
      } else if (c.type === 'arrow') {
        c.x2 = p.x;
        c.y2 = p.y;
      } else c.pts.push(p);
      schedule();
      return;
    }
    if (S.drag?.kind === 'move') {
      S.sel = moveRect(S.drag.orig, p.x - S.drag.start.x, p.y - S.drag.start.y, S.W, S.H);
      placeToolbar();
      schedule();
    } else if (S.drag?.kind === 'resize') {
      S.sel = resizeRect(S.drag.orig, S.drag.handle, p, S.W, S.H);
      placeToolbar();
      schedule();
    } else if (!S.tool) {
      const h = hitHandle(S.sel, p);
      document.body.style.cursor = h ? h.cursor : inside(p, S.sel) ? 'move' : 'crosshair';
    }
  }
});

window.addEventListener('mouseup', () => {
  if (!S.image) return;
  if (S.phase === 'dragging') {
    const d = S.drag;
    S.drag = null;
    if (d.moved && S.sel && S.sel.w >= 3 && S.sel.h >= 3) {
      // 手动框选完成
    } else if (S.hover) {
      S.sel = { ...S.hover };
    } else {
      S.sel = null;
      S.phase = 'idle';
      schedule();
      return;
    }
    S.phase = 'ready';
    loupe.style.display = 'none';
    if (S.mode === 'qr') return act('qr');
    placeToolbar();
    schedule();
    return;
  }
  if (S.phase === 'ready') {
    if (S.cur) {
      const c = S.cur;
      const empty =
        ((c.type === 'rect' || c.type === 'ellipse') && (c.w < 3 || c.h < 3)) ||
        (c.type === 'arrow' && Math.hypot(c.x2 - c.x1, c.y2 - c.y1) < 5);
      if (!empty) S.shapes.push(c);
      S.cur = null;
      schedule();
    }
    S.drag = null;
  }
});

window.addEventListener('dblclick', (e) => {
  if (S.phase === 'ready' && !S.tool && inside(pt(e), S.sel)) act('copy');
});
window.addEventListener('contextmenu', (e) => e.preventDefault());

/* ================= 键盘 ================= */
window.addEventListener('keydown', (e) => {
  if (!S.image || S.text) return;
  const mod = e.metaKey || e.ctrlKey;
  const k = e.key.toLowerCase();
  if (e.key === 'Escape') {
    e.preventDefault();
    if (S.tool) return setTool(null);
    return api.send('capture:cancel');
  }
  if (e.key === 'Enter' && S.sel) return act('copy');
  if (mod && k === 'z') return act('undo');
  if (mod && k === 's' && S.sel) return e.preventDefault(), act('save');
  if (mod && k === 'c') {
    if (S.sel) return act('copy');
    if (S.color_under) {
      api.invoke('clipboard:write', S.color_under);
      flash(`已复制颜色 ${S.color_under}`);
    }
    return;
  }
  if (S.phase === 'ready' && /^[1-7]$/.test(e.key)) {
    const tools = ['rect', 'ellipse', 'arrow', 'pen', 'mosaic', 'text', 'number'];
    const t = tools[Number(e.key) - 1];
    return setTool(S.tool === t ? null : t);
  }
  if (S.phase === 'ready' && !S.tool && e.key.startsWith('Arrow')) {
    e.preventDefault();
    const d = e.shiftKey ? 10 : 1;
    const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0;
    const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
    S.sel = mod ? { ...S.sel, w: clamp(S.sel.w + dx, 4, S.W - S.sel.x), h: clamp(S.sel.h + dy, 4, S.H - S.sel.y) } : moveRect(S.sel, dx, dy, S.W, S.H);
    placeToolbar();
    schedule();
  }
});

let flashTimer;
function flash(msg) {
  const f = $('flash');
  f.textContent = msg;
  f.classList.add('show');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => f.classList.remove('show'), 1300);
}

/* ================= 动作 ================= */
function renderSelection() {
  const { sel, k, image } = S;
  const w = Math.max(1, Math.round(sel.w * k));
  const h = Math.max(1, Math.round(sel.h * k));
  const out = new OffscreenCanvas(w, h);
  const c = out.getContext('2d');
  c.drawImage(image, Math.round(sel.x * k), Math.round(sel.y * k), w, h, 0, 0, w, h);
  for (const s of S.shapes) drawShape(c, s, k, sel.x, sel.y);
  return out;
}

async function act(name) {
  if (name === 'undo') {
    if (S.text) return commitText();
    const last = S.shapes.pop();
    if (last?.type === 'number') S.counter = Math.max(1, S.counter - 1);
    schedule();
    return;
  }
  if (name === 'cancel') return api.send('capture:cancel');
  if (!S.sel) return;
  commitText();
  if (name === 'qr') {
    const canvas = renderSelection();
    const text = decodeQrFrom(canvas);
    if (!text) {
      flash('未识别到二维码，请重新框选');
      if (S.mode === 'qr') reselect();
      return;
    }
    return api.send('capture:finish', { action: 'qr', text, mode: S.mode });
  }
  const canvas = renderSelection();
  const rect = { ...S.sel };
  const scaleFactor = S.k;
  document.body.classList.add('hidden-ui');
  ctx.clearRect(0, 0, S.W, S.H); // 立即让覆盖层消失，导出在后台完成
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const png = new Uint8Array(await blob.arrayBuffer());
  api.send('capture:finish', { action: name, png, rect, scaleFactor });
}
