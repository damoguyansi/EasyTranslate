// JSON 工具：智能解析（含多层转义）、格式化、压缩、排序、错误定位、降级排版

/** 从 V8 错误信息中提取出错位置，返回 { line, column, message }。 */
export function describeJsonError(error, text) {
  const msg = String(error?.message || error || '未知错误');
  let line;
  let column;
  const lc = msg.match(/line (\d+) column (\d+)/);
  const pos = msg.match(/position (\d+)/);
  if (lc) {
    line = Number(lc[1]);
    column = Number(lc[2]);
  } else if (pos) {
    const before = text.slice(0, Number(pos[1])).split('\n');
    line = before.length;
    column = before[before.length - 1].length + 1;
  } else if (/Unexpected end of JSON input/.test(msg)) {
    const lines = text.split('\n');
    line = lines.length;
    column = lines[lines.length - 1].length + 1;
  }
  const clean = msg
    .replace(/^JSON\.parse: /, '')
    .replace(/ in JSON at position \d+( \(line \d+ column \d+\))?/, '')
    .replace(/, "[\s\S]*" is not valid JSON$/, '');
  return { line, column, message: translateError(clean) };
}

function translateError(msg) {
  if (/Unexpected end of JSON input/.test(msg)) return '内容不完整，可能缺少结束括号';
  if (/Expected property name/.test(msg)) return '属性名必须使用双引号';
  if (/Expected ',' or '}'/.test(msg)) return "缺少 ',' 或 '}'";
  if (/Expected ',' or ']'/.test(msg)) return "缺少 ',' 或 ']'";
  if (/Bad control character/.test(msg)) return '字符串中包含未转义的控制字符';
  if (/Unexpected non-whitespace character/.test(msg)) return 'JSON 结束后还有多余内容';
  if (/Unexpected token/.test(msg)) return msg.replace(/Unexpected token/, '意外的字符');
  return msg;
}

export function looksLikeJson(text) {
  const t = String(text || '').trim();
  return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'));
}

function decodeLooseEscaped(text) {
  const t = String(text || '').trim();
  if (!/\\["\\nrtbf/]/.test(t)) return '';
  return t
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\');
}

/**
 * 智能解析：支持被字符串包裹/多层转义的 JSON。
 * @returns {{ ok: true, value: any, unwrapped: number } | { ok: false, error: object }}
 */
export function parseSmart(text) {
  const source = String(text ?? '');
  if (!source.trim()) return { ok: false, error: { message: '内容为空' } };
  let candidate = source.trim();
  let firstError = null;
  for (let depth = 0; depth < 5; depth++) {
    try {
      const value = JSON.parse(candidate);
      if (typeof value === 'string' && (looksLikeJson(value) || /^\s*"[\s\S]*"\s*$/.test(value))) {
        candidate = value.trim();
        continue;
      }
      return { ok: true, value, unwrapped: depth };
    } catch (e) {
      if (!firstError) firstError = describeJsonError(e, candidate);
      const loose = decodeLooseEscaped(candidate.replace(/^"|"$/g, ''));
      if (loose && loose !== candidate) {
        candidate = loose;
        continue;
      }
      break;
    }
  }
  return { ok: false, error: firstError || { message: '无法解析' } };
}

export function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort((a, b) => a.localeCompare(b))) out[k] = sortKeysDeep(value[k]);
    return out;
  }
  return value;
}

function indentUnit(indent) {
  if (indent === 'tab') return '\t';
  const n = Number(indent);
  return Number.isFinite(n) ? Math.max(0, Math.min(8, n)) : 2;
}

/** 格式化。标准 JSON 失败时降级为按结构符号排版。 */
export function formatJson(text, { indent = 2, sortKeys = false } = {}) {
  const parsed = parseSmart(text);
  if (parsed.ok) {
    const value = sortKeys ? sortKeysDeep(parsed.value) : parsed.value;
    return { ok: true, text: JSON.stringify(value, null, indentUnit(indent)), unwrapped: parsed.unwrapped };
  }
  const loose = formatLoose(text, indent);
  if (loose) return { ok: true, text: loose, loose: true, error: parsed.error };
  return { ok: false, error: parsed.error };
}

export function minifyJson(text) {
  const parsed = parseSmart(text);
  if (!parsed.ok) return parsed;
  return { ok: true, text: JSON.stringify(parsed.value) };
}

export function validateJson(text) {
  try {
    JSON.parse(String(text ?? ''));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: describeJsonError(e, String(text ?? '')) };
  }
}

/** 把文本转义为 JSON 字符串内容（不含外层引号）。 */
export function escapeJsonString(text) {
  return JSON.stringify(String(text ?? '')).slice(1, -1);
}

export function unescapeJsonString(text) {
  const t = String(text ?? '').trim().replace(/^"([\s\S]*)"$/, '$1');
  try {
    return JSON.parse('"' + t + '"');
  } catch {
    throw new Error('无法去转义：字符串中包含非法转义序列');
  }
}

export function textStats(text) {
  const s = String(text ?? '');
  return {
    chars: s.length,
    lines: s ? s.split('\n').length : 0,
    bytes: new TextEncoder().encode(s).length
  };
}

export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${Math.round((bytes / Math.pow(1024, i)) * 10) / 10} ${units[i]}`;
}

/** 非标准 JSON 的降级排版：只按结构符号换行缩进，不改内容。 */
export function formatLoose(text, indent = 2) {
  const source = String(text || '').trim();
  if (!source || !/[{}[\](),;]/.test(source)) return '';
  const u = indentUnit(indent);
  const unit = typeof u === 'number' ? ' '.repeat(u) : u;
  let out = '';
  let level = 0;
  let quote = '';
  let escaped = false;
  const newline = () => {
    out = out.replace(/[ \t]+$/, '');
    out += '\n' + unit.repeat(Math.max(0, level));
  };
  for (const ch of source) {
    if (quote) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
    } else if ('{[('.includes(ch)) {
      out += ch;
      level++;
      newline();
    } else if ('}])'.includes(ch)) {
      level = Math.max(0, level - 1);
      newline();
      out += ch;
    } else if (ch === ',' || ch === ';') {
      out += ch;
      newline();
    } else if (ch === ':') {
      out = out.replace(/[ \t]+$/, '') + ': ';
    } else if (/\s/.test(ch)) {
      if (out && !/[\s]$/.test(out)) out += ' ';
    } else {
      out += ch;
    }
  }
  const cleaned = out
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim())
    .join('\n');
  return cleaned && cleaned !== source ? cleaned : '';
}

export function valueType(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

/** 生成 JS 访问路径，如 $.data[0]["a-b"] */
export function joinPath(parent, key) {
  if (typeof key === 'number') return `${parent}[${key}]`;
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `${parent}.${key}` : `${parent}[${JSON.stringify(key)}]`;
}

export const SAMPLE_JSON = JSON.stringify(
  {
    name: 'EasyTranslate',
    version: '3.0.0',
    features: ['翻译', 'JSON', '编码', '密码', '验证码', '截图'],
    shortcuts: { toggle: '⌘⇧T', selection: '⌘⇧Y', capture: '⌘⇧Z' },
    nested: { escaped: '{"hello":"world"}', enabled: true, count: 42, empty: null }
  },
  null,
  2
);
