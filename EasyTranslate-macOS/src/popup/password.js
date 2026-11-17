// 密码视图：实时生成、强度显示、候选列表，选项自动记忆
import { $, $$, esc, copyText, debounce } from '../ui/dom.js';
import { generatePassword, passwordStrength, DEFAULT_PASSWORD_OPTIONS } from '../core/password.js';
import { state, saveSettings } from './state.js';

export function initPassword() {
  const value = $('#pwValue');
  const range = $('#pwLength');
  const num = $('#pwLengthNum');
  const exclude = $('#pwExclude');
  const more = $('#pwMore');
  const opts = { ...DEFAULT_PASSWORD_OPTIONS, ...(state.settings.password || {}) };
  let current = '';

  const persist = debounce(() => saveSettings({ password: { ...opts } }), 500);

  const LEVELS = {
    0: { width: 0, color: 'var(--line-strong)' },
    1: { width: 30, color: 'var(--danger)' },
    2: { width: 55, color: 'var(--warning)' },
    3: { width: 80, color: 'var(--success)' },
    4: { width: 100, color: 'var(--success)' }
  };

  function setStrength(level, text) {
    const l = LEVELS[level] || LEVELS[0];
    $('#pwFill').style.width = l.width + '%';
    $('#pwFill').style.background = l.color;
    $('#pwStrength').textContent = text;
  }

  function generate() {
    try {
      current = generatePassword(opts);
      value.value = current;
      const s = passwordStrength(current);
      setStrength(s.level, `密码强度：${s.label}`);
      $('#pwStrength').title = `约 ${s.bits} bits 熵`;
      more.innerHTML = Array.from({ length: 6 }, () => {
        const p = generatePassword(opts);
        return `<button data-pw="${esc(p)}" title="${esc(p)}">${esc(p)}</button>`;
      }).join('');
    } catch (e) {
      current = '';
      value.value = e.message;
      setStrength(0, '密码强度：—');
      more.innerHTML = '';
    }
  }

  function syncUi() {
    range.value = num.value = opts.length;
    exclude.value = opts.exclude || '';
    $$('#pwChips .chip').forEach((c) => c.classList.toggle('on', !!opts[c.dataset.opt]));
  }

  function setLength(v) {
    opts.length = Math.min(64, Math.max(4, Number(v) || 16));
    range.value = opts.length;
    if (document.activeElement !== num) num.value = opts.length;
    generate();
    persist();
  }

  range.addEventListener('input', () => setLength(range.value));
  num.addEventListener('change', () => {
    setLength(num.value);
    num.value = opts.length;
  });
  exclude.addEventListener('input', () => {
    opts.exclude = exclude.value;
    generate();
    persist();
  });
  $('#pwChips').addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    const key = c.dataset.opt;
    opts[key] = !opts[key];
    const anyClass = ['uppercase', 'lowercase', 'numbers', 'symbols'].some((k) => opts[k]);
    if (!anyClass) opts[key] = true; // 至少保留一种字符类型
    syncUi();
    generate();
    persist();
  });
  $('#pwRegen').addEventListener('click', generate);
  $('#pwCopy').addEventListener('click', () => copyText(current, '密码已复制'));
  more.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pw]');
    if (b) copyText(b.dataset.pw, '密码已复制');
  });
  document.addEventListener('keydown', (e) => {
    if (!$('#view-password').classList.contains('on')) return;
    if (document.activeElement?.matches('input, textarea')) return;
    if (e.key === 'r' && !e.metaKey && !e.ctrlKey) generate();
    if ((e.metaKey || e.ctrlKey) && e.key === 'c' && !window.getSelection().toString()) {
      e.preventDefault();
      copyText(current, '密码已复制');
    }
  });

  syncUi();
  generate();
  return { focus: () => $('#pwCopy').focus() };
}
