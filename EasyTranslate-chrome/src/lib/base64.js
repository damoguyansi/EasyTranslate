/** Base64 编码（支持 Unicode）。 */
export function encodeBase64(text) {
  if (!text) return '';
  try {
    return btoa(unescape(encodeURIComponent(text)));
  } catch {
    throw new Error('编码失败，请检查输入内容');
  }
}

/** Base64 解码（支持 Unicode）。 */
export function decodeBase64(encoded) {
  if (!encoded) return '';
  try {
    return decodeURIComponent(escape(atob(encoded)));
  } catch {
    throw new Error('解码失败，请检查输入的 Base64 字符串是否正确');
  }
}

/** 校验是否为合法 Base64 字符串。 */
export function isValidBase64(text) {
  if (!text || typeof text !== 'string') return false;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text)) return false;
  return text.length % 4 === 0;
}
