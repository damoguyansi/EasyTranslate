import './content.css';
import { translateText } from '../lib/translate.js';
import { detectLanguage, defaultTarget, LANGUAGES } from '../lib/language.js';

let icon = null;
let popup = null;
let lastText = '';

const LANG_LABEL = LANGUAGES; // { 'zh-Hans': '中文', en: '英语', ja: '日语' }
const MAX_LEN = 1000; // 超长选区不弹划词，避免误触

function removeIcon() {
  if (icon) {
    icon.remove();
    icon = null;
  }
}

function closeAll() {
  removeIcon();
  if (popup) {
    popup.remove();
    popup = null;
  }
  lastText = '';
}

function isOurNode(node) {
  return (icon && icon.contains(node)) || (popup && popup.contains(node));
}

/** 是否处于不应触发划词的可编辑/控件区域。 */
function inEditable(node) {
  let el = node && node.nodeType === 3 ? node.parentElement : node;
  while (el) {
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable) return true;
    el = el.parentElement;
  }
  return false;
}

/** 取选区的视口矩形（失败返回 null）。 */
function getSelectionRect(sel) {
  try {
    const range = sel.getRangeAt(0);
    const rects = range.getClientRects();
    const rect = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
    if (rect && (rect.width || rect.height)) return rect;
  } catch {
    /* ignore */
  }
  return null;
}

/** 在选区末尾下方创建翻译触发图标（锚定文本，不跟随鼠标）。 */
function createIcon(text, rect) {
  removeIcon();
  icon = document.createElement('div');
  icon.id = 'et-icon';
  icon.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 5h7M7.5 5c0 4-2 7-5 8m1-4c0 2.5 2.5 4.5 6 5.5M13 19l4-9 4 9m-6.5-3h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const x = rect.right + window.scrollX - 4;
  const y = rect.bottom + window.scrollY + 6;
  icon.style.left = `${x}px`;
  icon.style.top = `${y}px`;
  icon.addEventListener('mousedown', (e) => e.stopPropagation(), true);
  icon.addEventListener('click', (e) => {
    e.stopPropagation();
    const from = detectLanguage(text);
    showPopup(text, x, y + 26, from, defaultTarget(from));
  });
  document.body.appendChild(icon);
}

function buildLangOptions(selected) {
  return Object.entries(LANG_LABEL)
    .map(([v, l]) => `<option value="${v}" ${v === selected ? 'selected' : ''}>${l}</option>`)
    .join('');
}

function showPopup(text, x, y, from, to) {
  removeIcon();
  if (popup) popup.remove();
  popup = document.createElement('div');
  popup.id = 'et-popup';
  popup.innerHTML = `
    <div class="et-pop-head">
      <span class="et-pop-title">EasyTranslate</span>
      <div class="et-pop-langs">
        <select class="et-from">${buildLangOptions(from)}</select>
        <button class="et-swap" title="互换">⇄</button>
        <select class="et-to">${buildLangOptions(to)}</select>
      </div>
      <button class="et-refresh" title="重新翻译">↻</button>
      <button class="et-close" title="关闭">×</button>
    </div>
    <div class="et-pop-body">
      <div class="et-block">
        <div class="et-label">原文</div>
        <div class="et-source">${escapeHtml(text)}</div>
      </div>
      <div class="et-block">
        <div class="et-label">译文 <button class="et-copy" title="复制译文">⧉</button></div>
        <div class="et-target">翻译中…</div>
      </div>
    </div>`;
  document.body.appendChild(popup);
  // 阻止弹窗内部交互冒泡导致自身被关闭
  popup.addEventListener('mousedown', (e) => e.stopPropagation(), true);
  popup.addEventListener('mouseup', (e) => e.stopPropagation(), true);
  position(popup, x, y);

  const fromSel = popup.querySelector('.et-from');
  const toSel = popup.querySelector('.et-to');
  const targetEl = popup.querySelector('.et-target');

  const run = () => {
    targetEl.textContent = '翻译中…';
    targetEl.classList.add('loading');
    translateText(text, fromSel.value, toSel.value)
      .then((res) => {
        targetEl.textContent = res;
        targetEl.classList.remove('loading');
        position(popup, x, y);
      })
      .catch((err) => {
        targetEl.textContent = '翻译失败: ' + err.message;
        targetEl.classList.remove('loading');
      });
  };

  popup.querySelector('.et-close').addEventListener('click', (e) => {
    e.stopPropagation();
    closeAll();
  });
  popup.querySelector('.et-refresh').addEventListener('click', (e) => {
    e.stopPropagation();
    run();
  });
  popup.querySelector('.et-swap').addEventListener('click', (e) => {
    e.stopPropagation();
    [fromSel.value, toSel.value] = [toSel.value, fromSel.value];
    run();
  });
  popup.querySelector('.et-copy').addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(targetEl.textContent);
      e.target.textContent = '✓';
      setTimeout(() => (e.target.textContent = '⧉'), 1200);
    } catch {
      /* ignore */
    }
  });
  fromSel.addEventListener('change', run);
  toSel.addEventListener('change', run);
  run();
}

function position(el, anchorX, anchorY) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  let px = anchorX;
  let py = anchorY;
  if (px + w > window.scrollX + vw) px = Math.max(window.scrollX + 8, window.scrollX + vw - w - 8);
  if (py + h > window.scrollY + vh) py = anchorY - h - 36;
  if (py < window.scrollY + 8) py = window.scrollY + 8;
  el.style.left = `${px}px`;
  el.style.top = `${py}px`;
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

/** 选区变化后评估是否展示图标。 */
function handleSelection() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
    closeAll();
    return;
  }
  const text = sel.toString().trim();
  if (!text || text.length > MAX_LEN || text.indexOf('••') > -1) {
    closeAll();
    return;
  }
  // 选区落在可编辑控件或我们自己的 UI 内则忽略
  if (inEditable(sel.anchorNode) || isOurNode(sel.anchorNode)) return;
  // 弹窗已打开且文本未变，不重复创建
  if (popup && text === lastText) return;
  const rect = getSelectionRect(sel);
  if (!rect) {
    closeAll();
    return;
  }
  lastText = text;
  createIcon(text, rect);
}

// 选区结束：mouseup（捕获阶段，先于页面脚本拦截）
document.addEventListener(
  'mouseup',
  (event) => {
    if (isOurNode(event.target)) return;
    setTimeout(handleSelection, 10);
  },
  true
);

// 键盘选择（Shift+方向键 等）
document.addEventListener('keyup', (event) => {
  if (event.shiftKey || event.key === 'Escape') {
    if (event.key === 'Escape') return closeAll();
    setTimeout(handleSelection, 10);
  }
});

// 点击空白处关闭（捕获阶段，避免被页面 stopPropagation 吞掉）
document.addEventListener(
  'mousedown',
  (event) => {
    if (isOurNode(event.target)) return;
    closeAll();
  },
  true
);

// 滚动 / 缩放时关闭，避免错位漂浮
window.addEventListener('scroll', () => closeAll(), true);
window.addEventListener('resize', () => closeAll());

// 来自右键菜单的翻译请求
chrome.runtime.onMessage.addListener((req) => {
  if (req?.type === 'translate-selection' && req.text) {
    const text = req.text.trim();
    const sel = window.getSelection();
    const rect = sel && !sel.isCollapsed ? getSelectionRect(sel) : null;
    const ax = rect ? rect.right + window.scrollX : window.scrollX + 60;
    const ay = rect ? rect.bottom + window.scrollY + 30 : window.scrollY + 60;
    const from = detectLanguage(text);
    showPopup(text, ax, ay, from, defaultTarget(from));
  }
});
