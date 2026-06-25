/** 友好的 JSON 错误解析。 */
function parseJSONError(error, jsonText) {
  const msg = error.message;
  const pos = msg.match(/position (\d+)/);
  if (pos) {
    const position = parseInt(pos[1], 10);
    const lines = jsonText.substring(0, position).split('\n');
    const line = lines.length;
    const column = lines[lines.length - 1].length + 1;
    const ctx = jsonText.substring(Math.max(0, position - 20), Math.min(jsonText.length, position + 20));
    return `JSON 格式错误 (第 ${line} 行，第 ${column} 列)\n错误信息: ${msg}\n位置附近: ...${ctx}...`;
  }
  if (msg.includes('Unexpected end of JSON input')) return 'JSON 不完整：请检查是否缺少结束括号或大括号';
  if (msg.includes('Expected property name')) return '属性名格式不正确：JSON 属性名必须使用双引号';
  return `JSON 格式错误: ${msg}`;
}

export function formatJSON(jsonText, indent = 2) {
  if (!jsonText || !jsonText.trim()) return { success: false, error: 'JSON 内容不能为空' };
  try {
    return { success: true, result: JSON.stringify(JSON.parse(jsonText), null, indent) };
  } catch (e) {
    return { success: false, error: parseJSONError(e, jsonText) };
  }
}

export function compressJSON(jsonText) {
  if (!jsonText || !jsonText.trim()) return { success: false, error: 'JSON 内容不能为空' };
  try {
    return { success: true, result: JSON.stringify(JSON.parse(jsonText)) };
  } catch (e) {
    return { success: false, error: parseJSONError(e, jsonText) };
  }
}

export function validateJSON(jsonText) {
  if (!jsonText || !jsonText.trim()) return { success: false, error: 'JSON 内容不能为空' };
  try {
    JSON.parse(jsonText);
    return { success: true };
  } catch (e) {
    return { success: false, error: parseJSONError(e, jsonText) };
  }
}

export function getJSONStats(jsonText) {
  if (!jsonText) return { chars: 0, lines: 0, size: 0 };
  return {
    chars: jsonText.length,
    lines: jsonText.split('\n').length,
    size: new Blob([jsonText]).size
  };
}

/** 转义：把文本转成可放进 JSON 字符串的形式（不含外层引号）。 */
export function escapeString(text) {
  if (!text) return { success: true, result: '' };
  try {
    const s = JSON.stringify(text);
    return { success: true, result: s.slice(1, -1) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/** 去转义：把转义后的字符串还原。 */
export function unescapeString(text) {
  if (!text) return { success: true, result: '' };
  try {
    return { success: true, result: JSON.parse('"' + text.replace(/^"|"$/g, '') + '"') };
  } catch (e) {
    return { success: false, error: '无法去转义：' + e.message };
  }
}

/** 中文等非 ASCII 转 \uXXXX。 */
export function toUnicode(text) {
  if (!text) return { success: true, result: '' };
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0);
    out += code > 127 ? '\\u' + code.toString(16).padStart(4, '0') : ch;
  }
  return { success: true, result: out };
}

/** \uXXXX 还原为中文。 */
export function fromUnicode(text) {
  if (!text) return { success: true, result: '' };
  try {
    const result = text.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) =>
      String.fromCharCode(parseInt(h, 16))
    );
    return { success: true, result };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/** 解析 JSON 为对象（供树视图使用）。 */
export function parseJSON(jsonText) {
  if (!jsonText || !jsonText.trim()) return { success: false, error: 'JSON 内容不能为空' };
  try {
    return { success: true, value: JSON.parse(jsonText) };
  } catch (e) {
    return { success: false, error: parseJSONError(e, jsonText) };
  }
}

export function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
