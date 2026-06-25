/** 复制文本到剪贴板（带降级方案）。 */
export async function copyToClipboard(text) {
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

let toastTimer = null;

/** 轻量级 Toast 提示。 */
export function toast(message, type = 'info') {
  let el = document.getElementById('et-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'et-toast';
    el.className = 'et-toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.dataset.type = type;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

/** 给按钮一个临时的“已完成”反馈。 */
export function flashButton(btn, label = '✓ 已复制') {
  if (!btn) return;
  const original = btn.dataset.label || btn.textContent;
  btn.dataset.label = original;
  btn.textContent = label;
  btn.classList.add('is-done');
  setTimeout(() => {
    btn.textContent = original;
    btn.classList.remove('is-done');
  }, 1500);
}
