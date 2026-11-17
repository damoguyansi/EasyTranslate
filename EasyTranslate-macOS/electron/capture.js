// 截图：原生 screencapture 抓屏 + 预热的全屏标注窗口 + 钉图窗口
import {
  BrowserWindow, screen, desktopCapturer, systemPreferences, shell, dialog, app, Menu
} from 'electron';
import { execFile } from 'node:child_process';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadPage, webPrefs } from './windows.js';
import { writePng } from './clipboard.js';

const isMac = process.platform === 'darwin';
const SELF_OWNERS = /^(EasyTranslate|Electron)( Helper.*)?$/;
const IGNORED_OWNERS = new Set(['Window Server', 'Dock', 'Control Center', 'SystemUIServer', 'Notification Center']);

// JXA：通过 CGWindowList 枚举屏幕上的窗口（无需辅助功能权限），顺序为前台→后台
const WINDOW_LIST_JXA = `
ObjC.import('CoreGraphics');
const ref = $.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly | $.kCGWindowListExcludeDesktopElements, $.kCGNullWindowID);
const list = ObjC.deepUnwrap(ObjC.castRefToObject(ref)) || [];
const out = [];
for (const w of list) {
  const b = w.kCGWindowBounds || {};
  const layer = Number(w.kCGWindowLayer || 0);
  const alpha = Number(w.kCGWindowAlpha == null ? 1 : w.kCGWindowAlpha);
  if (alpha <= 0.01 || layer < 0 || layer > 25) continue;
  out.push([String(w.kCGWindowOwnerName || ''), layer, Math.round(b.X || 0), Math.round(b.Y || 0), Math.round(b.Width || 0), Math.round(b.Height || 0)]);
}
JSON.stringify(out);
`;

export function parseWindowList(stdout) {
  let rows;
  try {
    rows = JSON.parse(String(stdout || '').trim() || '[]');
  } catch {
    return [];
  }
  return rows
    .map(([owner, layer, x, y, w, h]) => ({ owner, layer, x, y, w, h }))
    .filter((r) => r.w >= 16 && r.h >= 16 && !SELF_OWNERS.test(r.owner) && !IGNORED_OWNERS.has(r.owner));
}

/** 全局坐标 → 显示器本地坐标，并裁掉与该显示器不相交的窗口。 */
export function toLocalRects(rects, bounds) {
  const out = [];
  for (const r of rects) {
    const x1 = Math.max(r.x, bounds.x);
    const y1 = Math.max(r.y, bounds.y);
    const x2 = Math.min(r.x + r.w, bounds.x + bounds.width);
    const y2 = Math.min(r.y + r.h, bounds.y + bounds.height);
    if (x2 - x1 < 16 || y2 - y1 < 16) continue;
    out.push({ x: x1 - bounds.x, y: y1 - bounds.y, w: x2 - x1, h: y2 - y1 });
  }
  return out;
}

function listWindows() {
  if (!isMac) return Promise.resolve([]);
  return new Promise((resolve) => {
    execFile('osascript', ['-l', 'JavaScript', '-e', WINDOW_LIST_JXA], { timeout: 2500 }, (err, stdout) => {
      resolve(err ? [] : parseWindowList(stdout));
    });
  });
}

function screencaptureRect(bounds) {
  const file = join(tmpdir(), `et-shot-${process.pid}-${Date.now()}.png`);
  const rect = `${bounds.x},${bounds.y},${bounds.width},${bounds.height}`;
  return new Promise((resolve) => {
    execFile('screencapture', ['-x', '-t', 'png', '-R', rect, file], { timeout: 6000 }, async (err) => {
      if (err) return resolve(null);
      try {
        const buf = await readFile(file);
        resolve(buf.length > 0 ? buf : null);
      } catch {
        resolve(null);
      } finally {
        unlink(file).catch(() => {});
      }
    });
  });
}

async function desktopCapture(display) {
  const sf = display.scaleFactor || 1;
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: Math.round(display.size.width * sf), height: Math.round(display.size.height * sf) }
  });
  const src = sources.find((s) => String(s.display_id) === String(display.id)) || sources[0];
  if (!src || src.thumbnail.isEmpty()) return null;
  return src.thumbnail.toPNG();
}

export function screenPermission() {
  if (!isMac) return 'granted';
  try {
    return systemPreferences.getMediaAccessStatus('screen');
  } catch {
    return 'unknown';
  }
}

async function grab(display) {
  if (isMac) {
    const buf = await screencaptureRect(display.bounds);
    if (buf) return buf;
  }
  try {
    return await desktopCapture(display);
  } catch {
    return null;
  }
}

async function askScreenPermission() {
  const ret = await dialog.showMessageBox({
    type: 'info',
    title: '需要屏幕录制权限',
    message: '请在「系统设置 › 隐私与安全性 › 录屏与系统录音」中允许 EasyTranslate，然后重新打开应用。',
    buttons: ['打开系统设置', '取消'],
    defaultId: 0,
    cancelId: 1
  });
  if (ret.response === 0) {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
  }
}

function timestampName(prefix = '截图') {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${prefix} ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}.png`;
}

export function createCaptureManager({ beforeCapture, onQrResult, getSaveDir }) {
  let overlay = null;
  let overlayReady = null;
  let busy = false;
  let session = 0;
  const pins = new Set();

  function ensureOverlay() {
    if (overlay && !overlay.isDestroyed()) return overlayReady;
    overlay = new BrowserWindow({
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      hasShadow: false,
      skipTaskbar: true,
      enableLargerThanScreen: true,
      roundedCorners: false,
      ...(isMac ? { type: 'panel' } : {}),
      webPreferences: webPrefs()
    });
    overlay.setAlwaysOnTop(true, 'screen-saver');
    overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    overlay.on('closed', () => {
      overlay = null;
      overlayReady = null;
      busy = false;
    });
    overlayReady = new Promise((resolve) => overlay.webContents.once('did-finish-load', resolve));
    loadPage(overlay, 'capture');
    return overlayReady;
  }

  /** 预热：启动后立即加载覆盖层页面，首次截图无需等待页面加载 */
  function prewarm() {
    ensureOverlay();
  }

  async function start({ mode = 'annotate' } = {}) {
    if (busy) return;
    busy = true;
    const id = ++session;
    try {
      const perm = screenPermission();
      if (perm === 'denied' || perm === 'restricted') {
        busy = false;
        await askScreenPermission();
        return;
      }
      await beforeCapture?.();
      const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
      const winsPromise = listWindows();
      const [png] = await Promise.all([grab(display), ensureOverlay()]);
      if (id !== session) return;
      if (!png) {
        busy = false;
        await askScreenPermission();
        return;
      }
      const b = display.bounds;
      overlay.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height });
      overlay.webContents.send('capture:open', {
        png,
        mode,
        width: b.width,
        height: b.height,
        scaleFactor: display.scaleFactor || 1
      });
      winsPromise.then((rects) => {
        if (id === session && overlay && !overlay.isDestroyed()) {
          overlay.webContents.send('capture:windows', toLocalRects(rects, b));
        }
      });
    } catch (e) {
      busy = false;
      console.error('[capture] failed', e);
    }
  }

  /** 渲染进程解码并绘制完首帧后再显示，避免闪白 */
  function onReady() {
    if (!overlay || overlay.isDestroyed()) return;
    overlay.setBounds(overlay.getBounds());
    overlay.show();
    overlay.focus();
    if (isMac) app.focus({ steal: true });
  }

  function close() {
    session++;
    busy = false;
    if (overlay && !overlay.isDestroyed()) {
      overlay.hide();
      overlay.webContents.send('capture:reset');
    }
  }

  async function finish({ action, png, rect, scaleFactor = 1, text, mode }) {
    const buf = png ? Buffer.from(png) : null;
    close();
    if (action === 'copy' && buf) {
      await writePng(buf).catch((e) => console.error('[capture] copy failed', e));
    } else if (action === 'save' && buf) {
      const dir = getSaveDir?.() || app.getPath('desktop');
      const ret = await dialog.showSaveDialog({
        defaultPath: join(dir, timestampName()),
        filters: [{ name: 'PNG 图片', extensions: ['png'] }]
      });
      if (!ret.canceled && ret.filePath) await writeFile(ret.filePath, buf);
    } else if (action === 'pin' && buf) {
      createPin(buf, rect, scaleFactor);
    } else if (action === 'qr') {
      onQrResult?.(text || '', mode);
    }
  }

  function createPin(buf, rect, scaleFactor) {
    const display = overlay && !overlay.isDestroyed() ? overlay.getBounds() : { x: 0, y: 0 };
    const win = new BrowserWindow({
      x: Math.round(display.x + rect.x),
      y: Math.round(display.y + rect.y),
      width: Math.max(24, Math.round(rect.w)),
      height: Math.max(24, Math.round(rect.h)),
      frame: false,
      resizable: false,
      hasShadow: true,
      skipTaskbar: true,
      fullscreenable: false,
      minimizable: false,
      maximizable: false,
      transparent: true,
      backgroundColor: '#00000000',
      ...(isMac ? { type: 'panel' } : {}),
      webPreferences: webPrefs()
    });
    win.setAlwaysOnTop(true, 'floating');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    loadPage(win, 'pin');
    const base = { w: Math.round(rect.w), h: Math.round(rect.h) };
    win.webContents.once('did-finish-load', () => {
      win.webContents.send('pin:image', { png: buf, scaleFactor });
      win.showInactive();
    });
    win.__pin = { buf, scaleFactor, base, zoom: 1 };
    pins.add(win);
    win.on('closed', () => pins.delete(win));
  }

  function pinAction(win, action, value) {
    if (!win || !win.__pin) return;
    const p = win.__pin;
    if (action === 'close') win.close();
    else if (action === 'move' && value) {
      const [x, y] = win.getPosition();
      win.setPosition(Math.round(x + (Number(value.dx) || 0)), Math.round(y + (Number(value.dy) || 0)), false);
    }
    else if (action === 'copy') writePng(p.buf).catch(() => {});
    else if (action === 'save') {
      dialog
        .showSaveDialog({ defaultPath: join(getSaveDir?.() || app.getPath('desktop'), timestampName('钉图')) })
        .then((r) => !r.canceled && r.filePath && writeFile(r.filePath, p.buf));
    } else if (action === 'zoom') {
      p.zoom = Math.min(4, Math.max(0.2, p.zoom * (value > 0 ? 1.1 : 1 / 1.1)));
      const b = win.getBounds();
      const w = Math.round(p.base.w * p.zoom);
      const h = Math.round(p.base.h * p.zoom);
      win.setBounds({ x: b.x + Math.round((b.width - w) / 2), y: b.y + Math.round((b.height - h) / 2), width: w, height: h });
    } else if (action === 'menu') {
      Menu.buildFromTemplate([
        { label: '复制', click: () => pinAction(win, 'copy') },
        { label: '保存…', click: () => pinAction(win, 'save') },
        { label: '原始大小', click: () => { p.zoom = 1.1; pinAction(win, 'zoom', -1); } },
        { type: 'separator' },
        { label: '关闭', click: () => win.close() },
        { label: '关闭全部钉图', click: () => closeAllPins() }
      ]).popup({ window: win });
    }
  }

  function closeAllPins() {
    for (const w of [...pins]) if (!w.isDestroyed()) w.close();
  }

  return { prewarm, start, onReady, close, finish, pinAction, closeAllPins, hasPins: () => pins.size > 0 };
}
