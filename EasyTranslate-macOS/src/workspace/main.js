// 工作台：JSON 编辑器 + 树视图，编码转换
import { api } from '../ui/api.js';
import { $, $$, debounce, toast, copyText } from '../ui/dom.js';
import { hydrateIcons } from '../ui/icons.js';
import {
  parseSmart, formatJson, minifyJson, escapeJsonString, unescapeJsonString, sortKeysDeep,
  textStats, formatBytes, SAMPLE_JSON
} from '../core/json.js';
import { unicodeEscape, unicodeUnescape, base64Encode, base64Decode, urlEncode, urlDecode, htmlEscape, htmlUnescape } from '../core/codec.js';
import { createEditor } from './editor.js';
import { createTree } from './tree.js';

hydrateIcons();
if (api.mock || api.platform !== 'darwin') document.body.classList.add('no-vibrancy');

/* ================= 工具切换 ================= */
function switchTool(tool) {
  $$('#toolSeg button').forEach((b) => b.classList.toggle('on', b.dataset.tool === tool));
  $$('.tool').forEach((s) => s.classList.toggle('on', s.id === `tool-${tool}`));
  if (tool === 'json') editor.focus();
  else $('#cIn').focus();
}
$('#toolSeg').addEventListener('click', (e) => e.target.dataset.tool && switchTool(e.target.dataset.tool));
$('#pinBtn').addEventListener('click', async () => {
  const on = await api.invoke('workspace:toggle-pin');
  $('#pinBtn').classList.toggle('on', !!on);
  toast(on ? '窗口已置顶' : '已取消置顶');
});

/* ================= JSON ================= */
const stateEl = $('#state');
const pathEl = $('#path');
let lastError = null;
let indent = '2';

const tree = createTree($('#tree'), {
  onSelect(node) {
    pathEl.textContent = node.path;
  }
});

const editor = createEditor($('#editor'), {
  onChange: () => {
    refresh();
    saveDraft();
  },
  onCursor: ({ line, col }) => ($('#cursor').textContent = `行 ${line}，列 ${col}`)
});

function setState(kind, text) {
  stateEl.className = 'state' + (kind ? ' ' + kind : '');
  stateEl.textContent = text;
  stateEl.title = text;
}

const refresh = debounce(() => {
  const text = editor.value;
  const s = textStats(text);
  $('#stats').textContent = s.chars ? `${s.chars.toLocaleString()} 字符 · ${s.lines.toLocaleString()} 行 · ${formatBytes(s.bytes)}` : '';
  lastError = null;
  if (!text.trim()) {
    setState('', '');
    tree.showEmpty();
    return;
  }
  const r = parseSmart(text);
  if (r.ok) {
    setState('ok', r.unwrapped ? `有效 JSON（含 ${r.unwrapped} 层转义）` : '有效 JSON');
    tree.render(r.value);
    const q = $('#treeSearch').value;
    if (q) updateSearch();
  } else {
    lastError = r.error;
    const where = r.error.line ? `第 ${r.error.line} 行 ${r.error.column} 列：` : '';
    setState('err', where + r.error.message);
    tree.showError(where + r.error.message);
  }
}, 200);

const saveDraft = debounce(() => api.invoke('draft:set', 'workspace-json', editor.value), 800);

function apply(fn) {
  const text = editor.value;
  if (!text.trim()) return toast('请先输入内容', 'error');
  try {
    const out = fn(text);
    if (out == null) return;
    editor.setValue(out);
  } catch (e) {
    toast(e.message || String(e), 'error');
  }
}

function applyToSelection(fn) {
  const sel = editor.selection();
  try {
    if (sel) editor.replaceRange(sel.from, sel.to, fn(sel.text));
    else apply(fn);
  } catch (e) {
    toast(e.message || String(e), 'error');
  }
}

function doFormat() {
  apply((t) => {
    const r = formatJson(t, { indent });
    if (!r.ok) throw new Error(r.error.message);
    if (r.loose) toast('不是标准 JSON，已按结构排版');
    return r.text;
  });
}
function doMinify() {
  apply((t) => {
    const r = minifyJson(t);
    if (!r.ok) throw new Error(r.error.message);
    return r.text;
  });
}

$('#fmt').addEventListener('click', doFormat);
$('#min').addEventListener('click', doMinify);
$('#sort').addEventListener('click', () =>
  apply((t) => {
    const r = parseSmart(t);
    if (!r.ok) throw new Error(r.error.message);
    return JSON.stringify(sortKeysDeep(r.value), null, indent === 'tab' ? '\t' : Number(indent));
  })
);
$('#esc').addEventListener('click', () => applyToSelection(escapeJsonString));
$('#unesc').addEventListener('click', () => applyToSelection(unescapeJsonString));
$('#toU').addEventListener('click', () => applyToSelection(unicodeEscape));
$('#fromU').addEventListener('click', () => applyToSelection(unicodeUnescape));
$('#indent').addEventListener('change', (e) => {
  indent = e.target.value;
  editor.setIndent(indent);
});
$('#copyAll').addEventListener('click', () => copyText(editor.value));
$('#sample').addEventListener('click', () => editor.setValue(SAMPLE_JSON));
$('#clear').addEventListener('click', () => editor.setValue(''));
$('#download').addEventListener('click', saveFile);
$('#openFile').addEventListener('click', () => $('#fileInput').click());
$('#fileInput').addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  if (f.size > 50 * 1024 * 1024) return toast('文件过大（超过 50 MB）', 'error');
  editor.setValue(await f.text());
  e.target.value = '';
  toast(`已打开 ${f.name}`);
});
stateEl.addEventListener('click', () => lastError?.line && editor.goto(lastError.line, lastError.column));
pathEl.addEventListener('click', () => pathEl.textContent && copyText(pathEl.textContent, '路径已复制'));

function saveFile() {
  const text = editor.value;
  if (!text) return toast('没有内容', 'error');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = 'data.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* 拖入文件 */
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', async (e) => {
  e.preventDefault();
  const f = e.dataTransfer?.files?.[0];
  if (f) {
    editor.setValue(await f.text());
    switchTool('json');
  }
});

/* 树：层级 / 搜索 */
$('#levelSeg').addEventListener('click', (e) => {
  const lv = Number(e.target.dataset.level);
  if (lv) tree.expandLevel(lv);
});
function updateSearch() {
  const n = tree.search($('#treeSearch').value);
  $('#treeCount').textContent = $('#treeSearch').value ? (n ? `${n} 个结果` : '无结果') : '';
  if (n) showStep(tree.step(1));
}
function showStep(r) {
  if (r.total) $('#treeCount').textContent = `${r.index}/${r.total}`;
}
$('#treeSearch').addEventListener('input', debounce(updateSearch, 200));
$('#treeSearch').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') showStep(tree.step(e.shiftKey ? -1 : 1));
  if (e.key === 'Escape') {
    e.target.value = '';
    updateSearch();
  }
});
$('#treePrev').addEventListener('click', () => showStep(tree.step(-1)));
$('#treeNext').addEventListener('click', () => showStep(tree.step(1)));

/* 分栏拖拽 */
(() => {
  const sp = $('#splitter');
  const left = $('#editorPane');
  sp.addEventListener('pointerdown', (e) => {
    sp.setPointerCapture(e.pointerId);
    sp.classList.add('drag');
    const total = $('#panes').clientWidth;
    const move = (ev) => {
      const pct = Math.min(80, Math.max(20, ((ev.clientX - $('#panes').getBoundingClientRect().left) / total) * 100));
      left.style.flexBasis = pct + '%';
    };
    const up = () => {
      sp.classList.remove('drag');
      sp.removeEventListener('pointermove', move);
      sp.removeEventListener('pointerup', up);
    };
    sp.addEventListener('pointermove', move);
    sp.addEventListener('pointerup', up);
  });
})();

/* ================= 编码 ================= */
const CODECS = {
  base64: [(t) => base64Encode(t, { urlSafe: $('#cSafe').checked }), base64Decode],
  url: [urlEncode, urlDecode],
  unicode: [unicodeEscape, unicodeUnescape],
  html: [htmlEscape, htmlUnescape]
};
let cMode = 'base64';
let cDir = 0;
function convert() {
  const t = $('#cIn').value;
  const out = $('#cOut');
  $('#cInStat').textContent = t ? `${t.length} 字符` : '';
  out.classList.remove('error');
  if (!t) return (out.value = '');
  try {
    out.value = CODECS[cMode][cDir](t);
  } catch (e) {
    out.value = e.message;
    out.classList.add('error');
  }
}
$('#cMode').addEventListener('click', (e) => {
  if (!e.target.dataset.mode) return;
  cMode = e.target.dataset.mode;
  $$('#cMode button').forEach((b) => b.classList.toggle('on', b === e.target));
  $('#cSafeWrap').classList.toggle('hidden', cMode !== 'base64');
  convert();
});
$('#cDir').addEventListener('click', (e) => {
  if (!e.target.dataset.dir) return;
  cDir = e.target.dataset.dir === 'encode' ? 0 : 1;
  $$('#cDir button').forEach((b) => b.classList.toggle('on', b === e.target));
  convert();
});
$('#cSafe').addEventListener('change', convert);
$('#cIn').addEventListener('input', debounce(convert, 60));
$('#cCopy').addEventListener('click', () => !$('#cOut').classList.contains('error') && copyText($('#cOut').value));
$('#cSwap').addEventListener('click', () => {
  if ($('#cOut').classList.contains('error')) return;
  $('#cIn').value = $('#cOut').value;
  $(`#cDir button[data-dir="${cDir ? 'encode' : 'decode'}"]`).click();
});

/* ================= 快捷键 ================= */
document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return;
  const k = e.key.toLowerCase();
  if (k === 's') {
    e.preventDefault();
    saveFile();
  } else if (k === 'o') {
    e.preventDefault();
    $('#fileInput').click();
  } else if (e.shiftKey && k === 'f') {
    e.preventDefault();
    doFormat();
  } else if (e.shiftKey && k === 'm') {
    e.preventDefault();
    doMinify();
  } else if (k === '1' || k === '2') {
    e.preventDefault();
    switchTool(k === '1' ? 'json' : 'codec');
  }
});

/* ================= 外部打开 ================= */
api.on('workspace:open', (msg = {}) => {
  switchTool(msg.tool === 'codec' ? 'codec' : 'json');
  if (typeof msg.text === 'string' && msg.text.trim()) {
    if (msg.tool === 'codec') {
      $('#cIn').value = msg.text;
      convert();
    } else {
      const r = formatJson(msg.text, { indent });
      editor.setValue(r.ok ? r.text : msg.text);
    }
  }
});

api.invoke('draft:get', 'workspace-json').then((v) => {
  if (v && !editor.value) editor.setValue(v);
  else refresh();
});
