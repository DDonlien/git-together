import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const mode = process.argv[2] || 'dev';

const commands = {
  setup: [['ci', '--prefix', 'macos']],
  dev: [['--prefix', 'macos', 'run', 'dev']],
  desktop: [['--prefix', 'macos', 'run', 'desktop']],
  tauri: [['--prefix', 'macos', 'run', 'tauri', '--', ...process.argv.slice(3)]],
  check: [['--prefix', 'macos', 'run', 'check'], ['--prefix', 'macos', 'run', 'check:rust']],
  'check:rust': [['--prefix', 'macos', 'run', 'check:rust']],
  test: [['--prefix', 'macos', 'test']],
  build: [['--prefix', 'macos', 'run', 'build']],
  package: [['--prefix', 'macos', 'run', 'tauri', '--', 'build']],
  'release-build': [['--prefix', 'macos', 'run', 'tauri', '--', 'build']],
};

const steps = commands[mode];
if (!steps) throw new Error(`Unknown Tauri command: ${mode}`);

for (const args of steps) {
  const result = process.env.npm_execpath
    ? spawnSync(process.execPath, [process.env.npm_execpath, ...args], { cwd: root, stdio: 'inherit' })
    : spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
