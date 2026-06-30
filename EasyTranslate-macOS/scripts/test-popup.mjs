import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

test('popup.js imports from storage-ipc.js', () => {
  const src = readFileSync('src/popup/popup.js', 'utf8');
  assert.ok(src.includes('storage-ipc.js'));
  assert.ok(!src.includes("'../lib/storage.js'"));
});

test('popup.js has initMacOS and macOS features', () => {
  const src = readFileSync('src/popup/popup.js', 'utf8');
  assert.ok(src.includes('initMacOS'));
  assert.ok(src.includes('onTranslateSelection'));
  assert.ok(src.includes('getLoginItem'));
  assert.ok(src.includes('openToolsWindow'));
  assert.ok(src.includes('onThemeChange'));
});

test('popup moves Base64 out and adds Authenticator panel', () => {
  const html = readFileSync('src/popup/popup.html', 'utf8');
  const js = readFileSync('src/popup/popup.js', 'utf8');
  assert.ok(!html.includes('data-tab="base64"'));
  assert.ok(html.includes('data-tab="auth"'));
  assert.ok(html.includes('authPasteBtn'));
  assert.ok(html.includes('base64OpenBtn'));
  assert.ok(!html.includes('base64Input'));
  assert.ok(js.includes("from '../authenticator/authenticator.js'"));
  assert.ok(js.includes("from 'jsqr'"));
  assert.ok(js.includes('getAuthAccounts'));
  assert.ok(js.includes('setAuthAccounts'));
  assert.ok(!js.includes("setValue('authAccounts'"));
  assert.ok(!js.includes("getValue('authAccounts'"));
  assert.ok(js.includes("document.addEventListener('paste'"));
  assert.ok(js.indexOf('const imageItem') < js.indexOf('const textItem'));
  assert.ok(js.includes('navigator.clipboard.read'));
  assert.ok(js.includes('scanQrCanvas'));
  assert.ok(js.includes("inversionAttempts: 'attemptBoth'"));
});

test('popup.html is popover style (no custom titlebar) with login item', () => {
  const src = readFileSync('src/popup/popup.html', 'utf8');
  // 菜单栏弹窗风格：移除自定义标题栏与交通灯，避免与原生按钮重复
  assert.ok(!src.includes('mac-titlebar'), '不应再有自定义标题栏');
  assert.ok(!src.includes('macClose'), '不应再有自定义关闭按钮');
  assert.ok(src.includes('loginItemCheck'));
  assert.ok(src.includes('feedbackLink'));
});

test('popup.css is flat, compact, non-draggable and never scrolls horizontally', () => {
  const src = readFileSync('src/popup/popup.css', 'utf8');
  assert.ok(src.includes('width: 100%'), 'body 宽度应跟随窗口');
  assert.ok(src.includes('overflow-x: hidden'), '应禁止横向滚动');
  assert.ok(src.includes('box-sizing: border-box'));
  // 菜单栏弹窗：整体不可拖动，且扁平（覆盖玻璃阴影）
  assert.ok(src.includes('-webkit-app-region: no-drag'), '窗口应不可拖动');
  assert.ok(!/-webkit-app-region:\s*drag/.test(src), '不应存在可拖拽区域');
  assert.ok(src.includes('box-shadow: none'), '扁平设计应去除卡片阴影');
});

test('capture overlay recalculates hovered window after async window update', () => {
  const src = readFileSync('src/capture/capture.js', 'utf8');
  assert.ok(src.includes('let lastPointer = null'));
  assert.ok(src.includes('wins = normalizeWindows(updatedWins || [])'));
  assert.ok(src.includes('hoverWin = pickWin(lastPointer)'));
  assert.ok(src.includes('canDetectWindows'));
  assert.ok(!src.includes('开启辅助功能权限后可悬停高亮窗口'));
});

test('capture overlay does not expose debug diagnostics in production UI', () => {
  const js = readFileSync('src/capture/capture.js', 'utf8');
  const html = readFileSync('src/capture/capture.html', 'utf8');
  const css = readFileSync('src/capture/capture.css', 'utf8');
  assert.ok(!html.includes('debugPanel'));
  assert.ok(!css.includes('.debug-panel'));
  assert.ok(!js.includes('debugLog'));
  assert.ok(!js.includes('renderer-windows-update'));
  assert.ok(!js.includes('renderer-move'));
});
