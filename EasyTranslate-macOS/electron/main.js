// electron/main.js
import {
  app, BrowserWindow, Tray, Menu, globalShortcut,
  ipcMain, shell, clipboard, nativeImage, nativeTheme,
  desktopCapturer, screen, dialog, systemPreferences
} from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync } from 'fs';
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
    const src = sources.find(s => String(s.display_id) === String(display.id)) || sources[0];
    return src ? src.thumbnail.toDataURL() : '';
  } catch (e) { return ''; }
}

// 通过 System Events 枚举可见窗口的位置/尺寸（需辅助功能权限；无权限则返回 []）
function getWindowRects() {
  return new Promise((resolve) => {
    if (process.platform !== 'darwin') return resolve([]);
    const script = 'tell application "System Events"\n'
      + 'set out to ""\n'
      + 'repeat with p in (every process whose visible is true and background only is false)\n'
      + 'repeat with w in (every window of p)\n'
      + 'try\n'
      + 'set ps to position of w\n'
      + 'set sz to size of w\n'
      + 'set out to out & (item 1 of ps) & "," & (item 2 of ps) & "," & (item 1 of sz) & "," & (item 2 of sz) & linefeed\n'
      + 'end try\n'
      + 'end repeat\n'
      + 'end repeat\n'
      + 'return out\n'
      + 'end tell';
    import('child_process').then(({ execFile }) => {
      execFile('osascript', ['-e', script], { timeout: 1500 }, (err, stdout) => {
        if (err || !stdout) return resolve([]);
        const rects = stdout.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
          const a = l.split(',').map(n => parseInt(n, 10));
          return { x: a[0], y: a[1], w: a[2], h: a[3] };
        }).filter(r => Number.isFinite(r.x) && r.w > 1 && r.h > 1);
        resolve(rects);
      });
    }).catch(() => resolve([]));
  });
}

async function startCapture() {
  if (captureWin) return;
  // 录屏权限检查：未授权时直接打开设置面板并提示，避免出现黑屏覆盖层
  if (process.platform === 'darwin') {
    const status = systemPreferences.getMediaAccessStatus('screen');
    if (status !== 'granted') {
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
      dialog.showMessageBox({
        type: 'info',
        title: '需要屏幕录制权限',
        message: '请在「系统设置 › 隐私与安全性 › 录屏与系统录音」中勾选 EasyTranslate，然后重启本应用再截图。',
        detail: '开发模式下若由其它程序启动，会归属到父进程；授权后必须重启进程权限才生效。',
        buttons: ['好的']
      });
      return;
    }
  }
  if (mainWin) mainWin.hide();
  const point = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point);
  const sf = display.scaleFactor || 1;

  // 截屏 + 枚举窗口（微信式自动选窗）并行
  const [image, winRects] = await Promise.all([
    captureScreenImage(display, sf),
    getWindowRects()
  ]);
  const windows = winRects
    .map(r => ({ x: r.x - display.bounds.x, y: r.y - display.bounds.y, w: r.w, h: r.h }))
    .filter(r => r.w > 1 && r.h > 1 &&
      r.x + r.w > 0 && r.y + r.h > 0 &&
      r.x < display.bounds.width && r.y < display.bounds.height);

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
    captureWin.webContents.send('et:capture-init', {
      image, displayBounds: display.bounds, scaleFactor: sf, windows
    });
    captureWin.show();
    captureWin.focus();
  });
  captureWin.on('closed', () => { captureWin = null; });
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
    { label: 'JSON \u683c\u5f0f\u5316\u5de5\u5177', click: () => { if(jsonWin){jsonWin.show();jsonWin.focus();} } },
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
  ipcMain.on('et:window-close',    e => { const w = BrowserWindow.fromWebContents(e.sender); if(w) w.hide(); });
  ipcMain.on('et:window-minimize', e => { const w = BrowserWindow.fromWebContents(e.sender); if(w) w.minimize(); });
  ipcMain.handle('et:open-json-window', async (_, draft) => {
    if (draft) await setValue('jsonDraft', draft);
    if (jsonWin) { jsonWin.show(); jsonWin.focus(); }
    if (draft && jsonWin) jsonWin.webContents.send('et:load-json-draft');
  });
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
