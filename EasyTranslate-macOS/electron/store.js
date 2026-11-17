// 轻量 JSON 存储：内存读取 + 防抖原子写入（不阻塞交互）
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const DEFAULT_SETTINGS = {
  theme: 'system', // system | light | dark
  launchAtLogin: false,
  shortcuts: {
    toggle: 'CommandOrControl+Shift+T',
    selection: 'CommandOrControl+Shift+Y',
    capture: 'CommandOrControl+Shift+Z'
  },
  translate: {
    foreignTarget: 'en', // 中文输入时译为该语言
    autoCopy: false
  },
  password: null,
  lastTab: 'translate',
  captureSaveDir: ''
};

const HISTORY_LIMIT = 50;

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** 从 v2（electron-store）数据中导入翻译历史与已加密的验证码账号，格式相同可直接沿用 */
export function importLegacy(old) {
  if (!old || typeof old !== 'object') return null;
  const out = {};
  if (Array.isArray(old.translateHistory)) {
    out.history = old.translateHistory.filter((h) => h && h.source && h.target).slice(0, HISTORY_LIMIT);
  }
  if (old.authAccountsEncrypted?.data) out.vault = { version: 2, data: old.authAccountsEncrypted.data, updatedAt: Date.now() };
  if (old.theme === 'light' || old.theme === 'dark') out.settings = { theme: old.theme };
  return Object.keys(out).length ? out : null;
}

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

export function deepMerge(base, patch) {
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch === undefined ? base : patch;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) out[k] = isPlainObject(v) && isPlainObject(base[k]) ? deepMerge(base[k], v) : v;
  return out;
}

export class JsonStore {
  constructor(dir, { name = 'easytranslate-v3.json', legacy = 'easytranslate.json', delay = 250 } = {}) {
    this.dir = dir;
    this.file = join(dir, name);
    this.delay = delay;
    this.timer = null;
    let data = readJson(this.file);
    if (!data) {
      data = importLegacy(readJson(join(dir, legacy)));
      if (data) this.schedule();
    }
    data ||= {};
    this.data = {
      settings: deepMerge(DEFAULT_SETTINGS, data.settings || {}),
      history: Array.isArray(data.history) ? data.history : [],
      vault: data.vault || null,
      drafts: data.drafts || {}
    };
  }

  getSettings() {
    return this.data.settings;
  }

  updateSettings(patch) {
    this.data.settings = deepMerge(this.data.settings, patch || {});
    this.schedule();
    return this.data.settings;
  }

  getHistory() {
    return this.data.history;
  }

  addHistory(entry) {
    if (!entry || !entry.source || !entry.target) return this.data.history;
    const list = this.data.history.filter((h) => !(h.source === entry.source && h.to === entry.to));
    list.unshift({ source: entry.source, target: entry.target, from: entry.from, to: entry.to, ts: Date.now() });
    this.data.history = list.slice(0, HISTORY_LIMIT);
    this.schedule();
    return this.data.history;
  }

  removeHistory(ts) {
    this.data.history = this.data.history.filter((h) => h.ts !== ts);
    this.schedule();
    return this.data.history;
  }

  clearHistory() {
    this.data.history = [];
    this.schedule();
    return [];
  }

  getVault() {
    return this.data.vault;
  }

  setVault(vault) {
    this.data.vault = vault;
    this.flush();
  }

  getDraft(key) {
    return this.data.drafts[key] ?? '';
  }

  setDraft(key, value) {
    // 草稿过大时不持久化，避免频繁写盘
    if (typeof value === 'string' && value.length > 2_000_000) return;
    this.data.drafts[key] = value;
    this.schedule();
  }

  schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.delay);
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    try {
      mkdirSync(this.dir, { recursive: true });
      const tmp = this.file + '.tmp';
      writeFileSync(tmp, JSON.stringify(this.data));
      renameSync(tmp, this.file);
    } catch (e) {
      console.error('[store] write failed', e);
    }
  }
}
