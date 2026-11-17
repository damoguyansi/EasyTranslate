// 核心纯函数测试：语言、编码、JSON、密码
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectLanguage, resolveTarget, languageName } from '../src/core/language.js';
import * as codec from '../src/core/codec.js';
import * as J from '../src/core/json.js';
import { generatePassword, passwordStrength, buildPools, SIMILAR_CHARS } from '../src/core/password.js';

test('language: detection and target resolution', () => {
  assert.equal(detectLanguage('你好世界'), 'zh-Hans');
  assert.equal(detectLanguage('hello world'), 'en');
  assert.equal(detectLanguage('こんにちは'), 'ja');
  assert.equal(detectLanguage('안녕하세요'), 'ko');
  assert.equal(resolveTarget('zh-Hans'), 'en');
  assert.equal(resolveTarget('zh-Hans', { preferredForeign: 'ja' }), 'ja');
  assert.equal(resolveTarget('en'), 'zh-Hans');
  assert.equal(resolveTarget('en', { requested: 'en' }), 'zh-Hans');
  assert.equal(resolveTarget('en', { requested: 'fr' }), 'fr');
  assert.equal(languageName('zh-Hans'), '中文');
});

test('codec: base64 round trip with unicode and url-safe', () => {
  const s = '你好, EasyTranslate 🚀';
  assert.equal(codec.base64Decode(codec.base64Encode(s)), s);
  const safe = codec.base64Encode('???>>>', { urlSafe: true });
  assert.ok(!/[+/=]/.test(safe));
  assert.equal(codec.base64Decode(safe), '???>>>');
  assert.throws(() => codec.base64Decode('***'));
});

test('codec: url / html / unicode', () => {
  assert.equal(codec.urlDecode(codec.urlEncode('a b&c=中')), 'a b&c=中');
  assert.equal(codec.htmlUnescape(codec.htmlEscape('<a href="x">&</a>')), '<a href="x">&</a>');
  assert.equal(codec.unicodeEscape('中a'), '\\u4e2da');
  assert.equal(codec.unicodeUnescape(codec.unicodeEscape('中文😀')), '中文😀');
});

test('codec: time parsing and hash', async () => {
  assert.equal(codec.parseTime('1700000000').millis, 1700000000000);
  assert.equal(codec.parseTime('1700000000000').seconds, 1700000000);
  assert.ok(codec.parseTime('2024-01-02 03:04:05').local.startsWith('2024-01-02 03:04:05'));
  assert.throws(() => codec.parseTime('not a date'));
  assert.equal(await codec.hashText('abc', 'SHA-256'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('json: smart parse unwraps escaped json', () => {
  const inner = JSON.stringify({ a: 1 });
  const r = J.parseSmart(JSON.stringify(JSON.stringify(inner)));
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { a: 1 });
  assert.equal(r.unwrapped, 2);
});

test('json: format / minify / sort / error position', () => {
  assert.equal(J.formatJson('{"b":1,"a":[1,2]}', { indent: 2 }).text, '{\n  "b": 1,\n  "a": [\n    1,\n    2\n  ]\n}');
  assert.equal(J.formatJson('{"b":1,"a":2}', { indent: 0, sortKeys: true }).text, '{"a":2,"b":1}');
  assert.equal(J.minifyJson('{ "a" : 1 }').text, '{"a":1}');
  const bad = J.validateJson('{\n  "a": 1,\n  "b" 2\n}');
  assert.equal(bad.ok, false);
  assert.equal(bad.error.line, 3);
  const loose = J.formatJson('foo(a=1,b={c:2})');
  assert.equal(loose.loose, true);
  assert.ok(loose.text.includes('\n'));
});

test('json: escape helpers and path', () => {
  assert.equal(J.unescapeJsonString(J.escapeJsonString('a"b\nc')), 'a"b\nc');
  assert.equal(J.joinPath('$', 'a'), '$.a');
  assert.equal(J.joinPath('$.a', 0), '$.a[0]');
  assert.equal(J.joinPath('$', 'a-b'), '$["a-b"]');
  assert.equal(J.formatBytes(2048), '2 KB');
});

test('password: length, classes and exclusions', () => {
  for (let i = 0; i < 50; i++) {
    const pw = generatePassword({
      length: 12, numbers: true, lowercase: true, uppercase: true, symbols: true, excludeSimilar: true, exclude: '#'
    });
    assert.equal(pw.length, 12);
    assert.match(pw, /[0-9]/);
    assert.match(pw, /[a-z]/);
    assert.match(pw, /[A-Z]/);
    assert.match(pw, /[^0-9a-zA-Z]/);
    assert.ok(![...SIMILAR_CHARS, '#'].some((c) => pw.includes(c)));
  }
  assert.throws(() => generatePassword({ numbers: false, lowercase: false, uppercase: false, symbols: false }));
  assert.equal(buildPools({ numbers: true, lowercase: false, uppercase: false, symbols: false, excludeSimilar: false }).length, 1);
  assert.ok(passwordStrength(generatePassword({ length: 24, symbols: true })).level >= 3);
});
