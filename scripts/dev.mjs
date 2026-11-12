// Development: Vite dev server for the renderer, then Electron pointed at it.
import { createServer } from 'vite';
import { build as esbuild } from 'esbuild';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { mainOptions, preloadOptions } from './build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const server = await createServer({ configFile: path.join(root, 'vite.config.mts') });
await server.listen();
await esbuild(mainOptions);
await esbuild(preloadOptions);

const electronPath = require('electron');
const child = spawn(electronPath, ['.'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, BOOKBOOST_DEV_URL: 'http://localhost:5183' },
});
child.on('exit', async () => {
  await server.close();
  process.exit(0);
});
