// src/storage-ipc.js
// Renderer-side adapter — replaces browser extension local storage
// API is identical to src/lib/storage.js so import path swap is sufficient
const api = window.electronAPI;
const HK = 'translateHistory', LIMIT = 30;

function readLocal(key, fallback) {
  try {
    const raw = window.localStorage?.getItem('et:' + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeLocal(key, value) {
  try {
    window.localStorage?.setItem('et:' + key, JSON.stringify(value));
  } catch {}
}

export async function getValue(key, fallback) {
  if (fallback === undefined) fallback = null;
  if (!api) return readLocal(key, fallback);
  return api.storageGet(key, fallback);
}
export async function setValue(key, value) {
  if (!api) return writeLocal(key, value);
  return api.storageSet(key, value);
}

export async function getHistory() { return (await getValue(HK, [])) || []; }
export async function addHistory(entry) {
  const list = await getHistory();
  const filtered = list.filter(
    h => !(h.source === entry.source && h.from === entry.from && h.to === entry.to)
  );
  filtered.unshift(Object.assign({}, entry, { ts: Date.now() }));
  await setValue(HK, filtered.slice(0, LIMIT));
}
export async function clearHistory() { await setValue(HK, []); }

export async function getTheme() { return (await getValue('theme', 'auto')) || 'auto'; }
export async function setTheme(t) { await setValue('theme', t); }
