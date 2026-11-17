// 设置视图：开机启动、外观、翻译偏好、快捷键录制、权限状态
import { api } from '../ui/api.js';
import { $, $$, toast } from '../ui/dom.js';
import { LANGUAGES } from '../core/language.js';
import { state, saveSettings } from './state.js';
import { eventToAccelerator, formatAccelerator } from './accelerator.js';

const REPO = 'https://github.com/damoguyansi/EasyTranslate';

export function initSettings() {
  const s = () => state.settings;
  let recording = null;

  /* 通用 */
  const login = $('#setLogin');
  login.addEventListener('change', () => saveSettings({ launchAtLogin: login.checked }));
  $('#setTheme').addEventListener('click', (e) => {
    const v = e.target.dataset.v;
    if (!v) return;
    saveSettings({ theme: v }).then(sync);
  });

  /* 翻译 */
  const foreign = $('#setForeign');
  foreign.innerHTML = LANGUAGES.filter((l) => !l.code.startsWith('zh'))
    .map((l) => `<option value="${l.code}">${l.name}</option>`)
    .join('');
  foreign.addEventListener('change', () => saveSettings({ translate: { foreignTarget: foreign.value } }));
  const autoCopy = $('#setAutoCopy');
  autoCopy.addEventListener('change', () => saveSettings({ translate: { autoCopy: autoCopy.checked } }));

  /* 快捷键 */
  function renderShortcuts(failed = []) {
    $$('.shortcut').forEach((b) => {
      if (b === recording) return;
      const acc = s().shortcuts?.[b.dataset.action];
      b.textContent = acc ? formatAccelerator(acc) : '未设置';
      b.classList.toggle('conflict', failed.includes(b.dataset.action));
      b.title = failed.includes(b.dataset.action) ? '该快捷键已被其它应用占用' : '点击修改';
    });
  }

  function stopRecording() {
    if (!recording) return;
    recording.classList.remove('recording');
    recording = null;
    api.invoke('shortcuts:resume');
    renderShortcuts();
  }

  $('#shortcutGroup').addEventListener('click', (e) => {
    const b = e.target.closest('.shortcut');
    if (!b) return;
    if (recording === b) return stopRecording();
    stopRecording();
    recording = b;
    b.classList.add('recording');
    b.textContent = '请按下快捷键…';
    api.invoke('shortcuts:suspend');
  });

  document.addEventListener(
    'keydown',
    async (e) => {
      if (!recording) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') return stopRecording();
      const action = recording.dataset.action;
      if (e.key === 'Backspace' || e.key === 'Delete') {
        const btn = recording;
        recording = null;
        btn.classList.remove('recording');
        const res = await saveSettings({ shortcuts: { [action]: '' } });
        renderShortcuts(res?.failed);
        return;
      }
      const acc = eventToAccelerator(e);
      if (!acc) return; // 只按了修饰键
      const dup = Object.entries(s().shortcuts || {}).find(([k, v]) => k !== action && v === acc);
      if (dup) {
        toast('该快捷键已用于其它功能', 'error');
        return;
      }
      const btn = recording;
      recording = null;
      btn.classList.remove('recording');
      const res = await saveSettings({ shortcuts: { [action]: acc } });
      renderShortcuts(res?.failed || []);
      if (res?.failed?.includes(action)) toast('快捷键注册失败，可能已被占用', 'error');
      else toast('快捷键已更新');
    },
    true
  );

  /* 权限 */
  async function refreshPerms() {
    const p = await api.invoke('app:permissions');
    if (!p) return;
    const render = (el, ok, kind) => {
      el.innerHTML = ok
        ? '<span class="dot ok"></span><span class="muted">已授权</span>'
        : `<span class="dot no"></span><button class="btn sm" data-perm="${kind}">去授权</button>`;
    };
    render($('#permScreen'), p.screen === 'granted', 'screen');
    render($('#permAx'), !!p.accessibility, 'accessibility');
  }
  $('#view-settings').addEventListener('click', (e) => {
    const b = e.target.closest('[data-perm]');
    if (b) api.invoke('app:open-permission', b.dataset.perm);
  });

  /* 关于 */
  $('#openRepo').addEventListener('click', () => api.invoke('app:open-external', REPO));
  $('#quitApp').addEventListener('click', () => api.send('app:quit'));

  function sync() {
    login.checked = !!(s().launchAtLogin || state.loginItem);
    $$('#setTheme button').forEach((b) => b.classList.toggle('on', b.dataset.v === (s().theme || 'system')));
    foreign.value = s().translate?.foreignTarget || 'en';
    autoCopy.checked = !!s().translate?.autoCopy;
    $('#appVersion').textContent = state.version ? `v${state.version}` : '';
    renderShortcuts();
  }

  sync();
  return {
    onShow() {
      sync();
      refreshPerms();
    },
    onHide: stopRecording,
    focus() {}
  };
}
