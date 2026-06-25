import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

test('preload.cjs uses CommonJS require', () => {
  const src = readFileSync('electron/preload.cjs', 'utf8');
  assert.ok(src.includes("require('electron')"));
  assert.ok(!src.includes('\nimport '), 'should not have ESM import');
});

test('preload.cjs exposes all APIs', () => {
  const src = readFileSync('electron/preload.cjs', 'utf8');
  const apis = [
    'storageGet','storageSet','storageDelete',
    'getHistory','addHistory','clearHistory',
    'getTheme','setTheme',
    'windowClose','windowMinimize',
    'openJsonWindow','openUrl',
    'setLoginItem','getLoginItem',
    'onTranslateSelection','onThemeChange','onLoadJsonDraft',
    'platform'
  ];
  for (const a of apis) assert.ok(src.includes(a), 'missing API: ' + a);
});

test('preload.cjs uses contextBridge.exposeInMainWorld', () => {
  const src = readFileSync('electron/preload.cjs', 'utf8');
  assert.ok(src.includes('contextBridge.exposeInMainWorld'));
  assert.ok(src.includes("'electronAPI'"));
});
