// 键盘事件 ⇄ Electron accelerator 转换（纯函数，便于测试）

const CODE_KEYS = {
  Space: 'Space', Enter: 'Return', Tab: 'Tab', Backquote: '`', Minus: '-', Equal: '=',
  BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'",
  Comma: ',', Period: '.', Slash: '/', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right'
};

export function keyFromCode(code) {
  if (!code) return '';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1\d|2[0-4])$/.test(code)) return code;
  return CODE_KEYS[code] || '';
}

/** 返回 accelerator，例如 CommandOrControl+Shift+T；仅修饰键或无修饰键时返回空串。 */
export function eventToAccelerator(e) {
  const key = keyFromCode(e.code);
  if (!key) return '';
  const mods = [];
  if (e.metaKey) mods.push('CommandOrControl');
  if (e.ctrlKey) mods.push('Control');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  const isFn = /^F\d+$/.test(key);
  if (!mods.length && !isFn) return '';
  // 仅 Shift + 普通键会影响正常输入，不允许
  if (mods.length === 1 && mods[0] === 'Shift' && !isFn) return '';
  return [...mods, key].join('+');
}

const SYMBOLS = {
  CommandOrControl: '⌘', CmdOrCtrl: '⌘', Command: '⌘', Cmd: '⌘', Super: '⌘', Meta: '⌘',
  Control: '⌃', Ctrl: '⌃', Alt: '⌥', Option: '⌥', Shift: '⇧',
  Return: '↩', Space: '␣', Tab: '⇥', Up: '↑', Down: '↓', Left: '←', Right: '→'
};
const ORDER = ['⌃', '⌥', '⇧', '⌘'];

/** 格式化为 macOS 风格符号，例如 ⇧⌘T */
export function formatAccelerator(acc) {
  if (!acc) return '';
  const parts = acc.split('+').map((p) => SYMBOLS[p] || p.toUpperCase());
  const mods = parts.filter((p) => ORDER.includes(p)).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const keys = parts.filter((p) => !ORDER.includes(p));
  return mods.join('') + keys.join('');
}
