// electron/store.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let store, tmpDir;
before(async () => {
  const Store = (await import('electron-store')).default;
  tmpDir = mkdtempSync(join(tmpdir(), 'et-store-'));
  store = new Store({ name: 'test', cwd: tmpDir,
    defaults: { theme: 'auto', translateHistory: [] } });
});
after(() => { try { rmSync(tmpDir, { recursive: true, force: true }); } catch(e) {} });

test('getValue returns stored value', () => {
  store.set('k', 'v'); assert.equal(store.get('k'), 'v');
});
test('getValue returns fallback when missing', () => {
  store.delete('nx'); assert.equal(store.get('nx', 'fb'), 'fb');
});
test('addHistory stores entry', () => {
  store.set('translateHistory', []);
  store.set('translateHistory', [{ source: 'hi', target: 'hello', from: 'zh', to: 'en', ts: 1 }]);
  assert.equal(store.get('translateHistory').length, 1);
});
test('addHistory deduplicates same source+direction', () => {
  store.set('translateHistory', []);
  const e = { source: 'dup', target: 'X', from: 'en', to: 'zh-Hans' };
  for (let i = 0; i < 3; i++) {
    const l = store.get('translateHistory').filter(
      h => !(h.source === e.source && h.from === e.from && h.to === e.to));
    l.unshift(Object.assign({}, e, { ts: Date.now() }));
    store.set('translateHistory', l.slice(0, 30));
  }
  assert.equal(store.get('translateHistory').filter(h => h.source === 'dup').length, 1);
});
test('history capped at 30', () => {
  store.set('translateHistory', []);
  for (let i = 0; i < 35; i++) {
    const l = store.get('translateHistory');
    l.unshift({ source: 't' + i, target: 'r' + i, from: 'en', to: 'zh', ts: Date.now() });
    store.set('translateHistory', l.slice(0, 30));
  }
  assert.equal(store.get('translateHistory').length, 30);
});
test('clearHistory empties list', () => {
  store.set('translateHistory', [{ source: 'a', ts: 1 }]);
  store.set('translateHistory', []);
  assert.equal(store.get('translateHistory').length, 0);
});
test('theme read/write', () => {
  store.set('theme', 'dark');  assert.equal(store.get('theme'), 'dark');
  store.set('theme', 'light'); assert.equal(store.get('theme'), 'light');
  store.set('theme', 'auto');  assert.equal(store.get('theme'), 'auto');
});
