// 钉图窗口：显示截图，双击关闭，Esc 关闭
const api = window.electronAPI;
const img = document.getElementById('pinImg');

api.onPinInit((d) => { img.src = d.image; });

img.addEventListener('dblclick', () => api.pinClose());
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') api.pinClose(); });
