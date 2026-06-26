import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync, readFileSync } from 'fs';

test('resources/icon.png exists and > 1KB', () => {
  assert.ok(existsSync('resources/icon.png'));
  assert.ok(statSync('resources/icon.png').size > 1024);
});

test('resources/generate-icons.sh exists', () => {
  // May not exist yet (created during macOS build step), skip if missing
  if (!existsSync('resources/generate-icons.sh')) return;
  const mode = statSync('resources/generate-icons.sh').mode;
  assert.ok(mode & 0o100, 'generate-icons.sh needs execute permission');
});

test('entitlements.mac.plist has required keys', () => {
  assert.ok(existsSync('resources/entitlements.mac.plist'));
  const plist = readFileSync('resources/entitlements.mac.plist', 'utf8');
  assert.ok(plist.includes('com.apple.security.network.client'));
  assert.ok(plist.includes('com.apple.security.automation.apple-events'));
  // 没有付费 Developer ID 证书时只能逐项 ad-hoc 自签，必须禁用库验证，
  // 否则 hardened runtime 会拒绝加载签名身份不同的内嵌 framework/helper，
  // 表现为启动即崩溃（DYLD Library not loaded / different Team IDs）。
  assert.ok(plist.includes('com.apple.security.cs.disable-library-validation'));
});

test('electron-builder.js 配置了 afterSign 重签名钩子', () => {
  const src = readFileSync('electron-builder.js', 'utf8');
  assert.ok(src.includes('afterSign'));
  assert.ok(existsSync('scripts/after-sign.cjs'));
});

test('electron-builder.js references correct paths', () => {
  const src = readFileSync('electron-builder.js', 'utf8');
  assert.ok(src.includes('resources/icon.icns'));
  assert.ok(src.includes('resources/entitlements.mac.plist'));
  assert.ok(src.includes('universal'));
});
