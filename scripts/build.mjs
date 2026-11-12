// Production build: renderer with Vite, main and preload with esbuild.
import { build as viteBuild } from 'vite';
import { build as esbuild } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const mainOptions = {
  entryPoints: [path.join(root, 'src/main/index.ts')],
  outfile: path.join(root, 'dist/main/index.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron', 'sql.js'],
  alias: { '@shared': path.join(root, 'src/shared') },
  sourcemap: false,
  logLevel: 'info',
};

export const preloadOptions = {
  entryPoints: [path.join(root, 'src/preload/index.ts')],
  outfile: path.join(root, 'dist/preload/index.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  alias: { '@shared': path.join(root, 'src/shared') },
  logLevel: 'info',
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await viteBuild({ configFile: path.join(root, 'vite.config.mts') });
  await esbuild(mainOptions);
  await esbuild(preloadOptions);
  console.log('Build complete.');
}
