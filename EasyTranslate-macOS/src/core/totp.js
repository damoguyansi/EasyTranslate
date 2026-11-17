// TOTP 验证码：otpauth:// 解析、Google Authenticator 导出（otpauth-migration）导入、手动添加、生成

const DEFAULTS = { algorithm: 'SHA1', digits: 6, period: 30 };
const ALGORITHMS = new Set(['SHA1', 'SHA256', 'SHA512']);
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function normalizeSecret(secret) {
  return String(secret || '').replace(/[\s-]+/g, '').replace(/=+$/g, '').toUpperCase();
}

export function base32Decode(secret) {
  const clean = normalizeSecret(secret);
  if (!clean || /[^A-Z2-7]/.test(clean)) throw new Error('密钥不是有效的 Base32 字符串');
  const bytes = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of clean) {
    buffer = (buffer << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

export function base32Encode(bytes) {
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const b of bytes) {
    buffer = (buffer << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += B32[(buffer >> bits) & 31];
    }
  }
  if (bits > 0) out += B32[(buffer << (5 - bits)) & 31];
  return out;
}

export function makeAccountId(secret, issuer, account) {
  return [issuer || '', account || '', normalizeSecret(secret)].join(':');
}

function buildAccount({ issuer, account, secret, algorithm, digits, period }) {
  const s = normalizeSecret(secret);
  base32Decode(s); // 校验
  const alg = String(algorithm || DEFAULTS.algorithm).toUpperCase().replace('-', '');
  const d = Number(digits || DEFAULTS.digits);
  const p = Number(period || DEFAULTS.period);
  if (!ALGORITHMS.has(alg)) throw new Error('不支持的算法：' + alg);
  if (![6, 7, 8].includes(d)) throw new Error('验证码位数仅支持 6、7、8 位');
  if (!Number.isFinite(p) || p < 5 || p > 300) throw new Error('刷新周期无效');
  const iss = String(issuer || '').trim();
  const acc = String(account || '').trim();
  return {
    id: makeAccountId(s, iss, acc),
    issuer: iss || acc || 'Authenticator',
    account: acc,
    secret: s,
    algorithm: alg,
    digits: d,
    period: p,
    createdAt: Date.now()
  };
}

export function createManualAccount(fields) {
  if (!normalizeSecret(fields?.secret)) throw new Error('请输入密钥');
  return buildAccount(fields || {});
}

export function parseOtpAuthUri(uri) {
  const raw = String(uri || '').trim();
  if (!raw) throw new Error('内容为空');
  const typeMatch = raw.match(/^otpauth:\/\/([^/?#]+)/i);
  if (!typeMatch) throw new Error('不是有效的 otpauth:// 链接');
  if (typeMatch[1].toLowerCase() !== 'totp') throw new Error('仅支持 TOTP 类型');
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('不是有效的 otpauth:// 链接');
  }
  const label = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  const params = url.searchParams;
  if (!params.get('secret')) throw new Error('缺少 secret 参数');
  const idx = label.indexOf(':');
  const labelIssuer = idx >= 0 ? label.slice(0, idx) : '';
  const labelAccount = idx >= 0 ? label.slice(idx + 1) : label;
  return buildAccount({
    issuer: params.get('issuer') || labelIssuer,
    account: labelAccount.trim(),
    secret: params.get('secret'),
    algorithm: params.get('algorithm'),
    digits: params.get('digits'),
    period: params.get('period')
  });
}

/* ---------- Google Authenticator 导出：otpauth-migration://offline?data=... ---------- */

function readVarint(buf, pos) {
  let result = 0;
  let shift = 0;
  for (;;) {
    if (pos >= buf.length) throw new Error('迁移数据已损坏');
    const b = buf[pos++];
    result += (b & 0x7f) * Math.pow(2, shift);
    if (!(b & 0x80)) return [result, pos];
    shift += 7;
  }
}

function readMessage(buf) {
  const fields = [];
  let pos = 0;
  while (pos < buf.length) {
    let key;
    [key, pos] = readVarint(buf, pos);
    const field = Math.floor(key / 8);
    const wire = key & 7;
    if (wire === 0) {
      let v;
      [v, pos] = readVarint(buf, pos);
      fields.push({ field, value: v });
    } else if (wire === 2) {
      let len;
      [len, pos] = readVarint(buf, pos);
      fields.push({ field, bytes: buf.subarray(pos, pos + len) });
      pos += len;
    } else if (wire === 5) pos += 4;
    else if (wire === 1) pos += 8;
    else throw new Error('迁移数据已损坏');
  }
  return fields;
}

export function parseMigrationUri(uri) {
  const url = new URL(String(uri).trim());
  const data = url.searchParams.get('data');
  if (!data) throw new Error('迁移二维码缺少 data 参数');
  const bin = atob(data.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, ''));
  const buf = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const text = new TextDecoder();
  const algMap = { 1: 'SHA1', 2: 'SHA256', 3: 'SHA512' };
  const accounts = [];
  for (const f of readMessage(buf)) {
    if (f.field !== 1 || !f.bytes) continue;
    const p = { secret: null, name: '', issuer: '', algorithm: 1, digits: 1, type: 2 };
    for (const g of readMessage(f.bytes)) {
      if (g.field === 1) p.secret = g.bytes;
      else if (g.field === 2) p.name = text.decode(g.bytes);
      else if (g.field === 3) p.issuer = text.decode(g.bytes);
      else if (g.field === 4) p.algorithm = g.value;
      else if (g.field === 5) p.digits = g.value;
      else if (g.field === 6) p.type = g.value;
    }
    if (p.type !== 2 || !p.secret?.length) continue; // 只导入 TOTP
    let name = p.name;
    if (p.issuer && name.startsWith(p.issuer + ':')) name = name.slice(p.issuer.length + 1);
    accounts.push(
      buildAccount({
        issuer: p.issuer,
        account: name,
        secret: base32Encode(p.secret),
        algorithm: algMap[p.algorithm] || 'SHA1',
        digits: p.digits === 2 ? 8 : 6,
        period: 30
      })
    );
  }
  if (!accounts.length) throw new Error('迁移二维码中没有可导入的 TOTP 账号');
  return accounts;
}

/** 解析任意二维码/文本内容，返回账号数组。 */
export function parseAuthPayload(text) {
  const raw = String(text || '').trim();
  if (/^otpauth-migration:/i.test(raw)) return parseMigrationUri(raw);
  if (/^otpauth:/i.test(raw)) return [parseOtpAuthUri(raw)];
  throw new Error('未识别到 Authenticator 二维码或 otpauth:// 链接');
}

/** 合并新账号：同 id 覆盖（保留备注），新账号置顶。 */
export function mergeAccounts(existing, incoming) {
  const list = Array.isArray(existing) ? existing.slice() : [];
  const added = [];
  for (const acc of incoming) {
    const old = list.findIndex((a) => a.id === acc.id);
    if (old >= 0) {
      if (list[old].remark) acc.remark = list[old].remark;
      list.splice(old, 1);
    }
    added.push(acc);
  }
  return added.concat(list);
}

export function reorderAccounts(accounts, orderedIds) {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const out = [];
  for (const id of orderedIds) {
    if (byId.has(id)) {
      out.push(byId.get(id));
      byId.delete(id);
    }
  }
  return out.concat([...byId.values()]);
}

export function totpRemaining(account, now = Date.now()) {
  const period = account?.period || DEFAULTS.period;
  return period - (Math.floor(now / 1000) % period);
}

const keyCache = new Map();

async function importKey(account) {
  const cacheKey = account.algorithm + ':' + account.secret;
  if (!keyCache.has(cacheKey)) {
    keyCache.set(
      cacheKey,
      crypto.subtle.importKey(
        'raw',
        base32Decode(account.secret),
        { name: 'HMAC', hash: String(account.algorithm || 'SHA1').replace(/^SHA(\d+)$/, 'SHA-$1') },
        false,
        ['sign']
      )
    );
  }
  return keyCache.get(cacheKey);
}

export async function generateTotp(account, now = Date.now()) {
  const period = account.period || DEFAULTS.period;
  const counter = Math.floor(now / 1000 / period);
  const msg = new ArrayBuffer(8);
  const view = new DataView(msg);
  view.setUint32(0, Math.floor(counter / 0x100000000));
  view.setUint32(4, counter >>> 0);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', await importKey(account), msg));
  const offset = digest[digest.length - 1] & 0xf;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  const digits = account.digits || DEFAULTS.digits;
  return String(binary % Math.pow(10, digits)).padStart(digits, '0');
}

export function normalizeRemark(value) {
  return Array.from(String(value || '').trim()).slice(0, 20).join('');
}
