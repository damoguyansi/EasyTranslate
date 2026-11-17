// 渲染进程多页面构建
import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./src', import.meta.url));
const pages = ['popup', 'workspace', 'capture', 'pin'];

export default defineConfig({
  root,
  base: './',
  build: {
    outDir: resolve(root, '../dist/renderer'),
    emptyOutDir: true,
    target: 'chrome130',
    modulePreload: false,
    rollupOptions: {
      input: Object.fromEntries(pages.map((p) => [p, resolve(root, p, 'index.html')]))
    }
  },
  server: { port: 5173, strictPort: true }
});
