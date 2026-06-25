# EasyTranslate 2.0 · 浏览器翻译工具箱

> 现代玻璃拟态（Glassmorphism）UI · 自动语言检测 · 划词翻译 · 输入翻译 · 密码生成 · Base64 · JSON 格式化

EasyTranslate 是一款轻量、美观的浏览器扩展（Chrome / Edge / Firefox，Manifest V3）。2.0 版本对 UI 与代码结构进行了**全面重构**：玻璃拟态视觉、深浅色主题切换、翻译历史、统一的 Toast 反馈，并引入 **Vite + @crxjs/vite-plugin** 模块化构建。

## ✨ 功能

| 功能 | 说明 |
| --- | --- |
| 🌐 翻译 | 自动检测中/英文，输入即时翻译；支持划词图标、右键菜单翻译；保留最近 30 条历史记录，点击可回填 |
| 🔐 密码生成器 | 加密安全随机数生成，可选数字/大小写/符号、长度 8–64、排除字符，实时强度评估 |
| 🔁 Base64 | 支持 Unicode 的编码 / 解码，格式校验 |
| `{ }` JSON | 格式化 / 压缩 / 校验，友好错误定位，独立全屏页面，字符·行数·大小统计 |

界面支持 **深色 / 浅色主题切换**（记忆偏好），首次根据系统配色自动适配。

## 🧱 项目结构

```
src/
  popup/        弹窗页面（HTML + CSS + 控制器）
  json-page/    独立 JSON 格式化全屏页
  content/      划词翻译内容脚本与样式
  background/   Service Worker（右键菜单）
  lib/          纯逻辑模块：translate / language / password / base64 / json / storage / ui
  styles/       玻璃拟态设计系统（设计令牌 + 组件）
manifest.config.js   由 @crxjs 生成 manifest
vite.config.js       构建配置
```

## 🚀 开发与构建

```bash
npm install      # 安装依赖
npm run dev      # 开发模式（HMR）
npm run build    # 生产构建，输出到 dist/
```

## 📦 安装到浏览器

1. 运行 `npm run build` 生成 `dist/`（仓库已附带一份构建产物）。
2. 打开 `chrome://extensions`，开启「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择本项目的 **`dist/`** 目录。

## 🔧 技术栈

原生 JavaScript（ES Modules）· Vite 5 · @crxjs/vite-plugin 2 · Chrome Manifest V3 · 微软 Edge 翻译接口。

## 🤝 贡献

欢迎提交 Issue / PR：<https://github.com/damoguyansi/EasyTranslate>
