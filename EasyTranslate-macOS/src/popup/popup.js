import { translateText } from '../lib/translate.js';
import { detectLanguage, defaultTarget, LANGUAGES } from '../lib/language.js';
import { generatePassword, calculatePasswordStrength } from '../lib/password.js';
import { encodeBase64, decodeBase64, isValidBase64 } from '../lib/base64.js';
import { formatJSON, compressJSON, validateJSON, getJSONStats, formatFileSize } from '../lib/json.js';
import { copyToClipboard, toast, flashButton } from '../lib/ui.js';
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
  initBase64();
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

/* ===== Base64 ===== */
function initBase64() {
  const input = $('base64Input');
  const output = $('base64Output');
  $('encodeBtn').addEventListener('click', () => {
    if (!input.value) return toast('请输入文本', 'error');
    try {
      output.value = encodeBase64(input.value);
    } catch (e) {
      toast(e.message, 'error');
    }
  });
  $('decodeBtn').addEventListener('click', () => {
    if (!input.value) return toast('请输入 Base64 字符串', 'error');
    if (!isValidBase64(input.value.trim())) return toast('不是有效的 Base64 字符串', 'error');
    try {
      output.value = decodeBase64(input.value.trim());
    } catch (e) {
      toast(e.message, 'error');
    }
  });
  $('b64ClearBtn').addEventListener('click', () => {
    input.value = '';
    output.value = '';
  });
  $('b64CopyBtn').addEventListener('click', async (e) => {
    if (!output.value) return toast('没有可复制的结果', 'error');
    (await copyToClipboard(output.value))
      ? (flashButton(e.target, '✓ 已复制'), toast('已复制', 'success'))
      : toast('复制失败', 'error');
  });
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
    window.electronAPI && window.electronAPI.openJsonWindow(document.getElementById('jsonEditor')&&document.getElementById('jsonEditor').value||undefined);
  };
  $('jsonOpenBtn').addEventListener('click', openFullPage);

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
        await api.openJsonWindow(draft || undefined);
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
