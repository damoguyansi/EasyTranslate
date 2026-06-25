/**
 * 基于 chrome.storage.local 的轻封装，带内存降级（用于独立页面调试）。
 */
const memory = {};
const hasChrome = typeof chrome !== 'undefined' && chrome.storage?.local;

export async function getValue(key, fallback = null) {
  if (!hasChrome) return key in memory ? memory[key] : fallback;
  const res = await chrome.storage.local.get(key);
  return key in res ? res[key] : fallback;
}

export async function setValue(key, value) {
  if (!hasChrome) {
    memory[key] = value;
    return;
  }
  await chrome.storage.local.set({ [key]: value });
}

const HISTORY_KEY = 'translateHistory';
const HISTORY_LIMIT = 30;

export async function getHistory() {
  return (await getValue(HISTORY_KEY, [])) || [];
}

export async function addHistory(entry) {
  const list = await getHistory();
  // 去重：相同原文+方向的记录提到最前
  const filtered = list.filter(
    (h) => !(h.source === entry.source && h.from === entry.from && h.to === entry.to)
  );
  filtered.unshift({ ...entry, ts: Date.now() });
  await setValue(HISTORY_KEY, filtered.slice(0, HISTORY_LIMIT));
}

export async function clearHistory() {
  await setValue(HISTORY_KEY, []);
}

const THEME_KEY = 'theme';

export async function getTheme() {
  return (await getValue(THEME_KEY, 'auto')) || 'auto';
}

export async function setTheme(theme) {
  await setValue(THEME_KEY, theme);
}
