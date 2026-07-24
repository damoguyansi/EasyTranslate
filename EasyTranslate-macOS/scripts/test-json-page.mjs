import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

test('json.js imports from storage-ipc.js', () => {
  const src = readFileSync('src/json-page/json.js', 'utf8');
  assert.ok(src.includes('storage-ipc.js'));
  assert.ok(!src.includes("'../lib/storage.js'"));
});

test('storage-ipc.js can initialize without electronAPI for local renderer checks', () => {
  const src = readFileSync('src/storage-ipc.js', 'utf8');
  assert.ok(src.includes('if (!api) return readLocal'));
  assert.ok(src.includes('window.localStorage'));
  assert.ok(src.includes('writeLocal'));
});

test('json.js has no chrome.storage.local', () => {
  const src = readFileSync('src/json-page/json.js', 'utf8');
  assert.ok(!src.includes('chrome.storage.local'));
  assert.ok(src.includes('storageGet'));
  assert.ok(src.includes('onLoadJsonDraft'));
});

test('json.js has applyTheme and onThemeChange', () => {
  const src = readFileSync('src/json-page/json.js', 'utf8');
  assert.ok(src.includes('applyTheme'));
  assert.ok(src.includes('onThemeChange'));
});

test('json.html has app-region style', () => {
  const src = readFileSync('src/json-page/json.html', 'utf8');
  const css = readFileSync('src/json-page/json.css', 'utf8');
  const main = readFileSync('electron/main.js', 'utf8');
  assert.ok(src.includes('-webkit-app-region'));
  assert.ok(src.includes('.wrap, .tool-tabs, .toolbar'));
  assert.ok(src.includes('.tool-tab { -webkit-app-region: no-drag; }'));
  assert.ok(!src.includes('window-drag-region'));
  assert.ok(css.includes('.tool-tabs'));
  assert.ok(css.includes('-webkit-app-region: no-drag'));
  assert.ok(!css.includes('-webkit-app-region: drag'));
  assert.ok(!main.includes('titleBarStyle'));
  assert.ok(main.includes("title: '工具大窗口 · EasyTranslate'"));
  assert.ok(main.includes('movable: true'));
  assert.ok(src.includes('body { -webkit-app-region: no-drag; }'));
  assert.ok(!src.includes('body { -webkit-app-region: drag; }'));
});

test('tools window contains JSON and Base64 tabs', () => {
  const html = readFileSync('src/json-page/json.html', 'utf8');
  const js = readFileSync('src/json-page/json.js', 'utf8');
  assert.ok(html.includes('data-tool-tab="json"'));
  assert.ok(html.includes('data-tool-tab="base64"'));
  assert.ok(html.includes('base64Input'));
  assert.ok(html.includes('base64Output'));
  assert.ok(js.includes("from '../lib/base64.js'"));
  assert.ok(js.includes('onLoadToolsTab'));
  assert.ok(js.includes('switchToolTab'));
});

test('json tool uses editor, smart escaped-json formatting, search, and folding controls', () => {
  const html = readFileSync('src/json-page/json.html', 'utf8');
  const js = readFileSync('src/json-page/json.js', 'utf8');
  const utils = readFileSync('src/json-page/json-utils.js', 'utf8');
  const css = readFileSync('src/json-page/json.css', 'utf8');
  const pkg = readFileSync('package.json', 'utf8');

  assert.ok(html.includes('id="jsonEditor"'));
  assert.ok(!html.includes('id="jsonInput"'));
  assert.ok(html.includes('id="editorSearchPanel"'));
  assert.ok(html.includes('id="treeSearchPanel"'));
  assert.ok(html.includes('id="editorSearchInput"'));
  assert.ok(html.includes('id="treeSearchInput"'));
  assert.ok(html.includes('data-search-side="editor"'));
  assert.ok(html.includes('data-search-side="tree"'));
  assert.ok(html.includes('tabindex="0"'));
  assert.ok(css.includes('.editor-search-panel[hidden]'));
  assert.ok(html.includes('id="expandLevel1"'));
  assert.ok(html.includes('id="expandLevel2"'));
  assert.ok(html.includes('id="expandLevel3"'));

  assert.ok(js.includes("from '@codemirror/view'"));
  assert.ok(js.includes("from '@codemirror/lang-json'"));
  assert.ok(js.includes("from './json-utils.js'"));
  assert.ok(js.includes('formatLooseText'));
  assert.ok(js.includes('不是标准 JSON，已按符号换行'));
  assert.ok(utils.includes('function parseJsonSmart'));
  assert.ok(!js.includes('function normalizeJsonStrings'));
  assert.ok(js.includes('function buildStringJsonNode'));
  assert.ok(js.includes('tjson-preview'));
  assert.ok(utils.includes('decodeLooseEscapedJson'));
  assert.ok(js.includes('function refreshSearch'));
  assert.ok(js.includes('function openSearchPanel'));
  assert.ok(js.includes("closeSearchPanel(activeSearchSide === 'tree' ? 'editor' : 'tree', false)"));
  assert.ok(js.includes('const searchState'));
  assert.ok(js.includes('let lastSearchSide'));
  assert.ok(js.includes('function resolveSearchSide'));
  assert.ok(js.includes('function findTreeMatches'));
  assert.ok(js.includes('function revealTreeMatch'));
  assert.ok(js.includes("setTimeout(() => getSearchEls('editor').input?.focus(), 0)"));
  assert.ok(js.includes("setTimeout(() => getSearchEls('tree').input?.focus(), 0)"));
  assert.ok(js.includes('function isFindShortcut'));
  assert.ok(js.includes("event.key === 'Enter'"));
  assert.ok(js.includes("event.key === 'Escape'"));
  assert.ok(!js.includes('searchKeymap'));
  assert.ok(!js.includes('JSON.stringify(normalized'));
  assert.ok(js.includes('function expandTreeToLevel'));

  assert.ok(pkg.includes('@codemirror/view'));
  assert.ok(pkg.includes('@codemirror/lang-json'));
  assert.ok(pkg.includes('@codemirror/search'));
});
