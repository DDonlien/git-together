import { build as buildClient } from 'vite';
import react from '@vitejs/plugin-react';
import { build as buildDesktop } from 'esbuild';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sign } from '@electron/osx-sign';
import { updateSource } from '../src/update-model';

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const manifest = JSON.parse(await readFile(join(clientRoot, 'package.json'), 'utf8')) as { name: string; version: string };
const electronVersion = (require('electron/package.json') as { version: string }).version;
if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('此打包入口需要 Apple Silicon macOS。');
const sourceEntries = ['src', 'server', 'electron', 'public', 'index.html', 'package.json', 'package-lock.json'];
const identity = process.env.GITTOGETHER_SIGN_IDENTITY || 'Developer ID Application: ZHENGTAO GONG (86J7X3KZ5Z)';

async function sourceDigest(root: string) {
  const hash = createHash('sha256');
  async function visit(relative: string) {
    const absolute = join(root, relative);
    const entries = await readdir(absolute, { withFileTypes: true }).catch(error => {
      if (error.code === 'ENOTDIR') return null;
      throw error;
    });
    if (entries) {
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) await visit(join(relative, entry.name));
    } else {
      hash.update(relative + '\0'); hash.update(await readFile(absolute)); hash.update('\0');
    }
  }
  for (const entry of sourceEntries) await visit(entry);
  return hash.digest('hex');
}

async function run(command: string, args: string[], cwd: string) {
  await new Promise<void>((resolveRun, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? resolveRun() : reject(new Error(`${command} failed (${signal ?? code})`)));
  });
}

const buildRoot = resolve(clientRoot, '..', '..', '_builds');
await mkdir(buildRoot, { recursive: true });
const output = await mkdtemp(join(buildRoot, `gittogether-${manifest.version}-macos-arm64-`));
const temporary = await realpath(await mkdtemp(join(tmpdir(), 'gittogether-package-')));
try {
  // An isolated source snapshot avoids touching Vite's watched config, dependencies or credentials.
  const source = join(temporary, 'source');
  const application = join(temporary, 'application');
  await mkdir(source);
  await mkdir(application);
  for (const name of sourceEntries) {
    await cp(join(clientRoot, name), join(source, name), { recursive: true });
  }
  const sourceSha256 = await sourceDigest(source);
  await symlink(join(clientRoot, 'node_modules'), join(source, 'node_modules'), 'dir');
  await buildClient({
    configFile: false, root: source, base: './', envPrefix: [], plugins: [react()],
    build: { outDir: join(application, 'client'), emptyOutDir: true, sourcemap: false },
  });
  await buildDesktop({
    absWorkingDir: source, entryPoints: ['electron/main.ts', 'electron/preload.ts'], bundle: true,
    platform: 'node', target: 'node22', format: 'cjs', outdir: join(application, 'desktop'),
    outExtension: { '.js': '.cjs' }, external: ['electron'], sourcemap: false,
  });

  // Desktop main is bundled; no optical native modules are needed. Never copy
  // checkout dependencies, .env, tests or user data into the application.
  await writeFile(join(application, 'package.json'), JSON.stringify({
    name: manifest.name, version: manifest.version, productName: 'GitTogether',
    private: true, main: 'desktop/main.cjs',
  }, null, 2) + '\n');
  const updateConfig = join(temporary, 'app-update.yml');
  // JSON is a YAML subset. This resource contains only public update metadata.
  await writeFile(updateConfig, JSON.stringify({ ...updateSource, updaterCacheDirName: 'gittogether-updater' }, null, 2));
  const args = ['--yes', '@electron/packager@20.3.0', application, 'GitTogether',
    '--platform=darwin', '--arch=arm64', '--no-asar', `--electron-version=${electronVersion}`,
    '--app-bundle-id=com.gittogether.standalone', `--app-version=${manifest.version}`, `--out=${output}`, `--extra-resource=${updateConfig}`];
  if (process.env.GITTOGETHER_ELECTRON_ZIP_DIR) args.push(`--electron-zip-dir=${process.env.GITTOGETHER_ELECTRON_ZIP_DIR}`);
  await run('npx', args, clientRoot);
  const applicationPath = join(output, 'GitTogether-darwin-arm64', 'GitTogether.app');
  // Never fall back to ad-hoc signing: native macOS updates require the same
  // Developer ID identity on both the running app and its replacement.
  await sign({ app: applicationPath, platform: 'darwin', identity, type: 'distribution',
    optionsForFile: () => ({ entitlements: join(source, 'electron', 'entitlements.plist'), hardenedRuntime: true }) });
  await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', applicationPath], clientRoot);
  if (await sourceDigest(clientRoot) !== sourceSha256) throw new Error('打包期间源文件发生变化，请重新打包；没有交付过期快照。');
  const zipPath = join(output, `GitTogether-${manifest.version}-macOS-arm64.zip`);
  await run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', applicationPath, zipPath], clientRoot);
  let notarized = false;
  if (process.env.GITTOGETHER_NOTARY_PROFILE) {
    await run('/usr/bin/xcrun', ['notarytool', 'submit', zipPath, '--keychain-profile', process.env.GITTOGETHER_NOTARY_PROFILE, '--wait'], clientRoot);
    await run('/usr/bin/xcrun', ['stapler', 'staple', applicationPath], clientRoot);
    await run('/usr/bin/xcrun', ['stapler', 'validate', applicationPath], clientRoot);
    await run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', applicationPath, zipPath], clientRoot);
    notarized = true;
  }
  const bytes = await readFile(zipPath);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const sha512 = createHash('sha512').update(bytes).digest('base64');
  const zipName = `GitTogether-${manifest.version}-macOS-arm64.zip`;
  const updateMetadata = { version: manifest.version, files: [{ url: zipName, sha512, size: bytes.length }], path: zipName, sha512, releaseDate: new Date().toISOString() };
  const updateMetadataPath = join(output, 'latest-mac.yml');
  await writeFile(updateMetadataPath, JSON.stringify(updateMetadata, null, 2) + '\n');
  const result = { applicationPath, zipPath, updateMetadataPath, sha256, sha512, sourceSha256, version: manifest.version, electronVersion, architecture: 'arm64', signature: 'Developer ID', notarized };
  await writeFile(join(output, 'build-info.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
