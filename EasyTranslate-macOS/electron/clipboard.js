// 剪贴板封装（Electron 45+ 的异步 W3C 风格 clipboard API）
import { clipboard, ClipboardItem } from 'electron';

export function writeText(text) {
  return clipboard.writeText(String(text ?? ''));
}

export function readText() {
  return clipboard.readText();
}

export async function writePng(buf) {
  await clipboard.write([new ClipboardItem({ 'image/png': new Blob([buf], { type: 'image/png' }) })]);
}

/** 读取剪贴板中的图片，返回 { type, data: Uint8Array } 或 null */
export async function readImage() {
  for (const item of await clipboard.read()) {
    const type = item.types.find((t) => t === 'image/png') || item.types.find((t) => t.startsWith('image/'));
    if (!type) continue;
    try {
      const blob = await item.getType(type);
      return { type, data: new Uint8Array(await blob.arrayBuffer()) };
    } catch {}
  }
  return null;
}

/** 完整保存当前剪贴板（所有条目与类型），用于划词后恢复 */
export async function snapshot() {
  try {
    const items = await clipboard.read();
    return await Promise.all(
      items.map(async (item) => {
        const data = {};
        for (const t of item.types) {
          try {
            data[t] = await item.getType(t);
          } catch {}
        }
        return data;
      })
    );
  } catch {
    return [];
  }
}

export async function restore(snap) {
  const items = (snap || []).filter((d) => Object.keys(d).length);
  try {
    if (items.length) await clipboard.write(items.map((d) => new ClipboardItem(d)));
    else clipboard.clear();
  } catch {
    // 某些私有格式无法回写时，至少恢复纯文本
    const text = items.map((d) => d['text/plain']).find(Boolean);
    if (text) await clipboard.writeText(typeof text === 'string' ? text : await text.text());
  }
}
