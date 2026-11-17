// 预加载脚本（sandbox 模式，CommonJS）：只暴露白名单 IPC
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const INVOKE = [
  'settings:get',
  'settings:set',
  'translate:run',
  'dict:lookup',
  'history:list',
  'history:add',
  'history:remove',
  'history:clear',
  'vault:load',
  'vault:save',
  'clipboard:write',
  'clipboard:read',
  'capture:start',
  'workspace:open',
  'workspace:toggle-pin',
  'popup:set-pinned',
  'app:open-external',
  'app:permissions',
  'app:open-permission',
  'draft:get',
  'draft:set',
  'shortcuts:suspend',
  'shortcuts:resume'
];

const SEND = ['popup:hide', 'capture:ready', 'capture:finish', 'capture:cancel', 'pin:action', 'app:quit'];

const EVENTS = [
  'popup:shown',
  'workspace:open',
  'capture:open',
  'capture:windows',
  'capture:reset',
  'pin:image',
  'auth:qr',
  'settings:changed'
];

contextBridge.exposeInMainWorld('et', {
  platform: process.platform,
  invoke(channel, ...args) {
    if (!INVOKE.includes(channel)) return Promise.reject(new Error('blocked channel: ' + channel));
    return ipcRenderer.invoke(channel, ...args);
  },
  send(channel, ...args) {
    if (SEND.includes(channel)) ipcRenderer.send(channel, ...args);
  },
  on(channel, cb) {
    if (!EVENTS.includes(channel)) return () => {};
    const fn = (_e, data) => cb(data);
    ipcRenderer.on(channel, fn);
    return () => ipcRenderer.removeListener(channel, fn);
  }
});
