// electron-builder.config.js
export default {
  appId: 'com.damoguyansi.easytranslate',
  productName: 'EasyTranslate',
  directories: { output: 'dist' },
  files: [
    'electron/**/*',
    'dist/renderer/**/*',
    'resources/icon.icns',
    'resources/tray.png',
    'resources/tray@2x.png',
    'resources/entitlements.mac.plist',
    'package.json'
  ],
  mac: {
    category: 'public.app-category.utilities',
    icon: 'resources/icon.icns',
    target: [{ target: 'dmg', arch: ['universal'] }],
    entitlements: 'resources/entitlements.mac.plist',
    entitlementsInherit: 'resources/entitlements.mac.plist',
    hardenedRuntime: true,
    gatekeeperAssess: false
  },
  dmg: {
    title: 'EasyTranslate ${version}',
    contents: [
      { x: 130, y: 220, type: 'file' },
      { x: 410, y: 220, type: 'link', path: '/Applications' }
    ]
  }
};
