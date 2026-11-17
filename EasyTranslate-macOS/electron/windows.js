// 窗口管理：菜单栏弹窗（常驻预热）+ 工作台大窗口（按需创建）
import { BrowserWindow, Menu, screen, app } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dirname, '..');
const isMac = process.platform === 'darwin';

export const POPUP_SIZE = { width: 420, height: 600 };

export function loadPage(win, page) {
  const dev = process.env.VITE_DEV_URL;
  if (dev) return win.loadURL(`${dev.replace(/\/$/, '')}/${page}/index.html`);
  return win.loadFile(join(ROOT, 'dist', 'renderer', page, 'index.html'));
}

export function webPrefs(extra = {}) {
  return {
    preload: join(__dirname, 'preload.cjs'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    spellcheck: false,
    backgroundThrottling: false,
    ...extra
  };
}

export function attachContextMenu(win) {
  win.webContents.on('context-menu', (_e, params) => {
    const t = [];
    if (params.isEditable) {
      t.push(
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { type: 'separator' },
        { role: 'selectAll', label: '全选' }
      );
    } else if (params.selectionText) {
      t.push({ role: 'copy', label: '复制' });
    }
    if (t.length) Menu.buildFromTemplate(t).popup({ window: win });
  });
}

/* ================= 菜单栏弹窗 ================= */
export function createPopup() {
  const win = new BrowserWindow({
    ...POPUP_SIZE,
    show: false,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: true,
    roundedCorners: true,
    transparent: false,
    backgroundColor: '#00000000',
    ...(isMac ? { type: 'panel', vibrancy: 'popover', visualEffectState: 'active' } : {}),
    webPreferences: webPrefs()
  });
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  win.setAlwaysOnTop(true, 'pop-up-menu');
  attachContextMenu(win);
  loadPage(win, 'popup');

  let pinned = false;
  let ready = false;
  let pending = null;
  let suppressBlurUntil = 0;
  win.webContents.once('did-finish-load', () => {
    ready = true;
    if (pending) {
      win.webContents.send('popup:shown', pending);
      pending = null;
    }
  });

  win.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });
  win.on('blur', () => {
    if (pinned || Date.now() < suppressBlurUntil) return;
    setTimeout(() => {
      if (!win.isDestroyed() && !win.isFocused() && !pinned) win.hide();
    }, 80);
  });

  function position(anchor, trayBounds) {
    const { width, height } = win.getBounds();
    let x;
    let y;
    let area;
    if (anchor === 'tray' && trayBounds && trayBounds.width) {
      const cx = Math.round(trayBounds.x + trayBounds.width / 2);
      area = screen.getDisplayNearestPoint({ x: cx, y: trayBounds.y }).workArea;
      x = cx - Math.round(width / 2);
      y = Math.round(trayBounds.y + trayBounds.height + 6);
    } else {
      // Spotlight 式：在鼠标所在屏幕上方居中
      area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
      x = Math.round(area.x + (area.width - width) / 2);
      y = Math.round(area.y + area.height * 0.16);
    }
    x = Math.min(Math.max(x, area.x + 8), area.x + area.width - width - 8);
    y = Math.min(Math.max(y, area.y + 4), area.y + area.height - height - 4);
    win.setPosition(x, y, false);
  }

  function show({ anchor = 'cursor', trayBounds, payload = {} } = {}) {
    if (!win.isVisible()) position(anchor, trayBounds);
    suppressBlurUntil = Date.now() + 300;
    win.show();
    win.focus();
    // panel 为非激活窗口，一般可直接成为 key window；个别情况下兜底激活一次
    if (isMac) {
      setTimeout(() => {
        if (!win.isDestroyed() && win.isVisible() && !win.isFocused()) {
          app.focus({ steal: true });
          win.focus();
        }
      }, 60);
    }
    const msg = { ...payload, at: Date.now() };
    if (ready) win.webContents.send('popup:shown', msg);
    else pending = msg;
  }

  function hide() {
    if (win.isVisible()) win.hide();
  }

  function toggle(opts) {
    if (win.isVisible() && win.isFocused()) hide();
    else show(opts);
  }

  function setPinned(v) {
    pinned = !!v;
    return pinned;
  }

  return {
    win,
    show,
    hide,
    toggle,
    setPinned,
    isPinned: () => pinned,
    holdOpen(ms = 600) {
      suppressBlurUntil = Date.now() + ms;
    }
  };
}

/* ================= 工作台（JSON / 编码大窗口） ================= */
export function createWorkspaceManager() {
  let win = null;
  let ready = false;
  let queue = [];

  function ensure() {
    if (win && !win.isDestroyed()) return win;
    ready = false;
    win = new BrowserWindow({
      width: 1180,
      height: 760,
      minWidth: 720,
      minHeight: 460,
      show: false,
      title: 'EasyTranslate 工作台',
      titleBarStyle: isMac ? 'hiddenInset' : 'default',
      trafficLightPosition: { x: 14, y: 14 },
      backgroundColor: '#00000000',
      ...(isMac ? { vibrancy: 'sidebar', visualEffectState: 'followWindow' } : {}),
      webPreferences: webPrefs()
    });
    attachContextMenu(win);
    loadPage(win, 'workspace');
    win.once('ready-to-show', () => win.show());
    win.webContents.once('did-finish-load', () => {
      ready = true;
      for (const m of queue) win.webContents.send('workspace:open', m);
      queue = [];
    });
    win.on('close', (e) => {
      if (!app.isQuitting) {
        e.preventDefault();
        win.hide();
      }
    });
    return win;
  }

  function open(payload = {}) {
    const w = ensure();
    if (ready) {
      w.webContents.send('workspace:open', payload);
      w.show();
      w.focus();
    } else {
      queue.push(payload);
    }
    if (isMac) app.focus({ steal: true });
  }

  function togglePin() {
    if (!win || win.isDestroyed()) return false;
    const next = !win.isAlwaysOnTop();
    win.setAlwaysOnTop(next, 'floating');
    return next;
  }

  return { open, togglePin, get: () => win };
}
