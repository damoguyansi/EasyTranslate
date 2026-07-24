import {
  validateJSON,
  parseJSON,
  escapeString,
  unescapeString,
  toUnicode,
  fromUnicode,
  getJSONStats,
  formatFileSize,
  formatLooseText
} from '../lib/json.js';
import { encodeBase64, decodeBase64, isValidBase64 } from '../lib/base64.js';
import { copyToClipboard, toast, flashButton } from '../lib/ui.js';
import { getTheme, setTheme } from '../storage-ipc.js';
import { parseJsonSmart, tryParse, looksLikeJson } from './json-utils.js';
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { EditorView, Decoration, keymap, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { json } from '@codemirror/lang-json';
import { foldAll, foldGutter } from '@codemirror/language';
import { highlightSelectionMatches } from '@codemirror/search';

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const attr = (s) => esc(s).replace(/"/g, '&quot;');

const SAMPLE = JSON.stringify(
  {
    name: 'EasyTranslate',
    version: '2.0.2',
    free: true,
    features: ['翻译', '密码生成', 'Authenticator', 'Base64', 'JSON'],
    author: { name: 'damoguyansi', email: 'damoguyansi@gmail.com' },
    rating: 4.8,
    tags: null
  },
  null,
  2
);

const setSearchQuery = StateEffect.define();
const searchDecorations = StateField.define({
  create() {
    return Decoration.none;
  },
  update(value, tr) {
    let next = value.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setSearchQuery)) next = buildSearchDecorations(tr.state, effect.value);
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field)
});

let editorView = null;
let currentJsonValue = null;
const searchState = {
  editor: { matches: [], index: -1 },
  tree: { matches: [], index: -1 }
};
let activeSearchSide = 'editor';
let lastSearchSide = 'editor';

function applyTheme(theme) {
  const resolved = theme === 'auto'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;
  document.documentElement.setAttribute('data-theme', resolved);
}

document.addEventListener('DOMContentLoaded', async () => {
  await initTheme();
  initEditor();
  initToolTabs();
  initPin();
  initDraftLoading();
  initJsonTools();
  initSearch();
  initBase64();
  window.electronAPI && window.electronAPI.onThemeChange((theme) => applyTheme(theme));
  window.electronAPI && window.electronAPI.onLoadToolsTab((data) => switchToolTab(data && data.tab || 'json'));
  refresh();
});

function initEditor() {
  editorView = new EditorView({
    parent: $('jsonEditor'),
    state: EditorState.create({
      doc: '',
      extensions: [
        lineNumbers(),
        foldGutter(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        json(),
        searchDecorations,
        keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        EditorView.domEventHandlers({
          focus() {
            lastSearchSide = 'editor';
          },
          pointerdown() {
            lastSearchSide = 'editor';
          },
          keydown(event) {
            if (isFindShortcut(event) && isJsonTabActive()) {
              event.preventDefault();
              openSearchPanel('editor');
              return true;
            }
            return false;
          }
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            hideErr();
            refresh();
            if (!$('editorSearchPanel')?.hidden) refreshSearch(false, 'editor');
          }
        })
      ]
    })
  });
}

function getEditorValue() {
  return editorView ? editorView.state.doc.toString() : '';
}

function setEditorValue(value) {
  if (!editorView) return;
  editorView.dispatch({
    changes: { from: 0, to: editorView.state.doc.length, insert: value || '' }
  });
}

function initPin() {
  const api = window.electronAPI;
  const btn = $('pinToggle');
  if (!api || !btn || !api.toggleJsonPin) {
    if (btn) btn.style.display = 'none';
    return;
  }
  api.getJsonPin().then((v) => btn.classList.toggle('active', !!v));
  btn.addEventListener('click', async () => {
    const on = await api.toggleJsonPin();
    btn.classList.toggle('active', !!on);
    btn.title = on ? '取消置顶' : '窗口置顶';
  });
}

function initDraftLoading() {
  const api = window.electronAPI;
  if (!api) return;
  const loadDraft = async () => {
    const draft = await api.storageGet('jsonDraft', null);
    if (draft) {
      setEditorValue(draft);
      await api.storageDelete('jsonDraft');
      refresh();
    }
  };
  loadDraft();
  api.onLoadJsonDraft(loadDraft);
}

function initJsonTools() {
  const indent = $('indentSize');

  $('formatBtn').addEventListener('click', () => {
    hideErr();
    const text = getEditorValue();
    if (!text) return toast('请输入 JSON', 'error');
    const ind = indent.value === 'tab' ? '\t' : parseInt(indent.value, 10);
    const smart = parseJsonSmart(text);
    if (!smart.success) {
      const loose = formatLooseText(text, ind);
      if (!loose.success) return showErr(smart.error);
      setEditorValue(loose.result);
      refresh();
      toast('不是标准 JSON，已按符号换行', 'success');
      return;
    }
    setEditorValue(JSON.stringify(smart.value, null, ind));
    refresh();
    toast(smart.unescaped ? '已解析转义 JSON 并格式化' : '已格式化', 'success');
  });

  $('compressBtn').addEventListener('click', () => {
    hideErr();
    const smart = parseJsonSmart(getEditorValue());
    if (!smart.success) return showErr(smart.error);
    setEditorValue(JSON.stringify(smart.value));
    refresh();
    toast('已压缩', 'success');
  });

  $('validateBtn').addEventListener('click', () => {
    hideErr();
    const r = validateJSON(getEditorValue());
    r.success ? toast('JSON 格式正确 ✓', 'success') : showErr(r.error);
  });

  $('escapeBtn').addEventListener('click', () => applyTextTransform(escapeString, '已转义'));
  $('unescapeBtn').addEventListener('click', () => applyTextTransform(unescapeString, '已去转义'));
  $('toUniBtn').addEventListener('click', () => applyTextTransform(toUnicode, '已转 Unicode'));
  $('fromUniBtn').addEventListener('click', () => applyTextTransform(fromUnicode, '已还原中文'));

  $('copyBtn').addEventListener('click', async (e) => {
    const text = getEditorValue();
    if (!text) return toast('没有可复制的内容', 'error');
    (await copyToClipboard(text))
      ? (flashButton(e.target, '✓ 已复制'), toast('已复制', 'success'))
      : toast('复制失败', 'error');
  });

  $('downloadBtn').addEventListener('click', () => {
    const text = getEditorValue();
    if (!text) return toast('没有可下载的内容', 'error');
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'data.json';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('已下载 data.json', 'success');
  });

  $('sampleBtn').addEventListener('click', () => {
    setEditorValue(SAMPLE);
    hideErr();
    refresh();
  });

  $('clearBtn').addEventListener('click', () => {
    setEditorValue('');
    hideErr();
    refresh();
  });

  $('expandAll').addEventListener('click', () => expandTreeAll());
  $('collapseAll').addEventListener('click', () => collapseTreeAll());
  $('expandLevel1').addEventListener('click', () => expandTreeToLevel(1));
  $('expandLevel2').addEventListener('click', () => expandTreeToLevel(2));
  $('expandLevel3').addEventListener('click', () => expandTreeToLevel(3));
}

function initSearch() {
  document.querySelectorAll('[data-search-side]').forEach((host) => {
    const side = host.dataset.searchSide === 'tree' ? 'tree' : 'editor';
    host.addEventListener('focusin', () => { lastSearchSide = side; });
    host.addEventListener('pointerdown', () => { lastSearchSide = side; });
  });
  $('treeView').addEventListener('focus', () => { lastSearchSide = 'tree'; });
  $('treeView').addEventListener('pointerdown', () => { lastSearchSide = 'tree'; });
  for (const side of ['editor', 'tree']) {
    const els = getSearchEls(side);
    els.panel.addEventListener('focusin', () => { lastSearchSide = side; });
    els.panel.addEventListener('pointerdown', () => { lastSearchSide = side; });
    els.input.addEventListener('input', () => refreshSearch(true, side));
    els.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        goSearch(event.shiftKey ? -1 : 1, side);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closeSearchPanel(side);
      }
    });
    els.prev.addEventListener('click', () => goSearch(-1, side));
    els.next.addEventListener('click', () => goSearch(1, side));
    els.close.addEventListener('click', () => closeSearchPanel(side));
  }
  document.addEventListener('keydown', (event) => {
    if (isFindShortcut(event) && isJsonTabActive()) {
      event.preventDefault();
      openSearchPanel(resolveSearchSide(event.target));
    }
  });
}

function refresh() {
  const text = getEditorValue();
  const s = getJSONStats(text);
  $('charCount').textContent = s.chars;
  $('lineCount').textContent = s.lines;
  $('sizeCount').textContent = formatFileSize(s.size);
  renderTree();
}

function renderTree() {
  const view = $('treeView');
  const text = getEditorValue();
  if (!text.trim()) {
    currentJsonValue = null;
    view.innerHTML = '<div class="tree-empty">解析成功后将在此显示树形结构</div>';
    $('rootType').textContent = '';
    $('validState').textContent = '—';
    $('validState').removeAttribute('data-ok');
    return;
  }

  const r = parseJSON(text);
  if (!r.success) {
    currentJsonValue = null;
    view.innerHTML = '<div class="tree-empty">JSON 无效，无法生成树</div>';
    $('rootType').textContent = '';
    $('validState').textContent = '—';
    return;
  }

  currentJsonValue = r.value;
  $('validState').textContent = '✓ 有效 JSON';
  $('validState').dataset.ok = '1';
  $('rootType').textContent = describe(r.value);
  view.innerHTML = `<div class="tree-row">${buildNode(r.value, null, 0, '$')}</div>`;
  bindToggles(view);
  if (!$('treeSearchPanel')?.hidden) refreshSearch(false, 'tree');
  else highlightTreeSearch('');
}

function applyTextTransform(fn, okMsg) {
  hideErr();
  const text = getEditorValue();
  if (!text) return toast('请输入内容', 'error');
  const r = fn(text);
  r.success ? (setEditorValue(r.result), refresh(), toast(okMsg, 'success')) : showErr(r.error);
}

function showErr(m) {
  const errBox = $('errorMessage');
  errBox.textContent = m;
  errBox.classList.add('show');
  $('validState').textContent = '✗ 格式错误';
  $('validState').dataset.ok = '0';
}

function hideErr() {
  $('errorMessage').classList.remove('show');
}

function isFindShortcut(event) {
  return event.key?.toLowerCase() === 'f' && (event.metaKey || event.ctrlKey) && !event.altKey;
}

function isJsonTabActive() {
  return $('tool-panel-json')?.classList.contains('active');
}

function resolveSearchSide(target = document.activeElement) {
  const node = target instanceof Element ? target : document.activeElement;
  if (node?.closest?.('[data-search-side="tree"], [data-search-panel="tree"]')) return 'tree';
  if (node?.closest?.('[data-search-side="editor"], [data-search-panel="editor"], .cm-editor')) return 'editor';
  return lastSearchSide;
}

function getSearchEls(side = activeSearchSide) {
  return {
    panel: $(`${side}SearchPanel`),
    input: $(`${side}SearchInput`),
    count: $(`${side}SearchCount`),
    prev: $(`${side}SearchPrevBtn`),
    next: $(`${side}SearchNextBtn`),
    close: $(`${side}SearchCloseBtn`)
  };
}

function openSearchPanel(side = 'editor') {
  activeSearchSide = side === 'tree' ? 'tree' : 'editor';
  lastSearchSide = activeSearchSide;
  closeSearchPanel(activeSearchSide === 'tree' ? 'editor' : 'tree', false);
  const { panel, input } = getSearchEls(activeSearchSide);
  if (!panel || !input) return;
  const selected = activeSearchSide === 'editor' ? getSelectedEditorText() : '';
  if (selected && !selected.includes('\n')) input.value = selected;
  panel.hidden = false;
  refreshSearch(true, activeSearchSide);
  setTimeout(() => {
    input.focus();
    input.select();
  }, 0);
}

function closeSearchPanel(side = activeSearchSide, restoreFocus = true) {
  const { panel, input } = getSearchEls(side);
  const state = getSearchState(side);
  if (panel) panel.hidden = true;
  if (input) input.value = '';
  state.matches = [];
  state.index = -1;
  if (side === 'editor') editorView.dispatch({ effects: setSearchQuery.of('') });
  updateSearchCount(side);
  if (side === 'tree') highlightTreeSearch('');
  if (restoreFocus) {
    if (side === 'tree') $('treeView')?.focus();
    else editorView?.focus();
  }
}

function getSelectedEditorText() {
  if (!editorView) return '';
  const range = editorView.state.selection.main;
  if (range.empty) return '';
  return editorView.state.sliceDoc(range.from, range.to);
}

function getSearchState(side = activeSearchSide) {
  return searchState[side === 'tree' ? 'tree' : 'editor'];
}

function refreshSearch(resetIndex = false, side = activeSearchSide) {
  activeSearchSide = side === 'tree' ? 'tree' : 'editor';
  const state = getSearchState(activeSearchSide);
  const query = getSearchEls(activeSearchSide).input?.value.trim() || '';
  state.matches = activeSearchSide === 'tree'
    ? findTreeMatches(query)
    : findTextMatches(getEditorValue(), query);
  if (resetIndex) state.index = -1;
  if (state.index >= state.matches.length) state.index = state.matches.length - 1;
  if (!state.matches.length) state.index = -1;
  editorView.dispatch({ effects: setSearchQuery.of(activeSearchSide === 'editor' ? query : '') });
  updateSearchCount(activeSearchSide);
  highlightTreeSearch(activeSearchSide === 'tree' ? query : '');
}

function findTextMatches(text, query) {
  if (!query) return [];
  const source = text.toLowerCase();
  const needle = query.toLowerCase();
  const matches = [];
  let pos = 0;
  while ((pos = source.indexOf(needle, pos)) !== -1) {
    matches.push({ from: pos, to: pos + query.length });
    pos += Math.max(1, query.length);
  }
  return matches;
}

function buildSearchDecorations(state, query) {
  const matches = findTextMatches(state.doc.toString(), query);
  const mark = Decoration.mark({ class: 'cm-search-hit' });
  return Decoration.set(matches.map((m) => mark.range(m.from, m.to)), true);
}

function goSearch(delta, side = activeSearchSide) {
  if (side !== activeSearchSide) refreshSearch(false, side);
  const state = getSearchState(activeSearchSide);
  if (!state.matches.length) return;
  if (state.index < 0) state.index = delta < 0 ? state.matches.length - 1 : 0;
  else state.index = (state.index + delta + state.matches.length) % state.matches.length;
  updateSearchCount(activeSearchSide);
  activeSearchSide === 'tree' ? revealTreeMatch() : revealSearchMatch();
}

function revealSearchMatch() {
  const state = getSearchState('editor');
  const match = state.matches[state.index];
  if (!match) return;
  editorView.dispatch({
    selection: { anchor: match.from, head: match.to },
    scrollIntoView: true
  });
  setTimeout(() => getSearchEls('editor').input?.focus(), 0);
}

function updateSearchCount(side = activeSearchSide) {
  const state = getSearchState(side);
  const current = state.index >= 0 ? state.index + 1 : 0;
  const count = getSearchEls(side).count;
  if (count) count.textContent = state.matches.length ? `${current}/${state.matches.length}` : '0/0';
}

function findTreeMatches(query) {
  const root = $('treeView');
  if (!root || !query) return [];
  return Array.from(root.querySelectorAll('[data-search]')).filter((node) =>
    (node.dataset.search || '').toLowerCase().includes(query.toLowerCase())
  );
}

function revealTreeMatch() {
  $('treeView')?.querySelectorAll('.tree-hit-active').forEach((node) => node.classList.remove('tree-hit-active'));
  const state = getSearchState('tree');
  const match = state.matches[state.index];
  if (!match) return;
  match.classList.add('tree-hit-active');
  match.scrollIntoView({ block: 'center', inline: 'nearest' });
  setTimeout(() => getSearchEls('tree').input?.focus(), 0);
}

function highlightTreeSearch(query = null) {
  const q = String(query ?? '').trim().toLowerCase();
  const root = $('treeView');
  if (!root) return;
  root.querySelectorAll('.tree-hit, .tree-hit-active').forEach((node) => {
    node.classList.remove('tree-hit');
    node.classList.remove('tree-hit-active');
  });
  if (!q) return;
  root.querySelectorAll('[data-search]').forEach((node) => {
    if ((node.dataset.search || '').toLowerCase().includes(q)) {
      node.classList.add('tree-hit');
      let parent = node.closest('.tnode');
      while (parent) {
        parent.classList.remove('tcollapsed');
        const toggle = parent.querySelector(':scope > .tline .ttoggle');
        if (toggle) toggle.textContent = '▾';
        parent = parent.parentElement?.closest('.tnode');
      }
    }
  });
}

function expandTreeAll() {
  $('treeView').querySelectorAll('.tnode').forEach((n) => setTreeCollapsed(n, false));
}

function collapseTreeAll() {
  $('treeView').querySelectorAll('.tnode').forEach((n, i) => i > 0 && setTreeCollapsed(n, true));
  if (editorView) foldAll(editorView);
}

function expandTreeToLevel(level) {
  $('treeView').querySelectorAll('.tnode').forEach((n) => {
    const depth = parseInt(n.dataset.depth || '0', 10);
    setTreeCollapsed(n, depth >= level);
  });
}

function setTreeCollapsed(node, collapsed) {
  node.classList.toggle('tcollapsed', collapsed);
  const toggle = node.querySelector(':scope > .tline .ttoggle');
  if (toggle) toggle.textContent = collapsed ? '▸' : '▾';
}

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

function buildNode(value, key, depth, path) {
  const keyHtml =
    key === null ? '' : `<span class="tkey">"${esc(key)}"</span><span class="tpunc">: </span>`;
  const isArr = Array.isArray(value);
  const isObj = value && typeof value === 'object';
  const searchText = key === null ? String(value ?? '') : `${key} ${String(value ?? '')}`;

  if (!isObj) {
    const jsonPreview = buildStringJsonNode(value, key, depth, path, keyHtml, searchText);
    if (jsonPreview) return jsonPreview;
    return `<div class="tleaf" data-search="${attr(searchText)}">${keyHtml}${leaf(value)}</div>`;
  }

  const entries = isArr ? value.map((v, i) => [i, v]) : Object.entries(value);
  const open = isArr ? '[' : '{';
  const close = isArr ? ']' : '}';
  const count = entries.length;
  const children = entries
    .map(([k, v]) => buildNode(v, isArr ? null : k, depth + 1, `${path}.${k}`))
    .join('');
  const childHtml = children || `<div class="tleaf tpunc">（空）</div>`;

  return (
    `<div class="tnode" data-depth="${depth}" data-path="${attr(path)}">` +
    `<div class="tline" data-search="${attr(searchText)}"><span class="ttoggle">▾</span>${keyHtml}<span class="tpunc">${open}</span>` +
    `<span class="tcount">${count}</span>` +
    `<span class="tsummary">…<span class="tpunc">${close}</span></span></div>` +
    `<div class="tchildren">${childHtml}</div>` +
    `<div class="tclose tpunc">${close}</div>` +
    `</div>`
  );
}

function buildStringJsonNode(value, key, depth, path, keyHtml, searchText) {
  if (typeof value !== 'string' || !looksLikeJson(value)) return '';
  const parsed = tryParse(value.trim());
  if (!parsed.ok || !parsed.value || typeof parsed.value !== 'object') return '';
  const child = buildNode(parsed.value, null, depth + 1, `${path}.$json`);
  const preview = value.length > 80 ? value.slice(0, 80) + '...' : value;
  const parsedSearchText = `${searchText} ${JSON.stringify(parsed.value)}`;

  return (
    `<div class="tnode tjson-string" data-depth="${depth}" data-path="${attr(path)}">` +
    `<div class="tline" data-search="${attr(parsedSearchText)}"><span class="ttoggle">▾</span>${keyHtml}` +
    `<span class="tstr">"</span><span class="tjson-preview">${esc(preview)}</span><span class="tstr">"</span>` +
    `<span class="tcount">JSON</span><span class="tsummary"> …</span></div>` +
    `<div class="tchildren">${child}</div>` +
    `</div>`
  );
}

function bindToggles(root) {
  root.querySelectorAll('.ttoggle').forEach((toggle) => {
    toggle.addEventListener('click', () => {
      const node = toggle.closest('.tnode');
      setTreeCollapsed(node, !node.classList.contains('tcollapsed'));
    });
  });
}

function initToolTabs() {
  document.querySelectorAll('.tool-tab').forEach((tab) => {
    tab.addEventListener('click', () => switchToolTab(tab.dataset.toolTab));
  });
}

function switchToolTab(tabName) {
  const target = tabName === 'base64' ? 'base64' : 'json';
  document.querySelectorAll('.tool-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.toolTab === target);
  });
  document.querySelectorAll('.tool-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `tool-panel-${target}`);
  });
  const focusId = target === 'base64' ? 'base64Input' : null;
  setTimeout(() => focusId ? document.getElementById(focusId)?.focus() : editorView?.focus(), 50);
}

function initBase64() {
  const input = $('base64Input');
  const output = $('base64Output');
  const errBox = $('base64Error');
  const showErr = (m) => {
    errBox.textContent = m;
    errBox.classList.add('show');
  };
  const hideErr = () => errBox.classList.remove('show');
  $('encodeBtn').addEventListener('click', () => {
    hideErr();
    if (!input.value) return toast('请输入文本', 'error');
    try {
      output.value = encodeBase64(input.value);
      toast('已编码', 'success');
    } catch (e) {
      showErr(e.message);
    }
  });
  $('decodeBtn').addEventListener('click', () => {
    hideErr();
    if (!input.value) return toast('请输入 Base64 字符串', 'error');
    if (!isValidBase64(input.value.trim())) return showErr('不是有效的 Base64 字符串');
    try {
      output.value = decodeBase64(input.value.trim());
      toast('已解码', 'success');
    } catch (e) {
      showErr(e.message);
    }
  });
  $('b64ClearBtn').addEventListener('click', () => {
    input.value = '';
    output.value = '';
    hideErr();
  });
  $('b64CopyBtn').addEventListener('click', async (e) => {
    if (!output.value) return toast('没有可复制的结果', 'error');
    (await copyToClipboard(output.value))
      ? (flashButton(e.target, '已复制'), toast('已复制', 'success'))
      : toast('复制失败', 'error');
  });
}

async function initTheme() {
  applyTheme(await getTheme());
  $('themeToggle').addEventListener('click', async () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    await setTheme(next);
  });
}
