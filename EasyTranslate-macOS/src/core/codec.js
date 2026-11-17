// 常用编解码：Base64 / URL / HTML 实体 / Unicode / 时间戳 / 哈希

const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: true });

function bytesToBinary(bytes) {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return s;
}

export function base64Encode(text, { urlSafe = false } = {}) {
  const out = btoa(bytesToBinary(enc.encode(String(text ?? ''))));
  return urlSafe ? out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : out;
}

export function base64Decode(input) {
  let s = String(input ?? '').replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!s) return '';
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new Error('不是有效的 Base64 字符串');
  while (s.length % 4) s += '=';
  let binary;
  try {
    binary = atob(s);
  } catch {
    throw new Error('不是有效的 Base64 字符串');
  }
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  try {
    return dec.decode(bytes);
  } catch {
    throw new Error('解码结果不是 UTF-8 文本');
  }
}

export function urlEncode(text) {
  return encodeURIComponent(String(text ?? ''));
}

export function urlDecode(text) {
  try {
    return decodeURIComponent(String(text ?? '').replace(/\+/g, ' '));
  } catch {
    throw new Error('不是有效的 URL 编码');
  }
}

const HTML_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function htmlEscape(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => HTML_MAP[c]);
}
export function htmlUnescape(text) {
  return String(text ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

export function unicodeEscape(text) {
  let out = '';
  for (const ch of String(text ?? '')) {
    const code = ch.codePointAt(0);
    if (code < 128) out += ch;
    else if (code <= 0xffff) out += '\\u' + code.toString(16).padStart(4, '0');
    else {
      const hi = Math.floor((code - 0x10000) / 0x400) + 0xd800;
      const lo = ((code - 0x10000) % 0x400) + 0xdc00;
      out += '\\u' + hi.toString(16) + '\\u' + lo.toString(16);
    }
  }
  return out;
}

export function unicodeUnescape(text) {
  return String(text ?? '')
    .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

export async function hashText(text, algorithm = 'SHA-256') {
  const buf = await crypto.subtle.digest(algorithm, enc.encode(String(text ?? '')));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/* ---------- 时间戳 ---------- */
const pad = (n, l = 2) => String(n).padStart(l, '0');

export function formatDate(date) {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/**
 * 解析时间戳或日期字符串，返回统一信息。
 * 10 位按秒、13 位按毫秒；其它字符串交给 Date 解析。
 */
export function parseTime(input) {
  const raw = String(input ?? '').trim();
  if (!raw) throw new Error('请输入时间戳或日期');
  let ms;
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    const n = Number(raw);
    const intLen = raw.replace(/^-/, '').split('.')[0].length;
    ms = intLen <= 10 ? n * 1000 : intLen <= 13 ? n : n / 1000;
  } else {
    ms = Date.parse(raw.replace(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/, '$1-$2-$3').replace(' ', 'T'));
    if (!Number.isFinite(ms)) ms = Date.parse(raw);
  }
  if (!Number.isFinite(ms)) throw new Error('无法识别的时间格式');
  const d = new Date(ms);
  return {
    seconds: Math.floor(ms / 1000),
    millis: Math.round(ms),
    local: formatDate(d),
    iso: d.toISOString(),
    relative: relativeTime(ms)
  };
}

export function relativeTime(ms, now = Date.now()) {
  const diff = Math.round((ms - now) / 1000);
  const abs = Math.abs(diff);
  const units = [
    [31536000, '年'],
    [2592000, '个月'],
    [86400, '天'],
    [3600, '小时'],
    [60, '分钟'],
    [1, '秒']
  ];
  if (abs < 5) return '刚刚';
  for (const [sec, name] of units) {
    if (abs >= sec) {
      const v = Math.floor(abs / sec);
      return diff < 0 ? `${v} ${name}前` : `${v} ${name}后`;
    }
  }
  return '刚刚';
}
