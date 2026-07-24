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

test('popup selects existing translate text when opened or focused', () => {
  const src = readFileSync('src/popup/popup.js', 'utf8');
  assert.ok(src.includes('function focusTranslateInput'));
  assert.ok(src.includes('window.addEventListener(\'focus\', () => focusTranslateInput(true))'));
  assert.ok(src.includes('onPopupShown'));
  assert.ok(src.includes('visibilitychange'));
  assert.ok(src.includes('input.select()'));
  assert.ok(src.includes("if (id === 'translate') setTimeout(() => focusTranslateInput(true), 60)"));
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

test('authenticator list supports right-click remarks', () => {
  const js = readFileSync('src/popup/popup.js', 'utf8');
  const css = readFileSync('src/popup/popup.css', 'utf8');
  assert.ok(js.includes("listEl.addEventListener('contextmenu'"));
  assert.ok(js.includes('showAuthContextMenu'));
  assert.ok(js.includes('normalizeRemark'));
  assert.ok(js.includes('添加/修改备注'));
  assert.ok(js.includes('清除备注'));
  assert.ok(js.includes('备注不能超过 20 个字符'));
  assert.ok(js.includes('authRemarkDialog'));
  assert.ok(js.includes('ensureRemarkDialog'));
  assert.ok(!js.includes('window.prompt'));
  assert.ok(js.includes('auth-remark'));
  assert.ok(css.includes('.auth-context-menu'));
  assert.ok(css.includes('.auth-remark-dialog'));
  assert.ok(css.includes('.auth-remark-card'));
});

test('authenticator list supports persistent drag sorting and highlighted remarks', () => {
  const js = readFileSync('src/popup/popup.js', 'utf8');
  const css = readFileSync('src/popup/popup.css', 'utf8');
  assert.ok(js.includes('reorderAuthAccounts'));
  assert.ok(js.includes("listEl.addEventListener('pointerdown'"));
  assert.ok(js.includes("listEl.addEventListener('pointermove'"));
  assert.ok(js.includes("listEl.addEventListener('pointerup'"));
  assert.ok(js.includes("listEl.addEventListener('pointercancel'"));
  assert.ok(js.includes('setPointerCapture'));
  assert.ok(js.includes('finishDrag'));
  assert.ok(js.includes('await save()'));
  assert.ok(css.includes('.auth-drag-handle'));
  assert.ok(css.includes('.auth-item.is-dragging'));
  assert.ok(css.includes('.auth-remark'));
  assert.ok(css.includes('font-size: 11px'));
});

test('popup JSON format falls back to readable symbol wrapping', () => {
  const js = readFileSync('src/popup/popup.js', 'utf8');
  const lib = readFileSync('src/lib/json.js', 'utf8');
  assert.ok(lib.includes('function formatLooseText'));
  assert.ok(lib.includes('loose: true'));
  assert.ok(js.includes('不是标准 JSON，已按符号换行'));
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

test('capture overlay supports double-click completion, toolbar clicks, and Escape cancellation', () => {
  const src = readFileSync('src/capture/capture.js', 'utf8');
  assert.ok(src.includes("addEventListener('dblclick'"));
  assert.ok(src.includes("if (phase === 'ready' && sel && inSel(p))"));
  assert.ok(src.includes("addEventListener('click'"));
  assert.ok(src.includes("e.preventDefault(); api.captureCancel()"));
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
