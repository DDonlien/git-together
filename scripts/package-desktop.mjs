import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { sourceState } from './source-state.mjs';

const root = resolve(import.meta.dirname, '..');
const desktop = join(root, 'desktop');
const require = createRequire(join(desktop, 'package.json'));
const { packager } = await import(pathToFileURL(require.resolve('@electron/packager')).href);
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const build = JSON.parse(readFileSync(join(desktop, 'out/build-info.json'), 'utf8'));
assert.equal(build.version, pkg.version);
assert.equal(build.channel, 'production');
assert.equal(build.sourceDirty, false, 'Commit and push before making a release.');
assert.equal(build.sourceSha256, sourceState(root));
const destination = join(root, 'artifacts/releases', pkg.version);
mkdirSync(destination, { recursive: true });
const run = (cmd, args, options = {}) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit', ...options });
const electron = JSON.parse(readFileSync(join(desktop, 'node_modules/electron/package.json'), 'utf8'));
const cache = join(desktop, '.runtime-cache');
const archive = `electron-v${electron.version}-${process.platform}-${process.arch}.zip`;
const zip = join(cache, archive);
if (!existsSync(zip)) run('curl', ['--fail', '--location', '--retry', '2', '--output', zip, `https://github.com/electron/electron/releases/download/v${electron.version}/${archive}`]);
assert.equal(createHash('sha256').update(readFileSync(zip)).digest('hex'), JSON.parse(readFileSync(join(desktop, 'node_modules/electron/checksums.json'), 'utf8'))[archive]);
const mac = process.platform === 'darwin';
assert.ok(mac ? process.arch === 'arm64' : process.platform === 'win32' && ['ia32', 'x64'].includes(process.arch));
const options = {
  name: 'GitTogether', platform: process.platform, arch: process.arch, electronVersion: electron.version, electronZipDir: cache,
  dir: join(desktop, 'out'), out: destination, asar: false, overwrite: true, tmpdir: false, derefSymlinks: true, prune: false,
  appVersion: pkg.version, buildVersion: pkg.version, appBundleId: 'com.gittogether.standalone', executableName: mac ? 'gittogether' : 'GitTogether',
  icon: join(root, `macos/src-tauri/icons/icon.${mac ? 'icns' : 'ico'}`),
  ignore: [/\/node_modules\/electron($|\/)/, /\/node_modules\/@electron\/packager($|\/)/, /\/\.git($|\/)/, /\/node_modules\/\.bin($|\/)/],
};
const identity = process.env.GITTOGETHER_SIGN_IDENTITY || 'Developer ID Application: ZHENGTAO GONG (86J7X3KZ5Z)';
if (mac) {
  const plist = require('plist');
  const info = plist.parse(readFileSync(join(desktop, 'script/info.plist'), 'utf8'));
  delete info.CFBundleIconName;
  info.NSAppleEventsUsageDescription = info.NSAppleEventsUsageDescription.replace('GitHub Desktop', 'GitTogether');
  Object.assign(options, { appCategoryType: 'public.app-category.developer-tools', darwinDarkModeSupport: true, extendInfo: info,
    osxSign: { type: 'distribution', identity, optionsForFile: () => ({ hardenedRuntime: true, entitlements: join(desktop, 'script/entitlements.plist') }) },
    protocols: [{ name: 'com.gittogether.standalone', schemes: ['x-github-desktop-auth', 'x-github-desktop-dev-auth', 'x-github-client', 'github-mac'] }],
  });
}
const [directory] = await packager(options);
const assets = [];
let notarization;
if (mac) {
  const app = join(directory, 'GitTogether.app');
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
  const signature = run('codesign', ['-dv', '--verbose=4', app], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  const configPath = join(homedir(), '.config/gittogether/release/notary.json');
  const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : { profile: 'gittogether-notary' };
  const credentials = ['--keychain-profile', config.profile, ...(config.keychain ? ['--keychain', config.keychain] : [])];
  const output = join(destination, `GitTogether-${pkg.version}-mac-arm64.zip`);
  const createZip = () => run('ditto', ['-c', '-k', '--keepParent', app, output]);
  createZip();
  const result = run('xcrun', ['notarytool', 'submit', output, ...credentials, '--wait', '--output-format', 'json'], { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8', timeout: 1800000 });
  notarization = JSON.parse(result);
  writeFileSync(join(destination, 'notarization.json'), result);
  assert.equal(notarization.status, 'Accepted', 'Apple did not accept this package.');
  run('xcrun', ['stapler', 'staple', app]);
  run('xcrun', ['stapler', 'validate', app]);
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
  run('spctl', ['--assess', '--type', 'execute', '--verbose=2', app]);
  createZip();
  assets.push(output);
  const tar = join(destination, `GitTogether-${pkg.version}-macOS-arm64.app.tar.gz`);
  // Python's archive writer preserves framework links without AppleDouble or xattrs.
  run('python3', ['-c', 'import tarfile,sys; t=tarfile.open(sys.argv[2],"w:gz",dereference=False); t.add(sys.argv[1],arcname="GitTogether.app"); t.close()', app, tar]);
  assets.push(tar);
} else {
  const output = join(destination, `squirrel-${process.arch}`);
  const installer = require('electron-winstaller');
  await installer.createWindowsInstaller({ name: 'GitTogether', title: 'GitTogether', authors: 'GitTogether',
    appDirectory: directory, outputDirectory: output, exe: 'GitTogether.exe', noMsi: true, noDelta: true,
    setupExe: `GitTogether-${pkg.version}-win32-${process.arch}.exe`,
    setupIcon: join(root, 'macos/src-tauri/icons/icon.ico'),
    iconUrl: 'https://raw.githubusercontent.com/DDonlien/git-together/main/macos/src-tauri/icons/icon.ico',
  });
  const old = `GitTogether-${pkg.version}-full.nupkg`;
  const name = `GitTogether-${pkg.version}-win32-${process.arch}-full.nupkg`;
  renameSync(join(output, old), join(destination, name));
  const setup = `GitTogether-${pkg.version}-win32-${process.arch}.exe`;
  renameSync(join(output, setup), join(destination, setup));
  const label = process.arch === 'ia32' ? 'x86' : 'x64';
  const bootstrap = join(destination, `GitTogether-${pkg.version}-Windows-${label}-setup.exe`);
  const script = join(destination, `bootstrap-${process.arch}.nsi`);
  writeFileSync(script, `Unicode true\nName "GitTogether"\nOutFile "${bootstrap}"\nRequestExecutionLevel user\nSilentInstall silent\nSection\nInitPluginsDir\nSetOutPath "$PLUGINSDIR"\nFile /oname=setup.exe "${join(destination, setup)}"\nExecWait '"$PLUGINSDIR\\setup.exe" --silent' $0\nIntCmp $0 0 +2\nAbort "GitTogether installation failed"\nExec '"$LOCALAPPDATA\\GitTogether\\Update.exe" --processStart GitTogether.exe'\nSectionEnd\n`);
  run(process.env.GITTOGETHER_MAKENSIS || 'C:\\Program Files (x86)\\NSIS\\makensis.exe', ['/V2', script]);
  assets.push(join(destination, name), join(destination, setup), bootstrap);
  const release = readFileSync(join(output, 'RELEASES'), 'utf8').replaceAll(old, name);
  writeFileSync(join(destination, `RELEASES-${process.arch}`), release);
  assets.push(join(destination, `RELEASES-${process.arch}`));
  // Verify executable architecture, not the architecture of the NSIS launcher.
  for (const binary of [join(directory, 'GitTogether.exe'), join(directory, 'resources/app/gittogether-presence.exe'), join(directory, 'resources/app/git/cmd/git.exe')]) {
    const bytes = readFileSync(binary); const machine = bytes.readUInt16LE(bytes.readUInt32LE(0x3c) + 4);
    assert.equal(machine, process.arch === 'ia32' ? 0x14c : 0x8664, binary);
  }
}
assert.equal(build.sourceSha256, sourceState(root));
const report = { version: pkg.version, build, platform: process.platform, arch: process.arch, directory,
  ...(mac ? { notarization, signature: identity } : { authenticode: false }),
  assets: assets.map(path => ({ name: basename(path), size: statSync(path).size, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') })),
};
writeFileSync(join(destination, `package-${process.platform}-${process.arch}.json`), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ packaged: true, version: pkg.version, platform: process.platform, arch: process.arch, assets: assets.map(path => basename(path)) }));
