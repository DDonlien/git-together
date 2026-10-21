import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
assert.equal(process.platform, 'win32');
const root = resolve(import.meta.dirname, '..');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const destination = join(root, 'artifacts/releases', version);
const packageReport = JSON.parse(readFileSync(join(destination, `package-win32-${process.arch}.json`), 'utf8'));
const fixture = mkdtempSync(join(tmpdir(), 'gittogether-installed-smoke-'));
const installer = join(destination, `GitTogether-${version}-Windows-${process.arch === 'ia32' ? 'x86' : 'x64'}-setup.exe`);
execFileSync(installer, ['/S'], { env: { ...process.env, GITTOGETHER_INSTALL_NO_LAUNCH: '1' }, stdio: 'inherit', timeout: 180000 });
const executable = join(process.env.LOCALAPPDATA, 'GitTogether', `app-${version}`, 'GitTogether.exe');
const bytes = readFileSync(executable); assert.equal(bytes.readUInt16LE(bytes.readUInt32LE(0x3c) + 4), process.arch === 'ia32' ? 0x14c : 0x8664);
const bare = join(fixture, 'remote.git'), repo = join(fixture, 'work');
const env = { ...process.env, GIT_CONFIG_GLOBAL: join(fixture, 'gitconfig'), GIT_CONFIG_NOSYSTEM: '1', GITTOGETHER_SMOKE: '1' };
const git = (args, cwd = fixture) => execFileSync('git', args, { cwd, env, encoding: 'utf8' }).trim();
git(['config', '--global', 'user.name', 'Windows package fixture']); git(['config', '--global', 'user.email', 'fixture@example.invalid']);
git(['init', '--bare', '--initial-branch=main', bare]); git(['clone', pathToFileURL(bare).href, repo]);
git(['config', 'commit.gpgsign', 'false'], repo); writeFileSync(join(repo, 'work.txt'), 'one\n');
git(['add', '.'], repo); git(['commit', '-m', 'fixture initial'], repo); git(['push', '-u', 'origin', 'main'], repo);
const require = createRequire(join(root, 'desktop/package.json'));
const { _electron } = require('playwright');
const app = await _electron.launch({ executablePath: executable, args: ['--user-data-dir=' + join(fixture, 'profile')], env, timeout: 60000 });
try {
  const native = await app.evaluate(async ({ app }, account) => {
    const keytar = require(app.getAppPath() + '/keytar.node');
    const service = 'GitTogether isolated package validation';
    try { await keytar.setPassword(service, account, 'synthetic-fixture-secret'); return await keytar.getPassword(service, account) === 'synthetic-fixture-secret' }
    finally { await keytar.deletePassword(service, account) }
  }, randomUUID());
  assert.equal(native, true);
  const page = await app.firstWindow(); await page.waitForFunction(() => window.__gittogetherAdapter);
  const call = (method, input) => page.evaluate(({ method, input }) => window.__gittogetherAdapter.handle(method, input), { method, input });
  await call('link', { repositoryId: '', path: repo });
  const catalog = await call('catalog', {}); const link = catalog.links.find(link => link.path === repo); assert.ok(link);
  const original = await call('localWorkspace', { repositoryId: link.repositoryId }); assert.equal(original.tasks[0].branch, 'main');
  writeFileSync(join(repo, 'work.txt'), 'two\n');
  const state = await page.evaluate(async id => { const a = window.__gittogetherAdapter; await a.dispatcher.refreshRepository(await a.repository(id)); return a.workspace(id) }, link.repositoryId);
  const task = state.tasks[0];
  const committed = await call('submitCommit', { repositoryId: link.repositoryId, taskId: task.id, expectedHead: task.head, changeKey: task.changeKey, summary: 'Windows installed package', description: '', operationId: randomUUID() });
  assert.notEqual(committed.commitId, original.tasks[0].head);
  await page.evaluate(() => window.__gittogetherAdapter.dispatcher.closePopup());
  const pushed = await call('pushCommit', { repositoryId: link.repositoryId, taskId: task.id, expectedHead: committed.commitId, commitId: committed.commitId, operationId: randomUUID() });
  assert.equal(pushed.pushed, true); assert.equal(git(['rev-parse', 'refs/heads/main'], bare), committed.commitId);
  writeFileSync(join(repo, 'work.txt'), 'keep local content\n');
  const head = git(['rev-parse', 'HEAD'], repo), index = git(['ls-files', '--stage'], repo);
  const snapshot = await call('localWorkspace', { repositoryId: link.repositoryId }); assert.ok(snapshot.tasks.length);
  assert.equal(git(['rev-parse', 'HEAD'], repo), head); assert.equal(git(['ls-files', '--stage'], repo), index);
  assert.equal(readFileSync(join(repo, 'work.txt'), 'utf8'), 'keep local content\n');
  const frame = page.frames().find(frame => frame.url().includes('/gittogether/index.html')); assert.ok(frame);
  await frame.waitForFunction(() => window.gittogether?.updates);
  const status = await frame.evaluate(() => window.gittogether.updates.status()); assert.equal(status.currentVersion, version); assert.notEqual(status.phase, 'unavailable');
  writeFileSync(join(destination, `windows-smoke-${process.arch}.json`), JSON.stringify({ version, sourceCommit: packageReport.build.sourceCommit, arch: process.arch, installed: true, encryptedStorage: true, originalCommitPush: true, fileAndIndexPreserved: true, productionUpdates: true }, null, 2) + '\n');
} finally { await app.close(); rmSync(fixture, { recursive: true, force: true }); }
