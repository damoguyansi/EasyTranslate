// electron/preload.cjs  -- CommonJS (avoids ESM preload issues in Electron 32)
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Storage
  storageGet:    function(key, fb) { return ipcRenderer.invoke('et:store-get', key, fb === undefined ? null : fb); },
  storageSet:    function(key, val) { return ipcRenderer.invoke('et:store-set', key, val); },
  storageDelete: function(key) { return ipcRenderer.invoke('et:store-delete', key); },
  // History
  getHistory:   function() { return ipcRenderer.invoke('et:get-history'); },
  addHistory:   function(entry) { return ipcRenderer.invoke('et:add-history', entry); },
  clearHistory: function() { return ipcRenderer.invoke('et:clear-history'); },
  // Theme
  getTheme:  function() { return ipcRenderer.invoke('et:get-theme'); },
  setTheme:  function(theme) { return ipcRenderer.invoke('et:set-theme', theme); },
  // Authenticator encrypted storage
  getAuthAccounts: function() { return ipcRenderer.invoke('et:get-auth-accounts'); },
  setAuthAccounts: function(accounts) { return ipcRenderer.invoke('et:set-auth-accounts', accounts); },
  // Window
  windowClose:    function() { ipcRenderer.send('et:window-close'); },
  windowMinimize: function() { ipcRenderer.send('et:window-minimize'); },
  // JSON window
  openToolsWindow: function(tab, draft) { return ipcRenderer.invoke('et:open-tools-window', tab, draft); },
  openJsonWindow: function(draft) { return ipcRenderer.invoke('et:open-json-window', draft); },
  // External URL
  openUrl: function(url) { return ipcRenderer.invoke('et:open-url', url); },
  // Login item
  setLoginItem: function(en) { return ipcRenderer.invoke('et:set-login-item', en); },
  getLoginItem: function() { return ipcRenderer.invoke('et:get-login-item'); },
  // JSON 窗口置顶
  toggleJsonPin: function() { return ipcRenderer.invoke('et:toggle-json-pin'); },
  getJsonPin:    function() { return ipcRenderer.invoke('et:get-json-pin'); },
  // 截图（从弹窗触发）
  startCapture:  function() { return ipcRenderer.invoke('et:start-capture'); },
  // 截图覆盖层 API
  onCaptureInit: function(cb) { ipcRenderer.on('et:capture-init', function(_, d) { cb(d); }); },
  onCaptureWindowsUpdate: function(cb) { ipcRenderer.on('et:capture-windows-update', function(_, d) { cb(d); }); },
  captureCancel: function() { ipcRenderer.send('et:capture-cancel'); },
  captureCopy:   function(dataURL) { ipcRenderer.send('et:capture-copy', dataURL); },
  captureSave:   function(dataURL) { return ipcRenderer.invoke('et:capture-save', dataURL); },
  capturePin:    function(payload) { ipcRenderer.send('et:capture-pin', payload); },
  // 钉图窗口 API
  onPinInit:     function(cb) { ipcRenderer.on('et:pin-init', function(_, d) { cb(d); }); },
  pinClose:      function() { ipcRenderer.send('et:pin-close'); },
  // Events (one-time bind; caller ensures single registration)
  onTranslateSelection: function(cb) { ipcRenderer.on('et:translate-selection',  function(_, text)  { cb(text); }); },
  onThemeChange:        function(cb) { ipcRenderer.on('et:system-theme-changed', function(_, theme) { cb(theme); }); },
  onLoadJsonDraft:      function(cb) { ipcRenderer.on('et:load-json-draft',      function()         { cb(); }); },
  onLoadToolsTab:       function(cb) { ipcRenderer.on('et:load-tools-tab',       function(_, data)  { cb(data); }); },
  // Platform
  platform: process.platform
});
