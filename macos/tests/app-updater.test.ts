import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppUpdater, type UpdateEngine } from '../electron/app-updater';
import { updateDescription, updateSource } from '../src/update-model';
import { UpdateSettings } from '../src/UpdateSettings';

class Engine extends EventEmitter implements UpdateEngine {
  autoDownload = true; autoInstallOnAppQuit = true; allowDowngrade = true;
  allowPrerelease = true; disableDifferentialDownload = false;
  checks = 0; downloads = 0; installs = 0;
  async checkForUpdates(): Promise<void> { this.checks++; }
  async downloadUpdate(): Promise<void> { this.downloads++; }
  quitAndInstall() { this.installs++; }
}
test('desktop update is explicit, stable-channel only, and cannot downgrade or install on ordinary quit', async () => {
  const engine = new Engine(); const updater = new AppUpdater(engine, '0.9.0', () => true);
  assert.equal(engine.autoDownload, false); assert.equal(engine.autoInstallOnAppQuit, false);
  assert.equal(engine.allowDowngrade, false); assert.equal(engine.allowPrerelease, false);
  assert.equal(engine.disableDifferentialDownload, true);
  assert.equal(updater.status().phase, 'idle');
  assert.equal((await updater.download()).phase, 'idle'); updater.install(); assert.equal(engine.installs, 0);
  await Promise.all([updater.check(), updater.check()]); assert.equal(engine.checks, 1);
  engine.emit('update-available', { version: '0.9.1' });
  assert.equal(updater.status().phase, 'available'); assert.equal(engine.downloads, 0);
  await Promise.all([updater.download(), updater.download()]); assert.equal(engine.downloads, 1);
  engine.emit('download-progress', { percent: 35.7 }); assert.equal(updater.status().percent, 35.7);
  engine.emit('download-progress', { percent: 101 }); assert.equal(updater.status().percent, 100);
  engine.emit('update-downloaded', { version: '0.9.1' }); assert.equal(updater.status().phase, 'ready');
  await updater.check(); assert.equal(engine.checks, 1); assert.equal(updater.status().phase, 'ready');
  updater.install(); updater.install(); assert.equal(engine.installs, 1); assert.equal(updater.status().phase, 'installing');
});
test('install waits for existing account/local operations and keeps the downloaded update retryable', () => {
  let busy = true; const engine = new Engine(); const updater = new AppUpdater(engine, '0.9.0', () => !busy);
  engine.emit('update-downloaded', { version: '0.9.1' });
  assert.equal(updater.install().phase, 'ready'); assert.equal(engine.installs, 0);
  assert.match(updater.status().message!, /操作正在进行/);
  busy = false; assert.equal(updater.install().phase, 'installing'); assert.equal(engine.installs, 1);
});
test('network/signature errors remain visible without leaking diagnostics, credentials or paths', async () => {
  const engine = new Engine(); const updater = new AppUpdater(engine, '0.9.0', () => true);
  engine.emit('error', new Error('https://token@evil.test/private /Users/private/account.encrypted'));
  assert.equal(updater.status().phase, 'error'); assert.doesNotMatch(JSON.stringify(updater.status()), /token|evil|Users|private/);
  await updater.check(); engine.emit('update-not-available', { version: '0.9.0' });
  assert.equal(updater.status().phase, 'current'); assert.equal(updater.status().message, undefined);
  assert.ok(updater.status().checkedAt);
  engine.emit('error', Object.assign(new Error('feed absent'), { code: 'ERR_UPDATER_LATEST_VERSION_NOT_FOUND' }));
  assert.match(updater.status().message!, /没有可用的更新发布/);
  engine.checkForUpdates = async () => { throw new Error('network'); };
  assert.equal((await updater.check()).phase, 'error');
});
test('unpackaged/native-unavailable clients never pretend to check or install', async () => {
  const updater = new AppUpdater(null, '0.9.0', () => true);
  assert.equal((await updater.check()).phase, 'unavailable');
  assert.equal((await updater.download()).phase, 'unavailable');
  assert.equal(updater.install().phase, 'unavailable');
  const markup = renderToStaticMarkup(createElement(UpdateSettings, { busy: false }));
  assert.match(markup, /应用更新/); assert.match(markup, /桌面 App/); assert.match(markup, /disabled/);
  assert.doesNotMatch(markup, /更新保留已连接账号和本地仓库关联/);
  assert.equal(updateDescription({ phase: 'downloading', currentVersion: '0.9.0', availableVersion: '0.9.1', percent: 13.8 }), '正在下载 0.9.1：13%');
});
test('missing and wrapped GitHub feeds never blame local installation permissions or reveal provider diagnostics', async () => {
  for (const code of ['ERR_UPDATER_LATEST_VERSION_NOT_FOUND', 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND', 'ERR_UPDATER_NO_PUBLISHED_VERSIONS', 'ERR_UPDATER_INVALID_RELEASE_FEED', 'ERR_XML_MISSED_ELEMENT', 'ERR_UPDATER_ZIP_FILE_NOT_FOUND']) {
    const engine = new Engine(); const updater = new AppUpdater(engine, '0.10.1', () => true);
    const problem = Object.assign(new Error('Cannot parse releases feed: https://token@private.test XML secret /Users/private'), { code });
    engine.checkForUpdates = async () => { engine.emit('error', problem); throw problem; };
    const result = await updater.check();
    assert.equal(result.phase, 'error'); assert.match(result.message!, /GitHub.*发布/);
    assert.doesNotMatch(result.message!, /网络|可写|签名|token|private|XML|secret/);
  }
});
test('check, download and installation failures keep their phase even when an event is followed by a rejection', async () => {
  const engine = new Engine(); const updater = new AppUpdater(engine, '0.10.1', () => true);
  const problem = new Error('private diagnostics');
  engine.checkForUpdates = async () => { engine.emit('error', problem); throw problem; };
  assert.match((await updater.check()).message!, /无法检查 GitHub 更新/);
  assert.doesNotMatch(updater.status().message!, /可写|签名/);
  engine.emit('update-available', { version: '0.10.2' });
  engine.downloadUpdate = async () => { engine.emit('error', problem); throw problem; };
  assert.match((await updater.download()).message!, /下载或校验失败.*尚未安装/);
  engine.emit('update-downloaded', { version: '0.10.2' });
  engine.quitAndInstall = () => { engine.emit('error', problem); throw problem; };
  assert.match(updater.install().message!, /安装失败.*可写.*签名/);
  assert.doesNotMatch(updater.status().message!, /private/);
});
test('fixed public GitHub update source is independent of user repositories and credential storage', () => {
  assert.deepEqual(updateSource, { provider: 'github', owner: 'DDonlien', repo: 'git-together', private: false });
  const main = readFileSync(new URL('../electron/main.ts', import.meta.url), 'utf8');
  assert.match(main, /new MacUpdater\(updateSource\)/);
  assert.match(main, /'userData', join\(app\.getPath\('appData'\), 'GitTogether-Standalone-Demo'\)/);
  assert.match(main, /'accounts-v2\.encrypted'/);
  assert.match(main, /activeImports\+\+/); assert.match(main, /finally \{ activeImports--; \}/);
  assert.match(main, /updater\.status\(\)\.phase === 'installing'/);
  const source = readFileSync(new URL('../electron/app-updater.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /encryptedStore|removeAccount|unlink|rm\(|setPath|\.save\(/);
  const packaging = readFileSync(new URL('../scripts/package-desktop.ts', import.meta.url), 'utf8');
  assert.match(packaging, /--app-bundle-id=com\.gittogether\.standalone/);
  assert.match(packaging, /await sign\([\s\S]*type: 'distribution'/);
  assert.match(packaging, /hardenedRuntime: true/);
  assert.doesNotMatch(packaging, /'--sign', '-'/);
  assert.match(packaging, /updaterCacheDirName: 'gittogether-updater'/);
  assert.match(packaging, /createHash\('sha512'\)/);
  assert.match(packaging, /latest-mac\.yml/);
});
