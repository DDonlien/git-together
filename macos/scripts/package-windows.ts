import { build as buildClient } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { appendFile, cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arch = process.argv[2];
if (process.platform !== 'win32' || !['x86', 'x64'].includes(arch)) throw new Error('Windows原生打包入口需要指定x86或x64。');
const target = arch === 'x86' ? 'i686-pc-windows-msvc' : 'x86_64-pc-windows-msvc';
const manifest = JSON.parse(await readFile(join(clientRoot, 'package.json'), 'utf8')) as { version: string };
const rootManifest = JSON.parse(await readFile(join(clientRoot, '..', 'package.json'), 'utf8')) as { version: string };
const cargoManifest = await readFile(join(clientRoot, 'src-tauri/Cargo.toml'), 'utf8');
if (rootManifest.version !== manifest.version || cargoManifest.match(/^version\s*=\s*"([^"]+)"/m)?.[1] !== manifest.version) throw new Error('Windows、macOS及Rust包版本必须一致。');
const git = async (args: string[]) => (await execute('git', args, { cwd: clientRoot })).stdout.trim();
const sourceCommit = await git(['rev-parse', 'HEAD']);
if ((process.env.GITTOGETHER_SOURCE_COMMIT && process.env.GITTOGETHER_SOURCE_COMMIT !== sourceCommit) || await git(['status', '--porcelain=v1', '--untracked-files=all', '--', 'src', 'src-tauri', 'public', 'scripts', 'package.json', 'package-lock.json', 'index.html'])) throw new Error('Windows包必须来自指定的干净源码提交。');
await execute('git', ['merge-base', '--is-ancestor', sourceCommit, 'origin/main'], { cwd: clientRoot });
const temporary = await mkdtemp(join(tmpdir(), `gittogether-windows-${arch}-`));
const output = join(clientRoot, 'artifacts', 'windows-package', arch);
await mkdir(output, { recursive: true });
const run = async (command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}) => {
  const result = await execute(command, args, { cwd, env: { ...process.env, ...env }, timeout: 3_600_000, maxBuffer: 32 * 1024 * 1024 });
  process.stdout.write(result.stdout); process.stderr.write(result.stderr); return result.stdout;
};
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
function machine(bytes: Buffer) {
  if (bytes.length < 64 || bytes.toString('ascii', 0, 2) !== 'MZ') throw new Error('主程序缺少PE头。');
  const offset = bytes.readUInt32LE(0x3c);
  if (offset + 6 > bytes.length || bytes.toString('binary', offset, offset + 4) !== 'PE\0\0') throw new Error('主程序PE头无效。');
  return bytes.readUInt16LE(offset + 4);
}
try {
  const source = join(temporary, 'source'); await mkdir(source);
  for (const entry of ['src', 'src-tauri', 'public', 'package.json', 'package-lock.json', 'index.html']) await cp(join(clientRoot, entry), join(source, entry), { recursive: true, filter: path => !relative(clientRoot, path).split(/[\\/]/).some(part => ['target', 'node_modules', 'gen'].includes(part)) && !path.endsWith('.key') });
  await symlink(join(clientRoot, 'node_modules'), join(source, 'node_modules'), 'junction');
  await run(process.execPath, [join(clientRoot, 'node_modules/typescript/bin/tsc'), '--noEmit'], clientRoot);
  await buildClient({ configFile: false, root: source, base: './', envPrefix: [], plugins: [react()], build: { outDir: join(source, 'dist/client'), sourcemap: false, target: 'esnext' } });
  const targetRoot = join(clientRoot, 'src-tauri/target');
  const environment = { CARGO_TARGET_DIR: targetRoot };
  await run('cargo', ['check', '--locked', '--target', target], join(source, 'src-tauri'), environment);
  await run('cargo', ['build', '--release', '--locked', '--target', target, '--bin', 'gittogether-platform-verify'], join(source, 'src-tauri'), environment);
  const binaryRoot = join(targetRoot, target, 'release');
  const checkOutput = await run(join(binaryRoot, 'gittogether-platform-verify.exe'), [], source);
  const validation = JSON.parse(checkOutput.trim()) as { version: string; architecture: string; nativeValidationPassed: boolean; checks: string[] };
  if (!validation.nativeValidationPassed || validation.version !== manifest.version || validation.architecture !== (arch === 'x86' ? 'x86' : 'x86_64')) throw new Error('原生校验报告的版本或架构不一致。');
  // Build-time diagnostics stay outside the application's Cargo target list.
  // This excludes them from Tauri's NSIS payload before bundling.
  await rm(join(source, 'src-tauri/src/bin'), { recursive: true });
  // Cargo's cache can contain an older version's installer. Only this run's
  // freshly generated bundle may enter the release's payload verification.
  const nsisRoot = join(binaryRoot, 'bundle/nsis');
  await rm(nsisRoot, { recursive: true, force: true });
  await run(process.execPath, [join(clientRoot, 'node_modules/@tauri-apps/cli/tauri.js'), 'build', '--target', target, '--bundles', 'nsis', '--config', JSON.stringify({ build: { beforeBuildCommand: null }, bundle: { createUpdaterArtifacts: false } }), '--', '--locked'], source, environment);
  const appBytes = await readFile(join(binaryRoot, 'gittogether.exe'));
  if (machine(appBytes) !== (arch === 'x86' ? 0x14c : 0x8664)) throw new Error('主程序的真实架构与打包目标不符。');
  // Tauri patches this exact marker for NSIS, then restores the build output.
  // Compare the payload with that expected byte change, retaining a full hash
  // check rather than accepting an arbitrary different executable.
  const expectedApplication = Buffer.from(appBytes);
  const marker = Buffer.from('__TAURI_BUNDLE_TYPE_VAR_UNK');
  const markerIndex = expectedApplication.indexOf(marker);
  if (markerIndex < 0) throw new Error('构建程序缺少Tauri安装类型标记。');
  expectedApplication.write('__TAURI_BUNDLE_TYPE_VAR_NSS', markerIndex, 'ascii');
  const installers = (await readdir(nsisRoot)).filter(name => name.endsWith('-setup.exe'));
  if (installers.length !== 1) throw new Error('Windows安装包数量不正确。');
  const installerPath = join(output, `GitTogether-${manifest.version}-Windows-${arch}-setup.exe`);
  await cp(join(nsisRoot, installers[0]), installerPath);
  const unpacked = join(temporary, 'unpacked');
  await run('C:\\Program Files\\7-Zip\\7z.exe', ['x', installerPath, '-o' + unpacked, '-y'], source);
  const entries: string[] = [];
  async function walk(directory: string) { for (const item of await readdir(directory, { withFileTypes: true })) { const path = join(directory, item.name); if (item.isDirectory()) await walk(path); else entries.push(path); } }
  await walk(unpacked);
  const applications = entries.filter(path => basename(path).toLowerCase() === 'gittogether.exe');
  if (applications.length !== 1 || hash(await readFile(applications[0])) !== hash(expectedApplication) || entries.some(path => /gittogether-(service|release-verify|platform-verify)\.exe$/i.test(path))) throw new Error('NSIS安装包内主程序或额外运行程序不符合要求。');
  // Exercise the real installer in a disposable, user-scoped destination.
  const installed = join(temporary, 'installed');
  await run(installerPath, ['/S', '/D=' + installed], source);
  if (hash(await readFile(join(installed, 'gittogether.exe'))) !== hash(expectedApplication)) throw new Error('实际安装后的主程序与构建结果不一致。');
  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `
    $ErrorActionPreference = 'Stop'
    $app = Start-Process -FilePath $env:GITTOGETHER_VALIDATION_APP -PassThru
    try {
      $ready = $false
      for ($attempt = 0; $attempt -lt 60; $attempt++) {
        Start-Sleep -Milliseconds 500
        $app.Refresh()
        if ($app.HasExited) { throw 'GitTogether exited during native startup' }
        $webview = Get-CimInstance Win32_Process -Filter "ParentProcessId = $($app.Id)" | Where-Object { $_.Name -eq 'msedgewebview2.exe' }
        if ($app.MainWindowHandle -ne 0 -and $webview) { $ready = $true; break }
      }
      if (-not $ready) { throw 'Native window or WebView2 did not start' }
      Write-Output 'Native GitTogether window and WebView2 started'
    } finally {
      if (-not $app.HasExited) { taskkill /PID $app.Id /T /F | Out-Null }
    }
  `], source, { GITTOGETHER_VALIDATION_APP: join(installed, 'gittogether.exe') });
  const installedEntries = await readdir(installed);
  const uninstaller = installedEntries.find(name => /^uninstall.*\.exe$/i.test(name));
  if (!uninstaller) throw new Error('安装后缺少卸载程序。');
  await run(join(installed, uninstaller), ['/S', '_?=' + installed], source);
  if (await git(['rev-parse', 'HEAD']) !== sourceCommit || await git(['status', '--porcelain=v1', '--untracked-files=all', '--', 'src', 'src-tauri', 'scripts', 'package.json', 'package-lock.json'])) throw new Error('构建过程中源码发生变化。');
  const bytes = await readFile(installerPath);
  await writeFile(join(output, 'build-info.json'), JSON.stringify({ version: manifest.version, sourceBranch: 'main', sourceCommit, platform: `windows-${arch === 'x86' ? 'i686' : 'x86_64'}`, architecture: arch, target, filename: basename(installerPath), size: bytes.length, sha256: hash(bytes), applicationSha256: hash(expectedApplication), applicationMachine: machine(appBytes), nativeValidationPassed: true, installerVerified: true, interfaceStarted: true, ...{ validation }, authenticodeSigned: false }, null, 2) + '\n');
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `directory=${output}\n`);
  console.log(`Windows ${arch}原生构建、核心操作、实际安装及架构校验通过：${installerPath}`);
} finally { await rm(temporary, { recursive: true, force: true, maxRetries: 6, retryDelay: 1000 }); }
