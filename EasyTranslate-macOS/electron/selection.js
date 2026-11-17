// 划词：模拟 ⌘C 读取当前选中文本，完成后恢复原剪贴板（全程异步，不阻塞主进程）
import { execFile } from 'node:child_process';

const COPY_SCRIPT = 'tell application "System Events" to keystroke "c" using command down';

function runOsa(script) {
  return new Promise((resolve) => {
    execFile('osascript', ['-e', script], { timeout: 1500 }, (err) => resolve(!err));
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {{ clip: { writeText, readText, snapshot, restore }, systemPreferences, platform?: string }} deps
 */
export function createSelectionReader({ clip, systemPreferences, platform = process.platform }) {
  function hasPermission(prompt = false) {
    if (platform !== 'darwin') return true;
    try {
      return systemPreferences.isTrustedAccessibilityClient(prompt);
    } catch {
      return false;
    }
  }

  async function read() {
    if (platform !== 'darwin') return { text: '', permission: true };
    if (!hasPermission(false)) {
      hasPermission(true); // 触发系统授权提示
      return { text: '', permission: false };
    }
    const saved = await clip.snapshot();
    const marker = `⁣et-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await clip.writeText(marker);

    await runOsa(COPY_SCRIPT);
    let text = '';
    for (let i = 0; i < 24; i++) {
      const now = await clip.readText();
      if (now !== marker) {
        text = now;
        break;
      }
      await wait(25);
    }
    await clip.restore(saved);
    return { text: (text || '').trim(), permission: true };
  }

  return { read, hasPermission };
}
