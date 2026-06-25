import {
  formatJSON,
  compressJSON,
  validateJSON,
  parseJSON,
  escapeString,
  unescapeString,
  toUnicode,
  fromUnicode,
  getJSONStats,
  formatFileSize
} from '../lib/json.js';
import { copyToClipboard, toast, flashButton } from '../lib/ui.js';
import { getTheme, setTheme } from '../storage-ipc.js';

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const SAMPLE = JSON.stringify(
  {
    name: 'EasyTranslate',
    version: '2.0.0',
    free: true,
    features: ['翻译', '密码生成', 'Base64', 'JSON'],
    author: { name: 'damoguyansi', email: 'damoguyansi@gmail.com' },
    rating: 4.8,
    tags: null
  },
  null,
  2
);


/* ===== macOS: module-level theme + IPC draft ===== */
function applyTheme(theme) {
  var resolved = theme === 'auto'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;
  document.documentElement.setAttribute('data-theme', resolved);
}

document.addEventListener('DOMContentLoaded', async () => {
  await initTheme();
  window.electronAPI && window.electronAPI.onThemeChange(function(theme) { applyTheme(theme); });
  // 窗口置顶（钉子）
  (function initPin() {
    var api = window.electronAPI, btn = document.getElementById('pinToggle');
    if (!api || !btn || !api.toggleJsonPin) { if (btn) btn.style.display = 'none'; return; }
    api.getJsonPin().then(function(v) { btn.classList.toggle('active', !!v); });
    btn.addEventListener('click', async function() {
      var on = await api.toggleJsonPin();
      btn.classList.toggle('active', !!on);
      btn.title = on ? '取消置顶' : '窗口置顶';
    });
  })();
  try {
    var _api = window.electronAPI;
    if (_api) {
      var _loadDraft = async function() {
        var _d = await _api.storageGet('jsonDraft', null);
        if (_d) {
          var _ed = document.getElementById('jsonEditor') || document.querySelector('textarea');
          if (_ed) { _ed.value = _d; await _api.storageDelete('jsonDraft'); }
        }
      };
      _loadDraft();
      _api.onLoadJsonDraft(_loadDraft);
    }
  } catch(e) {}


  const editor = $('jsonEditor');
  const errBox = $('errorMessage');
  const indent = $('indentSize');

  const showErr = (m) => {
    errBox.textContent = m;
    errBox.classList.add('show');
    $('validState').textContent = '✗ 格式错误';
    $('validState').dataset.ok = '0';
  };
  const hideErr = () => errBox.classList.remove('show');

  const refresh = () => {
    const s = getJSONStats(editor.value);
    $('charCount').textContent = s.chars;
    $('lineCount').textContent = s.lines;
    $('sizeCount').textContent = formatFileSize(s.size);
    renderGutter();
    renderTree();
  };

  const renderGutter = () => {
    const lines = editor.value.split('\n').length || 1;
    $('gutter').textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
  };

  const renderTree = () => {
    const view = $('treeView');
    if (!editor.value.trim()) {
      view.innerHTML = '<div class="tree-empty">解析成功后将在此显示树形结构</div>';
      $('rootType').textContent = '';
      $('validState').textContent = '—';
      $('validState').removeAttribute('data-ok');
      return;
    }
    const r = parseJSON(editor.value);
    if (!r.success) {
      view.innerHTML = '<div class="tree-empty">JSON 无效，无法生成树</div>';
      $('rootType').textContent = '';
      return;
    }
    $('validState').textContent = '✓ 有效 JSON';
    $('validState').dataset.ok = '1';
    $('rootType').textContent = describe(r.value);
    view.innerHTML = `<div class="tree-row">${buildNode(r.value, null, true)}</div>`;
    bindToggles(view);
  };

  // 工具栏
  $('formatBtn').addEventListener('click', () => {
    hideErr();
    if (!editor.value) return toast('请输入 JSON', 'error');
    const ind = indent.value === 'tab' ? '\t' : parseInt(indent.value, 10);
    const r = formatJSON(editor.value, ind);
    r.success ? ((editor.value = r.result), refresh(), toast('已格式化', 'success')) : showErr(r.error);
  });
  $('compressBtn').addEventListener('click', () => {
    hideErr();
    const r = compressJSON(editor.value);
    r.success ? ((editor.value = r.result), refresh(), toast('已压缩', 'success')) : showErr(r.error);
  });
  $('validateBtn').addEventListener('click', () => {
    hideErr();
    const r = validateJSON(editor.value);
    r.success ? toast('JSON 格式正确 ✓', 'success') : showErr(r.error);
  });
  $('escapeBtn').addEventListener('click', () => apply(escapeString, '已转义'));
  $('unescapeBtn').addEventListener('click', () => apply(unescapeString, '已去转义'));
  $('toUniBtn').addEventListener('click', () => apply(toUnicode, '已转 Unicode'));
  $('fromUniBtn').addEventListener('click', () => apply(fromUnicode, '已还原中文'));

  function apply(fn, okMsg) {
    hideErr();
    if (!editor.value) return toast('请输入内容', 'error');
    const r = fn(editor.value);
    r.success ? ((editor.value = r.result), refresh(), toast(okMsg, 'success')) : showErr(r.error);
  }

  $('copyBtn').addEventListener('click', async (e) => {
    if (!editor.value) return toast('没有可复制的内容', 'error');
    (await copyToClipboard(editor.value))
      ? (flashButton(e.target, '✓ 已复制'), toast('已复制', 'success'))
      : toast('复制失败', 'error');
  });
  $('downloadBtn').addEventListener('click', () => {
    if (!editor.value) return toast('没有可下载的内容', 'error');
    const blob = new Blob([editor.value], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'data.json';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('已下载 data.json', 'success');
  });
  $('sampleBtn').addEventListener('click', () => {
    editor.value = SAMPLE;
    hideErr();
    refresh();
  });
  $('clearBtn').addEventListener('click', () => {
    editor.value = '';
    hideErr();
    refresh();
  });
  $('expandAll').addEventListener('click', () =>
    $('treeView').querySelectorAll('.tnode').forEach((n) => n.classList.remove('tcollapsed'))
  );
  $('collapseAll').addEventListener('click', () =>
    $('treeView')
      .querySelectorAll('.tnode')
      .forEach((n, i) => i > 0 && n.classList.add('tcollapsed'))
  );

  editor.addEventListener('input', () => {
    hideErr();
    refresh();
  });
  editor.addEventListener('scroll', () => {
    $('gutter').scrollTop = editor.scrollTop;
  });
  // Tab 键插入缩进
  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = editor.selectionStart;
      const en = editor.selectionEnd;
      editor.value = editor.value.slice(0, s) + '  ' + editor.value.slice(en);
      editor.selectionStart = editor.selectionEnd = s + 2;
    }
  });

  // 从弹窗带入草稿（大文本通过 storage 传递）
  try {
    if (new URLSearchParams(location.search).get('from') === 'popup' && null) {
      const { jsonDraft } = await null.get('jsonDraft');
      if (jsonDraft) {
        editor.value = jsonDraft;
        await null.remove('jsonDraft');
      }
    }
  } catch {
    /* ignore */
  }
  refresh();
});

/* ===== 树构建 ===== */
function describe(v) {
  if (Array.isArray(v)) return `Array [${v.length}]`;
  if (v === null) return 'null';
  if (typeof v === 'object') return `Object {${Object.keys(v).length}}`;
  return typeof v;
}

function leaf(value) {
  if (value === null) return `<span class="tnull">null</span>`;
  switch (typeof value) {
    case 'string':
      return `<span class="tstr">"${esc(value)}"</span>`;
    case 'number':
      return `<span class="tnum">${value}</span>`;
    case 'boolean':
      return `<span class="tbool">${value}</span>`;
    default:
      return `<span>${esc(String(value))}</span>`;
  }
}

function buildNode(value, key) {
  const keyHtml =
    key === null ? '' : `<span class="tkey">"${esc(key)}"</span><span class="tpunc">: </span>`;
  const isArr = Array.isArray(value);
  const isObj = value && typeof value === 'object';

  if (!isObj) return `<div class="tleaf">${keyHtml}${leaf(value)}</div>`;

  const entries = isArr ? value.map((v, i) => [i, v]) : Object.entries(value);
  const open = isArr ? '[' : '{';
  const close = isArr ? ']' : '}';
  const count = entries.length;
  const children = entries.map(([k, v]) => buildNode(v, isArr ? null : k)).join('');
  const childHtml = children || `<div class="tleaf tpunc">（空）</div>`;

  return (
    `<div class="tnode">` +
    `<div class="tline"><span class="ttoggle">▾</span>${keyHtml}<span class="tpunc">${open}</span>` +
    `<span class="tcount">${count}</span>` +
    `<span class="tsummary">…<span class="tpunc">${close}</span></span></div>` +
    `<div class="tchildren">${childHtml}</div>` +
    `<div class="tclose tpunc">${close}</div>` +
    `</div>`
  );
}

function bindToggles(root) {
  root.querySelectorAll('.ttoggle').forEach((t) => {
    t.addEventListener('click', () => {
      const node = t.closest('.tnode');
      node.classList.toggle('tcollapsed');
      t.textContent = node.classList.contains('tcollapsed') ? '▸' : '▾';
    });
  });
}

/* ===== 主题 ===== */
async function initTheme() {
  apply(await getTheme());
  $('themeToggle').addEventListener('click', async () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    apply(next);
    await setTheme(next);
  });
  function apply(theme) {
    const resolved =
      theme === 'auto'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : theme;
    document.documentElement.setAttribute('data-theme', resolved);
  }
}
