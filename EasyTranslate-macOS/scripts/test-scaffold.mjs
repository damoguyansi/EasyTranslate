import { existsSync, readFileSync, lstatSync } from 'fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

test('package.json 字段正确', () => {
  const p = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.equal(p.type, 'module');
  assert.equal(p.main, 'electron/main.js');
  assert.ok(p.dependencies['electron-store'], 'electron-store 未声明');
  assert.ok(p.devDependencies['electron'], 'electron 未声明');
  assert.ok(p.devDependencies['vite'], 'vite 未声明');
});

test('vite.config.js 包含 fileURLToPath 与双入口', () => {
  const src = readFileSync('vite.config.js', 'utf8');
  assert.ok(src.includes('fileURLToPath'));
  assert.ok(src.includes('popup'));
  assert.ok(src.includes('json'));
});

test('electron-builder.config.js 包含 universal 架构', () => {
  assert.ok(readFileSync('electron-builder.config.js', 'utf8').includes('universal'));
});

test('必要目录结构存在', () => {
  for (const d of ['electron','src/popup','src/json-page','src/styles','resources','scripts'])
    assert.ok(existsSync(d), `目录 ${d} 不存在`);
  const s = lstatSync('src/lib');
  assert.ok(s.isSymbolicLink() || s.isDirectory(), 'src/lib 应为软链接或目录');
});
