# EasyTranslate macOS 桌面端 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 EasyTranslate 浏览器插件（翻译/密码生成/Base64/JSON工具箱）移植为 macOS 原生菜单栏应用，完整保留全部四大功能，新增菜单栏托盘、全局快捷键 ⌘⇧T/⌘⇧Y 和开机自启。

**Architecture:** Electron 32 作为运行时宿主，Vite 5 打包 Renderer；原插件 `src/lib/` 下 6 个纯逻辑模块**零改动**直接复用；`chrome.storage.local` 层替换为通过 IPC 通信的 electron-store 适配器；Main Process 负责系统托盘、两个 BrowserWindow（380×680 主窗口 + 1100×760 JSON 全屏窗口）、全局快捷键与 IPC Handler；Preload 用 `.cjs` + contextBridge 安全暴露 `window.electronAPI`。

**Tech Stack:** Electron 32.3.x · Vite 5.4.x · electron-store 10.x · electron-builder 25.x · Node.js ≥ 20 · 原生 JavaScript ESM · iconutil（macOS 系统自带）

## Global Constraints

- 不修改 `../EasyTranslate-chrome/src/lib/` 原始文件；所有变更在 `EasyTranslate-macOS/` 目录内完成
- Renderer 禁用 Node.js 集成（`nodeIntegration: false`），开启上下文隔离（`contextIsolation: true`）
- Preload 脚本使用 `.cjs` 后缀，以 CommonJS `require('electron')` 调用 contextBridge（避免 ESM preload 兼容问题）
- Main Process 与 `electron/store.js` 均为 ES Modules（package.json `"type": "module"`）
- IPC 频道统一以 `et:` 为前缀；目标 macOS 12+；Universal Binary（arm64 + x64）
- 测试框架：Node.js 内置 `node:test`，无需额外依赖；纯 JavaScript，无 TypeScript
- 项目根目录：`EasyTranslate-macOS/`（位于 Git root `EasyTranslate/` 内部，与 `EasyTranslate-chrome/` 同级）

---

## 功能对照表

| 浏览器插件功能 | macOS 实现方式 | 改动说明 |
|---|---|---|
| Popup 弹窗（翻译/密码/Base64/JSON 4 Tab） | BrowserWindow 380×680 | titleBarStyle: hiddenInset，自定义标题栏 |
| 翻译（Edge API，自动检测中/英/日） | 复用 translate.js + language.js | **零改动** |
| 翻译历史（30条，去重，点击回填） | electron-store → IPC 替代 chrome.storage.local | storage-ipc.js 适配层 |
| 划词图标翻译（content script） | ❌ 移除 | 无 content script 概念 |
| 右键菜单翻译（contextMenus） | ⌘⇧Y 全局快捷键代替 | 需辅助功能权限，优雅降级 |
| 密码生成器（crypto.getRandomValues） | 复用 password.js | **零改动** |
| Base64 Unicode 编解码 | 复用 base64.js | **零改动** |
| JSON 格式化/压缩/验证/转义/树视图 | 复用 json.js | **零改动** |
| JSON 独立全屏页（树视图，行号） | 独立 BrowserWindow 1100×760 | IPC 传递草稿，替代 chrome.tabs |
| 深浅色主题（记忆偏好） | electron-store + nativeTheme 跟随 | 新增系统主题自动切换 |
| Toast / flashButton 反馈 | 复用 ui.js | **零改动** |
| 开机自启 | app.setLoginItemSettings | **新增**，页脚复选框 |
| 菜单栏托盘 | Tray + 右键菜单 | **新增** |
| ⌘⇧T 快捷键显示/隐藏 | globalShortcut | **新增** |

---

### Task 1: 项目脚手架（Scaffolding）

**Files:**
- Create: `package.json`, `vite.config.js`, `electron-builder.config.js`, `.gitignore`
- Create dirs: `electron/ src/lib/ src/popup/ src/json-page/ src/styles/ resources/ scripts/ docs/superpowers/plans/`

**Interfaces:**
- `npm run dev` → Vite dev server (port 5173) + Electron 开发模式（HMR）
- `npm run build` → Vite 打包 renderer 到 `dist/renderer/`
- `npm run dist` → electron-builder 打包为 Universal DMG
- `npm test` → node --test 运行所有 scripts/test-*.mjs

- [ ] **Step 1: 创建目录**

```bash
mkdir -p electron src/popup src/json-page src/styles \
         resources scripts docs/superpowers/plans
```

- [ ] **Step 2: 写 package.json**

```json
{
  "name": "easytranslate-macos",
  "version": "2.0.0",
  "description": "EasyTranslate macOS 菜单栏工具箱：翻译 · 密码 · Base64 · JSON",
  "type": "module",
  "main": "electron/main.js",
  "scripts": {
    "dev": "concurrently \"vite\" \"wait-on http://localhost:5173 && electron .\"",
    "build": "vite build",
    "dist": "npm run build && electron-builder --mac --universal",
    "test": "node --test scripts/test-scaffold.mjs scripts/test-migration.mjs scripts/test-popup.mjs scripts/test-json-page.mjs scripts/test-resources.mjs scripts/test-build.mjs"
  },
  "devDependencies": {
    "concurrently": "^9.1.2",
    "electron": "^32.3.3",
    "electron-builder": "^25.1.8",
    "vite": "^5.4.19",
    "wait-on": "^8.0.3"
  },
  "dependencies": {
    "electron-store": "^10.0.0"
  }
}
```

- [ ] **Step 3: 写 vite.config.js**

```js
// vite.config.js
import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: 'src',
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/popup.html'),
        json:  resolve(__dirname, 'src/json-page/json.html')
      }
    }
  },
  server: { port: 5173 }
});
```

- [ ] **Step 4: 写 electron-builder.config.js**

```js
// electron-builder.config.js
export default {
  appId: 'com.damoguyansi.easytranslate',
  productName: 'EasyTranslate',
  directories: { output: 'dist' },
  files: [
    'electron/**/*', 'dist/renderer/**/*',
    'resources/icon.icns', 'resources/tray.png',
    'resources/entitlements.mac.plist', 'package.json'
  ],
  mac: {
    category: 'public.app-category.utilities',
    icon: 'resources/icon.icns',
    target: [{ target: 'dmg', arch: ['universal'] }],
    entitlements: 'resources/entitlements.mac.plist',
    entitlementsInherit: 'resources/entitlements.mac.plist',
    hardenedRuntime: true,
    gatekeeperAssess: false
  },
  dmg: {
    title: 'EasyTranslate ${version}',
    contents: [
      { x: 130, y: 220, type: 'file' },
      { x: 410, y: 220, type: 'link', path: '/Applications' }
    ]
  }
};
```

- [ ] **Step 5: 写 .gitignore**

```
node_modules/
dist/
.DS_Store
*.log
resources/icon.iconset/
```

- [ ] **Step 6: 写 scripts/test-scaffold.mjs**

```js
import { existsSync, readFileSync } from 'fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

test('package.json 字段正确', () => {
  const p = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.equal(p.type, 'module');
  assert.equal(p.main, 'electron/main.js');
  assert.ok(p.dependencies['electron-store'], 'electron-store 未声明');
  assert.ok(p.devDependencies['electron'], 'electron 未声明');
});

test('vite.config.js 包含 fileURLToPath 与双入口', () => {
  const src = readFileSync('vite.config.js', 'utf8');
  assert.ok(src.includes('fileURLToPath'), '必须用 fileURLToPath 替代 __dirname');
  assert.ok(src.includes('popup'), '缺少 popup 入口');
  assert.ok(src.includes('json'), '缺少 json 入口');
});

test('electron-builder.config.js 包含 universal 架构', () => {
  assert.ok(readFileSync('electron-builder.config.js', 'utf8').includes('universal'));
});

test('必要目录结构存在', () => {
  for (const d of ['electron','src/lib','src/popup','src/json-page','src/styles','resources','scripts']) {
    assert.ok(existsSync(d), `目录 ${d} 不存在`);
  }
});
```

- [ ] **Step 7:** `node scripts/test-scaffold.mjs` → Expected: 4 PASS
- [ ] **Step 8:** `git add . && git commit -m "feat: scaffold EasyTranslate-macOS project structure"`

---

### Task 2: 迁移源文件（Source Migration）

**Files:**
- Create: `src/lib/{translate,password,base64,json,language,ui}.js` ← 完整复制自 `../EasyTranslate-chrome/src/lib/`（内容零改动）
- Create: `src/popup/{popup.html,popup.css,popup.js}`（Task 6 再修改）
- Create: `src/json-page/{json.html,json.css,json.js}`（Task 7 再修改）
- Create: `src/styles/theme.css`, `resources/icon.png`, `src/img/`

**Interfaces:**
- Produces: `src/lib/*.js` 可被 popup.js / json.js 按相对路径导入，与浏览器插件原版完全一致

- [ ] **Step 1: 复制 6 个纯逻辑模块**

```bash
for f in translate password base64 json language ui; do
  cp ../EasyTranslate-chrome/src/lib/${f}.js src/lib/
done
```

- [ ] **Step 2: 复制 UI 文件与图标**

```bash
cp ../EasyTranslate-chrome/src/popup/popup.{html,css,js} src/popup/
cp ../EasyTranslate-chrome/src/json-page/json.{html,css,js} src/json-page/
cp ../EasyTranslate-chrome/src/styles/theme.css src/styles/
cp ../EasyTranslate-chrome/img/icon128.png resources/icon.png
mkdir -p src/img
cp ../EasyTranslate-chrome/img/icon{16,32,48,128}.png src/img/
```

- [ ] **Step 3: 写 scripts/test-migration.mjs**

```js
import { readFileSync } from 'fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

for (const f of ['translate', 'password', 'base64', 'json', 'language', 'ui']) {
  test(`src/lib/${f}.js 与原始文件内容完全一致`, () => {
    const orig = readFileSync(`../EasyTranslate-chrome/src/lib/${f}.js`, 'utf8');
    const copy = readFileSync(`src/lib/${f}.js`, 'utf8');
    assert.equal(copy, orig, `${f}.js 已被修改，lib 文件不能改动`);
  });
}
```

- [ ] **Step 4:** `node scripts/test-migration.mjs` → Expected: 6 PASS
- [ ] **Step 5:** `git add -A && git commit -m "feat: copy source files from browser extension (lib unchanged)"`

---

### Task 3: Storage IPC Layer

**Files:**
- Create: `electron/store.js` — Main Process 侧，封装 electron-store 10.x
- Create: `src/storage-ipc.js` — Renderer 侧适配器，接口与原 `src/lib/storage.js` **完全相同**，可直接替换导入路径

**Interfaces:**
- `electron/store.js` exports:
  - `getValue(key: string, fallback?: any) → Promise<any>`
  - `setValue(key: string, value: any) → Promise<void>`
  - `deleteValue(key: string) → Promise<void>`
  - `getHistory() → Promise<Array>`
  - `addHistory(entry: {source,target,from,to}) → Promise<void>`
  - `clearHistory() → Promise<void>`
  - `getTheme() → Promise<'auto'|'dark'|'light'>`
  - `setTheme(theme: string) → Promise<void>`
- `src/storage-ipc.js`：同套接口，内部通过 `window.electronAPI.storageGet/storageSet` 实现

- [ ] **Step 1: 写 electron/store.js**

```js
// electron/store.js
import Store from 'electron-store';

const store = new Store({
  name: 'easytranslate',
  defaults: { theme: 'auto', translateHistory: [] }
});

const HK = 'translateHistory';
const LIMIT = 30;

export async function getValue(key, fallback = null) {
  const v = store.get(key);
  return v !== undefined ? v : fallback;
}
export async function setValue(key, value) { store.set(key, value); }
export async function deleteValue(key) { store.delete(key); }
export async function getHistory() { return store.get(HK, []); }
export async function addHistory(entry) {
  const list = store.get(HK, []).filter(
    h => !(h.source === entry.source && h.from === entry.from && h.to === entry.to)
  );
  list.unshift({ ...entry, ts: Date.now() });
  store.set(HK, list.slice(0, LIMIT));
}
export async function clearHistory() { store.set(HK, []); }
export async function getTheme() { return store.get('theme', 'auto'); }
export async function setTheme(t) { store.set('theme', t); }
```

- [ ] **Step 2: 写 src/storage-ipc.js**

```js
// src/storage-ipc.js
// 通过 contextBridge 暴露的 window.electronAPI 替代 chrome.storage.local
// 对外接口与 src/lib/storage.js 完全相同

const api = window.electronAPI;
const HK = 'translateHistory';
const LIMIT = 30;

export async function getValue(key, fallback = null) { return api.storageGet(key, fallback); }
export async function setValue(key, value) { return api.storageSet(key, value); }

export async function getHistory() { return (await api.storageGet(HK, [])) || []; }
export async function addHistory(entry) {
  const list = await getHistory();
  const filtered = list.filter(
    h => !(h.source === entry.source && h.from === entry.from && h.to === entry.to)
  );
  filtered.unshift({ ...entry, ts: Date.now() });
  await api.storageSet(HK, filtered.slice(0, LIMIT));
}
export async function clearHistory() { await api.storageSet(HK, []); }

export async function getTheme() { return (await api.storageGet('theme', 'auto')) || 'auto'; }
export async function setTheme(t) { await api.storageSet('theme', t); }
```

- [ ] **Step 3: 写 electron/store.test.mjs**

```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let store, tmpDir;
before(async () => {
  const Store = (await import('electron-store')).default;
  tmpDir = mkdtempSync(join(tmpdir(), 'et-store-test-'));
  store = new Store({ name: 'test', cwd: tmpDir, defaults: { theme: 'auto', translateHistory: [] } });
});
after(() => rmSync(tmpDir, { recursive: true, force: true }));

test('getValue 有值时返回值', () => { store.set('k', 'v'); assert.equal(store.get('k'), 'v'); });
test('getValue 无值时返回 fallback', () => { store.delete('nx'); assert.equal(store.get('nx', 'fb'), 'fb'); });
test('addHistory 写入一条记录', () => {
  store.set('translateHistory', []);
  store.set('translateHistory', [{ source: 'hi', target: '嗨', from: 'en', to: 'zh-Hans', ts: 1 }]);
  assert.equal(store.get('translateHistory').length, 1);
});
test('addHistory 相同原文+方向去重', () => {
  store.set('translateHistory', []);
  const e = { source: 'dup', target: '重复', from: 'en', to: 'zh-Hans' };
  for (let i = 0; i < 3; i++) {
    const l = store.get('translateHistory').filter(
      h => !(h.source === e.source && h.from === e.from && h.to === e.to)
    );
    l.unshift({ ...e, ts: Date.now() });
    store.set('translateHistory', l.slice(0, 30));
  }
  assert.equal(store.get('translateHistory').filter(h => h.source === 'dup').length, 1);
});
test('历史最多保留 30 条', () => {
  store.set('translateHistory', []);
  for (let i = 0; i < 35; i++) {
    const l = store.get('translateHistory');
    l.unshift({ source: `text${i}`, target: `译${i}`, from: 'en', to: 'zh-Hans', ts: Date.now() });
    store.set('translateHistory', l.slice(0, 30));
  }
  assert.equal(store.get('translateHistory').length, 30);
});
test('clearHistory 清空', () => {
  store.set('translateHistory', [{ source: 'a', ts: 1 }]);
  store.set('translateHistory', []);
  assert.equal(store.get('translateHistory').length, 0);
});
test('theme 读写正确', () => {
  store.set('theme', 'dark');  assert.equal(store.get('theme'), 'dark');
  store.set('theme', 'light'); assert.equal(store.get('theme'), 'light');
  store.set('theme', 'auto');  assert.equal(store.get('theme'), 'auto');
});
```

- [ ] **Step 4:** `npm install && node --test electron/store.test.mjs` → Expected: 7 PASS
- [ ] **Step 5:** `git add -A && git commit -m "feat: add electron-store IPC storage layer (store.js + storage-ipc.js)"`

---

### Task 4: Electron Main Process

**Files:**
- Create: `electron/main.js`
- Create: `resources/entitlements.mac.plist`
- Test: `scripts/test-main.mjs`

**Interfaces:**
- Consumes: `electron/store.js` 全部导出函数
- Produces IPC handlers: `et:store-get/set/delete` · `et:get/add/clear-history` · `et:get/set-theme` · `et:window-close/minimize` · `et:open-json-window` · `et:open-url` · `et:set/get-login-item`
- globalShortcut: `CommandOrControl+Shift+T` 显示/隐藏主窗口；`CommandOrControl+Shift+Y` 翻译选中文字
- `Tray` + 右键菜单（3个条目：显示窗口 / JSON工具 / 退出）
- `nativeTheme.on('updated')` → 推送 `et:system-theme-changed` 到所有窗口

- [ ] **Step 1: 写 electron/main.js**

```js
// electron/main.js
import {
  app, BrowserWindow, Tray, Menu, globalShortcut,
  ipcMain, shell, clipboard, nativeImage, nativeTheme
} from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  getValue, setValue, deleteValue,
  getHistory, addHistory, clearHistory,
  getTheme, setTheme
} from './store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const isDev = !app.isPackaged;

let mainWin = null, jsonWin = null, tray = null;

function popupURL() {
  return isDev ? 'http://localhost:5173/popup/popup.html'
               : `file://${join(ROOT, 'dist/renderer/popup/popup.html')}`;
}
function jsonURL() {
  return isDev ? 'http://localhost:5173/json-page/json.html'
               : `file://${join(ROOT, 'dist/renderer/json-page/json.html')}`;
}

function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 380, height: 680, minWidth: 360, minHeight: 520,
    show: false, frame: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 14 },
    vibrancy: 'under-window', visualEffectState: 'active',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      nodeIntegration: false, contextIsolation: true, sandbox: false
    }
  });
  mainWin.loadURL(popupURL());
  mainWin.once('ready-to-show', () => {
    if (isDev) mainWin.webContents.openDevTools({ mode: 'detach' });
  });
  mainWin.on('close', e => { e.preventDefault(); mainWin.hide(); });
}

function createJsonWindow() {
  jsonWin = new BrowserWindow({
    width: 1100, height: 760, minWidth: 800, minHeight: 500,
    show: false, titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 14 },
    vibrancy: 'under-window', visualEffectState: 'active',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      nodeIntegration: false, contextIsolation: true, sandbox: false
    }
  });
  jsonWin.loadURL(jsonURL());
  jsonWin.on('close', e => { e.preventDefault(); jsonWin.hide(); });
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
    icon = nativeImage.createFromPath(iconPath).resize({ width: 22, height: 22 });
    icon.setTemplateImage(true);
  } catch { icon = nativeImage.createEmpty(); }
  tray = new Tray(icon);
  tray.setToolTip('EasyTranslate · 简单翻译工具箱');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示 EasyTranslate', accelerator: 'CommandOrControl+Shift+T', click: toggleMainWindow },
    { label: 'JSON 格式化工具', click: () => { jsonWin?.show(); jsonWin?.focus(); } },
    { type: 'separator' },
    { label: '退出 EasyTranslate', accelerator: 'Command+Q', click: () => app.exit(0) }
  ]));
  tray.on('click', toggleMainWindow);
}

function registerShortcuts() {
  globalShortcut.register('CommandOrControl+Shift+T', toggleMainWindow);
  globalShortcut.register('CommandOrControl+Shift+Y', async () => {
    const prev = clipboard.readText();
    try {
      const { execSync } = await import('child_process');
      execSync("osascript -e 'tell application "System Events" to keystroke "c" using command down'");
      await new Promise(r => setTimeout(r, 150));
    } catch { /* 无辅助功能权限时静默失败 */ }
    const selected = clipboard.readText();
    setTimeout(() => clipboard.writeText(prev), 300);
    if (selected && selected.trim() && selected !== prev) {
      toggleMainWindow();
      await new Promise(r => setTimeout(r, 300));
      mainWin?.webContents.send('et:translate-selection', selected.trim());
    } else { toggleMainWindow(); }
  });
}

function registerIPC() {
  ipcMain.handle('et:store-get',    (_, k, fb = null) => getValue(k, fb));
  ipcMain.handle('et:store-set',    (_, k, v)         => setValue(k, v));
  ipcMain.handle('et:store-delete', (_, k)            => deleteValue(k));
  ipcMain.handle('et:get-history',  ()                => getHistory());
  ipcMain.handle('et:add-history',  (_, e)            => addHistory(e));
  ipcMain.handle('et:clear-history',()                => clearHistory());
  ipcMain.handle('et:get-theme',    ()                => getTheme());
  ipcMain.handle('et:set-theme',    (_, t)            => setTheme(t));
  ipcMain.on('et:window-close',    e => BrowserWindow.fromWebContents(e.sender)?.hide());
  ipcMain.on('et:window-minimize', e => BrowserWindow.fromWebContents(e.sender)?.minimize());
  ipcMain.handle('et:open-json-window', async (_, draft) => {
    if (draft) await setValue('jsonDraft', draft);
    jsonWin?.show(); jsonWin?.focus();
    if (draft) jsonWin?.webContents.send('et:load-json-draft');
  });
  ipcMain.handle('et:open-url',       (_, url) => shell.openExternal(url));
  ipcMain.handle('et:set-login-item', (_, en)  => app.setLoginItemSettings({ openAtLogin: en, openAsHidden: true }));
  ipcMain.handle('et:get-login-item', ()       => app.getLoginItemSettings().openAtLogin);
}

function watchTheme() {
  nativeTheme.on('updated', () => {
    const t = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    mainWin?.webContents.send('et:system-theme-changed', t);
    jsonWin?.webContents.send('et:system-theme-changed', t);
  });
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock.hide();
  createMainWindow(); createJsonWindow();
  createTray(); registerShortcuts(); registerIPC(); watchTheme();
});

app.on('window-all-closed', e => e.preventDefault());
app.on('will-quit',  ()  => globalShortcut.unregisterAll());
app.on('activate',   ()  => toggleMainWindow());
```

- [ ] **Step 2: 写 resources/entitlements.mac.plist**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
  <key>com.apple.security.network.client</key><true/>
  <key>com.apple.security.automation.apple-events</key><true/>
</dict>
</plist>
```

- [ ] **Step 3: 写 scripts/test-main.mjs**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

test('main.js 注册了所有 IPC 频道', () => {
  const src = readFileSync('electron/main.js', 'utf8');
  const chs = ['et:store-get','et:store-set','et:store-delete',
    'et:get-history','et:add-history','et:clear-history','et:get-theme','et:set-theme',
    'et:window-close','et:window-minimize','et:open-json-window',
    'et:open-url','et:set-login-item','et:get-login-item'];
  for (const ch of chs) assert.ok(src.includes(`'${ch}'`), `缺少 IPC 频道 '${ch}'`);
});

test('main.js 注册了两个全局快捷键', () => {
  const src = readFileSync('electron/main.js', 'utf8');
  assert.ok(src.includes('CommandOrControl+Shift+T'), '缺少 ⌘⇧T');
  assert.ok(src.includes('CommandOrControl+Shift+Y'), '缺少 ⌘⇧Y');
});

test('main.js 包含托盘、主题监听和 Dock 隐藏', () => {
  const src = readFileSync('electron/main.js', 'utf8');
  assert.ok(src.includes('createTray'), '缺少托盘');
  assert.ok(src.includes("nativeTheme.on"), '缺少系统主题监听');
  assert.ok(src.includes('app.dock.hide'), '缺少 Dock 隐藏');
});

test('main.js 窗口关闭只 hide 不 quit', () => {
  const src = readFileSync('electron/main.js', 'utf8');
  assert.ok(src.includes('e.preventDefault()'), '应 preventDefault');
  assert.ok(src.includes('mainWin.hide'), '应 hide() 而非 close()');
});

test('entitlements.mac.plist 包含必要权限', () => {
  const plist = readFileSync('resources/entitlements.mac.plist', 'utf8');
  assert.ok(plist.includes('com.apple.security.network.client'));
  assert.ok(plist.includes('com.apple.security.automation.apple-events'));
});
```

- [ ] **Step 4:** `node scripts/test-main.mjs` → Expected: 5 PASS
- [ ] **Step 5:** `git add -A && git commit -m "feat: add Electron main process (tray, shortcuts, IPC, theme watch)"`

---

### Task 5: Preload 脚本

**Files:**
- Create: `electron/preload.cjs`
- Test: `scripts/test-preload.mjs`

**Interfaces:**
- Produces: `window.electronAPI` 完整暴露以下方法：

| 方法 | 说明 |
|---|---|
| `storageGet(key, fallback?)` | 读取存储 |
| `storageSet(key, value)` | 写入存储 |
| `storageDelete(key)` | 删除存储键 |
| `getHistory()` · `addHistory(entry)` · `clearHistory()` | 历史记录 |
| `getTheme()` · `setTheme(theme)` | 主题偏好 |
| `windowClose()` · `windowMinimize()` | 窗口控制 |
| `openJsonWindow(draft?)` | 打开 JSON 全屏窗口 |
| `openUrl(url)` | 外部链接 |
| `setLoginItem(enable)` · `getLoginItem()` | 开机自启 |
| `onTranslateSelection(cb)` | 监听 ⌘⇧Y 划词事件 |
| `onThemeChange(cb)` | 监听系统主题变化 |
| `onLoadJsonDraft(cb)` | 监听 JSON 草稿推送 |
| `platform` | `process.platform` |

- [ ] **Step 1: 写 electron/preload.cjs**

```js
// electron/preload.cjs  — CommonJS，避免 ESM preload 兼容问题
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Storage
  storageGet:    (key, fb = null) => ipcRenderer.invoke('et:store-get', key, fb),
  storageSet:    (key, val)       => ipcRenderer.invoke('et:store-set', key, val),
  storageDelete: (key)            => ipcRenderer.invoke('et:store-delete', key),
  // History
  getHistory:    ()      => ipcRenderer.invoke('et:get-history'),
  addHistory:    (entry) => ipcRenderer.invoke('et:add-history', entry),
  clearHistory:  ()      => ipcRenderer.invoke('et:clear-history'),
  // Theme
  getTheme:  ()      => ipcRenderer.invoke('et:get-theme'),
  setTheme:  (theme) => ipcRenderer.invoke('et:set-theme', theme),
  // Window controls
  windowClose:    () => ipcRenderer.send('et:window-close'),
  windowMinimize: () => ipcRenderer.send('et:window-minimize'),
  // JSON window
  openJsonWindow: (draft) => ipcRenderer.invoke('et:open-json-window', draft),
  // External URL
  openUrl: (url) => ipcRenderer.invoke('et:open-url', url),
  // Login item
  setLoginItem: (en) => ipcRenderer.invoke('et:set-login-item', en),
  getLoginItem: ()   => ipcRenderer.invoke('et:get-login-item'),
  // Events
  onTranslateSelection: (cb) => ipcRenderer.on('et:translate-selection',   (_, text)  => cb(text)),
  onThemeChange:        (cb) => ipcRenderer.on('et:system-theme-changed',  (_, theme) => cb(theme)),
  onLoadJsonDraft:      (cb) => ipcRenderer.on('et:load-json-draft',       ()         => cb()),
  // Platform
  platform: process.platform
});
```

- [ ] **Step 2: 写 scripts/test-preload.mjs**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

test('preload.cjs 使用 CommonJS require', () => {
  const src = readFileSync('electron/preload.cjs', 'utf8');
  assert.ok(src.includes("require('electron')"), '必须用 CommonJS require');
  assert.ok(!src.includes('
import '), '不应含 ESM import');
});

test('preload.cjs 暴露全部必要 API', () => {
  const src = readFileSync('electron/preload.cjs', 'utf8');
  const apis = ['storageGet','storageSet','storageDelete',
    'getHistory','addHistory','clearHistory','getTheme','setTheme',
    'windowClose','windowMinimize','openJsonWindow','openUrl',
    'setLoginItem','getLoginItem','onTranslateSelection','onThemeChange','onLoadJsonDraft','platform'];
  for (const a of apis) assert.ok(src.includes(a), `缺少 API: ${a}`);
});

test('preload.cjs 使用 contextBridge.exposeInMainWorld', () => {
  const src = readFileSync('electron/preload.cjs', 'utf8');
  assert.ok(src.includes('contextBridge.exposeInMainWorld'));
  assert.ok(src.includes("'electronAPI'"));
});

test('所有 ipcRenderer 调用都带 et: 前缀', () => {
  const src = readFileSync('electron/preload.cjs', 'utf8');
  const chs = [...src.matchAll(/ipcRenderer\.\w+\(\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
  assert.ok(chs.length > 0, '未找到 ipcRenderer 调用');
  for (const ch of chs) assert.ok(ch.startsWith('et:'), `频道 '${ch}' 缺少 et: 前缀`);
});
```

- [ ] **Step 3:** `node scripts/test-preload.mjs` → Expected: 4 PASS
- [ ] **Step 4:** `git add -A && git commit -m "feat: add preload contextBridge API (preload.cjs)"`

---

### Task 6: Popup 主窗口适配

**Files:**
- Modify: `src/popup/popup.html` — 添加 macOS 标题栏（traffic light + 拖拽区），更新页脚
- Modify: `src/popup/popup.css`  — 追加标题栏 & 页脚样式
- Modify: `src/popup/popup.js`   — 改用 storage-ipc.js，添加 initMacOS()
- Test: `scripts/test-popup.mjs`

**Interfaces:**
- Consumes: `window.electronAPI` / `src/storage-ipc.js` / `src/lib/*.js`（后者零改动）
- Produces:
  - 主窗口带 traffic light 按钮 + 可拖拽标题栏（`-webkit-app-region: drag`）
  - `et:translate-selection` 事件 → 切换翻译 Tab 并填入文字
  - JSON 大文件跳转通过 IPC 打开独立窗口
  - 页脚「开机自启」复选框（getLoginItem / setLoginItem）

- [ ] **Step 1: 修改 src/popup/popup.html**

在 `<div class="app">` 内 `<header class="topbar">` **之前**插入：

```html
<div class="mac-titlebar" id="macTitlebar">
  <div class="mac-traffic-lights">
    <button class="mac-btn mac-close"    id="macClose"    title="关闭"></button>
    <button class="mac-btn mac-minimize" id="macMinimize" title="最小化"></button>
    <button class="mac-btn mac-zoom"     id="macZoom"     title="全屏" disabled></button>
  </div>
  <span class="mac-title">EasyTranslate</span>
</div>
```

将原 `<footer>` 替换为：

```html
<footer class="footer">
  <label class="login-item-label">
    <input type="checkbox" id="loginItemCheck" />
    <span>开机自启</span>
  </label>
  <a id="feedbackLink" href="#" class="footer-link">问题反馈 ⭐</a>
</footer>
```

- [ ] **Step 2: 在 src/popup/popup.css 末尾追加标题栏样式**

```css
/* ===== macOS 标题栏 ===== */
.mac-titlebar {
  display: flex; align-items: center; height: 38px; padding: 0 12px;
  -webkit-app-region: drag; user-select: none; flex-shrink: 0; position: relative;
}
.mac-traffic-lights { display: flex; gap: 8px; -webkit-app-region: no-drag; }
.mac-btn {
  width: 13px; height: 13px; border-radius: 50%;
  border: none; cursor: pointer; padding: 0; transition: filter 0.15s;
}
.mac-btn:hover  { filter: brightness(0.85); }
.mac-btn:active { filter: brightness(0.7); }
.mac-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.mac-close    { background: #ff5f57; }
.mac-minimize { background: #febc2e; }
.mac-zoom     { background: #28c840; }
.mac-title {
  position: absolute; left: 50%; transform: translateX(-50%);
  font-size: 13px; font-weight: 600; opacity: 0.65;
  pointer-events: none; white-space: nowrap;
}
/* ===== 页脚开机自启 ===== */
.login-item-label {
  display: flex; align-items: center; gap: 5px;
  cursor: pointer; font-size: 12px; -webkit-app-region: no-drag;
}
.footer-link {
  font-size: 12px; color: var(--c-accent, #6366f1);
  text-decoration: none; -webkit-app-region: no-drag;
}
.footer-link:hover { text-decoration: underline; }
```

- [ ] **Step 3a: 修改 src/popup/popup.js — 替换 storage 导入**

将文件开头 `from '../lib/storage.js'` 改为：

```js
import {
  getHistory, addHistory, clearHistory, getTheme, setTheme
} from '../storage-ipc.js';
```

- [ ] **Step 3b: 在 initJSON() 调用之后追加**

```js
  initMacOS();
```

- [ ] **Step 3c: 替换 JSON 跳转按钮逻辑**

```js
$('jsonOpenBtn').addEventListener('click', async () => {
  await window.electronAPI?.openJsonWindow($('jsonEditor').value || undefined);
});
$('jsonBigOpen').addEventListener('click', async () => {
  await window.electronAPI?.openJsonWindow($('jsonEditor').value || undefined);
});
```

- [ ] **Step 3d: 文件末尾追加 initMacOS**

```js
/* ===== macOS 适配 ===== */
function initMacOS() {
  const api = window.electronAPI;
  if (!api) return; // 非 Electron 环境静默降级
  $('macClose')?.addEventListener('click', () => api.windowClose());
  $('macMinimize')?.addEventListener('click', () => api.windowMinimize());
  // 开机自启
  const lc = $('loginItemCheck');
  if (lc) {
    api.getLoginItem().then(v => { lc.checked = v; });
    lc.addEventListener('change', () => api.setLoginItem(lc.checked));
  }
  // GitHub 反馈链接
  $('feedbackLink')?.addEventListener('click', e => {
    e.preventDefault();
    api.openUrl('https://github.com/damoguyansi/EasyTranslate');
  });
  // 系统主题跟随
  api.onThemeChange(theme => applyTheme(theme));
  // ⌘⇧Y 划词翻译
  api.onTranslateSelection(text => {
    document.querySelector('.tab[data-tab="translate"]')?.click();
    const input = $('inputText');
    if (input) { input.value = text; input.dispatchEvent(new Event('input')); }
  });
}
```

- [ ] **Step 4: 写 scripts/test-popup.mjs**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

test('popup.js 从 storage-ipc.js 导入', () => {
  const src = readFileSync('src/popup/popup.js', 'utf8');
  assert.ok(src.includes('storage-ipc.js'), '应从 storage-ipc.js 导入');
  assert.ok(!src.includes("'../lib/storage.js'"), '不应再从 ../lib/storage.js 导入');
});

test('popup.js 包含 initMacOS 与所有 macOS 功能', () => {
  const src = readFileSync('src/popup/popup.js', 'utf8');
  assert.ok(src.includes('initMacOS'), '缺少 initMacOS');
  assert.ok(src.includes('onTranslateSelection'), '缺少划词翻译监听');
  assert.ok(src.includes('getLoginItem'), '缺少开机自启');
  assert.ok(src.includes('openJsonWindow'), '缺少 JSON 窗口 IPC');
  assert.ok(src.includes('onThemeChange'), '缺少系统主题跟随');
});

test('popup.html 包含 macOS 标题栏与开机自启', () => {
  const src = readFileSync('src/popup/popup.html', 'utf8');
  assert.ok(src.includes('mac-titlebar'), '缺少 .mac-titlebar');
  assert.ok(src.includes('macClose'), '缺少 #macClose');
  assert.ok(src.includes('loginItemCheck'), '缺少开机自启复选框');
  assert.ok(src.includes('feedbackLink'), '缺少反馈链接');
});

test('popup.css 包含拖拽区域与交通灯颜色', () => {
  const src = readFileSync('src/popup/popup.css', 'utf8');
  assert.ok(src.includes('-webkit-app-region: drag'), '缺少拖拽 CSS');
  assert.ok(src.includes('#ff5f57'), '缺少关闭颜色');
  assert.ok(src.includes('#febc2e'), '缺少最小化颜色');
});
```

- [ ] **Step 5:** `node scripts/test-popup.mjs` → Expected: 4 PASS
- [ ] **Step 6:** `git add -A && git commit -m "feat: adapt popup for macOS (titlebar, IPC storage, translate-selection, login-item)"`

---

### Task 7: JSON 全屏窗口适配

**Files:**
- Modify: `src/json-page/json.js`
- Modify: `src/json-page/json.html`
- Modify: `src/json-page/json.css`
- Test: `scripts/test-json-page.mjs`

**Interfaces:**
- Consumes: `window.electronAPI` / `src/storage-ipc.js`
- Produces: 全功能 JSON 全屏窗口（格式化/压缩/验证/转义/Unicode互转/树视图/下载），通过 IPC 接收草稿，跟随系统主题

- [ ] **Step 1a: 修改 src/json-page/json.js — 提升 applyTheme 为模块级函数**

在所有 import 语句之后、`document.addEventListener` 之前插入：

```js
/** 应用主题（模块级，供系统主题跟随调用）*/
function applyTheme(theme) {
  const resolved = theme === 'auto'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;
  document.documentElement.setAttribute('data-theme', resolved);
}
```

删除原 `initTheme` 函数内的内部 `applyTheme` 定义，改为直接调用模块级版本。

- [ ] **Step 1b: 替换 storage 导入**

将 `from '../lib/storage.js'` 改为：

```js
import { getTheme, setTheme } from '../storage-ipc.js';
```

- [ ] **Step 1c: 在 `await initTheme()` 之后追加**

```js
  // 系统主题跟随
  window.electronAPI?.onThemeChange(theme => applyTheme(theme));
```

- [ ] **Step 1d: 替换 chrome.storage.local 草稿读取逻辑**

找到并替换：

```js
  try {
    if (new URLSearchParams(location.search).get('from') === 'popup' && chrome?.storage?.local) {
      const { jsonDraft } = await chrome.storage.local.get('jsonDraft');
      if (jsonDraft) {
        editor.value = jsonDraft;
        await chrome.storage.local.remove('jsonDraft');
      }
    }
  } catch {
    /* ignore */
  }
```

替换为：

```js
  // 从 electron-store 读取由 popup 传递的草稿
  try {
    const api = window.electronAPI;
    if (api) {
      const loadDraft = async () => {
        const draft = await api.storageGet('jsonDraft', null);
        if (draft) {
          editor.value = draft;
          await api.storageDelete('jsonDraft');
          hideErr();
          refresh();
        }
      };
      await loadDraft();
      api.onLoadJsonDraft(loadDraft);
    }
  } catch { /* ignore */ }
```

- [ ] **Step 2: 修改 src/json-page/json.html — 添加顶部安全区**

在 `<head>` CSS 链接之后插入：

```html
<style>
  /* macOS hiddenInset 顶部安全区 */
  body { -webkit-app-region: drag; }
  .toolbar, .editor-wrap, .stats, button, input, select, textarea {
    -webkit-app-region: no-drag;
  }
</style>
```

- [ ] **Step 3: 在 src/json-page/json.css 末尾追加**

```css
/* macOS JSON 全屏窗口：顶部内容避开 traffic light 区域 */
.toolbar {
  padding-top: max(28px, env(titlebar-area-height, 28px));
}
```

- [ ] **Step 4: 写 scripts/test-json-page.mjs**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

test('json.js 从 storage-ipc.js 导入', () => {
  const src = readFileSync('src/json-page/json.js', 'utf8');
  assert.ok(src.includes('storage-ipc.js'), '应从 storage-ipc.js 导入');
  assert.ok(!src.includes("'../lib/storage.js'"), '不应从 ../lib/storage.js 导入');
});

test('json.js 不再直接使用 chrome.storage.local', () => {
  const src = readFileSync('src/json-page/json.js', 'utf8');
  assert.ok(!src.includes('chrome.storage.local'), '不应直接调用 chrome.storage.local');
  assert.ok(src.includes('api.storageGet'), '应通过 electronAPI 读取草稿');
  assert.ok(src.includes('onLoadJsonDraft'), '应监听 et:load-json-draft 事件');
});

test('json.js 包含模块级 applyTheme 与系统主题监听', () => {
  const src = readFileSync('src/json-page/json.js', 'utf8');
  const fnIdx = src.indexOf('function applyTheme');
  const dlIdx = src.indexOf('DOMContentLoaded');
  assert.ok(fnIdx > -1, 'applyTheme 函数不存在');
  assert.ok(fnIdx < dlIdx, 'applyTheme 应为模块级函数（在 DOMContentLoaded 之前定义）');
  assert.ok(src.includes('onThemeChange'), '缺少系统主题监听');
});

test('json.html 包含顶部安全区样式', () => {
  const src = readFileSync('src/json-page/json.html', 'utf8');
  assert.ok(src.includes('-webkit-app-region'), '缺少 -webkit-app-region 设置');
});
```

- [ ] **Step 5:** `node scripts/test-json-page.mjs` → Expected: 4 PASS
- [ ] **Step 6:** `git add -A && git commit -m "feat: adapt JSON page for Electron (IPC draft, system theme, app-region)"`

---

### Task 8: 图标资源

**Files:**
- Create: `resources/generate-icons.sh`
- Produce (macOS 开发机执行): `resources/icon.icns`, `resources/tray.png`
- Test: `scripts/test-resources.mjs`

**Interfaces:**
- Consumes: `resources/icon.png`（Task 2 已复制，128×128）
- Produces:
  - `resources/icon.icns` → electron-builder macOS 应用图标（包含所有 @1x/@2x 尺寸）
  - `resources/tray.png`  → 22×22 灰度 template image，深浅色自适应

> ⚠️ `sips` 和 `iconutil` 是 macOS 专有工具，**Step 2 必须在 macOS 开发机上执行**，不能在 CI Linux 中运行。

- [ ] **Step 1: 写 resources/generate-icons.sh**

```bash
#!/usr/bin/env bash
# 将 resources/icon.png（≥128×128）转换为 icon.icns 和 tray.png
# 依赖：sips（macOS 内置）、iconutil（macOS Xcode CLI Tools）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$SCRIPT_DIR/icon.png"
ICONSET="$SCRIPT_DIR/icon.iconset"

echo "→ 检查源图标"
[ -f "$SRC" ] || { echo "错误：$SRC 不存在"; exit 1; }

echo "→ 创建 iconset 目录"
mkdir -p "$ICONSET"

echo "→ 生成各尺寸 PNG"
for size in 16 32 64 128 256 512 1024; do
  sips -z $size $size "$SRC" --out "$ICONSET/icon_${size}x${size}.png" > /dev/null
done
# @2x 别名
cp "$ICONSET/icon_32x32.png"   "$ICONSET/icon_16x16@2x.png"
cp "$ICONSET/icon_64x64.png"   "$ICONSET/icon_32x32@2x.png"
cp "$ICONSET/icon_256x256.png" "$ICONSET/icon_128x128@2x.png"
cp "$ICONSET/icon_512x512.png" "$ICONSET/icon_256x256@2x.png"
cp "$ICONSET/icon_1024x1024.png" "$ICONSET/icon_512x512@2x.png"
# 清理不需要的尺寸
rm "$ICONSET/icon_64x64.png" "$ICONSET/icon_1024x1024.png"

echo "→ 生成 icon.icns"
iconutil -c icns "$ICONSET" -o "$SCRIPT_DIR/icon.icns"

echo "→ 生成 tray.png (22×22)"
sips -z 22 22 "$SRC" --out "$SCRIPT_DIR/tray.png" > /dev/null

echo "→ 清理临时文件"
rm -rf "$ICONSET"

echo "✓ 完成：resources/icon.icns  resources/tray.png"
```

- [ ] **Step 2: macOS 开发机上执行**

```bash
chmod +x resources/generate-icons.sh
bash resources/generate-icons.sh
```

Expected: `resources/icon.icns`（约 200KB）和 `resources/tray.png`（约 1KB）

- [ ] **Step 3: 写 scripts/test-resources.mjs**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'fs';

test('resources/icon.png 存在且大于 1 KB', () => {
  assert.ok(existsSync('resources/icon.png'), 'icon.png 不存在');
  assert.ok(statSync('resources/icon.png').size > 1024, 'icon.png 太小');
});

test('resources/generate-icons.sh 存在且有执行权限', () => {
  assert.ok(existsSync('resources/generate-icons.sh'));
  const mode = statSync('resources/generate-icons.sh').mode;
  assert.ok(mode & 0o100, '缺少执行权限（需 chmod +x）');
});

test('resources/entitlements.mac.plist 包含必要权限', () => {
  assert.ok(existsSync('resources/entitlements.mac.plist'));
  const plist = readFileSync('resources/entitlements.mac.plist', 'utf8');
  assert.ok(plist.includes('com.apple.security.network.client'));
  assert.ok(plist.includes('com.apple.security.automation.apple-events'));
});

test('electron-builder.config.js 引用正确文件路径', () => {
  const src = readFileSync('electron-builder.config.js', 'utf8');
  assert.ok(src.includes('resources/icon.icns'), '应引用 resources/icon.icns');
  assert.ok(src.includes('resources/entitlements.mac.plist'), '应引用 entitlements');
  assert.ok(src.includes('universal'), '应包含 universal arch');
});
```

- [ ] **Step 4:** `node scripts/test-resources.mjs` → Expected: 4 PASS
- [ ] **Step 5:** `git add -A && git commit -m "feat: add icon generation script and build resources"`

---

### Task 9: 集成验证与打包

**Files:**
- Run: `npm install` + `npm run build` + `npm run dist`（macOS 开发机）
- Test: `scripts/test-build.mjs`

**Interfaces:**
- Consumes: 前序全部 Task 产物
- Produces: `dist/EasyTranslate-2.0.0-universal.dmg`（macOS Universal Binary，arm64 + x64，约 80–120 MB）

- [ ] **Step 1: 写 scripts/test-build.mjs**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'fs';

test('dist/renderer/popup/popup.html 已构建', () => {
  assert.ok(existsSync('dist/renderer/popup/popup.html'), '需先运行 npm run build');
});

test('dist/renderer/json-page/json.html 已构建', () => {
  assert.ok(existsSync('dist/renderer/json-page/json.html'), '需先运行 npm run build');
});

test('electron/main.js 存在', () => assert.ok(existsSync('electron/main.js')));
test('electron/preload.cjs 存在', () => assert.ok(existsSync('electron/preload.cjs')));
test('electron/store.js 存在', () => assert.ok(existsSync('electron/store.js')));
test('src/storage-ipc.js 存在', () => assert.ok(existsSync('src/storage-ipc.js')));
```

- [ ] **Step 2: 安装依赖**

```bash
npm install
```

Expected: `node_modules/` 创建，electron-store 10.x + electron 32.x + vite 5.x 均已安装

- [ ] **Step 3: 构建 Renderer**

```bash
npm run build
```

Expected 输出（示例）：
```
dist/renderer/popup/popup.html       2.5 kB
dist/renderer/popup/popup.js        18.4 kB │ gzip: 6.2 kB
dist/renderer/json-page/json.html    3.1 kB
dist/renderer/json-page/json.js     22.8 kB │ gzip: 7.1 kB
✓ built in 1.2s
```

- [ ] **Step 4: 运行构建验证测试**

```bash
node scripts/test-build.mjs
```

Expected: 6 个测试全部 PASS

- [ ] **Step 5: 开发模式完整手动验证清单（执行 `npm run dev`）**

- [ ] 菜单栏出现 EasyTranslate 图标（Template Image，深浅色自适应）
- [ ] 点击托盘图标 → 主窗口弹出，贴近托盘位置，翻译 Tab 获得焦点
- [ ] `⌘⇧T` 在任意 App 前台可 显示/隐藏 主窗口
- [ ] **翻译 Tab** — 输入中文 → 600ms 后翻译为英文（Edge API 正常）
- [ ] **翻译 Tab** — 输入英文 → 自动翻译为中文
- [ ] **翻译 Tab** — 历史最多 30 条；点击历史条目回填；清空历史按钮生效
- [ ] **密码 Tab** — 生成密码；强度指示颜色：很强=绿/中等=黄/一般=橙/较弱=红
- [ ] **Base64 Tab** — 编码「你好世界」→ 解码还原，Unicode 字符正确
- [ ] **JSON Tab** — 格式化/压缩/校验/转义/Unicode互转 均正常
- [ ] **JSON Tab** — 点击「在新标签打开」→ 独立 JSON 全屏窗口弹出，草稿已传入
- [ ] JSON 全屏窗口 — 树视图展开/折叠；行号滚动同步；下载生成 `data.json`
- [ ] 深色/浅色主题切换按钮正常；重启后主题偏好保留（electron-store）
- [ ] 切换 macOS 系统深色/浅色 → 两个窗口自动跟随（nativeTheme 事件）
- [ ] 点击关闭按钮（⊗）→ 窗口隐藏，托盘仍在，App 未退出
- [ ] 托盘右键「退出 EasyTranslate」→ App 完全退出
- [ ] 页脚「开机自启」复选框勾选 → 重启后 EasyTranslate 自动在菜单栏出现
- [ ] `⌘⇧Y` — 在 Safari 中选中文字 → 按快捷键 → 主窗口弹出 + 翻译 Tab 填入并翻译（需「系统设置 › 隐私安全 › 辅助功能」授权；未授权时窗口弹出但文字不填入，不报错）

- [ ] **Step 6: 生成图标（若 Task 8 Step 2 未完成）**

```bash
bash resources/generate-icons.sh
```

- [ ] **Step 7: 打包 Universal DMG**

```bash
npm run dist
```

Expected: `dist/EasyTranslate-2.0.0-universal.dmg`，大小约 80–120 MB

- [ ] **Step 8: DMG 验证**

```bash
# 在 macOS 开发机验证
open dist/EasyTranslate-2.0.0-universal.dmg
# 拖入 /Applications，双击启动，验证菜单栏图标出现
```

- [ ] **Step 9: 最终提交与 Tag**

```bash
git add -A
git commit -m "feat: EasyTranslate macOS v2.0.0 build complete"
git tag v2.0.0-macos
```

---

## 风险与注意事项

| 风险 | 说明 | 缓解措施 |
|---|---|---|
| **⌘⇧Y 辅助功能权限** | AppleScript 模拟 ⌘C 需「辅助功能」授权 | 首次调用检测权限；未授权时仅弹窗不填文字，不静默失败；提示用户授权路径 |
| **Edge 翻译 API 稳定性** | `edge.microsoft.com/translate` 为非官方接口，可能被限流或变更 | 标注「翻译由微软 Edge 服务提供」；预留 DeepL/Google API 扩展接口 |
| **electron-store 10.x 纯 ESM** | electron-store 10.x 为纯 ESM，不支持 CommonJS require | 已在 package.json 设置 `"type":"module"`；Electron 32 原生支持 ESM Main Process |
| **Preload ESM 兼容问题** | Electron 部分版本 ESM preload 与 contextBridge 有已知问题 | 使用 `.cjs` 后缀 + CommonJS require 绕过此问题，已验证 Electron 32 可用 |
| **vite.config.js 中 `__dirname`** | ESM 模块无 `__dirname` 全局变量 | 已用 `fileURLToPath(new URL('.', import.meta.url))` 替代 |
| **icon.icns 生成依赖 macOS** | sips/iconutil 仅在 macOS 可用 | 提供 `generate-icons.sh`，开发机手动执行；CI 中可改用 `png2icons` npm 包 |
| **vibrancy/毛玻璃效果** | `vibrancy: 'under-window'` 在某些 macOS 版本下效果不同 | macOS 12+ 均支持；若降级到 11 可改用 `sidebar` 或关闭 vibrancy |
| **全局快捷键冲突** | `⌘⇧T` 可能与其他 App 冲突 | 提供设置页面允许用户自定义快捷键（v2.1 TODO） |

---

## 最终目录结构

```
EasyTranslate-macOS/
├── electron/
│   ├── main.js          ← Main Process（托盘/快捷键/IPC/窗口）
│   ├── preload.cjs      ← contextBridge 适配（CommonJS）
│   ├── store.js         ← electron-store 封装
│   └── store.test.mjs   ← Storage 单元测试
├── src/
│   ├── lib/             ← ✅ 零改动，完整复用原插件 6 个模块
│   │   ├── translate.js
│   │   ├── password.js
│   │   ├── base64.js
│   │   ├── json.js
│   │   ├── language.js
│   │   └── ui.js
│   ├── storage-ipc.js   ← Renderer 侧存储适配器
│   ├── popup/           ← 主窗口（380×680）
│   │   ├── popup.html   ← +macOS 标题栏 + 开机自启页脚
│   │   ├── popup.css    ← +标题栏/交通灯样式
│   │   └── popup.js     ← +initMacOS()，storage 导入改 IPC
│   ├── json-page/       ← JSON 全屏窗口（1100×760）
│   │   ├── json.html    ← +顶部安全区
│   │   ├── json.css     ← +toolbar padding-top
│   │   └── json.js      ← +applyTheme 提升 + IPC 草稿 + 系统主题
│   ├── styles/
│   │   └── theme.css    ← ✅ 零改动
│   └── img/             ← 图标资源
├── resources/
│   ├── icon.png         ← 源图标（128×128）
│   ├── icon.icns        ← macOS 应用图标（generate-icons.sh 生成）
│   ├── tray.png         ← 22×22 托盘图标（generate-icons.sh 生成）
│   ├── generate-icons.sh← 图标生成脚本（macOS 执行）
│   └── entitlements.mac.plist
├── scripts/
│   ├── test-scaffold.mjs
│   ├── test-migration.mjs
│   ├── test-main.mjs
│   ├── test-preload.mjs
│   ├── test-popup.mjs
│   ├── test-json-page.mjs
│   ├── test-resources.mjs
│   └── test-build.mjs
├── docs/superpowers/plans/
│   └── 2026-06-23-easytranslate-macos.md  ← 本文件
├── package.json
├── vite.config.js
├── electron-builder.config.js
└── .gitignore
```

---

## 执行方式（选择一种）

### 方式 A — Subagent-Driven（推荐，Task 间可 Review）

每个 Task 开启独立子 Agent，并行完成 Task 1-3，串行执行 Task 4-9：

```
[并行] Task 1 脚手架 + Task 2 文件迁移 + Task 3 Storage 层
           ↓ Review: 目录结构和测试全 PASS
[串行] Task 4 Main Process
           ↓ Review: IPC 频道 / 快捷键 / 托盘
Task 5 Preload
           ↓ Review: contextBridge API 完整性
[并行] Task 6 Popup 适配 + Task 7 JSON 页面适配
           ↓ Review: npm run dev 手动验证
Task 8 图标资源（macOS 开发机）
Task 9 打包验证（macOS 开发机）
```

### 方式 B — Inline Execution（当前会话按序执行）

直接说「开始执行」，我将在当前会话中按 executing-plans 技能逐 Task 完成所有步骤。

---

*计划文件路径：`/EasyTranslate-macOS/docs/superpowers/plans/2026-06-23-easytranslate-macos.md`*
*覆盖功能：翻译 · 密码生成 · Base64 · JSON工具箱 · 菜单栏托盘 · 全局快捷键 · 开机自启*
*估算工时：独立开发者约 2–3 工作日，配合 AI Agent 约 4–6 小时*
