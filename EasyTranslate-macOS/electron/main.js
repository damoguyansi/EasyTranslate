// EasyTranslate 主进程入口
import {
  app, BrowserWindow, Tray, Menu, Notification, globalShortcut, ipcMain, shell,
  nativeImage, nativeTheme, safeStorage, systemPreferences, net
} from 'electron';
import { join } from 'node:path';
import { JsonStore } from './store.js';
import * as clip from './clipboard.js';
import { createTranslator } from './translator.js';
import { createDictionary } from './dictionary.js';
import { createVault } from './vault.js';
import { createShortcutManager } from './shortcuts.js';
import { createSelectionReader } from './selection.js';
import { createPopup, createWorkspaceManager, ROOT } from './windows.js';
import { createCaptureManager, screenPermission } from './capture.js';

const isMac = process.platform === 'darwin';
app.setName('EasyTranslate');

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let store;
let popup;
let workspace;
let capture;
let tray;
let shortcuts;
let selection;
// 使用 net.fetch：走系统代理设置，避免代理环境下翻译失败
const translator = createTranslator((...a) => net.fetch(...a));
const dictionary = createDictionary((...a) => net.fetch(...a));

/* ---------------- 动作 ---------------- */
function trayBounds() {
  try {
    return tray?.getBounds();
  } catch {
    return null;
  }
}

function togglePopup(anchor = 'cursor') {
  popup.toggle({ anchor, trayBounds: trayBounds() });
}

async function translateSelection() {
  const { text, permission } = await selection.read();
  popup.show({
    anchor: 'cursor',
    payload: { tab: 'translate', text, notice: permission ? '' : 'accessibility' }
  });
}

function startCapture(mode = 'annotate') {
  capture.start({ mode });
}

/* ---------------- 设置应用 ---------------- */
function applySettings(prev, next) {
  if (!prev || prev.theme !== next.theme) nativeTheme.themeSource = next.theme || 'system';
  if (!prev || JSON.stringify(prev.shortcuts) !== JSON.stringify(next.shortcuts)) {
    const res = shortcuts.apply(next.shortcuts);
    rebuildTrayMenu();
    return res;
  }
  return null;
}

function setLoginItem(enabled) {
  try {
    app.setLoginItemSettings({ openAtLogin: !!enabled, openAsHidden: true });
  } catch {}
}

/* ---------------- 托盘 ---------------- */
function accel(action) {
  return store.getSettings().shortcuts?.[action] || undefined;
}

function rebuildTrayMenu() {
  if (!tray) return;
  tray.__menu = Menu.buildFromTemplate([
    { label: '打开 EasyTranslate', accelerator: accel('toggle'), click: () => togglePopup('tray') },
    { label: '划词翻译', accelerator: accel('selection'), click: translateSelection },
    { label: '截图', accelerator: accel('capture'), click: () => startCapture() },
    { type: 'separator' },
    { label: 'JSON 工作台', click: () => workspace.open({ tool: 'json' }) },
    { label: '编码工具', click: () => workspace.open({ tool: 'codec' }) },
    { label: '关闭全部钉图', enabled: capture.hasPins(), click: () => capture.closeAllPins() },
    { type: 'separator' },
    { label: '设置…', click: () => popup.show({ anchor: 'tray', trayBounds: trayBounds(), payload: { tab: 'settings' } }) },
    { label: '退出 EasyTranslate', accelerator: 'Command+Q', click: () => app.quit() }
  ]);
}

function createTray() {
  let icon = nativeImage.createFromPath(join(ROOT, 'resources', 'tray.png'));
  if (icon.isEmpty()) icon = nativeImage.createEmpty();
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('EasyTranslate');
  tray.setIgnoreDoubleClickEvents(true);
  rebuildTrayMenu();
  tray.on('click', () => togglePopup('tray'));
  tray.on('right-click', () => {
    rebuildTrayMenu();
    tray.popUpContextMenu(tray.__menu);
  });
}

/* 应用菜单：Dock 隐藏时依旧需要，否则 ⌘C / ⌘V / ⌘Z 在输入框中失效 */
function createAppMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'EasyTranslate',
        submenu: [
          { role: 'about', label: '关于 EasyTranslate' },
          { type: 'separator' },
          { role: 'hide', label: '隐藏' },
          { role: 'quit', label: '退出' }
        ]
      },
      {
        label: '编辑',
        submenu: [
          { role: 'undo', label: '撤销' },
          { role: 'redo', label: '重做' },
          { type: 'separator' },
          { role: 'cut', label: '剪切' },
          { role: 'copy', label: '复制' },
          { role: 'paste', label: '粘贴' },
          { role: 'selectAll', label: '全选' }
        ]
      },
      {
        label: '窗口',
        submenu: [{ role: 'close', label: '关闭' }, { role: 'minimize', label: '最小化' }, { role: 'zoom' }]
      },
      ...(app.isPackaged ? [] : [{ label: '开发', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }] }])
    ])
  );
}

/* ---------------- IPC ---------------- */
function senderWindow(e) {
  return BrowserWindow.fromWebContents(e.sender);
}

function registerIpc() {
  const handle = (ch, fn) => ipcMain.handle(ch, (e, ...a) => fn(...a, e));

  handle('settings:get', () => ({
    settings: store.getSettings(),
    platform: process.platform,
    version: app.getVersion(),
    loginItem: app.getLoginItemSettings().openAtLogin
  }));
  handle('settings:set', (patch) => {
    const prev = JSON.parse(JSON.stringify(store.getSettings()));
    const next = store.updateSettings(patch);
    if (patch && 'launchAtLogin' in patch) setLoginItem(patch.launchAtLogin);
    const res = applySettings(prev, next);
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('settings:changed', next);
    return { settings: next, failed: res?.failed || [] };
  });

  handle('translate:run', (req) => translator.translate(req || {}));
  handle('dict:lookup', (text) => dictionary.lookup(text));
  handle('history:list', () => store.getHistory());
  handle('history:add', (entry) => store.addHistory(entry));
  handle('history:remove', (ts) => store.removeHistory(ts));
  handle('history:clear', () => store.clearHistory());

  const vault = createVault(store, safeStorage);
  handle('vault:load', () => vault.load());
  handle('vault:save', (accounts) => vault.save(accounts));

  handle('clipboard:write', async (text) => {
    await clip.writeText(text);
    return true;
  });
  handle('clipboard:read', async () => {
    const [image, text] = await Promise.all([clip.readImage().catch(() => null), clip.readText().catch(() => '')]);
    return { text, image };
  });

  handle('capture:start', (opts) => startCapture(opts?.mode));
  handle('workspace:open', (payload) => {
    popup.hide();
    workspace.open(payload || {});
  });
  handle('workspace:toggle-pin', () => workspace.togglePin());
  handle('popup:set-pinned', (v) => popup.setPinned(v));

  handle('app:open-external', (url) => {
    if (/^https:\/\//.test(String(url))) shell.openExternal(url);
  });
  handle('app:permissions', () => ({
    screen: screenPermission(),
    accessibility: isMac ? systemPreferences.isTrustedAccessibilityClient(false) : true
  }));
  handle('app:open-permission', (kind) => {
    const pane = kind === 'screen' ? 'Privacy_ScreenCapture' : 'Privacy_Accessibility';
    if (kind === 'accessibility') systemPreferences.isTrustedAccessibilityClient?.(true);
    popup.holdOpen(1500);
    shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${pane}`);
  });

  handle('draft:get', (key) => store.getDraft(String(key)));
  handle('draft:set', (key, value) => store.setDraft(String(key), value));
  handle('shortcuts:suspend', () => shortcuts.suspend());
  handle('shortcuts:resume', () => shortcuts.resume());

  ipcMain.on('popup:hide', () => popup.hide());
  ipcMain.on('capture:ready', () => capture.onReady());
  ipcMain.on('capture:cancel', () => capture.close());
  ipcMain.on('capture:finish', (_e, payload) => capture.finish(payload || {}));
  ipcMain.on('pin:action', (e, action, value) => capture.pinAction(senderWindow(e), action, value));
  ipcMain.on('app:quit', () => app.quit());
}

/* ---------------- 启动 ---------------- */
app.whenReady().then(() => {
  if (isMac) app.dock?.hide();
  app.setAboutPanelOptions({ applicationName: 'EasyTranslate', applicationVersion: app.getVersion() });

  store = new JsonStore(app.getPath('userData'));
  selection = createSelectionReader({ clip, systemPreferences });
  popup = createPopup();
  workspace = createWorkspaceManager();
  capture = createCaptureManager({
    beforeCapture: async () => {
      if (popup.win.isVisible()) {
        popup.hide();
        await new Promise((r) => setTimeout(r, 140)); // 等待弹窗从合成器中消失
      }
    },
    onQrResult: (text, mode) => {
      if (mode === 'qr' || /^otpauth(-migration)?:/i.test(text)) {
        popup.show({ anchor: 'cursor', payload: { tab: 'auth', qr: text } });
      } else if (text) {
        clip.writeText(text).catch(() => {});
        if (Notification.isSupported()) new Notification({ title: '二维码内容已复制', body: text.slice(0, 160) }).show();
      }
    },
    getSaveDir: () => store.getSettings().captureSaveDir
  });
  shortcuts = createShortcutManager(globalShortcut, {
    toggle: () => togglePopup('cursor'),
    selection: translateSelection,
    capture: () => startCapture()
  });

  createAppMenu();
  registerIpc();
  createTray();
  applySettings(null, store.getSettings());

  // 预热截图覆盖层，首次截图秒开
  setTimeout(() => capture.prewarm(), 800);

  // 开发模式：启动后直接弹出主窗口，便于调试样式
  if (process.env.VITE_DEV_URL) setTimeout(() => popup.show({ anchor: 'cursor' }), 1200);
});

app.on('second-instance', () => popup?.show({ anchor: 'tray', trayBounds: trayBounds() }));
app.on('activate', () => popup?.show({ anchor: 'tray', trayBounds: trayBounds() }));
app.on('window-all-closed', (e) => e.preventDefault?.());
app.on('before-quit', () => {
  app.isQuitting = true;
  store?.flush();
});
app.on('will-quit', () => globalShortcut.unregisterAll());
