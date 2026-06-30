import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  parseOtpAuthUri,
  generateTotp,
  base32Decode
} = await import('../src/authenticator/authenticator.js');

test('parseOtpAuthUri parses standard TOTP uri', () => {
  const account = parseOtpAuthUri(
    'otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example'
  );
  assert.equal(account.type, 'totp');
  assert.equal(account.issuer, 'Example');
  assert.equal(account.account, 'alice@example.com');
  assert.equal(account.secret, 'JBSWY3DPEHPK3PXP');
  assert.equal(account.algorithm, 'SHA1');
  assert.equal(account.digits, 6);
  assert.equal(account.period, 30);
});

test('parseOtpAuthUri accepts Aliyun style account labels with @', () => {
  const account = parseOtpAuthUri(
    'otpauth://totp/Aliyun:quguolong@1010692187545340?secret=D5X4DAEL3YER2TFUMSXRT5GVZP2UDMD6TCJF5JFTFYBI5CBKR27TLDS6Y4GYN2XI&issuer=Aliyun'
  );
  assert.equal(account.issuer, 'Aliyun');
  assert.equal(account.account, 'quguolong@1010692187545340');
  assert.equal(account.type, 'totp');
});

test('base32Decode decodes RFC sample secret', () => {
  const bytes = base32Decode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  assert.equal(new TextDecoder().decode(bytes), '12345678901234567890');
});

test('generateTotp matches RFC 6238 SHA1 vector', async () => {
  const account = {
    secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
    algorithm: 'SHA1',
    digits: 8,
    period: 30
  };
  assert.equal(await generateTotp(account, 59000), '94287082');
  assert.equal(await generateTotp(account, 1111111109000), '07081804');
  assert.equal(await generateTotp(account, 1111111111000), '14050471');
});
