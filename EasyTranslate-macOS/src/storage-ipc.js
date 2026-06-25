// src/storage-ipc.js
// Renderer-side adapter — replaces browser extension local storage
// API is identical to src/lib/storage.js so import path swap is sufficient
const api = window.electronAPI;
const HK = 'translateHistory', LIMIT = 30;

export async function getValue(key, fallback) {
  if (fallback === undefined) fallback = null;
  return api.storageGet(key, fallback);
}
export async function setValue(key, value) { return api.storageSet(key, value); }

export async function getHistory() { return (await api.storageGet(HK, [])) || []; }
export async function addHistory(entry) {
  const list = await getHistory();
  const filtered = list.filter(
    h => !(h.source === entry.source && h.from === entry.from && h.to === entry.to)
  );
  filtered.unshift(Object.assign({}, entry, { ts: Date.now() }));
  await api.storageSet(HK, filtered.slice(0, LIMIT));
}
export async function clearHistory() { await api.storageSet(HK, []); }

export async function getTheme() { return (await api.storageGet('theme', 'auto')) || 'auto'; }
export async function setTheme(t) { await api.storageSet('theme', t); }
