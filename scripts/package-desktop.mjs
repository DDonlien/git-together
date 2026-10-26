import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const windowsArch = process.env.GITTOGETHER_PACKAGE_ARCH;
const windows = process.platform === 'win32';
const args = windows
  ? ['--prefix', 'macos', 'run', 'package:windows', '--', windowsArch === 'ia32' ? 'x86' : windowsArch === 'x64' ? 'x64' : process.arch === 'ia32' ? 'x86' : 'x64']
  : ['--prefix', 'macos', 'run', 'tauri', '--', 'build'];
const result = spawnSync('npm', args, { cwd: root, env: process.env, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
