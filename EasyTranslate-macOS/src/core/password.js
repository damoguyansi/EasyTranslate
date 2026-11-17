// 密码生成：加密安全随机数 + 拒绝采样（无取模偏差），保证每个已选字符类至少出现一次

export const CHARSETS = {
  numbers: '0123456789',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?'
};

export const SIMILAR_CHARS = 'il1Lo0O';

export const DEFAULT_PASSWORD_OPTIONS = {
  length: 16,
  numbers: true,
  lowercase: true,
  uppercase: true,
  symbols: false,
  excludeSimilar: true,
  exclude: ''
};

function randomInt(max) {
  // 返回 [0, max) 的无偏整数
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % max;
  }
}

export function buildPools(opts) {
  const o = { ...DEFAULT_PASSWORD_OPTIONS, ...opts };
  const banned = new Set((o.exclude || '') + (o.excludeSimilar ? SIMILAR_CHARS : ''));
  const pools = [];
  for (const key of ['numbers', 'lowercase', 'uppercase', 'symbols']) {
    if (!o[key]) continue;
    const pool = [...CHARSETS[key]].filter((c) => !banned.has(c)).join('');
    if (pool) pools.push(pool);
  }
  return pools;
}

export function generatePassword(opts = {}) {
  const o = { ...DEFAULT_PASSWORD_OPTIONS, ...opts };
  const length = Math.min(128, Math.max(4, Number(o.length) || 16));
  const pools = buildPools(o);
  if (!pools.length) throw new Error('没有可用字符，请至少选择一种字符类型');
  const all = pools.join('');
  const chars = pools.slice(0, length).map((p) => p[randomInt(p.length)]);
  while (chars.length < length) chars.push(all[randomInt(all.length)]);
  // Fisher–Yates 洗牌，打散必选字符的位置
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/** 基于熵估计强度：bits = length * log2(字符池大小)。 */
export function passwordStrength(password) {
  if (!password) return { bits: 0, level: 0, label: '—' };
  let pool = 0;
  if (/[0-9]/.test(password)) pool += 10;
  if (/[a-z]/.test(password)) pool += 26;
  if (/[A-Z]/.test(password)) pool += 26;
  if (/[^0-9a-zA-Z]/.test(password)) pool += 26;
  const bits = Math.round(password.length * Math.log2(Math.max(pool, 2)));
  if (bits >= 100) return { bits, level: 4, label: '极强' };
  if (bits >= 75) return { bits, level: 3, label: '强' };
  if (bits >= 50) return { bits, level: 2, label: '中等' };
  return { bits, level: 1, label: '弱' };
}
