// 主进程纯逻辑测试：存储、快捷键、翻译服务、窗口列表、截图几何
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonStore, deepMerge, DEFAULT_SETTINGS } from '../electron/store.js';
import { isValidAccelerator, createShortcutManager } from '../electron/shortcuts.js';
import { createTranslator } from '../electron/translator.js';
import { eventToAccelerator, formatAccelerator } from '../src/popup/accelerator.js';
import { normRect, resizeRect, moveRect, pickWindow, hitHandle } from '../src/capture/geometry.js';

test('store: defaults, deep merge, history dedupe, persistence', () => {
  const dir = mkdtempSync(join(tmpdir(), 'et-store-'));
  const s = new JsonStore(dir, { delay: 0 });
  assert.equal(s.getSettings().shortcuts.toggle, DEFAULT_SETTINGS.shortcuts.toggle);
  s.updateSettings({ shortcuts: { capture: 'Alt+A' } });
  assert.equal(s.getSettings().shortcuts.capture, 'Alt+A');
  assert.equal(s.getSettings().shortcuts.toggle, DEFAULT_SETTINGS.shortcuts.toggle);
  s.addHistory({ source: 'hi', target: '你好', from: 'en', to: 'zh-Hans' });
  s.addHistory({ source: 'hi', target: '嗨', from: 'en', to: 'zh-Hans' });
  assert.equal(s.getHistory().length, 1);
  assert.equal(s.getHistory()[0].target, '嗨');
  s.flush();
  const disk = JSON.parse(readFileSync(join(dir, 'easytranslate-v3.json'), 'utf8'));
  assert.equal(disk.settings.shortcuts.capture, 'Alt+A');
  const again = new JsonStore(dir);
  assert.equal(again.getHistory().length, 1);
  assert.deepEqual(deepMerge({ a: { b: 1, c: 2 } }, { a: { b: 3 } }), { a: { b: 3, c: 2 } });
});

test('store: imports v2 history and encrypted vault without touching the old file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'et-legacy-'));
  const old = { theme: 'dark', translateHistory: [{ source: 'a', target: 'b', from: 'en', to: 'zh-Hans', ts: 1 }], authAccountsEncrypted: { version: 1, data: 'ENC' } };
  writeFileSync(join(dir, 'easytranslate.json'), JSON.stringify(old));
  const s = new JsonStore(dir, { delay: 0 });
  assert.equal(s.getHistory().length, 1);
  assert.equal(s.getVault().data, 'ENC');
  assert.equal(s.getSettings().theme, 'dark');
  s.flush();
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'easytranslate.json'), 'utf8')), old);
});

test('shortcuts: validation and registration with conflicts', () => {
  assert.ok(isValidAccelerator('CommandOrControl+Shift+T'));
  assert.ok(isValidAccelerator('F5'));
  assert.ok(!isValidAccelerator('T'));
  assert.ok(!isValidAccelerator('Shift+'));
  const registered = new Map();
  const fake = {
    register: (acc, fn) => (acc === 'Alt+X' ? false : (registered.set(acc, fn), true)),
    unregister: (acc) => registered.delete(acc)
  };
  const m = createShortcutManager(fake, { toggle() {}, selection() {}, capture() {} });
  const r = m.apply({ toggle: 'CommandOrControl+Shift+T', selection: 'Alt+X', capture: '' });
  assert.deepEqual(r.failed, ['selection']);
  assert.equal(registered.size, 1);
  m.suspend();
  assert.equal(registered.size, 0);
  m.resume();
  assert.equal(registered.size, 1);
});

test('translator: request shape, caching and errors', async () => {
  let calls = 0;
  let lastUrl = '';
  const fetchImpl = async (url, opts) => {
    calls++;
    lastUrl = url;
    assert.deepEqual(JSON.parse(opts.body), ['hello']);
    return { ok: true, json: async () => [{ detectedLanguage: { language: 'en' }, translations: [{ text: '你好' }] }] };
  };
  const t = createTranslator(fetchImpl);
  assert.deepEqual(await t.translate({ text: 'hello', to: 'zh-Hans' }), { text: '你好', detected: 'en' });
  assert.ok(!lastUrl.includes('from='));
  await t.translate({ text: 'hello', to: 'zh-Hans' });
  assert.equal(calls, 1);
  const bad = createTranslator(async () => ({ ok: false, status: 429 }));
  await assert.rejects(bad.translate({ text: 'x', to: 'en' }), /429/);
  const offline = createTranslator(async () => {
    throw new TypeError('fetch failed');
  });
  await assert.rejects(offline.translate({ text: 'x', to: 'en' }), /网络/);
});

test('accelerator: keyboard event conversion and display', () => {
  assert.equal(eventToAccelerator({ code: 'KeyT', metaKey: true, shiftKey: true }), 'CommandOrControl+Shift+T');
  assert.equal(eventToAccelerator({ code: 'KeyT', shiftKey: true }), '');
  assert.equal(eventToAccelerator({ code: 'ShiftLeft', shiftKey: true }), '');
  assert.equal(eventToAccelerator({ code: 'F6' }), 'F6');
  assert.equal(formatAccelerator('CommandOrControl+Shift+T'), '⇧⌘T');
  assert.equal(formatAccelerator('Control+Alt+Space'), '⌃⌥␣');
});

test('capture geometry', () => {
  assert.deepEqual(normRect(10, 10, 0, 5), { x: 0, y: 5, w: 10, h: 5 });
  assert.deepEqual(moveRect({ x: 0, y: 0, w: 10, h: 10 }, 100, -5, 50, 50), { x: 40, y: 0, w: 10, h: 10 });
  assert.deepEqual(resizeRect({ x: 10, y: 10, w: 10, h: 10 }, { k: 'se' }, { x: 40, y: 30 }, 100, 100), { x: 10, y: 10, w: 30, h: 20 });
  const wins = [{ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 100, h: 100 }];
  assert.equal(pickWindow(wins, { x: 5, y: 5 }), wins[0]);
  assert.equal(pickWindow(wins, { x: 50, y: 50 }), wins[1]);
  assert.equal(hitHandle({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 10 }).k, 'se');
});
