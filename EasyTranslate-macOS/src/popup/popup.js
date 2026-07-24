import { translateText } from '../lib/translate.js';
import { detectLanguage, defaultTarget, LANGUAGES } from '../lib/language.js';
import { generatePassword, calculatePasswordStrength } from '../lib/password.js';
import { formatJSON, compressJSON, validateJSON, getJSONStats, formatFileSize } from '../lib/json.js';
import {
  parseOtpAuthUri,
  generateTotp,
  getTotpRemaining,
  reorderAuthAccounts
} from '../authenticator/authenticator.js';
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
  setTimeout(() => focusTranslateInput(true), 100);
  window.addEventListener('focus', () => focusTranslateInput(true));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) setTimeout(() => focusTranslateInput(true), 40);
  });
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
      if (id === 'translate') setTimeout(() => focusTranslateInput(true), 60);
    });
  });
}

function focusTranslateInput(selectExisting = false) {
  const input = $('inputText');
  const panel = document.getElementById('panel-translate');
  if (!input || !panel?.classList.contains('active')) return;
  input.focus();
  if (selectExisting && input.value) input.select();
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
  let contextMenu = null;
  let remarkDialog = null;
  let draggingItem = null;
  let dragPointerId = null;
  let dragMoved = false;

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
    if (draggingItem) return;
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
      const remark = normalizeRemark(account.remark || '');
      const remarkHtml = remark ? `<span class="auth-remark">@${esc(remark)}</span>` : '';
      return `<div class="auth-item" data-id="${attr(account.id)}" title="拖拽排序">
        <button type="button" class="auth-drag-handle" aria-label="拖拽排序" title="拖拽排序">⠿</button>
        <div class="auth-meta">
          <strong>${esc(account.issuer || 'Authenticator')}</strong>
          <div class="auth-detail">
            <span class="auth-account">${esc(account.account || '')}</span>
            ${remarkHtml}
          </div>
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
      const existing = accounts.find((item) => item.id === account.id);
      if (existing?.remark) account.remark = normalizeRemark(existing.remark);
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
  listEl.addEventListener('contextmenu', (e) => {
    const item = e.target.closest('.auth-item');
    if (!item) return;
    e.preventDefault();
    showAuthContextMenu(item, e.clientX, e.clientY);
  });
  listEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('[data-act]')) return;
    const item = e.target.closest('.auth-item');
    if (!item) return;
    e.preventDefault();
    draggingItem = item;
    dragPointerId = e.pointerId;
    dragMoved = false;
    item.classList.add('is-dragging');
    listEl.classList.add('is-sorting');
    hideAuthContextMenu();
    item.setPointerCapture(e.pointerId);
  });
  listEl.addEventListener('pointermove', (e) => {
    if (!draggingItem || e.pointerId !== dragPointerId) return;
    e.preventDefault();
    const candidates = Array.from(listEl.querySelectorAll('.auth-item:not(.is-dragging)'));
    const nextItem = candidates.find((item) => {
      const rect = item.getBoundingClientRect();
      return e.clientY < rect.top + rect.height / 2;
    });
    if (nextItem && draggingItem.nextElementSibling !== nextItem) {
      listEl.insertBefore(draggingItem, nextItem);
      dragMoved = true;
    } else if (!nextItem && draggingItem !== listEl.lastElementChild) {
      listEl.appendChild(draggingItem);
      dragMoved = true;
    }
  });
  listEl.addEventListener('pointerup', async (e) => {
    if (!draggingItem || e.pointerId !== dragPointerId) return;
    e.preventDefault();
    await finishDrag(dragMoved);
  });
  listEl.addEventListener('pointercancel', async (e) => {
    if (!draggingItem || e.pointerId !== dragPointerId) return;
    await finishDrag(false);
  });

  async function finishDrag(shouldSave) {
    const dragged = draggingItem;
    draggingItem = null;
    dragPointerId = null;
    dragged.classList.remove('is-dragging');
    listEl.classList.remove('is-sorting');
    if (!shouldSave) {
      await render();
      return;
    }
    const orderedIds = Array.from(listEl.querySelectorAll('.auth-item'), (item) => item.dataset.id);
    const previousIds = accounts.map((account) => account.id);
    accounts = reorderAuthAccounts(accounts, orderedIds);
    if (JSON.stringify(previousIds) !== JSON.stringify(orderedIds)) {
      await save();
      toast('排序已保存', 'success');
    }
    await render();
  }
  document.addEventListener('paste', async (e) => {
    if (!activeAuthPanel()) return;
    const handled = await addFromClipboardEvent(e);
    if (handled) e.preventDefault();
  });
  document.addEventListener('click', hideAuthContextMenu);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideAuthContextMenu();
      closeRemarkDialog();
    }
  });
  window.addEventListener('blur', hideAuthContextMenu);
  window.addEventListener('focus', render);
  timer = setInterval(render, 1000);
  window.addEventListener('beforeunload', () => clearInterval(timer));
  load();

  function ensureAuthContextMenu() {
    if (contextMenu) return contextMenu;
    contextMenu = document.createElement('div');
    contextMenu.id = 'authContextMenu';
    contextMenu.className = 'auth-context-menu';
    contextMenu.hidden = true;
    contextMenu.innerHTML = `
      <button type="button" data-auth-menu-act="remark">添加/修改备注</button>
      <button type="button" data-auth-menu-act="clear">清除备注</button>
    `;
    contextMenu.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-auth-menu-act]');
      if (!btn) return;
      const id = contextMenu.dataset.id;
      hideAuthContextMenu();
      if (btn.dataset.authMenuAct === 'remark') editRemark(id);
      if (btn.dataset.authMenuAct === 'clear') await clearRemark(id);
    });
    document.body.appendChild(contextMenu);
    return contextMenu;
  }

  function showAuthContextMenu(item, x, y) {
    const menu = ensureAuthContextMenu();
    const account = accounts.find((entry) => entry.id === item.dataset.id);
    if (!account) return;
    menu.dataset.id = account.id;
    menu.querySelector('[data-auth-menu-act="clear"]').hidden = !account.remark;
    menu.hidden = false;
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
  }

  function hideAuthContextMenu() {
    if (contextMenu) contextMenu.hidden = true;
  }

  function ensureRemarkDialog() {
    if (remarkDialog) return remarkDialog;
    remarkDialog = document.createElement('div');
    remarkDialog.id = 'authRemarkDialog';
    remarkDialog.className = 'auth-remark-dialog';
    remarkDialog.hidden = true;
    remarkDialog.innerHTML = `
      <div class="auth-remark-backdrop" data-auth-remark-cancel></div>
      <form class="auth-remark-card">
        <label for="authRemarkInput">备注</label>
        <input id="authRemarkInput" class="field" type="text" maxlength="20" placeholder="20 个字符以内" />
        <div class="auth-remark-meta"><span id="authRemarkCount">0/20</span></div>
        <div class="auth-remark-actions">
          <button type="button" class="btn" data-auth-remark-cancel>取消</button>
          <button type="submit" class="btn btn-primary">保存</button>
        </div>
      </form>
    `;
    const input = remarkDialog.querySelector('#authRemarkInput');
    const updateCount = () => {
      const count = Array.from(input.value || '').length;
      remarkDialog.querySelector('#authRemarkCount').textContent = `${Math.min(count, 20)}/20`;
      if (count > 20) input.value = normalizeRemark(input.value);
    };
    input.addEventListener('input', updateCount);
    remarkDialog.addEventListener('click', (e) => {
      if (e.target.closest('[data-auth-remark-cancel]')) closeRemarkDialog();
    });
    remarkDialog.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await saveRemark(remarkDialog.dataset.id, input.value);
    });
    document.body.appendChild(remarkDialog);
    return remarkDialog;
  }

  function editRemark(id) {
    const account = accounts.find((entry) => entry.id === id);
    if (!account) return;
    const dialog = ensureRemarkDialog();
    const input = dialog.querySelector('#authRemarkInput');
    dialog.dataset.id = id;
    input.value = account.remark || '';
    dialog.querySelector('#authRemarkCount').textContent = `${Array.from(input.value).length}/20`;
    dialog.hidden = false;
    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  }

  function closeRemarkDialog() {
    if (!remarkDialog) return;
    remarkDialog.hidden = true;
    delete remarkDialog.dataset.id;
  }

  async function saveRemark(id, value) {
    const account = accounts.find((entry) => entry.id === id);
    if (!account) return;
    if (Array.from(String(value || '').trim()).length > 20) {
      showErr('备注不能超过 20 个字符');
      return;
    }
    const remark = normalizeRemark(value);
    if (remark) account.remark = remark;
    else delete account.remark;
    await save();
    await render();
    closeRemarkDialog();
    toast(remark ? '已保存备注' : '已清除备注', 'success');
  }

  async function clearRemark(id) {
    const account = accounts.find((entry) => entry.id === id);
    if (!account) return;
    delete account.remark;
    await save();
    await render();
    toast('已清除备注', 'success');
  }
}

function normalizeRemark(value) {
  return Array.from(String(value || '').trim()).slice(0, 20).join('');
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
    r.success
      ? ((editor.value = r.result), stats(), toast(r.loose ? '不是标准 JSON，已按符号换行' : '已格式化', 'success'))
      : showErr(r.error);
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
  if (sb) sb.addEventListener('click', async function() {
    try {
      await api.startCapture();
    } catch (e) {
      toast('截图启动失败，请检查录屏权限', 'error');
    }
  });
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
  if (api.onPopupShown) {
    api.onPopupShown(function() {
      setTimeout(function() { focusTranslateInput(true); }, 40);
    });
  }
  api.onTranslateSelection(function(text) {
    var tab = document.querySelector('[data-tab="translate"]');
    if (tab) tab.click();
    var input = document.getElementById('inputText');
    if (input) { input.value = text; input.dispatchEvent(new Event('input')); }
  });
}
