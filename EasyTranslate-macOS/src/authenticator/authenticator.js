const DEFAULTS = {
  algorithm: 'SHA1',
  digits: 6,
  period: 30
};

const ALGORITHMS = new Set(['SHA1', 'SHA256', 'SHA512']);

export function parseOtpAuthUri(uri) {
  if (!uri || typeof uri !== 'string') throw new Error('二维码内容为空');
  let url;
  try {
    url = new URL(uri.trim());
  } catch {
    throw new Error('不是有效的 Authenticator 二维码');
  }
  if (url.protocol !== 'otpauth:') throw new Error('仅支持 otpauth:// 二维码');
  if (getOtpType(uri) !== 'totp') throw new Error('仅支持 TOTP 类型二维码');

  const label = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  const params = url.searchParams;
  const secret = normalizeSecret(params.get('secret') || '');
  if (!secret) throw new Error('二维码缺少 secret 参数');

  const labelParts = label.split(':');
  const issuer = params.get('issuer') || (labelParts.length > 1 ? labelParts[0] : '');
  const account = labelParts.length > 1 ? labelParts.slice(1).join(':') : label;
  const algorithm = String(params.get('algorithm') || DEFAULTS.algorithm).toUpperCase();
  const digits = parseInt(params.get('digits') || DEFAULTS.digits, 10);
  const period = parseInt(params.get('period') || DEFAULTS.period, 10);

  if (!ALGORITHMS.has(algorithm)) throw new Error('不支持的算法：' + algorithm);
  if (![6, 7, 8].includes(digits)) throw new Error('验证码位数仅支持 6、7、8 位');
  if (!Number.isFinite(period) || period < 5 || period > 300) throw new Error('刷新周期无效');

  return {
    id: makeAccountId(secret, issuer, account),
    type: 'totp',
    issuer: issuer || 'Authenticator',
    account: account || issuer || '未命名账号',
    secret,
    algorithm,
    digits,
    period,
    createdAt: Date.now()
  };
}

export function getTotpRemaining(account, now = Date.now()) {
  const period = account?.period || DEFAULTS.period;
  return period - (Math.floor(now / 1000) % period);
}

export async function generateTotp(account, now = Date.now()) {
  const period = account.period || DEFAULTS.period;
  const counter = Math.floor(now / 1000 / period);
  const key = await crypto.subtle.importKey(
    'raw',
    base32Decode(account.secret),
    { name: 'HMAC', hash: normalizeHash(account.algorithm) },
    false,
    ['sign']
  );
  const msg = new ArrayBuffer(8);
  const view = new DataView(msg);
  view.setUint32(0, Math.floor(counter / 0x100000000));
  view.setUint32(4, counter >>> 0);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const offset = digest[digest.length - 1] & 0xf;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  const digits = account.digits || DEFAULTS.digits;
  return String(binary % Math.pow(10, digits)).padStart(digits, '0');
}

export function normalizeSecret(secret) {
  return String(secret || '').replace(/\s+/g, '').replace(/=+$/g, '').toUpperCase();
}

export function base32Decode(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = normalizeSecret(secret);
  if (!clean || /[^A-Z2-7]/.test(clean)) throw new Error('secret 不是有效的 Base32');
  let bits = '';
  for (const ch of clean) bits += alphabet.indexOf(ch).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return new Uint8Array(bytes);
}

function normalizeHash(algorithm) {
  return String(algorithm || DEFAULTS.algorithm).replace(/^SHA(\d+)$/, 'SHA-$1');
}

function getOtpType(uri) {
  const match = String(uri || '').trim().match(/^otpauth:\/\/([^/?#]+)/i);
  return match ? decodeURIComponent(match[1]).toLowerCase() : '';
}

function makeAccountId(secret, issuer, account) {
  return [issuer || '', account || '', normalizeSecret(secret)].join(':');
}
