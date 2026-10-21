import { sourceState } from './source-state.mjs';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync, unlinkSync } from 'node:fs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const desktop = join(root, 'desktop');
const ui = join(root, 'macos');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const sha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
if (sha.status !== 0) throw new Error('Cannot determine the source commit.');
const runtimeBin = join(desktop, '.runtime-bin'); mkdirSync(runtimeBin, { recursive: true });
if (process.platform === 'win32') writeFileSync(join(runtimeBin, 'yarn.cmd'), `@"${process.execPath}" "${join(desktop, 'vendor/yarn-1.21.1.js')}" %*\r\n`);
else {
  if (existsSync(join(runtimeBin, 'yarn'))) unlinkSync(join(runtimeBin, 'yarn'));
  writeFileSync(join(runtimeBin, 'yarn'), `#!/usr/bin/env node\nrequire(${JSON.stringify(join(desktop, 'vendor/yarn-1.21.1.js'))});\n`);
  chmodSync(join(runtimeBin, 'yarn'), 0o755);
}
const env = { ...process.env, PATH: [runtimeBin, dirname(process.execPath), join(desktop, 'node_modules/.bin'), process.env.PATH].join(process.platform === 'win32' ? ';' : ':'), DUGITE_CACHE_DIR: join(desktop, '.runtime-cache'), CIRCLE_SHA1: sha.stdout.trim(), RELEASE_CHANNEL: 'development', GITTOGETHER_VERSION: version };
const node = process.execPath;
const yarn = join(desktop, 'vendor/yarn-1.21.1.js');
function run(command, args, cwd = root, extra = {}) {
  const result = spawnSync(command, args, { cwd, env: { ...env, ...extra }, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
function yarnRun(args, cwd = desktop, extra = {}) { run(node, [yarn, ...args], cwd, extra); }
function verify() { run(node, ['scripts/verify-upstream.mjs']); }
function copyUI() {
  const out = join(desktop, 'out'); mkdirSync(out, { recursive: true });
  cpSync(join(ui, 'dist/client'), join(out, 'gittogether'), { recursive: true });
  const name = process.platform === 'win32' ? 'gittogether-presence.exe' : 'gittogether-presence';
  cpSync(join(desktop, 'gittogether-presence/target/debug', name), join(out, name));
  if (process.platform !== 'win32') chmodSync(join(out, name), 0o755);
}
const mode = process.argv[2] || 'dev';
if (mode === 'setup') {
  yarnRun(['install', '--frozen-lockfile', '--ignore-scripts', '--non-interactive']);
  yarnRun(['install', '--frozen-lockfile', '--ignore-scripts', '--non-interactive'], join(desktop, 'app'));
  run(node, ['scripts/download-runtime.mjs']);
  // Match upstream post-install: the earlier ignore-scripts pass otherwise
  // leaves local native dependencies and notification declarations unbuilt.
  yarnRun(['install', '--frozen-lockfile', '--non-interactive', '--force'], join(desktop, 'app'));
  // The upstream root postinstall also initializes git submodules. Their exact
  // pinned sources are already vendored here; run only its dependency builds.
  for (const name of ['printenvz', 'process-proxy']) {
    const path = join(desktop, 'node_modules', name);
    const scripts = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8')).scripts || {};
    if (scripts.install) yarnRun(['run', 'install'], path);
  }
  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], ui);
  verify();
} else if (mode === 'check') {
  verify();
  run(node, ['node_modules/typescript/bin/tsc', '--noEmit'], desktop);
  run(node, ['node_modules/typescript/bin/tsc', '--noEmit'], ui);
  run('cargo', ['check', '--locked', '--manifest-path', 'desktop/gittogether-presence/Cargo.toml']);
} else if (mode === 'build' || mode === 'dev' || mode === 'package') {
  if (mode === 'package' && process.platform !== 'darwin') throw new Error('package:mac requires a macOS build host.');
  verify();
  const sourceSha256 = sourceState(root);
  run(node, ['node_modules/vite/bin/vite.js', 'build'], ui);
  run('cargo', ['build', '--locked', '--manifest-path', 'desktop/gittogether-presence/Cargo.toml']);
  yarnRun(['compile:prod']);
  // Unchanged upstream build assembles embedded Git, Git LFS, native modules,
  // license/emoji resources. Compilation does not produce an installer.
  run(node, ['node_modules/ts-node/dist/bin.js', '-P', 'script/tsconfig.json', 'script/build.ts'], desktop, { NODE_ENV: 'development', DESKTOP_SKIP_PACKAGE: '1' });
  copyUI();
  verify();
  if (sourceState(root) !== sourceSha256) throw new Error('Source changed during the build; rebuild before running or testing.');
  writeFileSync(join(desktop, 'out/build-info.json'), JSON.stringify({ version, sourceCommit: sha.stdout.trim(), sourceSha256, sourceDirty: spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).stdout.trim().length > 0, engine: JSON.parse(readFileSync(join(root, 'docs/github-desktop-upstream.json'), 'utf8')).commit }, null, 2));
  if (mode === 'package') run(node, ['scripts/package-macos.mjs']);
  if (mode === 'dev') {
    const electron = join(desktop, 'node_modules/electron', process.platform === 'darwin' ? 'dist/Electron.app/Contents/MacOS/Electron' : process.platform === 'win32' ? 'dist/electron.exe' : 'dist/electron');
    const child = spawn(electron, ['--allow-file-access-from-files', join(desktop, 'out')], { cwd: desktop, env, stdio: 'inherit' });
    child.on('exit', code => process.exit(code || 0));
  }
} else if (mode === 'test') {
  run('cargo', ['build', '--locked', '--manifest-path', 'desktop/gittogether-presence/Cargo.toml']);
  run(node, ['--test', 'scripts/upstream-boundary.test.mjs', 'scripts/presence-storage.test.mjs', 'scripts/commit-model.test.mjs']);
} else throw new Error(`Unknown mode: ${mode}`);
