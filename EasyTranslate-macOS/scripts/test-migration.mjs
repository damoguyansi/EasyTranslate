import { readFileSync, existsSync, lstatSync } from 'fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

test('src/lib is symlink or directory', () => {
  const s = lstatSync('src/lib');
  assert.ok(s.isSymbolicLink() || s.isDirectory());
});

const LIBS = ['translate','password','base64','json','language','ui'];
for (const f of LIBS) {
  test('src/lib/' + f + '.js matches chrome source', () => {
    assert.ok(existsSync('src/lib/' + f + '.js'), f + '.js missing');
    const orig = readFileSync('../EasyTranslate-chrome/src/lib/' + f + '.js', 'utf8');
    const lnk  = readFileSync('src/lib/' + f + '.js', 'utf8');
    assert.equal(lnk, orig, f + '.js content mismatch');
  });
}

test('storage-ipc.js exists and uses electronAPI', () => {
  const src = readFileSync('src/storage-ipc.js', 'utf8');
  assert.ok(!src.includes('chrome.storage'), 'should not use chrome.storage');
  assert.ok(src.includes('electronAPI'), 'should use electronAPI');
});
