<p align="center">
  <img src="assets/logo/logo-1024.png" width="120" height="120" alt="EasyTranslate logo" />
</p>

<h1 align="center">EasyTranslate</h1>

<p align="center">
  一款翻译 · 密码 · Base64 · JSON 工具箱，提供浏览器扩展与 macOS 菜单栏两种形态<br/>
  A translate · password · Base64 · JSON toolbox, available as a browser extension and a macOS menu-bar app
</p>

<p align="center">
  <a href="#中文">中文</a> ·
  <a href="#english">English</a>
</p>

---

## 中文

### 这是什么

EasyTranslate 是一个轻量、美观的多功能工具箱，核心功能是**自动中英互译**，并附带日常开发/办公中常用的小工具：密码生成器、Base64 编解码、JSON 格式化。同一套设计与逻辑代码，分别提供两种使用形态：

| 子项目 | 形态 | 适用场景 |
| --- | --- | --- |
| [`EasyTranslate-chrome/`](EasyTranslate-chrome) | 浏览器扩展（Chrome / Edge，Manifest V3） | 网页划词翻译、右键菜单翻译 |
| [`EasyTranslate-macOS/`](EasyTranslate-macOS) | macOS 菜单栏应用（Electron） | 全局快捷键、截图标注、置顶小窗，不依赖浏览器 |

两者的图标、品牌色（紫→粉渐变）、四个工具 Tab（翻译 / 密码 / Base64 / JSON）与交互细节保持一致，详细使用说明见各子项目的 README。

### 快速开始

```bash
# 浏览器扩展
cd EasyTranslate-chrome && npm install && npm run build   # 产物在 dist/，加载到 chrome://extensions

# macOS 应用
cd EasyTranslate-macOS && npm install && npm run dev       # 开发模式
cd EasyTranslate-macOS && npm run dist                      # 打包出 dmg 安装包
```

### Logo / 品牌素材

统一品牌标志位于 [`assets/logo/`](assets/logo)：`logo.svg`（矢量源文件）与 `logo-1024.png`（1024×1024 母版）。两个子项目的所有图标（浏览器扩展 16/32/48/128px icon、macOS 应用 `.icns`、DMG 安装包图标）均由该母版统一派生，菜单栏图标除外——菜单栏图标遵循 macOS 系统规范，使用单色模板图标（见 `EasyTranslate-macOS/resources/tray.png`）。

### 下载安装包

正式安装包发布在 [GitHub Releases](https://github.com/damoguyansi/EasyTranslate/releases)：

- **macOS**：`EasyTranslate-x.x.x-universal.dmg`（支持 Intel / Apple Silicon）
- **Chrome 插件**：`EasyTranslate-chrome-vx.x.x.zip`（解压后通过开发者模式加载）

### 协议

MIT License，详见 [`EasyTranslate-chrome/LICENSE`](EasyTranslate-chrome/LICENSE)。

---

## English

### What is this

EasyTranslate is a lightweight, good-looking utility toolbox built around **automatic Chinese ⇄ English translation**, plus a few tools developers and everyday users reach for often: a password generator, Base64 encode/decode, and a JSON formatter. The same design system and core logic ship in two forms:

| Sub-project | Form factor | Best for |
| --- | --- | --- |
| [`EasyTranslate-chrome/`](EasyTranslate-chrome) | Browser extension (Chrome / Edge, Manifest V3) | Selection-translate on web pages, right-click context menu |
| [`EasyTranslate-macOS/`](EasyTranslate-macOS) | macOS menu-bar app (Electron) | Global keyboard shortcuts, screenshot annotation, always-on-top windows — no browser needed |

Both share the same icon, brand gradient (indigo → violet → pink), the four tool tabs (Translate / Password / Base64 / JSON), and interaction details. See each sub-project's README for full usage instructions.

### Quick start

```bash
# Browser extension
cd EasyTranslate-chrome && npm install && npm run build   # output in dist/, load via chrome://extensions

# macOS app
cd EasyTranslate-macOS && npm install && npm run dev       # dev mode
cd EasyTranslate-macOS && npm run dist                      # build the .dmg installer
```

### Logo / brand assets

The unified brand mark lives in [`assets/logo/`](assets/logo): `logo.svg` (vector source) and `logo-1024.png` (1024×1024 master). Every icon in both sub-projects — the browser extension's 16/32/48/128px icons, the macOS app's `.icns`, and the DMG installer icon — is derived from this single master. The exception is the macOS menu-bar tray icon, which follows Apple's HIG and uses a monochrome template image instead (see `EasyTranslate-macOS/resources/tray.png`).

### Download installers

Official installers are published on [GitHub Releases](https://github.com/damoguyansi/EasyTranslate/releases):

- **macOS**: `EasyTranslate-x.x.x-universal.dmg` (Intel & Apple Silicon)
- **Chrome extension**: `EasyTranslate-chrome-vx.x.x.zip` (unzip and load via developer mode)

### License

MIT License — see [`EasyTranslate-chrome/LICENSE`](EasyTranslate-chrome/LICENSE).
