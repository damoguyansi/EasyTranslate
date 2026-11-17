// 弹窗共享状态：设置的读取与保存
import { api } from '../ui/api.js';

export const state = {
  settings: {},
  platform: 'darwin',
  version: '',
  loginItem: false
};

export async function loadSettings() {
  const res = await api.invoke('settings:get');
  Object.assign(state, res);
  api.on('settings:changed', (s) => (state.settings = s));
  return state.settings;
}

export async function saveSettings(patch) {
  const res = await api.invoke('settings:set', patch);
  if (res?.settings) state.settings = res.settings;
  return res;
}
