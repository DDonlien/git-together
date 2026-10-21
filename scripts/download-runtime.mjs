import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const desktop = join(root, 'desktop');
const require = createRequire(join(desktop, 'package.json'));
const cache = join(desktop, '.runtime-cache'); mkdirSync(cache, { recursive: true });
function download(url, file, checksum) {
  if (!existsSync(file)) {
    const result = spawnSync('curl', ['--fail', '--location', '--retry', '2', '--output', file, url], { stdio: 'inherit' });
    if (result.status !== 0) throw new Error('Runtime download failed.');
  }
  const actual = createHash('sha256').update(readFileSync(file)).digest('hex');
  if (actual !== checksum) throw new Error(`Runtime checksum mismatch: ${file}`);
}
const ep = join(desktop, 'node_modules/electron');
const ev = JSON.parse(readFileSync(join(ep, 'package.json'))).version;
const archive = `electron-v${ev}-${process.platform}-${process.arch}.zip`;
const sums = JSON.parse(readFileSync(join(ep, 'checksums.json')));
const binaryPath = process.platform === 'darwin' ? 'Electron.app/Contents/MacOS/Electron' : process.platform === 'win32' ? 'electron.exe' : 'electron';
if (!existsSync(join(ep, 'dist', binaryPath))) {
  const file = join(cache, archive);
  download(`https://github.com/electron/electron/releases/download/v${ev}/${archive}`, file, sums[archive]);
  await require('extract-zip')(file, { dir: join(ep, 'dist') });
  writeFileSync(join(ep, 'path.txt'), binaryPath);
}
const dugite = join(desktop, 'app/node_modules/dugite');
const config = require(join(dugite, 'script/embedded-git.json'))[`${process.platform}-${process.arch}`];
if (!config) throw new Error('No upstream embedded Git for this platform.');
download(config.url, join(cache, config.name), config.checksum);
const installed = spawnSync(process.execPath, ['script/download-git.js'], { cwd: dugite, env: { ...process.env, DUGITE_CACHE_DIR: cache }, stdio: 'inherit' });
if (installed.status !== 0) throw new Error('Upstream Git installation failed.');
console.log(`Installed original Electron ${ev} and upstream embedded Git (SHA-256 verified).`);
