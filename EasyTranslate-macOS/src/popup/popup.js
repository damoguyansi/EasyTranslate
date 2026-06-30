import { translateText } from '../lib/translate.js';
import { detectLanguage, defaultTarget, LANGUAGES } from '../lib/language.js';
import { generatePassword, calculatePasswordStrength } from '../lib/password.js';
import { formatJSON, compressJSON, validateJSON, getJSONStats, formatFileSize } from '../lib/json.js';
import { parseOtpAuthUri, generateTotp, getTotpRemaining } from '../authenticator/authenticator.js';
import { copyToClipboard, toast, flashButton } from '../lib/ui.js';
import jsQR from 'jsqr';
import {
  getHistory,
  addHistory,
  clearHistory,
  getTheme,
  setTheme
} from '../storage-ipc.js';

const $ = (id) => document.getElementById(id);
const debounce = (fn, d) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), d);
  };
};

document.addEventListener('DOMContentLoaded', async () => {
  await initTheme();
  initTabs();
  initTranslate();
  initPassword();
  initAuth();
  initJSON();
  initMacOS();
  setTimeout(() => $('inputText')?.focus(), 100);
});

/* ===== 主题 ===== */
async function initTheme() {
  const saved = await getTheme();
  applyTheme(saved);
  $('themeToggle').addEventListener('click', async () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    await setTheme(next);
  });
}
function applyTheme(theme) {
  const resolved =
    theme === 'auto'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme;
  document.documentElement.setAttribute('data-theme', resolved);
}

/* ===== 标签切换 ===== */
function initTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const id = tab.dataset.tab;
      tabs.forEach((t) => t.classList.toggle('active', t === tab));
      document.querySelectorAll('.panel').forEach((p) => {
        p.classList.toggle('active', p.id === `panel-${id}`);
      });
      if (id === 'translate') setTimeout(() => $('inputText').focus(), 60);
    });
  });
}

/* ===== 翻译 ===== */
function initTranslate() {
  const input = $('inputText');
  const output = $('outputText');
  const from = $('sourceLang');
  const to = $('targetLang');
  const count = $('charCount');

  const badge = $('detectBadge');

  // 解析实际的源/目标语言（处理"自动检测"与源=目标的情况）
  const resolveLangs = (text) => {
    let resolvedFrom = from.value;
    if (resolvedFrom === 'auto') {
      resolvedFrom = detectLanguage(text);
      badge.style.display = 'inline-block';
      badge.textContent = `检测到：${LANGUAGES[resolvedFrom] || resolvedFrom}`;
    } else {
      badge.style.display = 'none';
    }
    let resolvedTo = to.value;
    if (resolvedTo === resolvedFrom) resolvedTo = defaultTarget(resolvedFrom);
    return { resolvedFrom, resolvedTo };
  };

  const doTranslate = () => {
    const text = input.value.trim();
    if (!text) {
      output.value = '';
      badge.style.display = 'none';
      return;
    }
    const { resolvedFrom, resolvedTo } = resolveLangs(text);
    output.value = '翻译中…';
    translateText(text, resolvedFrom, resolvedTo)
      .then((res) => {
        output.value = res;
        addHistory({ source: text, target: res, from: resolvedFrom, to: resolvedTo }).then(
          renderHistory
        );
      })
      .catch((e) => (output.value = '翻译失败: ' + e.message));
  };
  const debounced = debounce(doTranslate, 600);

  input.addEventListener('input', () => {
    let len = input.value.length;
    if (len > 500) {
      input.value = input.value.slice(0, 500);
      len = 500;
    }
    count.textContent = `${len} / 500`;
    if (input.value.trim()) debounced();
    else {
      output.value = '';
      badge.style.display = 'none';
    }
  });

  from.addEventListener('change', doTranslate);
  to.addEventListener('change', doTranslate);
  $('switchLang').addEventListener('click', () => {
    // 自动检测时，先把检测到的语言固化再互换
    let f = from.value === 'auto' ? detectLanguage(input.value.trim() || output.value) : from.value;
    from.value = to.value;
    to.value = f;
    doTranslate();
  });
  $('clearTranslate').addEventListener('click', () => {
    input.value = '';
    output.value = '';
    count.textContent = '0 / 500';
    input.focus();
  });
  $('copyTranslate').addEventListener('click', async (e) => {
    if (!output.value) return toast('没有可复制的译文', 'error');
    (await copyToClipboard(output.value))
      ? (flashButton(e.target, '✓ 已复制'), toast('已复制译文', 'success'))
      : toast('复制失败', 'error');
  });

  $('clearHistory').addEventListener('click', async () => {
    await clearHistory();
    renderHistory();
    toast('已清空历史', 'success');
  });

  // 点击历史回填
  $('historyList').addEventListener('click', (e) => {
    const item = e.target.closest('.history-item');
    if (!item) return;
    input.value = item.dataset.source;
    from.value = item.dataset.from;
    to.value = item.dataset.to;
    output.value = item.dataset.target;
    $('charCount').textContent = `${input.value.length} / 500`;
  });

  renderHistory();
}

async function renderHistory() {
  const list = await getHistory();
  const box = $('historyList');
  if (!list.length) {
    box.innerHTML = '<div class="history-empty">暂无翻译记录</div>';
    return;
  }
  box.innerHTML = list
    .map(
      (h) => `<div class="history-item" data-source="${attr(h.source)}" data-target="${attr(
        h.target
      )}" data-from="${h.from}" data-to="${h.to}">
        <div class="hi-src">${esc(h.source)}</div>
        <div class="hi-tgt">${esc(h.target)}</div>
      </div>`
    )
    .join('');
}
const esc = (s) =>
  String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const attr = (s) => esc(s).replace(/"/g, '&quot;');

/* ===== 密码 ===== */
function initPassword() {
  const display = $('passwordDisplay');
  const slider = $('lengthSlider');
  const lenNum = $('lengthValue');

  const opts = () => ({
    length: parseInt(slider.value, 10),
    includeNumbers: $('includeNumbers').checked,
    includeLowercase: $('includeLowercase').checked,
    includeUppercase: $('includeUppercase').checked,
    includeSymbols: $('includeSymbols').checked,
    excludeChars: $('excludeChars').value
  });

  const gen = () => {
    const pw = generatePassword(opts());
    display.value = pw;
    const s = calculatePasswordStrength(pw);
    $('strengthFill').style.width = s.width + '%';
    $('strengthFill').style.background = s.color;
    $('strengthText').textContent = `密码强度：${s.text}`;
  };

  $('generateBtn').addEventListener('click', gen);
  $('copyPwBtn').addEventListener('click', async (e) => {
    if (!display.value) return toast('请先生成密码', 'error');
    (await copyToClipboard(display.value))
      ? toast('已复制密码', 'success')
      : toast('复制失败', 'error');
  });
  slider.addEventListener('input', () => {
    lenNum.value = slider.value;
    gen();
  });
  lenNum.addEventListener('input', () => {
    let v = parseInt(lenNum.value, 10) || 16;
    v = Math.min(64, Math.max(8, v));
    lenNum.value = v;
    slider.value = v;
    gen();
  });
  ['includeNumbers', 'includeLowercase', 'includeUppercase', 'includeSymbols'].forEach((id) =>
    $(id).addEventListener('change', gen)
  );
  $('excludeChars').addEventListener('input', gen);
  gen();
}

/* ===== Authenticator ===== */
function initAuth() {
  const listEl = $('authList');
  const errBox = $('authError');
  let accounts = [];
  let timer = null;

  const showErr = (msg) => {
    errBox.textContent = msg;
    errBox.classList.add('show');
  };
  const hideErr = () => errBox.classList.remove('show');
  const save = () => window.electronAPI.setAuthAccounts(accounts);
  const load = async () => {
    accounts = await window.electronAPI.getAuthAccounts();
    if (!Array.isArray(accounts)) accounts = [];
    await render();
  };
  const activeAuthPanel = () => document.getElementById('panel-auth')?.classList.contains('active');

  async function render() {
    if (!accounts.length) {
      listEl.innerHTML = '<div class="auth-empty">暂无账号，复制二维码图片后按 Ctrl+V 添加</div>';
      return;
    }
    const now = Date.now();
    const rows = await Promise.all(accounts.map(async (account) => {
      let code = '------';
      try {
        code = await generateTotp(account, now);
      } catch {
        code = '错误';
      }
      return `<div class="auth-item" data-id="${attr(account.id)}">
        <div class="auth-meta">
          <strong>${esc(account.issuer || 'Authenticator')}</strong>
          <span>${esc(account.account || '')}</span>
        </div>
        <button class="auth-code mono" data-act="copy" data-code="${attr(code)}">${esc(code)}</button>
        <span class="auth-left">${getTotpRemaining(account, now)}s</span>
        <button class="link-btn auth-delete" data-act="delete">删除</button>
      </div>`;
    }));
    listEl.innerHTML = rows.join('');
  }

  async function addFromText(text) {
    hideErr();
    try {
      const account = parseOtpAuthUri(text);
      accounts = [account].concat(accounts.filter((item) => item.id !== account.id));
      await save();
      await render();
      toast('已添加 Auth 账号', 'success');
    } catch (e) {
      showErr(e.message || '添加失败');
    }
  }

  async function addFromClipboardEvent(event) {
    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find((item) => item.kind === 'file' && item.type.startsWith('image/'));
    if (imageItem) {
      const file = imageItem.getAsFile();
      try {
        const text = await decodeQrFile(file);
        await addFromText(text);
        return true;
      } catch (e) {
        showErr(e.message || '未识别到二维码');
        return true;
      }
    }
    const textItem = items.find((item) => item.kind === 'string' && item.type === 'text/plain');
    if (textItem) {
      textItem.getAsString(addFromText);
      return true;
    }
    return false;
  }

  $('authPasteBtn').addEventListener('click', async () => {
    hideErr();
    try {
      const text = await readClipboardAuthText();
      await addFromText(text);
    } catch (e) {
      showErr(e.message || '请在 Auth 页按 Ctrl+V 粘贴二维码图片');
    }
  });

  async function readClipboardAuthText() {
    if (navigator.clipboard?.read) {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith('image/'));
        if (!imageType) continue;
        return decodeQrFile(await item.getType(imageType));
      }
    }
    if (navigator.clipboard?.readText) {
      const text = await navigator.clipboard.readText();
      if (text) return text;
    }
    throw new Error('请复制 Authenticator 二维码图片后按 Ctrl+V');
  }
  $('authRefreshBtn').addEventListener('click', render);
  listEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    const item = e.target.closest('.auth-item');
    if (!btn || !item) return;
    if (btn.dataset.act === 'copy') {
      (await copyToClipboard(btn.dataset.code))
        ? (flashButton(btn, '已复制'), toast('已复制验证码', 'success'))
        : toast('复制失败', 'error');
    }
    if (btn.dataset.act === 'delete') {
      accounts = accounts.filter((account) => account.id !== item.dataset.id);
      await save();
      await render();
      toast('已删除', 'success');
    }
  });
  document.addEventListener('paste', async (e) => {
    if (!activeAuthPanel()) return;
    const handled = await addFromClipboardEvent(e);
    if (handled) e.preventDefault();
  });
  window.addEventListener('focus', render);
  timer = setInterval(render, 1000);
  window.addEventListener('beforeunload', () => clearInterval(timer));
  load();
}

async function decodeQrFile(file) {
  if (!file) throw new Error('剪贴板里没有图片');
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  const qr = scanQrCanvas(ctx, canvas.width, canvas.height);
  if (!qr?.data) throw new Error('未识别到 Authenticator 二维码');
  return qr.data;
}

function scanQrCanvas(ctx, width, height) {
  const candidates = [
    [0, 0, width, height],
    [Math.round(width * 0.15), Math.round(height * 0.12), Math.round(width * 0.7), Math.round(height * 0.62)],
    [Math.round(width * 0.2), Math.round(height * 0.15), Math.round(width * 0.5), Math.round(height * 0.55)]
  ];
  for (const rect of candidates) {
    const qr = scanQrRect(ctx, rect);
    if (qr) return qr;
  }
  return null;
}

function scanQrRect(ctx, rect) {
  const [x, y, w, h] = rect;
  if (w < 32 || h < 32) return null;
  const imageData = ctx.getImageData(x, y, w, h);
  return jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
}

/* ===== JSON ===== */
function initJSON() {
  const editor = $('jsonEditor');
  const errBox = $('jsonError');
  const showErr = (m) => {
    errBox.textContent = m;
    errBox.classList.add('show');
  };
  const hideErr = () => errBox.classList.remove('show');
  const stats = () => {
    const s = getJSONStats(editor.value);
    $('jsonChars').textContent = s.chars;
    $('jsonLines').textContent = s.lines;
    $('jsonSize').textContent = formatFileSize(s.size);
  };

  $('jsonFormatBtn').addEventListener('click', () => {
    hideErr();
    if (!editor.value) return toast('请输入 JSON', 'error');
    const r = formatJSON(editor.value, 2);
    r.success ? ((editor.value = r.result), stats(), toast('已格式化', 'success')) : showErr(r.error);
  });
  $('jsonCompressBtn').addEventListener('click', () => {
    hideErr();
    if (!editor.value) return toast('请输入 JSON', 'error');
    const r = compressJSON(editor.value);
    r.success ? ((editor.value = r.result), stats(), toast('已压缩', 'success')) : showErr(r.error);
  });
  $('jsonValidateBtn').addEventListener('click', () => {
    hideErr();
    if (!editor.value) return toast('请输入 JSON', 'error');
    const r = validateJSON(editor.value);
    r.success ? toast('JSON 格式正确 ✓', 'success') : showErr(r.error);
  });
  $('jsonCopyBtn').addEventListener('click', async (e) => {
    if (!editor.value) return toast('没有可复制的内容', 'error');
    (await copyToClipboard(editor.value))
      ? (flashButton(e.target, '✓ 已复制'), toast('已复制', 'success'))
      : toast('复制失败', 'error');
  });
  $('jsonClearBtn').addEventListener('click', () => {
    editor.value = '';
    hideErr();
    stats();
  });
  const openFullPage = async () => {
    // 大文本通过 storage 传递，避免 URL 长度限制
    window.electronAPI && window.electronAPI.openToolsWindow('json', document.getElementById('jsonEditor')&&document.getElementById('jsonEditor').value||undefined);
  };
  $('jsonOpenBtn').addEventListener('click', openFullPage);
  $('base64OpenBtn').addEventListener('click', () => {
    window.electronAPI && window.electronAPI.openToolsWindow('base64');
  });

  const LARGE = 5000;
  editor.addEventListener('input', () => {
    hideErr();
    stats();
    // 大文本提示在完整页面处理
    const hint = $('jsonBigHint');
    if (hint) hint.style.display = editor.value.length > LARGE ? 'flex' : 'none';
  });
  $('jsonBigOpen')?.addEventListener('click', openFullPage);
  stats();
}

/* ===== macOS Adapter ===== */
function initMacOS() {
  const api = window.electronAPI;
  if (!api) return;
  // 截图：触发全屏标注覆盖层（弹窗会因失焦自动隐藏）
  var sb = document.getElementById('screenshotBtn');
  if (sb) sb.addEventListener('click', function() { api.startCapture(); });
  // 菜单栏弹窗风格：无自定义标题栏按钮，窗口靠托盘点击/失焦控制
  ['jsonOpenBtn','jsonBigOpen'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) {
      var fresh = el.cloneNode(true);
      el.parentNode.replaceChild(fresh, el);
      fresh.addEventListener('click', async function() {
        var draft = document.getElementById('jsonEditor') && document.getElementById('jsonEditor').value;
        await api.openToolsWindow('json', draft || undefined);
      });
    }
  });
  var lc = document.getElementById('loginItemCheck');
  if (lc) {
    api.getLoginItem().then(function(v) { lc.checked = !!v; });
    lc.addEventListener('change', function() { api.setLoginItem(lc.checked); });
  }
  var fl = document.getElementById('feedbackLink');
  if (fl) fl.addEventListener('click', function(e) {
    e.preventDefault();
    api.openUrl('https://github.com/damoguyansi/EasyTranslate');
  });
  api.onThemeChange(function(theme) {
    var resolved = theme === 'auto'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme;
    document.documentElement.setAttribute('data-theme', resolved);
  });
  api.onTranslateSelection(function(text) {
    var tab = document.querySelector('[data-tab="translate"]');
    if (tab) tab.click();
    var input = document.getElementById('inputText');
    if (input) { input.value = text; input.dispatchEvent(new Event('input')); }
  });
}
