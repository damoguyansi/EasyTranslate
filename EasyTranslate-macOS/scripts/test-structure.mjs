// 结构一致性测试：IPC 白名单、页面入口、安全选项、打包配置、资源
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');

function listFrom(src, name) {
  const m = src.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
  assert.ok(m, `${name} list missing`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

function rendererFiles(dir = 'src') {
  const out = [];
  for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...rendererFiles(p));
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

test('preload whitelist matches main-process handlers', () => {
  const preload = read('electron/preload.cjs');
  const main = read('electron/main.js');
  for (const ch of listFrom(preload, 'INVOKE')) assert.ok(main.includes(`handle('${ch}'`), `missing ipc handler ${ch}`);
  for (const ch of listFrom(preload, 'SEND')) assert.ok(main.includes(`ipcMain.on('${ch}'`), `missing ipc listener ${ch}`);
});

test('every channel used by renderer is whitelisted', () => {
  const preload = read('electron/preload.cjs');
  const allowed = new Set([...listFrom(preload, 'INVOKE'), ...listFrom(preload, 'SEND'), ...listFrom(preload, 'EVENTS')]);
  for (const f of rendererFiles()) {
    for (const m of read(f).matchAll(/api\.(?:invoke|send|on)\('([^']+)'/g)) {
      assert.ok(allowed.has(m[1]), `${f} uses non-whitelisted channel ${m[1]}`);
    }
  }
});

test('main-process events sent to renderer are declared', () => {
  const events = new Set(listFrom(read('electron/preload.cjs'), 'EVENTS'));
  for (const f of ['electron/main.js', 'electron/windows.js', 'electron/capture.js']) {
    for (const m of read(f).matchAll(/webContents\.send\('([^']+)'/g)) assert.ok(events.has(m[1]), `${f} sends undeclared ${m[1]}`);
  }
});

test('renderer pages exist for every vite entry', () => {
  for (const p of ['popup', 'workspace', 'capture', 'pin']) assert.ok(existsSync(join(root, 'src', p, 'index.html')), p);
  assert.ok(read('vite.config.js').includes("['popup', 'workspace', 'capture', 'pin']"));
  for (const p of ['popup', 'workspace', 'capture', 'pin']) assert.ok(read('electron/' + (p === 'popup' || p === 'workspace' ? 'windows.js' : 'capture.js')).includes(`'${p}'`));
});

test('every #id the page scripts look up exists in its html', () => {
  const pages = { popup: 'src/popup', workspace: 'src/workspace', capture: 'src/capture' };
  for (const [page, dir] of Object.entries(pages)) {
    const html = read(`${dir}/index.html`);
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    for (const f of rendererFiles(dir)) {
      for (const m of read(f).matchAll(/\$\('#([A-Za-z][\w-]*)/g)) assert.ok(ids.has(m[1]), `${f}: #${m[1]} missing in ${page}/index.html`);
      for (const m of read(f).matchAll(/\$\('([A-Za-z][\w-]*)'\)/g)) {
        if (page === 'capture') assert.ok(ids.has(m[1]), `${f}: ${m[1]} missing in ${page}/index.html`);
      }
    }
  }
});

test('windows are sandboxed with context isolation', () => {
  const w = read('electron/windows.js');
  assert.match(w, /contextIsolation: true/);
  assert.match(w, /sandbox: true/);
  assert.match(w, /nodeIntegration: false/);
});

test('packaging config and resources', async () => {
  const cfg = (await import(new URL('../electron-builder.js', import.meta.url))).default;
  assert.equal(cfg.mac.target[0].arch[0], 'universal');
  assert.equal(cfg.mac.extendInfo.LSUIElement, true);
  assert.ok(existsSync(join(root, cfg.afterSign)));
  for (const f of ['resources/icon.icns', 'resources/tray.png', 'resources/tray@2x.png', 'resources/entitlements.mac.plist']) {
    assert.ok(existsSync(join(root, f)), f);
  }
  const ent = read('resources/entitlements.mac.plist');
  assert.match(ent, /network\.client/);
  assert.match(ent, /automation\.apple-events/);
  assert.equal(JSON.parse(read('package.json')).main, 'electron/main.js');
});
