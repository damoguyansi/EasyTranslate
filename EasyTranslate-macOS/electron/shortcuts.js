// 全局快捷键：按设置注册，支持运行时修改并返回冲突项
export const SHORTCUT_ACTIONS = ['toggle', 'selection', 'capture'];

const MODIFIERS = new Set([
  'Command', 'Cmd', 'Control', 'Ctrl', 'CommandOrControl', 'CmdOrCtrl', 'Alt', 'Option', 'AltGr', 'Shift', 'Super', 'Meta'
]);

/** 校验 Electron accelerator：至少一个修饰键 + 一个普通键。 */
export function isValidAccelerator(acc) {
  if (typeof acc !== 'string' || !acc.trim()) return false;
  const parts = acc.split('+');
  if (parts.some((p) => !p)) return false;
  const keys = parts.filter((p) => !MODIFIERS.has(p));
  const mods = parts.filter((p) => MODIFIERS.has(p));
  return keys.length === 1 && (mods.length >= 1 || /^F([1-9]|1\d|2[0-4])$/.test(keys[0]));
}

export function createShortcutManager(globalShortcut, handlers) {
  let current = {};

  function apply(map) {
    for (const acc of Object.values(current)) {
      if (acc) {
        try {
          globalShortcut.unregister(acc);
        } catch {}
      }
    }
    current = {};
    const failed = [];
    for (const action of SHORTCUT_ACTIONS) {
      const acc = map?.[action];
      if (!acc) continue;
      if (!isValidAccelerator(acc)) {
        failed.push(action);
        continue;
      }
      let ok = false;
      try {
        ok = globalShortcut.register(acc, handlers[action]);
      } catch {
        ok = false;
      }
      if (ok) current[action] = acc;
      else failed.push(action);
    }
    return { failed, active: { ...current } };
  }

  function suspend() {
    for (const acc of Object.values(current)) {
      try {
        globalShortcut.unregister(acc);
      } catch {}
    }
  }

  function resume() {
    const map = { ...current };
    current = {};
    return apply(map);
  }

  return { apply, suspend, resume, get: () => ({ ...current }) };
}
