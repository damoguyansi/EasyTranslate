import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

test('json.js imports from storage-ipc.js', () => {
  const src = readFileSync('src/json-page/json.js', 'utf8');
  assert.ok(src.includes('storage-ipc.js'));
  assert.ok(!src.includes("'../lib/storage.js'"));
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
  assert.ok(src.includes('-webkit-app-region'));
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
