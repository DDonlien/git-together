import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const require = createRequire(join(root, 'desktop/package.json'));
const ts = require('typescript');
function load(file, mocks, channel = 'production') {
  const source = ts.transpileModule(readFileSync(join(root, 'desktop/app/src/ui/gittogether', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('exports', 'require', '__RELEASE_CHANNEL__', source)(exports, name => mocks[name] ?? require(name), channel);
  return exports;
}
function updater(channel, canInstall = () => true) {
  let changed, failed; const calls = [];
  const state = { status: 4, lastSuccessfulCheck: null, newReleases: null };
  const store = { state, onError: fn => { failed = fn }, onDidChange: fn => { changed = fn },
    checkForUpdates: async (...args) => { calls.push(args); state.status = 0; changed() }, quitAndInstallUpdate: () => calls.push('install') };
  const { DesktopUpdates } = load('updates.ts', { '../lib/update-store': { updateStore: store, UpdateStatus: { CheckingForUpdates: 0, UpdateAvailable: 1, UpdateNotAvailable: 2, UpdateReady: 3, UpdateNotChecked: 4 } }, './adapter': { productVersion: '0.37.0' } }, channel);
  return { controller: new DesktopUpdates(canInstall), state, calls, change: () => changed(), fail: error => failed(error) };
}
test('local status reads never query the feed; checks delegate to the original updater', async () => {
  const u = updater(); for (let i = 0; i < 20; i++) assert.equal((await u.controller.command('status')).phase, 'idle');
  assert.deepEqual(u.calls, []); assert.equal((await u.controller.command('check')).phase, 'checking'); assert.deepEqual(u.calls, [[false, true]]);
});
test('feed errors remain errors instead of latest-version success and recover on a new check', async () => {
  const u = updater(); u.state.status = 2; u.fail(new Error('network refused'));
  assert.equal(u.controller.status().phase, 'error'); assert.match(u.controller.status().message, /network refused/);
  await u.controller.command('check'); assert.equal(u.controller.status().phase, 'checking');
});
test('only a downloaded update can install and active operations block restart', async () => {
  let busy = true; const u = updater('production', () => !busy);
  await assert.rejects(u.controller.command('install'), /当前操作/); busy = false;
  await assert.rejects(u.controller.command('install'), /下载完成/);
  u.state.status = 3; u.state.newReleases = [{ latestVersion: '0.38.0' }];
  assert.equal((await u.controller.command('install')).phase, 'installing'); assert.deepEqual(u.calls, ['install']);
});
test('development builds cannot download or install public releases', async () => {
  const u = updater('development'); for (const action of ['check', 'download', 'install']) assert.equal((await u.controller.command(action)).phase, 'unavailable');
  assert.deepEqual(u.calls, []);
});
test('missing or stale release notes cannot mislabel the downloaded native update', () => {
  const u = updater(); u.state.status = 3;
  for (const latestVersion of ['0.33.0', '0.37.0']) {
    u.state.newReleases = [{ latestVersion }];
    assert.equal(u.controller.status().availableVersion, undefined);
    assert.match(u.controller.status().message, /重启/);
  }
});
test('legacy import uses account stores and dispatcher without rewriting the encrypted original', async t => {
  const profile = mkdtempSync(join(tmpdir(), 'gittogether-upgrade-test-')); t.after(() => rmSync(profile, { recursive: true, force: true }));
  const original = Buffer.from('synthetic encrypted source'); const source = join(profile, 'accounts-v2.encrypted'); writeFileSync(source, original);
  const checkout = join(profile, 'work'); mkdirSync(checkout); writeFileSync(join(checkout, 'work.txt'), 'uncommitted fixture'); const additions = [], users = [];
  const adapter = { gitea: {}, repositories: () => [], dispatcher: { addRepositories: async paths => additions.push(...paths) } };
  const { upgradeLegacy } = load('upgrade.ts', { '../main-process-proxy': { getPath: async () => profile }, '../../lib/api': { getEndpointForRepository: () => 'https://api.github.com', fetchUser: async (_host, token) => ({ token }) } });
  let reads = 0;
  const presence = { command: async () => { reads++; return { ok: true, value: { version: 2, accounts: [{ account: { provider: 'github', host: 'https://github.com/', login: 'fixture' }, token: 'synthetic' }], links: [{ path: checkout }] } } } };
  const accounts = { getAll: async () => [], addAccount: async account => { users.push(account); return account } };
  await upgradeLegacy(adapter, presence, accounts); await upgradeLegacy(adapter, presence, accounts);
  assert.equal(reads, 1); assert.deepEqual(additions, [checkout]); assert.deepEqual(users, [{ token: 'synthetic' }]);
  assert.deepEqual(readFileSync(source), original); assert.equal(readFileSync(join(checkout, 'work.txt'), 'utf8'), 'uncommitted fixture');
});
