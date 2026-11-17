// 开发模式：启动 Vite，再以 VITE_DEV_URL 启动 Electron（跨平台，无需额外依赖）
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)) });
await server.listen();
const url = server.resolvedUrls.local[0];
console.log('[dev] vite ready at', url);

const child = spawn(require('electron'), ['.'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_URL: url.replace(/\/$/, '') }
});
child.on('exit', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
