// electron/main.js
import {
  app, BrowserWindow, Tray, Menu, globalShortcut,
  ipcMain, shell, clipboard, nativeImage, nativeTheme,
  desktopCapturer, screen, dialog, systemPreferences, safeStorage
} from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { appendFileSync, writeFileSync } from 'fs';
import { execFile } from 'child_process';
import {
  getValue, setValue, deleteValue,
  getHistory, addHistory, clearHistory,
  getTheme, setTheme
} from './store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const isDev = !app.isPackaged;

// 应用名（菜单 / 关于 / Dock 等显示为项目名）
app.setName('EasyTranslate');

let mainWin = null, jsonWin = null, tray = null, captureWin = null;
let pinWins = [];
const AUTH_ACCOUNTS_KEY = 'authAccounts';
const AUTH_ACCOUNTS_ENCRYPTED_KEY = 'authAccountsEncrypted';

function captureDebugEnabled() {
  return process.env.ET_CAPTURE_DEBUG === '1';
}
function captureLogPath() {
  return join(app.getPath('userData'), 'capture-debug.log');
}
function captureLog(event, data = {}) {
  if (!captureDebugEnabled()) return;
  try {
    appendFileSync(captureLogPath(), JSON.stringify({
      time: new Date().toISOString(),
      event,
      ...data
    }) + '\n');
  } catch (e) {}
}

function devBase() {
  return process.env.VITE_DEV_URL || 'http://localhost:5173';
}
function popupURL() {
  return isDev
    ? (devBase() + '/popup/popup.html')
    : ('file://' + join(ROOT, 'dist/renderer/popup/popup.html'));
}
function jsonURL() {
  return isDev
    ? (devBase() + '/json-page/json.html')
    : ('file://' + join(ROOT, 'dist/renderer/json-page/json.html'));
}
function captureURL() {
  return isDev
    ? (devBase() + '/capture/capture.html')
    : ('file://' + join(ROOT, 'dist/renderer/capture/capture.html'));
}
function pinURL() {
  return isDev
    ? (devBase() + '/capture/pin.html')
    : ('file://' + join(ROOT, 'dist/renderer/capture/pin.html'));
}

function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 440, height: 620, minWidth: 440, minHeight: 480,
    show: false, frame: false,
    resizable: false, maximizable: false, fullscreenable: false,
    alwaysOnTop: true, skipTaskbar: true,
    vibrancy: 'under-window', visualEffectState: 'active',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      nodeIntegration: false, contextIsolation: true, sandbox: false
    }
  });
  mainWin.loadURL(popupURL());
  mainWin.on('close', e => { e.preventDefault(); mainWin.hide(); });
  // 菜单栏弹窗风格：点击窗口外任意位置立即隐藏
  mainWin.on('blur', () => mainWin.hide());
}

function createJsonWindow() {
  jsonWin = new BrowserWindow({
    width: 1100, height: 760, minWidth: 800, minHeight: 500,
    show: false, titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 13 },   /* 居中于顶部 40px 标题栏条 (40-14)/2≈13 */
    vibrancy: 'under-window', visualEffectState: 'active',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      nodeIntegration: false, contextIsolation: true, sandbox: false
    }
  });
  jsonWin.loadURL(jsonURL());
  jsonWin.on('close', e => { e.preventDefault(); jsonWin.hide(); });
}

/* ===== 截图：全屏标注覆盖层 ===== */
async function captureScreenImage(display, sf) {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.round(display.size.width * sf),
        height: Math.round(display.size.height * sf)
      }
    });
    captureLog('capture-sources', {
      count: sources.length,
      displayId: display.id,
      sources: sources.map(s => ({
        id: s.id,
        name: s.name,
        display_id: s.display_id,
        thumbnailEmpty: s.thumbnail.isEmpty(),
        thumbnailSize: s.thumbnail.getSize()
      }))
    });
    const src = sources.find(s => String(s.display_id) === String(display.id)) || sources[0];
    const image = src && !src.thumbnail.isEmpty() ? src.thumbnail.toDataURL() : '';
    captureLog('capture-source-selected', {
      selected: src ? { id: src.id, name: src.name, display_id: src.display_id, size: src.thumbnail.getSize() } : null,
      hasImage: !!image
    });
    return image;
  } catch (e) {
    captureLog('capture-sources-error', { error: String(e && (e.stack || e.message) || e) });
    return '';
  }
}

function canDetectWindowRects() {
  return process.platform === 'darwin';
}

// 通过 WindowServer 枚举可见窗口的位置/尺寸。相比 System Events，这条路径不需要
// 辅助功能权限，且 CGWindowList 返回顺序接近前台到后台，更适合悬停选窗。
function getWindowRects() {
  return new Promise((resolve) => {
    if (process.platform !== 'darwin') return resolve([]);
    const script = `
ObjC.import('CoreGraphics');
ObjC.import('Foundation');

const options = $.kCGWindowListOptionOnScreenOnly | $.kCGWindowListExcludeDesktopElements;
const ref = $.CGWindowListCopyWindowInfo(options, $.kCGNullWindowID);
const windows = ObjC.deepUnwrap(ObjC.castRefToObject(ref));

for (const win of windows) {
  const layer = Number(win.kCGWindowLayer || 0);
  const alpha = Number(win.kCGWindowAlpha == null ? 1 : win.kCGWindowAlpha);
  const bounds = win.kCGWindowBounds || {};
  const x = Math.round(Number(bounds.X || 0));
  const y = Math.round(Number(bounds.Y || 0));
  const w = Math.round(Number(bounds.Width || 0));
  const h = Math.round(Number(bounds.Height || 0));
  const owner = String(win.kCGWindowOwnerName || '');
  if (layer !== 0 || alpha <= 0.01 || w < 8 || h < 8) continue;
  console.log(owner + '\\t' + x + ',' + y + ',' + w + ',' + h);
}
`;
    execFile('osascript', ['-l', 'JavaScript', '-e', script], { timeout: 1500 }, (err, stdout, stderr) => {
      // JXA's console.log can be delivered on stderr even when the script succeeds.
      const output = stdout || stderr || '';
      if (err || !output) {
        captureLog('window-rects-empty', {
          error: err ? String(err.message || err) : '',
          stderr: stderr || '',
          stdoutLength: stdout ? stdout.length : 0
        });
        return resolve([]);
      }
      const rects = output.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
        const [owner, rawRect] = l.split('\t');
        if (!rawRect) return null;
        const a = rawRect.split(',').map(n => parseInt(n, 10));
        return { owner: owner || '', x: a[0], y: a[1], w: a[2], h: a[3] };
      }).filter(r => r && Number.isFinite(r.x) && r.w > 1 && r.h > 1);
      captureLog('window-rects', {
        count: rects.length,
        sample: rects.slice(0, 8)
      });
      resolve(rects);
    });
  });
}

function toDisplayWindows(winRects, display) {
  return winRects
    .map(r => ({ x: r.x - display.bounds.x, y: r.y - display.bounds.y, w: r.w, h: r.h }))
    .filter((r, i) => !/^EasyTranslate( Helper.*)?$/.test(winRects[i].owner || ''))
    .filter(r => r.w > 1 && r.h > 1 &&
      r.x + r.w > 0 && r.y + r.h > 0 &&
      r.x < display.bounds.width && r.y < display.bounds.height);
}

async function startCapture() {
  if (captureWin) return;
  captureLog('start-capture');
  if (mainWin) mainWin.hide();
  const point = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point);
  const sf = display.scaleFactor || 1;
  const canDetectWindows = canDetectWindowRects();
  let initialWindows = [];
  let captureLoaded = false;
  const windowRectsPromise = (canDetectWindows ? getWindowRects() : Promise.resolve([]))
    .then((winRects) => {
      const windows = toDisplayWindows(winRects, display);
      initialWindows = windows;
      captureLog('window-rects-ready', {
        count: windows.length,
        sample: windows.slice(0, 8),
        captureLoaded
      });
      if (captureLoaded && captureWin) {
        captureLog('window-rects-send', {
          count: windows.length,
          sample: windows.slice(0, 8)
        });
        captureWin.webContents.send('et:capture-windows-update', windows);
      }
      return windows;
    });
  captureLog('capture-display', {
    point,
    displayId: display.id,
    bounds: display.bounds,
    size: display.size,
    scaleFactor: sf,
    canDetectWindows
  });

  // mainWin.hide() 只是发出隐藏指令，系统合成器把它真正从屏幕上抹掉还需要
  // 一两帧时间；如果立刻截屏，会把弹窗自己的残影也拍进截图里。等一帧再截。
  await new Promise(r => setTimeout(r, 120));

  // 截屏图像直接决定覆盖层何时能展示，必须等；窗口位置枚举（微信式自动选窗）
  // 通过 AppleScript 实现，在进程数较多的机器上可能要几秒——不能让它卡住截图
  // 弹出的速度。先只等截屏完成就显示覆盖层，窗口列表异步获取后再补发更新。
  const image = await captureScreenImage(display, sf);
  if (!image) {
    captureLog('capture-image-empty');
    if (mainWin) mainWin.show();
    if (process.platform === 'darwin') {
      const ret = await dialog.showMessageBox(mainWin || undefined, {
        type: 'info',
        title: '需要屏幕录制权限',
        message: '请在「系统设置 › 隐私与安全性 › 录屏与系统录音」中勾选 EasyTranslate，然后完全退出并重新打开本应用。',
        detail: '如果已经勾选仍看到此提示，请先关闭 EasyTranslate，再把系统设置里的 EasyTranslate 开关关闭后重新打开一次。',
        buttons: ['打开系统设置', '稍后'],
        defaultId: 0,
        cancelId: 1
      });
      if (ret.response === 0) {
        shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
      }
    }
    return;
  }

  captureWin = new BrowserWindow({
    x: display.bounds.x, y: display.bounds.y,
    width: display.bounds.width, height: display.bounds.height,
    frame: false, transparent: true, resizable: false, movable: false,
    minimizable: false, maximizable: false, fullscreenable: false,
    hasShadow: false, skipTaskbar: true, enableLargerThanScreen: true,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      nodeIntegration: false, contextIsolation: true, sandbox: false
    }
  });
  captureWin.setAlwaysOnTop(true, 'screen-saver');
  captureWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  captureWin.loadURL(captureURL());
  captureWin.webContents.once('did-finish-load', () => {
    if (!captureWin) return;
    captureLoaded = true;
    captureWin.webContents.send('et:capture-init', {
      image, displayBounds: display.bounds, scaleFactor: sf,
      windows: initialWindows, canDetectWindows
    });
    captureLog('capture-init-sent', {
      initialWindows: initialWindows.length
    });
    captureWin.show();
    captureWin.focus();
  });
  captureWin.on('closed', () => { captureWin = null; });
  windowRectsPromise.catch(() => {});
}
function closeCapture() {
  if (captureWin) { try { captureWin.close(); } catch (e) {} captureWin = null; }
}

/* ===== 钉图：把截好的图固定在屏幕上 ===== */
function createPinWindow(p) {
  const win = new BrowserWindow({
    x: Math.round(p.x), y: Math.round(p.y),
    width: Math.max(20, Math.round(p.width)), height: Math.max(20, Math.round(p.height)),
    frame: false, transparent: true, resizable: false, hasShadow: true,
    skipTaskbar: true, movable: true, fullscreenable: false, minimizable: false,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      nodeIntegration: false, contextIsolation: true, sandbox: false
    }
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadURL(pinURL());
  win.webContents.once('did-finish-load', () =>
    win.webContents.send('et:pin-init', { image: p.dataURL }));
  pinWins.push(win);
  win.on('closed', () => { pinWins = pinWins.filter(w => w !== win); });
}

function toggleMainWindow() {
  if (!mainWin) return;
  if (mainWin.isVisible() && mainWin.isFocused()) { mainWin.hide(); return; }
  if (tray) {
    const tb = tray.getBounds(), wb = mainWin.getBounds();
    mainWin.setPosition(
      Math.round(tb.x + tb.width / 2 - wb.width / 2),
      Math.round(tb.y + tb.height + 4)
    );
  }
  mainWin.show(); mainWin.focus();
}

function createTray() {
  const iconPath = join(ROOT, 'resources', 'tray.png');
  let icon;
  try {
    // tray.png 已是 22×22 模板图，配套 tray@2x.png 自动用于 Retina；勿强制 resize 以免丢失 @2x
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) throw new Error('tray icon empty');
    icon.setTemplateImage(true);
  } catch (e) { icon = nativeImage.createEmpty(); }
  tray = new Tray(icon);
  tray.setToolTip('EasyTranslate');
  const trayMenu = Menu.buildFromTemplate([
    { label: '\u663e\u793a EasyTranslate', accelerator: 'CommandOrControl+Shift+T', click: toggleMainWindow },
    { label: '\u5de5\u5177\u5927\u7a97\u53e3', click: () => openToolsWindow('json') },
    { type: 'separator' },
    { label: '\u9000\u51fa', accelerator: 'Command+Q', click: () => app.exit(0) }
  ]);
  // \u5de6\u952e\u5355\u51fb\u663e\u9690\u7a97\u53e3\uff1b\u53f3\u952e\u5f39\u51fa\u83dc\u5355\uff08\u4e0d\u7528 setContextMenu\uff0c\u5426\u5219\u5de6\u952e\u4e5f\u4f1a\u5f39\u83dc\u5355\uff09
  tray.on('click', toggleMainWindow);
  tray.on('right-click', () => tray.popUpContextMenu(trayMenu));
}

function registerShortcuts() {
  globalShortcut.register('CommandOrControl+Shift+T', toggleMainWindow);
  globalShortcut.register('CommandOrControl+Shift+Z', () => startCapture());
  globalShortcut.register('CommandOrControl+Shift+Y', async () => {
    const prev = clipboard.readText();
    try {
      const { execSync } = await import('child_process');
      execSync("osascript -e 'tell application \"System Events\" to keystroke \"c\" using command down'");
      await new Promise(r => setTimeout(r, 150));
    } catch (e) { /* no accessibility permission */ }
    const selected = clipboard.readText();
    setTimeout(() => clipboard.writeText(prev), 300);
    if (selected && selected.trim() && selected !== prev) {
      toggleMainWindow();
      await new Promise(r => setTimeout(r, 300));
      if (mainWin) mainWin.webContents.send('et:translate-selection', selected.trim());
    } else { toggleMainWindow(); }
  });
}

function registerIPC() {
  ipcMain.handle('et:store-get',    (_, k, fb) => getValue(k, fb === undefined ? null : fb));
  ipcMain.handle('et:store-set',    (_, k, v)  => setValue(k, v));
  ipcMain.handle('et:store-delete', (_, k)     => deleteValue(k));
  ipcMain.handle('et:get-history',  ()         => getHistory());
  ipcMain.handle('et:add-history',  (_, e)     => addHistory(e));
  ipcMain.handle('et:clear-history',()         => clearHistory());
  ipcMain.handle('et:get-theme',    ()         => getTheme());
  ipcMain.handle('et:set-theme',    (_, t)     => setTheme(t));
  ipcMain.handle('et:get-auth-accounts', () => getAuthAccounts());
  ipcMain.handle('et:set-auth-accounts', (_, accounts) => setAuthAccounts(accounts));
  ipcMain.on('et:window-close',    e => { const w = BrowserWindow.fromWebContents(e.sender); if(w) w.hide(); });
  ipcMain.on('et:window-minimize', e => { const w = BrowserWindow.fromWebContents(e.sender); if(w) w.minimize(); });
  ipcMain.handle('et:open-tools-window', async (_, tab = 'json', draft) => openToolsWindow(tab, draft));
  ipcMain.handle('et:open-json-window', async (_, draft) => openToolsWindow('json', draft));
  ipcMain.handle('et:open-url',       (_, url) => shell.openExternal(url));
  ipcMain.handle('et:set-login-item', (_, en)  =>
    app.setLoginItemSettings({ openAtLogin: en, openAsHidden: true }));
  ipcMain.handle('et:get-login-item', () => app.getLoginItemSettings().openAtLogin);

  // JSON 窗口置顶
  ipcMain.handle('et:toggle-json-pin', () => {
    if (!jsonWin) return false;
    const next = !jsonWin.isAlwaysOnTop();
    jsonWin.setAlwaysOnTop(next, 'floating');
    return next;
  });
  ipcMain.handle('et:get-json-pin', () => (jsonWin ? jsonWin.isAlwaysOnTop() : false));

  // 截图
  ipcMain.handle('et:start-capture', () => startCapture());
  ipcMain.on('et:capture-cancel', () => closeCapture());
  ipcMain.on('et:capture-copy', (_, dataURL) => {
    try { clipboard.writeImage(nativeImage.createFromDataURL(dataURL)); } catch (e) {}
    closeCapture();
  });
  ipcMain.handle('et:capture-save', async (_, dataURL) => {
    try {
      const img = nativeImage.createFromDataURL(dataURL);
      const d = new Date();
      const pad = n => String(n).padStart(2, '0');
      const name = `截图_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
      const ret = await dialog.showSaveDialog(captureWin || undefined, {
        defaultPath: join(app.getPath('pictures'), name),
        filters: [{ name: 'PNG 图片', extensions: ['png'] }]
      });
      if (!ret.canceled && ret.filePath) writeFileSync(ret.filePath, img.toPNG());
    } catch (e) {}
    closeCapture();
  });
  ipcMain.on('et:capture-pin', (_, p) => { createPinWindow(p); closeCapture(); });
  ipcMain.on('et:pin-close', e => {
    const w = BrowserWindow.fromWebContents(e.sender); if (w) w.close();
  });
}

async function openToolsWindow(tab = 'json', draft) {
  const targetTab = tab === 'base64' ? 'base64' : 'json';
  if (draft && targetTab === 'json') await setValue('jsonDraft', draft);
  if (jsonWin) {
    jsonWin.show();
    jsonWin.focus();
    jsonWin.webContents.send('et:load-tools-tab', { tab: targetTab });
    if (draft && targetTab === 'json') jsonWin.webContents.send('et:load-json-draft');
  }
}

async function getAuthAccounts() {
  const encrypted = await getValue(AUTH_ACCOUNTS_ENCRYPTED_KEY, null);
  if (encrypted && encrypted.data) return decryptAuthAccounts(encrypted.data);

  const legacy = await getValue(AUTH_ACCOUNTS_KEY, null);
  if (Array.isArray(legacy)) {
    await setAuthAccounts(legacy);
    await deleteValue(AUTH_ACCOUNTS_KEY);
    return legacy;
  }
  return [];
}

async function setAuthAccounts(accounts) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('系统加密能力不可用，无法保存 Authenticator 数据');
  }
  const safeAccounts = Array.isArray(accounts) ? accounts : [];
  const encrypted = safeStorage.encryptString(JSON.stringify(safeAccounts)).toString('base64');
  await setValue(AUTH_ACCOUNTS_ENCRYPTED_KEY, {
    version: 1,
    data: encrypted,
    updatedAt: Date.now()
  });
  await deleteValue(AUTH_ACCOUNTS_KEY);
}

function decryptAuthAccounts(data) {
  try {
    const raw = safeStorage.decryptString(Buffer.from(data, 'base64'));
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function watchTheme() {
  nativeTheme.on('updated', () => {
    const t = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    if (mainWin) mainWin.webContents.send('et:system-theme-changed', t);
    if (jsonWin) jsonWin.webContents.send('et:system-theme-changed', t);
  });
}

app.whenReady().then(() => {
  app.setAboutPanelOptions({ applicationName: 'EasyTranslate', applicationVersion: app.getVersion() });
  if (process.platform === 'darwin') app.dock.hide();
  createMainWindow(); createJsonWindow();
  createTray(); registerShortcuts(); registerIPC(); watchTheme();
});

app.on('window-all-closed', e => e.preventDefault());
app.on('will-quit',  () => globalShortcut.unregisterAll());
app.on('activate',   () => toggleMainWindow());
