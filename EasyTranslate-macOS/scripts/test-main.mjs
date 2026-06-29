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

test('capture window hover detection does not depend on accessibility prompt', () => {
  const src = readFileSync('electron/main.js', 'utf8');
  assert.ok(src.includes('CGWindowListCopyWindowInfo'));
  assert.ok(src.includes("'-l', 'JavaScript'"));
  assert.ok(src.includes("const output = stdout || stderr || ''"));
  assert.ok(!src.includes('isTrustedAccessibilityClient(true)'));
  assert.ok(!src.includes('需要辅助功能权限'));
  assert.ok(!src.includes('kCGWindowSharingState'), 'sharing state can be 0 for normal app windows');
});

test('screen recording permission is prompted only after capture fails', () => {
  const src = readFileSync('electron/main.js', 'utf8');
  const captureIndex = src.indexOf('const image = await captureScreenImage(display, sf)');
  const showMessageIndex = src.indexOf("title: '需要屏幕录制权限'");
  const openSettingsIndex = src.indexOf("Privacy_ScreenCapture");
  assert.equal(src.includes("getMediaAccessStatus('screen')"), false);
  assert.ok(captureIndex > -1, 'missing real capture attempt');
  assert.ok(showMessageIndex > -1, 'missing screen recording prompt');
  assert.ok(showMessageIndex > captureIndex, 'prompt should happen after capture fails');
  assert.ok(openSettingsIndex > showMessageIndex, 'settings should open after prompt setup');
  assert.ok(src.includes("buttons: ['打开系统设置', '稍后']"));
});

test('capture sends window detection metadata after async enumeration', () => {
  const src = readFileSync('electron/main.js', 'utf8');
  const promiseIndex = src.indexOf('const windowRectsPromise = (canDetectWindows ? getWindowRects() : Promise.resolve([]))');
  const captureWinIndex = src.indexOf('captureWin = new BrowserWindow');
  assert.ok(promiseIndex > -1, 'window enumeration should be started');
  assert.ok(promiseIndex < captureWinIndex, 'window enumeration should start before capture overlay exists');
  assert.ok(src.includes('canDetectWindows'));
  assert.ok(src.includes("webContents.send('et:capture-windows-update'"));
  assert.ok(src.includes("!/^EasyTranslate( Helper.*)?$/.test"));
  assert.ok(src.includes('initialWindows'));
  assert.ok(src.includes('captureLoaded'));
  assert.ok(src.includes('windows: initialWindows'));
});

test('capture keeps diagnostics hidden from production UI', () => {
  const src = readFileSync('electron/main.js', 'utf8');
  assert.ok(src.includes('ET_CAPTURE_DEBUG'));
  assert.ok(src.includes('capture-debug.log'));
  assert.ok(src.includes('window-rects-send'));
  assert.ok(src.includes('capture-sources'));
  assert.ok(!src.includes('captureDebugOverride'));
  assert.ok(!src.includes('et:capture-debug-info'));
  assert.ok(!src.includes('et:capture-debug-log'));
  assert.ok(!src.includes('打开截图诊断'));
});

test('entitlements.mac.plist has required permissions', () => {
  const plist = readFileSync('resources/entitlements.mac.plist', 'utf8');
  assert.ok(plist.includes('com.apple.security.network.client'));
  assert.ok(plist.includes('com.apple.security.automation.apple-events'));
});
