import { build as buildClient } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile, stat } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { releaseBranch, updateSource } from '../src/update-model';
import { notarizationResult, prepareDesktopRelease } from './desktop-release';
import { buildWindowsPackages } from './windows-release';
import { prepareNotarization } from './notarization';

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(join(clientRoot, 'package.json'), 'utf8')) as { version: string };
const rootManifest = JSON.parse(await readFile(join(clientRoot, '..', 'package.json'), 'utf8')) as { version: string };
const version = process.env.GITTOGETHER_RELEASE_VERSION || manifest.version;
if (rootManifest.version !== manifest.version || version !== manifest.version) throw new Error('根项目、Tauri客户端和发布tag版本必须一致。');
const cargoManifest = await readFile(join(clientRoot, 'src-tauri/Cargo.toml'), 'utf8');
if (cargoManifest.match(/^version\s*=\s*"([^"]+)"/m)?.[1] !== version) throw new Error('Rust包版本必须与Tauri发布版本一致。');
const tauri = JSON.parse(await readFile(join(clientRoot, 'src-tauri/tauri.conf.json'), 'utf8')) as { plugins: { updater: { pubkey: string } } };
if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('此打包入口需要 Apple Silicon macOS。');
const sourceEntries = ['src', 'src-tauri', 'public', 'index.html', 'package.json', 'package-lock.json'];
const identity = process.env.GITTOGETHER_SIGN_IDENTITY || 'Developer ID Application: ZHENGTAO GONG (86J7X3KZ5Z)';
const signingKey = process.env.GITTOGETHER_TAURI_SIGNING_KEY || join(homedir(), '.config/gittogether/release/tauri-updater.key');
const cargo = process.env.GITTOGETHER_CARGO || join(homedir(), '.cargo/bin/cargo');
const execute = promisify(execFile);
const git = async (args: string[]) => (await execute('git', args, { cwd: clientRoot })).stdout.trim();
const inputPaths = [...sourceEntries, 'scripts', '../package.json', '../scripts', '../.github/workflows', 'vite.config.mjs'];
const sourceBranch = await git(['branch', '--show-current']);
const sourceCommit = await git(['rev-parse', 'HEAD']);
const selectedCommit = process.env.GITTOGETHER_SOURCE_COMMIT;
if ((selectedCommit && selectedCommit !== sourceCommit) || (sourceBranch !== releaseBranch && !selectedCommit)) throw new Error('更新包必须来自main或指定的已推送main提交。');
if (await git(['status', '--porcelain=v1', '--untracked-files=all', '--', ...inputPaths])) throw new Error('打包源码有未提交改动，请先检查并提交到 main。');

function included(path: string) { return !path.split(/[\\/]/).some(part => ['target', 'node_modules', '.git'].includes(part)) && !path.replaceAll('\\', '/').includes('src-tauri/gen/') && !path.endsWith('.key'); }
async function sourceDigest(root: string) {
  const hash = createHash('sha256');
  async function visit(path: string) {
    if (!included(path)) return;
    const absolute = join(root, path), info = await stat(absolute);
    if (info.isDirectory()) { for (const entry of (await readdir(absolute)).sort()) await visit(join(path, entry)); }
    else { hash.update(path + '\0'); hash.update(await readFile(absolute)); hash.update('\0'); }
  }
  for (const entry of sourceEntries) await visit(entry);
  return hash.digest('hex');
}
async function run(command: string, args: string[], cwd = clientRoot, environment: NodeJS.ProcessEnv = {}) {
  await new Promise<void>((done, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', env: { ...process.env, ...environment } });
    child.once('error', reject); child.once('exit', (code, signal) => code === 0 ? done() : reject(new Error(`${basename(command)} 未完成（${signal ?? code}）。`)));
  });
}
const buildRoot = resolve(clientRoot, '..', '..', '_builds');
await mkdir(buildRoot, { recursive: true });
const releaseLock = join(buildRoot, 'gittogether-release.lock');
await mkdir(releaseLock).catch(error => { if (error.code === 'EEXIST') throw new Error('另一个桌面发布正在运行，请待其完成。'); throw error; });
let temporary: string | undefined;
try {
  console.log(`发布 GitTogether ${manifest.version}：核对 main、更新签名和 Apple 公证配置…`);
  const release = await prepareDesktopRelease(clientRoot, version, sourceCommit);
  const keyInfo = await stat(signingKey);
  if (!keyInfo.isFile() || (keyInfo.mode & 0o077)) throw new Error('Tauri 更新签名密钥必须是仅当前用户可读的文件。');
  if ((await readFile(signingKey + '.pub', 'utf8')).trim() !== tauri.plugins.updater.pubkey) throw new Error('Tauri 更新密钥与应用内置公钥不一致，停止发布。');
  const notary = await prepareNotarization();
  await run('npm', ['run', 'check']);
  await run(cargo, ['check', '--manifest-path', 'src-tauri/Cargo.toml', '--locked']);
  const output = await mkdtemp(join(buildRoot, `gittogether-${manifest.version}-macos-arm64-`));
  temporary = await realpath(await mkdtemp(join(tmpdir(), 'gittogether-tauri-package-')));
  const source = join(temporary, 'source'); await mkdir(source);
  for (const name of sourceEntries) await cp(join(clientRoot, name), join(source, name), { recursive: true, filter: path => included(relative(clientRoot, path)) });
  const sourceSha256 = await sourceDigest(source);
  await symlink(join(clientRoot, 'node_modules'), join(source, 'node_modules'), 'dir');
  await buildClient({ configFile: false, root: source, base: './', envPrefix: [], plugins: [react()], build: { outDir: join(source, 'dist/client'), emptyOutDir: true, sourcemap: false, target: 'esnext' } });
  const targetRoot = join(buildRoot, 'tauri-target');
  // Only the React resources and Rust application enter the bundle. Node stays
  // a development/build tool; no Electron, Node sidecar or credentials are copied.
  await run(join(clientRoot, 'node_modules/.bin/tauri'), ['build', '--target', 'aarch64-apple-darwin', '--bundles', 'app', '--config', JSON.stringify({ build: { beforeBuildCommand: null }, bundle: { createUpdaterArtifacts: false } })], source, { CARGO_TARGET_DIR: targetRoot, PATH: `${dirname(cargo)}:${process.env.PATH || ''}`, APPLE_SIGNING_IDENTITY: '-' });
  const binaryRoot = join(targetRoot, 'aarch64-apple-darwin/release');
  const applicationPath = join(output, 'GitTogether.app');
  await cp(join(binaryRoot, 'bundle/macos/GitTogether.app'), applicationPath, { recursive: true });
  // Cargo also builds the browser service and the release verifier. Tauri's
  // bundler discovers all binaries; these tools stay outside the shipped app.
  for (const tool of ['gittogether-service', 'gittogether-release-verify', 'gittogether-platform-verify']) await rm(join(applicationPath, 'Contents/MacOS', tool), { force: true });
  const bundledBinaries = await readdir(join(applicationPath, 'Contents/MacOS'));
  if (bundledBinaries.length !== 1 || bundledBinaries[0] !== 'gittogether') throw new Error('正式包包含额外运行程序，停止发布。');
  await run('/usr/bin/codesign', ['--force', '--options', 'runtime', '--timestamp', '--entitlements', join(source, 'src-tauri/entitlements.plist'), '--sign', identity, applicationPath]);
  await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', applicationPath]);
  const signature = (await execute('/usr/bin/codesign', ['-d', '--verbose=4', applicationPath])).stderr;
  if (!signature.includes('Identifier=com.gittogether.standalone') || !signature.includes('TeamIdentifier=86J7X3KZ5Z')) throw new Error('应用身份或开发者团队与旧版本不一致。');
  const entries = (await execute('/usr/bin/find', [applicationPath, '-type', 'f'])).stdout;
  if (/Electron Framework|\.asar\b|\/node_modules\/|\/node(?:\.exe)?\n/.test(entries)) throw new Error('原生包中意外包含旧运行时，停止发布。');
  if (await sourceDigest(clientRoot) !== sourceSha256 || await git(['status', '--porcelain=v1', '--untracked-files=all', '--', ...inputPaths]) || await git(['branch', '--show-current']) !== sourceBranch || await git(['rev-parse', 'HEAD']) !== sourceCommit) throw new Error('打包期间 main 源码发生变化，未发布过期快照。');
  // Keep the established archive name for possible older-client discovery.
  // Release verification does not claim an automatic Electron-to-Tauri migration.
  const zipPath = join(output, `GitTogether-${manifest.version}-mac-arm64.zip`);
  await run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', applicationPath, zipPath]);
  console.log('Rust 应用已签名，正在等待 Apple 公证…');
  const notarization = notarizationResult(await notary.submit(zipPath));
  await writeFile(join(output, 'notarization.json'), JSON.stringify(notarization, null, 2) + '\n');
  await run('/usr/bin/xcrun', ['stapler', 'staple', applicationPath]);
  await run('/usr/bin/xcrun', ['stapler', 'validate', applicationPath]);
  await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', applicationPath]);
  await run('/usr/sbin/spctl', ['--assess', '--type', 'execute', '--verbose=2', applicationPath]);
  await run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', applicationPath, zipPath]);
  const bytes = await readFile(zipPath), sha256 = createHash('sha256').update(bytes).digest('hex'), sha512 = createHash('sha512').update(bytes).digest('base64');
  const tarPath = join(output, `GitTogether-${manifest.version}-macOS-arm64.app.tar.gz`);
  // BSD tar otherwise adds root AppleDouble entries which Tauri cannot unpack.
  await run('/usr/bin/tar', ['-czf', tarPath, '-C', output, 'GitTogether.app'], clientRoot, { COPYFILE_DISABLE: '1' });
  // Sign the final, stapled bytes and bind this exact version to the signature.
  await run(join(clientRoot, 'node_modules/.bin/tauri'), ['signer', 'sign', '--private-key-path', signingKey, '--password', '', '--app-version', manifest.version, tarPath]);
  const signaturePath = tarPath + '.sig';
  await run(join(binaryRoot, 'gittogether-release-verify'), [join(source, 'src-tauri/tauri.conf.json'), tarPath, signaturePath, manifest.version]);
  const tarBytes = await readFile(tarPath), tarSignature = (await readFile(signaturePath, 'utf8')).trim();
  console.log('macOS包已完成公证和签名，正在收集并签名同一源码的Windows x86/x64原生安装包…');
  const windows = await buildWindowsPackages(clientRoot, manifest.version, sourceCommit, output, signingKey, join(binaryRoot, 'gittogether-release-verify'));
  const tauriManifestPath = join(output, 'latest.json');
  const platforms = Object.fromEntries(windows.map(p => [p.platform, { signature: p.signature, url: `https://github.com/${updateSource.owner}/${updateSource.repo}/releases/download/v${manifest.version}/${basename(p.installerPath)}` }]));
  await writeFile(tauriManifestPath, JSON.stringify({ version: manifest.version, notes: `GitTogether ${manifest.version}`, pub_date: new Date().toISOString(), platforms: { 'darwin-aarch64': { signature: tarSignature, url: `https://github.com/${updateSource.owner}/${updateSource.repo}/releases/download/v${manifest.version}/${basename(tarPath)}` }, ...platforms } }, null, 2) + '\n');
  const result = { applicationPath, zipPath, sha256, sha512, sourceSha256, sourceBranch, sourceCommit, version, framework: 'Tauri 2', backend: 'Rust', architecture: 'arm64', signature: 'Developer ID', notarized: true, notarization: { ...notarization, profile: notary.profile, storage: notary.storage }, size: bytes.length, windows, tauri: { tarPath, signaturePath, manifestPath: tauriManifestPath, signature: tarSignature, sha256: createHash('sha256').update(tarBytes).digest('hex'), size: tarBytes.length } };
  await writeFile(join(output, 'build-info.json'), JSON.stringify(result, null, 2) + '\n');
  console.log('公证及更新签名通过，正在发布并核对 Tauri 更新清单与公开安装包…');
  const publication = await release.publish(result);
  const completed = { ...result, ...publication };
  await writeFile(join(output, 'build-info.json'), JSON.stringify(completed, null, 2) + '\n');
  console.log(JSON.stringify(completed, null, 2));
} finally { if (temporary) await rm(temporary, { recursive: true, force: true }); await rm(releaseLock, { recursive: true }); }
