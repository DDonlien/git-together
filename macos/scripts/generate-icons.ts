import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const masters = resolve(root, '../assets/brand');
const icons = join(root, 'src-tauri/icons');
const publicBrand = join(root, 'public/brand');
const execute = promisify(execFile);
const temporary = await mkdtemp(join(tmpdir(), 'gittogether-icons-'));
const cli = join(root, 'node_modules/@tauri-apps/cli/tauri.js');

try {
  const square = join(temporary, 'square');
  const mac = join(temporary, 'mac');
  await execute(process.execPath, [cli, 'icon', join(masters, 'gittogether-square.png'), '--output', square], { cwd: root });
  await execute(process.execPath, [cli, 'icon', join(masters, 'gittogether-app.png'), '--output', mac], { cwd: root });
  await mkdir(icons, { recursive: true });
  await mkdir(publicBrand, { recursive: true });
  // macOS uses the approved transparent squircle; Windows uses the full square.
  await cp(join(mac, 'icon.icns'), join(icons, 'icon.icns'));
  await cp(join(square, 'icon.ico'), join(icons, 'icon.ico'));
  for (const name of ['icon.png', '32x32.png', '128x128.png', '128x128@2x.png']) {
    await cp(join(square, name), join(icons, name));
  }
  await cp(join(mac, '128x128.png'), join(publicBrand, 'app-icon.png'));
  await cp(join(square, '32x32.png'), join(publicBrand, 'favicon.png'));
  console.log('已从选定品牌原图生成 macOS、Windows 和网页图标。');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
