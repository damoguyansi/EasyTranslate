// 渲染进程通用工具：DOM、Toast、复制、菜单、对话框
import { api } from './api.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function debounce(fn, ms) {
  let t;
  const wrapped = (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

let toastEl;
let toastTimer;
export function toast(message, type = 'info') {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  toastEl.className = `toast show ${type === 'error' ? 'error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), type === 'error' ? 2600 : 1500);
}

export async function copyText(text, label = '已复制') {
  if (!text) {
    toast('没有可复制的内容', 'error');
    return false;
  }
  try {
    await api.invoke('clipboard:write', text);
    toast(label);
    return true;
  } catch {
    try {
      await navigator.clipboard.writeText(text);
      toast(label);
      return true;
    } catch {
      toast('复制失败', 'error');
      return false;
    }
  }
}

/* ---------- 右键菜单 ---------- */
let menuEl;
export function closeMenu() {
  menuEl?.remove();
  menuEl = null;
}
export function showMenu(x, y, items) {
  closeMenu();
  menuEl = document.createElement('div');
  menuEl.className = 'menu';
  for (const it of items) {
    if (it === '-') {
      menuEl.appendChild(document.createElement('hr'));
      continue;
    }
    const b = document.createElement('button');
    b.textContent = it.label;
    if (it.danger) b.className = 'danger';
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      closeMenu();
      it.action();
    });
    menuEl.appendChild(b);
  }
  document.body.appendChild(menuEl);
  const r = menuEl.getBoundingClientRect();
  menuEl.style.left = Math.max(6, Math.min(x, innerWidth - r.width - 6)) + 'px';
  menuEl.style.top = Math.max(6, Math.min(y, innerHeight - r.height - 6)) + 'px';
}
document.addEventListener('mousedown', (e) => {
  if (menuEl && !menuEl.contains(e.target)) closeMenu();
});
window.addEventListener('blur', closeMenu);

/* ---------- 对话框 ---------- */
export function openDialog({ title, body, okText = '确定', onOk, danger = false }) {
  const mask = document.createElement('div');
  mask.className = 'dialog-mask';
  mask.innerHTML = `<form class="dialog"><h3>${esc(title)}</h3><div class="dialog-body"></div>
    <div class="actions"><button type="button" class="btn" data-cancel>取消</button>
    <button type="submit" class="btn primary ${danger ? 'danger-fill' : ''}">${esc(okText)}</button></div></form>`;
  const form = mask.querySelector('form');
  const bodyEl = mask.querySelector('.dialog-body');
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body) bodyEl.appendChild(body);
  const close = () => {
    mask.remove();
    document.removeEventListener('keydown', onKey, true);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener('keydown', onKey, true);
  mask.addEventListener('mousedown', (e) => e.target === mask && close());
  mask.querySelector('[data-cancel]').addEventListener('click', close);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const keep = await onOk?.(form);
      if (keep !== false) close();
    } catch (err) {
      toast(err.message || String(err), 'error');
    }
  });
  document.body.appendChild(mask);
  setTimeout(() => form.querySelector('input, textarea, select, button[type=submit]')?.focus(), 30);
  return { close, form };
}

export function confirmDialog(title, message, okText = '确定') {
  return new Promise((resolve) => {
    let ok = false;
    const d = openDialog({
      title,
      body: `<p class="muted" style="margin:0">${esc(message)}</p>`,
      okText,
      danger: true,
      onOk: () => {
        ok = true;
      }
    });
    const obs = new MutationObserver(() => {
      if (!d.form.isConnected) {
        obs.disconnect();
        resolve(ok);
      }
    });
    obs.observe(document.body, { childList: true });
  });
}

/** 让 textarea 支持 Tab 缩进而不是切换焦点 */
export function enableTabIndent(ta) {
  ta.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    document.execCommand('insertText', false, '  ');
  });
}
