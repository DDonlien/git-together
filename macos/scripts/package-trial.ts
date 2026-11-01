import { build as buildClient } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { prepareNotarization } from './notarization';

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const execute = promisify(execFile);
const manifest = JSON.parse(await readFile(join(clientRoot, 'package.json'), 'utf8')) as { version: string };
const rootManifest = JSON.parse(await readFile(join(clientRoot, '..', 'package.json'), 'utf8')) as { version: string };
const config = JSON.parse(await readFile(join(clientRoot, 'src-tauri/tauri.conf.json'), 'utf8'));
const version = manifest.version;
if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('此试用包入口需要 Apple Silicon macOS。');
if (!version.includes('-lite.') || rootManifest.version !== version || config.productName !== 'GitTogether Lite' || config.identifier !== 'com.gittogether.standalone.lite' || config.plugins.updater.endpoints.length) {
  throw new Error('试用包必须使用独立 Lite 版本、应用身份与关闭的稳定更新源。');
}
const cargoManifest = await readFile(join(clientRoot, 'src-tauri/Cargo.toml'), 'utf8');
if (cargoManifest.match(/^version\s*=\s*"([^"]+)"/m)?.[1] !== version) throw new Error('Rust 与试用包版本不一致。');
const git = async (args: string[]) => (await execute('git', args, { cwd: clientRoot })).stdout.trim();
const sourceBranch = await git(['branch', '--show-current']);
if (!sourceBranch || sourceBranch === 'main') throw new Error('试用包必须来自独立试用分支。');
const sourceCommit = await git(['rev-parse', 'HEAD']);
const sourceEntries = ['src', 'src-tauri', 'public', 'index.html', 'package.json', 'package-lock.json'];
const identity = process.env.GITTOGETHER_SIGN_IDENTITY || 'Developer ID Application: ZHENGTAO GONG (86J7X3KZ5Z)';
const cargo = process.env.GITTOGETHER_CARGO || join(homedir(), '.cargo/bin/cargo');
const buildRoot = resolve(clientRoot, '..', '..', '_builds');
await mkdir(buildRoot, { recursive: true });
const lock = join(buildRoot, 'gittogether-lite-package.lock');
await mkdir(lock).catch(error => { if (error.code === 'EEXIST') throw new Error('另一个 Lite 试用包正在构建。'); throw error; });

function included(path: string) {
  return !path.split(/[\\/]/).some(part => ['target', 'node_modules', '.git', '.DS_Store'].includes(part))
    && !path.replaceAll('\\', '/').includes('src-tauri/gen/') && !path.endsWith('.key');
}
async function digest(root: string) {
  const hash = createHash('sha256');
  async function visit(path: string) {
    if (!included(path)) return;
    const full = join(root, path), info = await stat(full);
    if (info.isDirectory()) { for (const entry of (await readdir(full)).sort()) await visit(join(path, entry)); }
    else { hash.update(path + '\0'); hash.update(await readFile(full)); hash.update('\0'); }
  }
  for (const entry of sourceEntries) await visit(entry);
  return hash.digest('hex');
}
async function run(command: string, args: string[], cwd = clientRoot, environment: NodeJS.ProcessEnv = {}) {
  await new Promise<void>((done, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', env: { ...process.env, ...environment } });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? done() : reject(new Error(`${basename(command)} 未完成（${signal ?? code}）。`)));
  });
}
let temporary: string | undefined;
try {
  const notary = await prepareNotarization();
  const output = await mkdtemp(join(buildRoot, `gittogether-lite-${version}-macos-arm64-`));
  temporary = await realpath(await mkdtemp(join(tmpdir(), 'gittogether-lite-package-')));
  const source = join(temporary, 'source');
  await mkdir(source);
  for (const name of sourceEntries) await cp(join(clientRoot, name), join(source, name), { recursive: true, filter: path => included(relative(clientRoot, path)) });
  const sourceSha256 = await digest(source);
  if (sourceSha256 !== await digest(clientRoot)) throw new Error('复制期间源码发生变化，请完成修改后重新打包。');
  const sourceWorkingTreeModified = !!await git(['status', '--porcelain=v1', '--untracked-files=all', '--', ...sourceEntries]);
  await symlink(join(clientRoot, 'node_modules'), join(source, 'node_modules'), 'dir');
  await buildClient({ configFile: false, root: source, base: './', envPrefix: [], plugins: [react()], build: { outDir: join(source, 'dist/client'), emptyOutDir: true, sourcemap: false, target: 'esnext' } });
  const targetRoot = join(buildRoot, 'tauri-target');
  await run(join(clientRoot, 'node_modules/.bin/tauri'), ['build', '--target', 'aarch64-apple-darwin', '--bundles', 'app', '--config', JSON.stringify({ build: { beforeBuildCommand: null }, bundle: { createUpdaterArtifacts: false } }), '--', '--locked'], source, { CARGO_TARGET_DIR: targetRoot, PATH: `${dirname(cargo)}:${process.env.PATH || ''}`, APPLE_SIGNING_IDENTITY: '-' });
  const applicationPath = join(output, 'GitTogether Lite.app');
  await cp(join(targetRoot, 'aarch64-apple-darwin/release/bundle/macos/GitTogether Lite.app'), applicationPath, { recursive: true });
  for (const tool of ['gittogether-service', 'gittogether-release-verify', 'gittogether-platform-verify']) await rm(join(applicationPath, 'Contents/MacOS', tool), { force: true });
  const binaries = await readdir(join(applicationPath, 'Contents/MacOS'));
  if (binaries.length !== 1 || binaries[0] !== 'gittogether') throw new Error('试用包包含多余运行程序。');
  const architecture = (await execute('/usr/bin/lipo', ['-archs', join(applicationPath, 'Contents/MacOS/gittogether')])).stdout.trim();
  if (architecture !== 'arm64') throw new Error('试用包主程序不是 Apple Silicon 架构。');
  await run('/usr/bin/codesign', ['--force', '--options', 'runtime', '--timestamp', '--entitlements', join(source, 'src-tauri/entitlements.plist'), '--sign', identity, applicationPath]);
  await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', applicationPath]);
  const signature = (await execute('/usr/bin/codesign', ['-d', '--verbose=4', applicationPath])).stderr;
  if (!signature.includes('Identifier=com.gittogether.standalone.lite') || !signature.includes('TeamIdentifier=86J7X3KZ5Z')) throw new Error('试用包应用身份或签名团队不正确。');
  if (await digest(clientRoot) !== sourceSha256 || await git(['branch', '--show-current']) !== sourceBranch || await git(['rev-parse', 'HEAD']) !== sourceCommit) throw new Error('构建期间源码发生变化，未交付过期试用包。');
  const zipPath = join(output, `GitTogether-Lite-${version}-macOS-arm64.zip`);
  await run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', applicationPath, zipPath]);
  console.log('Lite 试用包已签名，正在等待 Apple 公证…');
  const notarization = JSON.parse(await notary.submit(zipPath)) as { id?: string; status?: string };
  await writeFile(join(output, 'notarization.json'), JSON.stringify(notarization, null, 2) + '\n');
  if (!notarization.id || notarization.status !== 'Accepted') throw new Error(`Apple 公证未通过（${notarization.status ?? '没有结果'}）。`);
  await run('/usr/bin/xcrun', ['stapler', 'staple', applicationPath]);
  await run('/usr/bin/xcrun', ['stapler', 'validate', applicationPath]);
  await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', applicationPath]);
  await run('/usr/sbin/spctl', ['--assess', '--type', 'execute', '--verbose=2', applicationPath]);
  await run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', applicationPath, zipPath]);
  const bytes = await readFile(zipPath);
  const result = { productName: 'GitTogether Lite', version, sourceBranch, sourceCommit, sourceWorkingTreeModified, sourceSha256, applicationPath, zipPath, architecture, framework: 'Tauri 2', backend: 'Rust', identifier: 'com.gittogether.standalone.lite', dataDirectory: 'GitTogether-Lite', stableUpdaterEnabled: false, signature: 'Developer ID', notarization, sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length, createdAt: new Date().toISOString() };
  await writeFile(join(output, 'build-info.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (temporary) await rm(temporary, { recursive: true, force: true });
  await rm(lock, { recursive: true });
}
