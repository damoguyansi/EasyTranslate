import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'fs';

test('electron/main.js exists', () => assert.ok(existsSync('electron/main.js')));
test('electron/preload.cjs exists', () => assert.ok(existsSync('electron/preload.cjs')));
test('electron/store.js exists', () => assert.ok(existsSync('electron/store.js')));
test('src/storage-ipc.js exists', () => assert.ok(existsSync('src/storage-ipc.js')));
test('src/authenticator/authenticator.js exists', () => assert.ok(existsSync('src/authenticator/authenticator.js')));
test('src/popup/popup.html exists', () => assert.ok(existsSync('src/popup/popup.html')));
test('src/json-page/json.html exists', () => assert.ok(existsSync('src/json-page/json.html')));
