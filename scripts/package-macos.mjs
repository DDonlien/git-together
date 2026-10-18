import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { sourceState } from './source-state.mjs';

if (process.platform !== 'darwin') throw new Error('This package requires macOS.');
const root = resolve(import.meta.dirname, '..');
const desktop = join(root, 'desktop');
const out = join(desktop, 'out');
const require = createRequire(join(desktop, 'package.json'));
const { packager } = await import(pathToFileURL(require.resolve('@electron/packager')).href);
const plist = require('plist');
const build = JSON.parse(readFileSync(join(out, 'build-info.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(join(out, 'package.json'), 'utf8'));
assert.equal(build.sourceSha256, sourceState(root), 'Rebuild changed sources before packaging.');
assert.equal(build.version, pkg.version);
const electron = JSON.parse(readFileSync(join(desktop, 'node_modules/electron/package.json'), 'utf8'));
const archive = `electron-v${electron.version}-darwin-${process.arch}.zip`;
const cache = join(desktop, '.runtime-cache');
mkdirSync(cache, { recursive: true });
const zip = join(cache, archive);
if (!existsSync(zip)) execFileSync('curl', ['--fail', '--location', '--retry', '2', '--output', zip, `https://github.com/electron/electron/releases/download/v${electron.version}/${archive}`], { stdio: 'inherit' });
const checksums = JSON.parse(readFileSync(join(desktop, 'node_modules/electron/checksums.json'), 'utf8'));
assert.equal(createHash('sha256').update(readFileSync(zip)).digest('hex'), checksums[archive], 'Electron archive checksum mismatch.');

// Keep upstream packaging/runtime options. Only the local output, product icon,
// display copy and development identity belong to this test distribution.
const info = plist.parse(readFileSync(join(desktop, 'script/info.plist'), 'utf8'));
delete info.CFBundleIconName;
info.NSAppleEventsUsageDescription = info.NSAppleEventsUsageDescription.replace('GitHub Desktop', 'GitTogether');
const destination = join(root, 'artifacts/macos', build.version);
const paths = await packager({
  name: pkg.productName,
  platform: 'darwin',
  arch: process.arch,
  electronVersion: electron.version,
  electronZipDir: cache,
  dir: out,
  out: destination,
  asar: false,
  overwrite: true,
  tmpdir: false,
  derefSymlinks: true,
  prune: false,
  icon: join(root, 'macos/src-tauri/icons/icon.icns'),
  ignore: [/\/node_modules\/electron($|\/)/, /\/node_modules\/@electron\/packager($|\/)/, /\/\.git($|\/)/, /\/node_modules\/\.bin($|\/)/],
  appVersion: build.version,
  buildVersion: build.version,
  appBundleId: `${pkg.bundleID}Dev`,
  appCategoryType: 'public.app-category.developer-tools',
  darwinDarkModeSupport: true,
  extendInfo: info,
  osxSign: {
    optionsForFile: () => ({ hardenedRuntime: true, entitlements: join(desktop, 'script/entitlements-dev.plist') }),
    type: 'development',
    identity: '-',
    identityValidation: false,
  },
  protocols: [{ name: `${pkg.bundleID}Dev`, schemes: ['x-github-desktop-dev-auth', 'x-github-client', 'github-mac'] }],
});
assert.equal(build.sourceSha256, sourceState(root), 'Source changed during packaging.');
const app = join(paths[0], `${pkg.productName}.app`);
execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app], { stdio: 'inherit' });
const report = { build, app, architecture: process.arch, electron: electron.version, signature: 'ad-hoc development', notarized: false, packagedAt: new Date().toISOString() };
writeFileSync(join(paths[0], 'package-info.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Packaged macOS test app: ${app}`);
