# Repository Guidelines

## Project Structure & Module Organization

EasyTranslate has two deliverables:

- `EasyTranslate-chrome/`: Chrome/Edge Manifest V3 extension built with Vite and `@crxjs/vite-plugin`.
- `EasyTranslate-macOS/`: Electron menu-bar app using Vite and `electron-builder`.
- `assets/logo/`: shared brand source assets used by both targets.

In both app folders, source files live under `src/`. Browser-extension helpers are in `EasyTranslate-chrome/src/lib/`; Electron main-process code is in `EasyTranslate-macOS/electron/`; packaging resources are in `EasyTranslate-macOS/resources/`; tests are in `EasyTranslate-macOS/scripts/`. Treat `dist/`, `node_modules/`, local `docs/`, and release archives such as `EasyTranslate-chrome-v*.zip` as generated artifacts unless a release task requires them.

## Build, Test, and Development Commands

Run commands from the relevant subproject directory:

```bash
cd EasyTranslate-chrome && npm install
npm run dev       # start Vite for extension development
npm run build     # build extension output into dist/
npm run preview   # preview built UI

cd EasyTranslate-macOS && npm install
npm run dev       # start Vite, then Electron against localhost:5173
npm run build     # build renderer assets
npm run dist      # package a universal macOS app/dmg
npm test          # run Node test suite in scripts/
```

## Coding Style & Naming Conventions

Use modern JavaScript ES modules. Follow the existing style: 2-space indentation, semicolons, single quotes, `const`/`let`, and small focused functions. File and directory names are lowercase kebab-case where practical, for example `json-page/` and `storage-ipc.js`. Keep UI files grouped by feature with matching `.html`, `.css`, and `.js` names.

## Testing Guidelines

The macOS package uses Node’s built-in `node:test` with `node:assert/strict`. Add tests as `scripts/test-*.mjs` for scaffold, IPC, preload, resource, and build checks. Run `npm test` in `EasyTranslate-macOS/` before changing Electron behavior, shortcuts, IPC channels, resources, or packaging. The Chrome package has no dedicated test command; verify with `npm run build` and manual extension loading via `chrome://extensions`.

## Commit & Pull Request Guidelines

Recent commits use concise Chinese, imperative summaries, often release messages like `发布 v2.0.1：...` or fixes like `修复 ... 的问题`. Keep commits scoped to one concern and mention the target when useful, for example `修复 macOS 截图窗口超时问题`.

Pull requests should include a short description, affected target (`chrome`, `macOS`, or shared assets), test/build commands run, and screenshots for visible UI changes. Link related issues or release tasks when applicable.

## Security & Configuration Tips

Do not commit signing credentials, notarization secrets, or local permission/debug files. For macOS packaging changes, keep entitlements in `EasyTranslate-macOS/resources/` explicit and minimal. For extension changes, avoid broadening Manifest V3 permissions unless the feature requires it.
