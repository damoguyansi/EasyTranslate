// 菜单栏弹窗入口：标签切换、全局键盘、与主进程事件对接
import { api } from '../ui/api.js';
import { $, $$, closeMenu } from '../ui/dom.js';
import { hydrateIcons } from '../ui/icons.js';
import { state, loadSettings, saveSettings } from './state.js';
import { initTranslate } from './translate.js';
import { initJson } from './json.js';
import { initCodec } from './codec.js';
import { initPassword } from './password.js';
import { initAuth } from './auth.js';
import { initSettings } from './settings.js';

const TABS = ['translate', 'password', 'auth', 'json', 'codec'];
const views = {};
let current = '';

function switchTab(tab, { focus = true } = {}) {
  if (!views[tab]) tab = 'translate';
  if (tab !== current) {
    $$('.view').forEach((v) => v.classList.toggle('on', v.id === `view-${tab}`));
    $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    moveIndicator(tab);
    $('#settingsBtn').classList.toggle('on', tab === 'settings');
    const prev = current;
    current = tab;
    views[prev]?.onHide?.();
    views[tab]?.onShow?.();
    if (TABS.includes(tab) && state.settings.lastTab !== tab) saveSettings({ lastTab: tab });
  }
  if (focus) views[tab]?.focus?.();
}

function moveIndicator(tab) {
  const btn = $(`#tabs button[data-tab="${tab}"]`);
  const ind = $('#tabInd');
  $('#tabs').classList.toggle('none', !btn);
  if (!btn) return;
  ind.style.width = btn.offsetWidth + 'px';
  ind.style.transform = `translateX(${btn.offsetLeft}px)`;
}

async function boot() {
  hydrateIcons();
  if (api.mock || api.platform !== 'darwin') document.body.classList.add('no-vibrancy');
  await loadSettings();

  views.translate = initTranslate();
  views.json = initJson();
  views.codec = initCodec();
  views.password = initPassword();
  views.auth = initAuth();
  views.settings = initSettings();

  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (b) switchTab(b.dataset.tab);
  });
  $('#settingsBtn').addEventListener('click', () => switchTab(current === 'settings' ? state.settings.lastTab : 'settings'));
  $('#captureBtn').addEventListener('click', () => api.invoke('capture:start', { mode: 'annotate' }));

  const pinBtn = $('#pinBtn');
  pinBtn.addEventListener('click', async () => {
    const on = await api.invoke('popup:set-pinned', !pinBtn.classList.contains('on'));
    pinBtn.classList.toggle('on', !!on);
    pinBtn.title = on ? '已固定：失焦不隐藏' : '固定窗口（失焦不隐藏）';
  });

  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === 'Escape' && !e.defaultPrevented) {
      if (document.querySelector('.dialog-mask, .menu')) return closeMenu();
      if (current === 'settings') return switchTab(state.settings.lastTab);
      api.send('popup:hide');
      return;
    }
    if (mod && /^[1-5]$/.test(e.key)) {
      e.preventDefault();
      switchTab(TABS[Number(e.key) - 1]);
    } else if (mod && e.key === ',') {
      e.preventDefault();
      switchTab('settings');
    } else if (mod && e.key.toLowerCase() === 'w') {
      e.preventDefault();
      api.send('popup:hide');
    }
  });

  api.on('popup:shown', (msg = {}) => {
    if (msg.tab) switchTab(msg.tab, { focus: false });
    views[current]?.onReveal?.(msg);
    if (!msg.text && !msg.qr) views[current]?.focus?.(true);
  });
  api.on('auth:qr', (text) => {
    switchTab('auth');
    views.auth.onReveal({ qr: text });
  });

  switchTab(state.settings.lastTab || 'translate');
  requestAnimationFrame(() => moveIndicator(current));
  window.addEventListener('resize', () => moveIndicator(current));
}

boot();
