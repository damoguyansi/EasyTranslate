// electron/store.js
import Store from 'electron-store';

const store = new Store({
  name: 'easytranslate',
  defaults: { theme: 'auto', translateHistory: [] }
});
const HK = 'translateHistory', LIMIT = 30;

export async function getValue(key, fallback) {
  if (fallback === undefined) fallback = null;
  const v = store.get(key);
  return v !== undefined ? v : fallback;
}
export async function setValue(key, value) { store.set(key, value); }
export async function deleteValue(key) { store.delete(key); }
export async function getHistory() { return store.get(HK, []); }
export async function addHistory(entry) {
  const list = store.get(HK, []).filter(
    h => !(h.source === entry.source && h.from === entry.from && h.to === entry.to)
  );
  list.unshift(Object.assign({}, entry, { ts: Date.now() }));
  store.set(HK, list.slice(0, LIMIT));
}
export async function clearHistory() { store.set(HK, []); }
export async function getTheme() { return store.get('theme', 'auto'); }
export async function setTheme(t) { store.set('theme', t); }
