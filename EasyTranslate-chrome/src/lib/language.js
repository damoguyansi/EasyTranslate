/**
 * 自动检测文本语言：日文 / 中文 / 英文。
 * 判定优先级：含平假名/片假名 → 日文；含 CJK 汉字（且无假名）→ 中文；否则英文。
 * @param {string} text
 * @returns {'ja'|'zh-Hans'|'en'}
 */
export function detectLanguage(text) {
  if (!text || typeof text !== 'string' || !text.trim()) return 'en';

  let kana = 0; // 平假名 + 片假名
  let han = 0; // CJK 汉字
  let latin = 0;

  for (const ch of text) {
    const c = ch.codePointAt(0);
    if ((c >= 0x3040 && c <= 0x309f) || (c >= 0x30a0 && c <= 0x30ff)) kana++;
    else if (c >= 0x4e00 && c <= 0x9fff) han++;
    else if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) latin++;
  }

  // 只要出现假名就判定为日文（日文常混用汉字）
  if (kana > 0) return 'ja';

  const total = text.length || 1;
  if (han / total > 0.2) return 'zh-Hans';
  if (latin / total > 0.3) return 'en';
  // 兜底：有汉字算中文，否则英文
  return han > 0 ? 'zh-Hans' : 'en';
}

export const LANGUAGES = {
  'zh-Hans': '中文',
  en: '英语',
  ja: '日语'
};

/**
 * 给定源语言，返回一个合理的默认目标语言。
 * 中文↔英文互译；日文默认译为中文。
 */
export function defaultTarget(src) {
  if (src === 'zh-Hans') return 'en';
  if (src === 'en') return 'zh-Hans';
  if (src === 'ja') return 'zh-Hans';
  return 'zh-Hans';
}

/** 兼容旧调用：等价于 defaultTarget。 */
export const oppositeLang = defaultTarget;
