import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config.js';

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        json: 'src/json-page/json.html'
      }
    }
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: { port: 5173 }
  }
});
