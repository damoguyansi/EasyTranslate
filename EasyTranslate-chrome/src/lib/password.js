const CHARSET = {
  numbers: '0123456789',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?'
};

/**
 * 生成随机密码（使用加密安全随机数）。
 */
export function generatePassword(options = {}) {
  const {
    length = 16,
    includeNumbers = true,
    includeLowercase = true,
    includeUppercase = true,
    includeSymbols = false,
    excludeChars = ''
  } = options;

  let charset = '';
  if (includeNumbers) charset += CHARSET.numbers;
  if (includeLowercase) charset += CHARSET.lowercase;
  if (includeUppercase) charset += CHARSET.uppercase;
  if (includeSymbols) charset += CHARSET.symbols;
  if (!charset) charset = CHARSET.numbers + CHARSET.lowercase;

  if (excludeChars) {
    const exclude = new Set(excludeChars.split(''));
    charset = charset
      .split('')
      .filter((c) => !exclude.has(c))
      .join('');
  }
  if (!charset) return '错误: 没有可用字符生成密码';

  const random = new Uint32Array(length);
  crypto.getRandomValues(random);
  let password = '';
  for (let i = 0; i < length; i++) password += charset[random[i] % charset.length];
  return password;
}

/**
 * 计算密码强度。
 */
export function calculatePasswordStrength(password) {
  if (!password) return { score: 0, text: '未生成', color: '#94a3b8', width: 0 };

  let score = 0;
  const len = password.length;
  if (len >= 8) score += 20;
  if (len >= 12) score += 10;
  if (len >= 16) score += 10;
  if (len >= 20) score += 10;
  if (/\d/.test(password)) score += 15;
  if (/[a-z]/.test(password)) score += 15;
  if (/[A-Z]/.test(password)) score += 15;
  if (/[^a-zA-Z0-9]/.test(password)) score += 15;
  if (new Set(password.split('')).size >= len * 0.7) score += 10;

  if (score >= 80) return { score, text: '很强', color: '#22c55e', width: 100 };
  if (score >= 60) return { score, text: '中等', color: '#eab308', width: 70 };
  if (score >= 40) return { score, text: '一般', color: '#f97316', width: 50 };
  return { score, text: '较弱', color: '#ef4444', width: 30 };
}
