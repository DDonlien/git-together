import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { loadEnv } from 'vite';

const require = createRequire(import.meta.url);
const electronPath = (require('electron') as string).trim();
const previewURL = process.env.GITTOGETHER_PREVIEW_URL || 'http://127.0.0.1:4173/';
try { await fetch(previewURL); }
catch { throw new Error(`请先启动本地预览服务：${previewURL}`); }
await build({
  entryPoints: ['electron/main.ts', 'electron/preload.ts'], bundle: true,
  platform: 'node', format: 'cjs', outdir: 'dist-electron', outExtension: { '.js': '.cjs' },
  external: ['electron', 'electron-liquid-glass'], sourcemap: true,
});
const environment: NodeJS.ProcessEnv = { ...loadEnv('development', process.cwd(), 'GITTOGETHER_'), ...process.env, GITTOGETHER_PREVIEW_URL: previewURL };
delete environment.ELECTRON_RUN_AS_NODE;
const child = spawn(electronPath, ['.'], { stdio: 'inherit', env: environment });
child.on('exit', code => { process.exitCode = code || 0; });
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
