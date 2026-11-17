// 选区几何计算（纯函数，可单元测试）
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function normRect(x1, y1, x2, y2) {
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}

export function HANDLES(r) {
  const { x, y, w, h } = r;
  return [
    { k: 'nw', x, y, cursor: 'nwse-resize' },
    { k: 'n', x: x + w / 2, y, cursor: 'ns-resize' },
    { k: 'ne', x: x + w, y, cursor: 'nesw-resize' },
    { k: 'e', x: x + w, y: y + h / 2, cursor: 'ew-resize' },
    { k: 'se', x: x + w, y: y + h, cursor: 'nwse-resize' },
    { k: 's', x: x + w / 2, y: y + h, cursor: 'ns-resize' },
    { k: 'sw', x, y: y + h, cursor: 'nesw-resize' },
    { k: 'w', x, y: y + h / 2, cursor: 'ew-resize' }
  ];
}

export function hitHandle(r, p, tol = 7) {
  if (!r) return null;
  let best = null;
  let bestD = Infinity;
  for (const h of HANDLES(r)) {
    const d = Math.max(Math.abs(h.x - p.x), Math.abs(h.y - p.y));
    if (d <= tol && d < bestD) {
      best = h;
      bestD = d;
    }
  }
  return best;
}

export function moveRect(r, dx, dy, W, H) {
  return { ...r, x: clamp(r.x + dx, 0, W - r.w), y: clamp(r.y + dy, 0, H - r.h) };
}

export function resizeRect(orig, handle, p, W, H) {
  let x1 = orig.x;
  let y1 = orig.y;
  let x2 = orig.x + orig.w;
  let y2 = orig.y + orig.h;
  const k = handle.k;
  const px = clamp(p.x, 0, W);
  const py = clamp(p.y, 0, H);
  if (k.includes('w')) x1 = px;
  if (k.includes('e')) x2 = px;
  if (k.includes('n')) y1 = py;
  if (k.includes('s')) y2 = py;
  const r = normRect(x1, y1, x2, y2);
  return { ...r, w: Math.max(2, r.w), h: Math.max(2, r.h) };
}

/** 返回包含点 p 的最上层（列表中最靠前）窗口。 */
export function pickWindow(windows, p) {
  for (const w of windows) {
    if (p.x >= w.x && p.x <= w.x + w.w && p.y >= w.y && p.y <= w.y + w.h) return w;
  }
  return null;
}
