// vite.config.js
import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: 'src',
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup:   resolve(__dirname, 'src/popup/popup.html'),
        json:    resolve(__dirname, 'src/json-page/json.html'),
        capture: resolve(__dirname, 'src/capture/capture.html'),
        pin:     resolve(__dirname, 'src/capture/pin.html')
      }
    }
  },
  server: {
    port: 5173,
    strictPort: true   // 5173 사용 중이면 에러로 알림, 자동 변경 금지
  }
});
