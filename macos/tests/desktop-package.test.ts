import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { releaseBranch, updateSource } from '../src/update-model';

test('official release keeps the established application identity and signed update feed', () => {
  const root = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  const client = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const config = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
  const updater = JSON.parse(readFileSync(new URL('../../docs/release-updater.json', import.meta.url), 'utf8'));
  const cargo = readFileSync(new URL('../src-tauri/Cargo.toml', import.meta.url), 'utf8');
  assert.match(root.version, /^\d+\.\d+\.\d+$/);
  assert.equal(client.version, root.version);
  assert.equal(cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1], root.version);
  assert.equal(config.productName, 'GitTogether');
  assert.equal(config.app.windows[0].title, 'GitTogether');
  assert.equal(config.identifier, 'com.gittogether.standalone');
  assert.equal(config.bundle.macOS.bundleVersion ?? root.version, root.version);
  assert.deepEqual(config.plugins.updater.endpoints, ['https://github.com/DDonlien/git-together/releases/latest/download/latest.json']);
  assert.equal(config.plugins.updater.pubkey, updater.plugins.updater.pubkey);
  assert.equal(config.plugins.updater.requireSignedVersion, true);
});

test('Tauri build uses relative client assets and excludes Electron runtimes', () => {
  const source = readFileSync(new URL('../scripts/package-desktop.ts', import.meta.url), 'utf8');
  assert.ok(source.includes("configFile: false, root: source, base: './', envPrefix: []"));
  assert.ok(source.includes("version, framework: 'Tauri 2', backend: 'Rust'"));
  assert.ok(source.includes("'--bundles', 'app'"));
  assert.ok(source.includes('sourcemap: false'));
  assert.ok(source.includes("['src', 'src-tauri', 'public', 'index.html', 'package.json', 'package-lock.json']"));
  assert.ok(source.includes('sourceDigest(clientRoot) !== sourceSha256'));
  assert.ok(source.includes('Electron Framework|\\.asar'));
  assert.ok(!source.includes("main: 'desktop/main.cjs'"));
  assert.ok(!source.includes('latest-mac.yml'));
  assert.ok(source.includes('await rm(temporary, { recursive: true, force: true })'));
});
test('Tauri release packages require committed main source and publish the signed Tauri feed', () => {
  assert.equal(releaseBranch, 'main');
  assert.deepEqual(updateSource, { provider: 'github', owner: 'DDonlien', repo: 'git-together', private: false });
  const source = readFileSync(new URL('../scripts/package-desktop.ts', import.meta.url), 'utf8');
  assert.ok(source.includes('sourceBranch !== releaseBranch'));
  assert.ok(source.includes("'status', '--porcelain=v1', '--untracked-files=all', '--', ...inputPaths"));
  assert.ok(source.includes('sourceDigest(clientRoot) !== sourceSha256'));
  assert.ok(source.includes("await git(['branch', '--show-current']) !== sourceBranch"));
  assert.ok(source.includes("version, framework: 'Tauri 2'"));
  assert.ok(source.includes('latest.json'));
  assert.ok(!source.includes('latest-mac.yml'));
  assert.ok(!source.includes('electron-updater'));
});
