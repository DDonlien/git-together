import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = await mkdtemp(join(tmpdir(), 'gittogether-oauth-'));
try {
  const entry = join(directory, 'helper.cjs');
  await build({ entryPoints: [fileURLToPath(new URL('../electron/github-oauth-dev.ts', import.meta.url))], bundle: true,
    platform: 'node', format: 'cjs', outfile: entry, external: ['electron'] });
  const require = createRequire(import.meta.url);
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  const child = spawn((require('electron') as string).trim(), [entry], { stdio: 'inherit', env: environment });
  const interrupt = () => child.kill('SIGINT'); const terminate = () => child.kill('SIGTERM');
  process.on('SIGINT', interrupt); process.on('SIGTERM', terminate);
  try {
    process.exitCode = await new Promise<number>((resolve, reject) => {
      child.once('error', reject); child.once('exit', code => resolve(code ?? 1));
    });
  } finally { process.off('SIGINT', interrupt); process.off('SIGTERM', terminate); }
} catch {
  process.stderr.write('无法启动本机网页授权服务，请检查 Electron 运行环境。\n'); process.exitCode = 1;
} finally { await rm(directory, { recursive: true, force: true }); }
