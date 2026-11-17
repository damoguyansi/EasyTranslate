// electron-builder 打包配置（universal dmg）
export default {
  appId: 'com.damoguyansi.easytranslate',
  productName: 'EasyTranslate',
  directories: { output: 'dist', buildResources: 'resources' },
  files: [
    'electron/**/*',
    'dist/renderer/**/*',
    'resources/tray.png',
    'resources/tray@2x.png',
    'package.json'
  ],
  asar: true,
  compression: 'normal',
  electronLanguages: ['zh_CN', 'en'],
  mac: {
    category: 'public.app-category.utilities',
    icon: 'resources/icon.icns',
    target: [{ target: 'dmg', arch: ['universal'] }],
    entitlements: 'resources/entitlements.mac.plist',
    entitlementsInherit: 'resources/entitlements.mac.plist',
    hardenedRuntime: true,
    gatekeeperAssess: false,
    identity: null,
    extendInfo: {
      LSUIElement: true,
      NSAppleEventsUsageDescription: 'EasyTranslate 需要发送 ⌘C 以读取你选中的文字进行划词翻译。',
      NSScreenCaptureUsageDescription: 'EasyTranslate 需要屏幕录制权限来截图。'
    }
  },
  afterSign: 'build/after-sign.cjs',
  dmg: {
    title: 'EasyTranslate ${version}',
    contents: [
      { x: 130, y: 220, type: 'file' },
      { x: 410, y: 220, type: 'link', path: '/Applications' }
    ]
  }
};
