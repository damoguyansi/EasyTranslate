export function parseJsonSmart(text) {
  const errors = [];
  let candidate = String(text || '').trim();
  for (let i = 0; i < 4; i++) {
    const parsed = tryParse(candidate);
    if (parsed.ok) {
      if (typeof parsed.value === 'string' && looksLikeJson(parsed.value)) {
        candidate = parsed.value.trim();
        continue;
      }
      return { success: true, value: parsed.value, unescaped: i > 0 };
    }
    errors.push(parsed.error);

    const loose = decodeLooseEscapedJson(candidate);
    if (loose && loose !== candidate) {
      candidate = loose;
      continue;
    }
    break;
  }
  return { success: false, error: 'JSON 格式错误或转义层级无法解析: ' + (errors[0] || '未知错误') };
}

export function tryParse(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export function looksLikeJson(text) {
  const t = String(text || '').trim();
  return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'));
}

export function decodeLooseEscapedJson(text) {
  const t = String(text || '').trim();
  if (!/[\\][\\"nrtbf/]/.test(t)) return '';
  return t
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\');
}
