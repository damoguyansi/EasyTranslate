// 钉图窗口：拖动移动、滚轮缩放、双击 / Esc 关闭、右键菜单
import { api } from '../ui/api.js';

const img = document.getElementById('img');
const zoomEl = document.getElementById('zoom');
let base = 0;
let zoomTimer;

api.on('pin:image', ({ png }) => {
  img.src = URL.createObjectURL(new Blob([png], { type: 'image/png' }));
  base = innerWidth;
});

let drag = null;
window.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  drag = { x: e.screenX, y: e.screenY };
  document.body.classList.add('moving');
});
window.addEventListener('mousemove', (e) => {
  if (!drag) return;
  const dx = e.screenX - drag.x;
  const dy = e.screenY - drag.y;
  if (!dx && !dy) return;
  drag = { x: e.screenX, y: e.screenY };
  api.send('pin:action', 'move', { dx, dy });
});
window.addEventListener('mouseup', () => {
  drag = null;
  document.body.classList.remove('moving');
});
window.addEventListener('dblclick', () => api.send('pin:action', 'close'));
window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  api.send('pin:action', 'menu');
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') api.send('pin:action', 'close');
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') api.send('pin:action', 'copy');
});
window.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    api.send('pin:action', 'zoom', e.deltaY < 0 ? 1 : -1);
  },
  { passive: false }
);
window.addEventListener('resize', () => {
  if (!base) return;
  zoomEl.textContent = Math.round((innerWidth / base) * 100) + '%';
  zoomEl.classList.add('show');
  clearTimeout(zoomTimer);
  zoomTimer = setTimeout(() => zoomEl.classList.remove('show'), 900);
});
