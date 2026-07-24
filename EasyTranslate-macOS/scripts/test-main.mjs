import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

test('main.js has all IPC channels', () => {
  const src = readFileSync('electron/main.js', 'utf8');
  const chs = [
    'et:store-get','et:store-set','et:store-delete',
    'et:get-history','et:add-history','et:clear-history',
    'et:get-theme','et:set-theme',
    'et:get-auth-accounts','et:set-auth-accounts',
    'et:window-close','et:window-minimize',
    'et:open-tools-window','et:open-json-window','et:open-url',
    'et:set-login-item','et:get-login-item'
  ];
  for (const ch of chs) assert.ok(src.includes("'" + ch + "'"), 'missing channel: ' + ch);
});

test('main.js encrypts Authenticator accounts and migrates legacy plaintext', () => {
  const src = readFileSync('electron/main.js', 'utf8');
  assert.ok(src.includes('safeStorage'));
  assert.ok(src.includes('AUTH_ACCOUNTS_ENCRYPTED_KEY'));
  assert.ok(src.includes('safeStorage.encryptString'));
  assert.ok(src.includes('safeStorage.decryptString'));
  assert.ok(src.includes('deleteValue(AUTH_ACCOUNTS_KEY)'));
  assert.ok(src.includes("getValue(AUTH_ACCOUNTS_KEY"));
});

test('main.js keeps openJsonWindow compatibility through tools window', () => {
  const src = readFileSync('electron/main.js', 'utf8');
  assert.ok(src.includes("openToolsWindow('json', draft)"));
  assert.ok(src.includes("jsonWin.webContents.send('et:load-tools-tab'"));
  assert.ok(src.includes("targetTab === 'json'"));
  assert.ok(src.includes("tab === 'base64'"));
});

test('main.js provides native edit context menus for text fields', () => {
  const src = readFileSync('electron/main.js', 'utf8');
  assert.ok(src.includes('function attachEditContextMenu'));
  assert.ok(src.includes("win.webContents.on('context-menu'"));
  assert.ok(src.includes('params.isEditable'));
  assert.ok(src.includes("{ role: 'paste'"));
  assert.ok(src.includes('attachEditContextMenu(mainWin)'));
  assert.ok(src.includes('attachEditContextMenu(jsonWin)'));
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

test('main popover hides reliably when focus leaves the app', () => {
  const src = readFileSync('electron/main.js', 'utf8');
  assert.ok(src.includes('function hideMainWindow'));
  assert.ok(src.includes('function notifyMainWindowShown'));
  assert.ok(src.includes('function focusMainWindowSoon'));
  assert.ok(src.includes('lastMainToggleAt'));
  assert.ok(src.includes("webContents.send('et:popup-shown'"));
  assert.ok(src.includes("app.on('deactivate', () => hideMainWindow())"));
  assert.ok(src.includes("app.on('browser-window-focus'"));
  assert.ok(src.includes('win !== mainWin'));
  assert.ok(src.includes("if (mainWin.isVisible()) { mainWin.hide(); return; }"));
  assert.ok(src.includes('Date.now() - lastMainToggleAt < 300'));
  assert.ok(src.includes('setTimeout(focus, 40)'));
  assert.ok(src.includes('focus(true)'));
});

test('main window stays usable from fullscreen spaces and opens quickly', () => {
  const src = readFileSync('electron/main.js', 'utf8');
  assert.ok(src.includes('mainWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })'));
  assert.ok(src.includes("mainWin.setAlwaysOnTop(true, 'screen-saver')"));
  assert.ok(src.includes('mainWin.showInactive()'));
  assert.ok(src.includes('mainWin.moveTop()'));
  assert.ok(src.includes('mainWinReady'));
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

test('capture window handles Escape in the main process as a renderer fallback', () => {
  const src = readFileSync('electron/main.js', 'utf8');
  assert.ok(src.includes("captureWin.webContents.on('before-input-event'"));
  assert.ok(src.includes("input.key === 'Escape'"));
  assert.ok(src.includes('event.preventDefault()'));
  assert.ok(src.includes('closeCapture()'));
});

test('capture close keeps a newly opened window reference intact', () => {
  const src = readFileSync('electron/main.js', 'utf8');
  assert.ok(src.includes('const captureRef = captureWin'));
  assert.ok(src.includes('if (captureWin === captureRef) captureWin = null'));
  assert.ok(src.includes('captureWin = null;\n  if (captureRef)'));
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
