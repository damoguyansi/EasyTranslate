import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

export default defineManifest({
  manifest_version: 3,
  name: 'EasyTranslate 简单翻译 · 工具箱',
  version: pkg.version,
  description:
    '现代玻璃拟态多功能工具箱：自动语言检测、划词翻译、输入翻译、随机密码生成、Base64 编解码、JSON 格式化。',
  default_locale: 'zh_CN',
  permissions: ['activeTab', 'contextMenus', 'scripting', 'storage'],
  host_permissions: ['https://edge.microsoft.com/*'],
  action: {
    default_popup: 'src/popup/popup.html',
    default_icon: 'img/icon128.png'
  },
  icons: {
    16: 'img/icon16.png',
    32: 'img/icon32.png',
    48: 'img/icon48.png',
    128: 'img/icon128.png'
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/content.js']
    }
  ],
  background: {
    service_worker: 'src/background/background.js',
    type: 'module'
  }
});
