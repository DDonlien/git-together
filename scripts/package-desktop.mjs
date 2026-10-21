import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, statSync, openSync, readSync, closeSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { setTimeout as pause } from 'node:timers/promises';
import { sourceState } from './source-state.mjs';

const root = resolve(process.env.GITTOGETHER_SOURCE_ROOT || resolve(import.meta.dirname, '..'));
const targetArch = process.env.GITTOGETHER_PACKAGE_ARCH || process.arch;
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
const archive = `electron-v${electron.version}-${process.platform}-${targetArch}.zip`;
const zip = join(cache, archive);
if (!existsSync(zip)) run('curl', ['--fail', '--location', '--retry', '2', '--output', zip, `https://github.com/electron/electron/releases/download/v${electron.version}/${archive}`]);
assert.equal(createHash('sha256').update(readFileSync(zip)).digest('hex'), JSON.parse(readFileSync(join(desktop, 'node_modules/electron/checksums.json'), 'utf8'))[archive]);
const mac = process.platform === 'darwin';
assert.ok(mac ? targetArch === 'arm64' : process.platform === 'win32' && ['ia32', 'x64'].includes(targetArch));
const options = {
  name: 'GitTogether', platform: process.platform, arch: targetArch, electronVersion: electron.version, electronZipDir: cache,
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
    osxSign: { type: 'distribution', identity,
      // All resources are sealed by the bundle signature. Independently sign
      // Mach-O code and nested bundles, rather than attaching signatures to PNGs.
      ignore: path => {
        if (!statSync(path).isFile()) return false;
        const header = Buffer.alloc(4), file = openSync(path, 'r');
        try { readSync(file, header, 0, 4, 0) } finally { closeSync(file) }
        return !['feedface', 'feedfacf', 'cefaedfe', 'cffaedfe', 'cafebabe', 'bebafeca', 'cafebabf', 'bfbafeca'].includes(header.toString('hex'));
      }, optionsForFile: () => ({ hardenedRuntime: true, entitlements: join(desktop, 'script/entitlements.plist') }) },
    protocols: [{ name: 'com.gittogether.standalone', schemes: ['x-github-desktop-auth', 'x-github-desktop-dev-auth', 'x-github-client', 'github-mac'] }],
  });
}
const [directory] = await packager(options);
const appResources = mac ? join(directory, 'GitTogether.app/Contents/Resources/app') : join(directory, 'resources/app');
const updateURL = mac ? `https://update.electronjs.org/DDonlien/git-together/darwin-arm64/${pkg.version}` : `https://raw.githubusercontent.com/DDonlien/git-together/main/updates/win32-${targetArch}`;
assert.ok(readFileSync(join(appResources, 'renderer.js'), 'utf8').includes(updateURL), 'Packaged updater feed does not match the target.');
const assets = [];
let notarization;
if (mac) {
  const app = join(directory, 'GitTogether.app');
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
  const signingInfo = spawnSync('codesign', ['-dv', '--verbose=4', app], { encoding: 'utf8' });
  assert.equal(signingInfo.status, 0);
  assert.ok(signingInfo.stderr.includes('Authority=' + identity), 'Developer ID identity mismatch.');
  assert.ok(signingInfo.stderr.includes('TeamIdentifier=86J7X3KZ5Z'));
  assert.ok(signingInfo.stderr.includes('Identifier=com.gittogether.standalone'));
  writeFileSync(join(destination, 'codesign-info.txt'), signingInfo.stderr);
  const configPath = join(homedir(), '.config/gittogether/release/notary.json');
  const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : { profile: 'gittogether-notary' };
  const credentials = ['--keychain-profile', config.profile, ...(config.keychain ? ['--keychain', config.keychain] : [])];
  async function notary(phase, args) {
    const deadline = Date.now() + 600000;
    for (let attempt = 1; ; attempt++) {
      const result = spawnSync('xcrun', ['notarytool', phase, ...args, ...credentials, '--output-format', 'json'], { encoding: 'utf8', timeout: 1800000 });
      if (result.error) throw result.error;
      if (result.status === 0) return result.stdout;
      // Retry only the known failure before credentials were loaded. An upload,
      // rejected submission or invalid credential must retain its real error.
      if (result.status !== 69 || !/No Keychain password item found for profile:/.test(result.stderr)) throw new Error(`Apple ${phase} failed (${result.status}): ${result.stderr}`);
      console.warn(JSON.stringify({ phase, attempt, profile: config.profile, reason: 'saved-keychain-item-temporarily-unavailable' }));
      if (Date.now() >= deadline) throw new Error('既有Apple公证配置暂不可读取，自动重试已超时；配置保留，未发布安装包。');
      await pause(15000);
    }
  }
  const output = join(destination, `GitTogether-${pkg.version}-mac-arm64.zip`);
  const createZip = () => run('ditto', ['-c', '-k', '--keepParent', app, output]);
  createZip();
  await notary('history', []);
  const result = await notary('submit', [output, '--wait']);
  notarization = JSON.parse(result);
  writeFileSync(join(destination, 'notarization.json'), result);
  assert.equal(notarization.status, 'Accepted', 'Apple did not accept this package.');
  run('xcrun', ['stapler', 'staple', app]);
  run('xcrun', ['stapler', 'validate', app]);
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
  run('spctl', ['--assess', '--type', 'execute', '--verbose=2', app]);
  createZip();
  const extracted = mkdtempSync(join(tmpdir(), 'gittogether-release-archive-'));
  try {
    run('ditto', ['-x', '-k', output, extracted]);
    const restored = join(extracted, 'GitTogether.app');
    run('codesign', ['--verify', '--deep', '--strict', restored]);
    run('xcrun', ['stapler', 'validate', restored]);
    const restoredBuild = JSON.parse(readFileSync(join(restored, 'Contents/Resources/app/build-info.json'), 'utf8'));
    assert.equal(restoredBuild.sourceCommit, build.sourceCommit);
    assert.equal(restoredBuild.sourceSha256, build.sourceSha256);
  } finally { rmSync(extracted, { recursive: true, force: true }); }
  assets.push(output);
  const tar = join(destination, `GitTogether-${pkg.version}-macOS-arm64.app.tar.gz`);
  // Python's archive writer preserves framework links without AppleDouble or xattrs.
  run('python3', ['-c', 'import tarfile,sys; t=tarfile.open(sys.argv[2],"w:gz",dereference=False); t.add(sys.argv[1],arcname="GitTogether.app"); t.close()', app, tar]);
  assets.push(tar);
} else {
  const output = join(destination, `squirrel-${targetArch}`);
  const installer = require('electron-winstaller');
  await installer.createWindowsInstaller({ name: 'GitTogether', title: 'GitTogether', authors: 'GitTogether',
    appDirectory: directory, outputDirectory: output, exe: 'GitTogether.exe', noMsi: true, noDelta: true,
    setupExe: `GitTogether-${pkg.version}-win32-${targetArch}.exe`,
    setupIcon: join(root, 'macos/src-tauri/icons/icon.ico'),
    iconUrl: 'https://raw.githubusercontent.com/DDonlien/git-together/main/macos/src-tauri/icons/icon.ico',
  });
  const old = `GitTogether-${pkg.version}-full.nupkg`;
  const name = `GitTogether-${pkg.version}-win32-${targetArch}-full.nupkg`;
  renameSync(join(output, old), join(destination, name));
  const setup = `GitTogether-${pkg.version}-win32-${targetArch}.exe`;
  renameSync(join(output, setup), join(destination, setup));
  const label = targetArch === 'ia32' ? 'x86' : 'x64';
  const bootstrap = join(destination, `GitTogether-${pkg.version}-Windows-${label}-setup.exe`);
  const script = join(destination, `bootstrap-${targetArch}.nsi`);
  writeFileSync(script, `Unicode true\nName "GitTogether"\nOutFile "${bootstrap}"\nRequestExecutionLevel user\nSilentInstall silent\nSection\nInitPluginsDir\nSetOutPath "$PLUGINSDIR"\nFile /oname=setup.exe "${join(destination, setup)}"\nExecWait '"$PLUGINSDIR\\setup.exe" --silent' $0\nIntCmp $0 0 +3\nSetErrorLevel $0\nQuit\nReadEnvStr $1 "GITTOGETHER_INSTALL_NO_LAUNCH"\nStrCmp $1 "1" +2\nExec '"$LOCALAPPDATA\\GitTogether\\Update.exe" --processStart GitTogether.exe'\nSectionEnd\n`);
  run(process.env.GITTOGETHER_MAKENSIS || 'C:\\Program Files (x86)\\NSIS\\makensis.exe', ['/V2', script]);
  assets.push(join(destination, name), join(destination, setup), bootstrap);
  const release = readFileSync(join(output, 'RELEASES'), 'utf8').replaceAll(old, name);
  writeFileSync(join(destination, `RELEASES-${targetArch}`), release);
  assets.push(join(destination, `RELEASES-${targetArch}`));
  // Verify executable architecture, not the architecture of the NSIS launcher.
  for (const binary of [join(directory, 'GitTogether.exe'), join(directory, 'resources/app/gittogether-presence.exe'), join(directory, 'resources/app/git/cmd/git.exe')]) {
    const bytes = readFileSync(binary); const machine = bytes.readUInt16LE(bytes.readUInt32LE(0x3c) + 4);
    assert.equal(machine, targetArch === 'ia32' ? 0x14c : 0x8664, binary);
  }
}
assert.equal(build.sourceSha256, sourceState(root));
const report = { version: pkg.version, build, platform: process.platform, arch: targetArch, directory,
  ...(mac ? { notarization, signature: identity } : { authenticode: false }),
  assets: assets.map(path => ({ name: basename(path), size: statSync(path).size, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') })),
};
writeFileSync(join(destination, `package-${process.platform}-${targetArch}.json`), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ packaged: true, version: pkg.version, platform: process.platform, arch: targetArch, assets: assets.map(path => basename(path)) }));
