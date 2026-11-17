// 渲染进程 API：Electron 中使用 preload 暴露的 window.et；
// 在普通浏览器中（vite 预览界面）退化为内存模拟，便于调试 UI。
function createMock() {
  const listeners = {};
  const mem = {
    settings: {
      theme: 'system',
      launchAtLogin: false,
      shortcuts: {
        toggle: 'CommandOrControl+Shift+T',
        selection: 'CommandOrControl+Shift+Y',
        capture: 'CommandOrControl+Shift+Z'
      },
      translate: { foreignTarget: 'en', autoCopy: false },
      password: null,
      lastTab: 'translate'
    },
    history: [],
    vault: [],
    drafts: {}
  };
  // 浏览器预览：?demo 时填充示例数据
  if (location.search.includes('demo')) {
    const now = Date.now();
    mem.history = [
      { source: 'The quick brown fox jumps over the lazy dog', target: '敏捷的棕色狐狸跳过了懒狗', from: 'en', to: 'zh-Hans', ts: now - 40e3 },
      { source: '今天天气很好', target: 'The weather is nice today', from: 'zh-Hans', to: 'en', ts: now - 3.6e6 * 3 },
      { source: 'ありがとうございます', target: '非常感谢', from: 'ja', to: 'zh-Hans', ts: now - 864e5 * 2 }
    ];
    const acc = (issuer, account, secret, remark) => ({ id: issuer + account, issuer, account, secret, algorithm: 'SHA1', digits: 6, period: 30, remark });
    mem.vault = [
      acc('GitHub', 'dev@example.com', 'JBSWY3DPEHPK3PXP', '工作'),
      acc('Google', 'me@gmail.com', 'GEZDGNBVGY3TQOJQ'),
      acc('阿里云', 'admin', 'MFRGGZDFMZTWQ2LK')
    ];
  }
  const handlers = {
    'settings:get': () => ({ settings: mem.settings, platform: 'darwin', version: 'dev', loginItem: false }),
    'settings:set': (p) => {
      mem.settings = { ...mem.settings, ...p };
      return { settings: mem.settings, failed: [] };
    },
    'translate:run': async ({ text, to }) => {
      await new Promise((r) => setTimeout(r, 250));
      return { text: `[${to}] ${text}`, detected: /[一-鿿]/.test(text) ? 'zh-Hans' : 'en' };
    },
    'dict:lookup': (text) =>
      /^[a-z]+$/i.test(String(text).trim())
        ? {
            word: text.trim(),
            phonetics: [{ label: '英', text: 'sɪɡˈnɪfɪkənt', audio: 'https://dict.youdao.com/dictvoice?audio=significant&type=1' }, { label: '美', text: 'sɪɡˈnɪfɪkənt', audio: 'https://dict.youdao.com/dictvoice?audio=significant&type=2' }],
            defs: [{ pos: 'adj.', text: '显著的，相当数量的；重要的，意义重大的；别有含义的' }, { pos: 'n.', text: '<古>象征，有意义的事物' }],
            forms: [{ name: '比较级', value: 'more significant' }, { name: '最高级', value: 'most significant' }],
            exams: ['CET4', 'CET6', '考研', 'IELTS', 'TOEFL'],
            synonyms: [{ pos: 'adj.', words: ['important', 'remarkable', 'effective', 'valid'], tran: '' }],
            phrases: [{ text: 'significant difference', tran: '显著性差异' }, { text: 'significant other', tran: '重要他人' }],
            examples: [{ src: 'Your work has shown a significant improvement.', tran: '你的工作有了显著改进。' }]
          }
        : null,
    'history:list': () => mem.history,
    'history:add': (e) => (mem.history = [{ ...e, ts: Date.now() }, ...mem.history].slice(0, 50)),
    'history:remove': (ts) => (mem.history = mem.history.filter((h) => h.ts !== ts)),
    'history:clear': () => (mem.history = []),
    'vault:load': () => mem.vault,
    'vault:save': (a) => (mem.vault = a),
    'clipboard:write': (t) => navigator.clipboard?.writeText(t),
    'clipboard:read': async () => ({ text: (await navigator.clipboard?.readText?.().catch(() => '')) || '', image: null }),
    'app:permissions': () => ({ screen: 'granted', accessibility: false }),
    'draft:get': (k) => mem.drafts[k] || '',
    'draft:set': (k, v) => (mem.drafts[k] = v)
  };
  return {
    platform: 'darwin',
    mock: true,
    async invoke(ch, ...args) {
      const h = handlers[ch];
      return h ? h(...args) : undefined;
    },
    send() {},
    on(ch, cb) {
      (listeners[ch] ||= []).push(cb);
      return () => {};
    },
    emit(ch, data) {
      (listeners[ch] || []).forEach((cb) => cb(data));
    }
  };
}

export const api = window.et || createMock();
if (!window.et) window.__etMock = api;
