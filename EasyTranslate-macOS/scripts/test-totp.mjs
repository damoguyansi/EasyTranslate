// TOTP 测试：RFC 6238 向量、otpauth 解析、Google Authenticator 迁移导入
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateTotp, parseOtpAuthUri, parseMigrationUri, parseAuthPayload, base32Encode, base32Decode,
  createManualAccount, mergeAccounts, reorderAccounts, totpRemaining
} from '../src/core/totp.js';

// RFC 6238 附录 B，密钥 "12345678901234567890"
const RAW = new TextEncoder().encode('12345678901234567890');
const SECRET = base32Encode(RAW);

test('totp: RFC 6238 vectors (SHA1, 8 digits)', async () => {
  const acc = { secret: SECRET, algorithm: 'SHA1', digits: 8, period: 30 };
  assert.equal(await generateTotp(acc, 59 * 1000), '94287082');
  assert.equal(await generateTotp(acc, 1111111109 * 1000), '07081804');
  assert.equal(await generateTotp(acc, 20000000000 * 1000), '65353130');
});

test('totp: base32 round trip', () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 255, 7]);
  assert.deepEqual(base32Decode(base32Encode(bytes)), bytes);
  assert.throws(() => base32Decode('!!!'));
});

test('totp: parse otpauth uri', () => {
  const a = parseOtpAuthUri('otpauth://totp/GitHub:me%40x.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&digits=6');
  assert.equal(a.issuer, 'GitHub');
  assert.equal(a.account, 'me@x.com');
  assert.equal(a.digits, 6);
  assert.throws(() => parseOtpAuthUri('otpauth://hotp/x?secret=JBSWY3DPEHPK3PXP'));
  assert.throws(() => parseOtpAuthUri('https://example.com'));
});

function varint(n) {
  const out = [];
  while (n > 127) {
    out.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  out.push(n);
  return out;
}
const bytesField = (num, bytes) => [...varint((num << 3) | 2), ...varint(bytes.length), ...bytes];
const intField = (num, v) => [...varint(num << 3), ...varint(v)];

test('totp: google authenticator migration payload', () => {
  const enc = new TextEncoder();
  const otp = [
    ...bytesField(1, [...RAW]),
    ...bytesField(2, [...enc.encode('Acme:alice')]),
    ...bytesField(3, [...enc.encode('Acme')]),
    ...intField(4, 1),
    ...intField(5, 1),
    ...intField(6, 2)
  ];
  const payload = new Uint8Array([...bytesField(1, otp), ...intField(2, 1)]);
  const uri = `otpauth-migration://offline?data=${encodeURIComponent(Buffer.from(payload).toString('base64'))}`;
  const list = parseMigrationUri(uri);
  assert.equal(list.length, 1);
  assert.equal(list[0].issuer, 'Acme');
  assert.equal(list[0].account, 'alice');
  assert.equal(list[0].secret, SECRET);
  assert.equal(parseAuthPayload(uri).length, 1);
});

test('totp: manual, merge keeps remark, reorder', () => {
  const a = createManualAccount({ issuer: 'A', account: 'x', secret: 'JBSW Y3DP EHPK 3PXP' });
  assert.equal(a.secret, 'JBSWY3DPEHPK3PXP');
  assert.throws(() => createManualAccount({ issuer: 'A', secret: '' }));
  const b = createManualAccount({ issuer: 'B', secret: 'GEZDGNBV' });
  const merged = mergeAccounts([{ ...a, remark: 'work' }, b], [{ ...a }]);
  assert.equal(merged[0].remark, 'work');
  assert.equal(merged.length, 2);
  assert.deepEqual(reorderAccounts(merged, [b.id]).map((x) => x.id), [b.id, a.id]);
  assert.equal(totpRemaining({ period: 30 }, 10_000), 20);
});
