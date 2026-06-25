import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

test('main.js has all IPC channels', () => {
  const src = readFileSync('electron/main.js', 'utf8');
  const chs = [
    'et:store-get','et:store-set','et:store-delete',
    'et:get-history','et:add-history','et:clear-history',
    'et:get-theme','et:set-theme',
    'et:window-close','et:window-minimize',
    'et:open-json-window','et:open-url',
    'et:set-login-item','et:get-login-item'
  ];
  for (const ch of chs) assert.ok(src.includes("'" + ch + "'"), 'missing channel: ' + ch);
});

test('main.js has both global shortcuts', () => {
  const src = readFileSync('electron/main.js', 'utf8');
  assert.ok(src.includes('CommandOrControl+Shift+T'));
  assert.ok(src.includes('CommandOrControl+Shift+Y'));
});

test('main.js has tray, nativeTheme, dock.hide', () => {
  const src = readFileSync('electron/main.js', 'utf8');
  assert.ok(src.includes('createTray'));
  assert.ok(src.includes('nativeTheme.on'));
  assert.ok(src.includes('app.dock.hide'));
});

test('main.js hides window on close, does not quit', () => {
  const src = readFileSync('electron/main.js', 'utf8');
  assert.ok(src.includes('e.preventDefault()'));
  assert.ok(src.includes('mainWin.hide'));
});

test('entitlements.mac.plist has required permissions', () => {
  const plist = readFileSync('resources/entitlements.mac.plist', 'utf8');
  assert.ok(plist.includes('com.apple.security.network.client'));
  assert.ok(plist.includes('com.apple.security.automation.apple-events'));
});
