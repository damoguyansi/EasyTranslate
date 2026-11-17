// 语言检测与目标语言推断（纯函数，可在 Node 测试中直接运行）

export const LANGUAGES = [
  { code: 'zh-Hans', name: '中文' },
  { code: 'en', name: '英语' },
  { code: 'ja', name: '日语' },
  { code: 'ko', name: '韩语' },
  { code: 'fr', name: '法语' },
  { code: 'de', name: '德语' },
  { code: 'es', name: '西班牙语' },
  { code: 'ru', name: '俄语' },
  { code: 'zh-Hant', name: '繁体中文' }
];

const NAMES = Object.fromEntries(LANGUAGES.map((l) => [l.code, l.name]));

export function languageName(code) {
  if (!code) return '';
  if (NAMES[code]) return NAMES[code];
  if (code.startsWith('zh')) return '中文';
  return code;
}

/**
 * 本地快速检测：只区分中 / 日 / 韩 / 英（其它语言交给翻译接口检测）。
 * @returns {'zh-Hans'|'ja'|'ko'|'en'}
 */
export function detectLanguage(text) {
  if (!text || typeof text !== 'string' || !text.trim()) return 'en';
  let kana = 0;
  let han = 0;
  let hangul = 0;
  let latin = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if ((c >= 0x3040 && c <= 0x30ff) || (c >= 0x31f0 && c <= 0x31ff)) kana++;
    else if ((c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf)) han++;
    else if ((c >= 0xac00 && c <= 0xd7af) || (c >= 0x1100 && c <= 0x11ff)) hangul++;
    else if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) latin++;
  }
  if (kana > 0) return 'ja';
  if (hangul > 0 && hangul >= han) return 'ko';
  const total = han + latin + hangul || 1;
  if (han / total > 0.2) return 'zh-Hans';
  return 'en';
}

export function isChinese(code) {
  return typeof code === 'string' && code.startsWith('zh');
}

/**
 * 根据源语言决定目标语言：
 * - 源语言为中文 → 用户设置的「中文译入」语言（默认英语）
 * - 其它语言 → 中文
 */
export function resolveTarget(source, { preferredForeign = 'en', requested = 'auto' } = {}) {
  if (requested && requested !== 'auto') {
    if (requested === source) return isChinese(source) ? preferredForeign : 'zh-Hans';
    return requested;
  }
  return isChinese(source) ? preferredForeign : 'zh-Hans';
}
