import { sourceState } from './source-state.mjs';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const packagedApp = process.env.GITTOGETHER_SMOKE_APP;
const appRoot = packagedApp ? join(resolve(packagedApp), 'Contents/Resources/app') : join(root, 'desktop/out');
const build = JSON.parse(readFileSync(join(appRoot, 'build-info.json'), 'utf8'));
assert.equal(build.sourceSha256, sourceState(root), 'Rebuild changed sources before checking repository discovery.');
const require = createRequire(join(root, 'desktop/package.json'));
const { _electron } = require('playwright');
const fixture = realpathSync(mkdtempSync(join(tmpdir(), 'gittogether-discovery-')));
const profile = join(fixture, 'profile'), parent = join(fixture, 'Projects/Gitea'), remotes = join(fixture, 'remotes');
const output = join(root, 'artifacts/local-discovery', build.version, ...(packagedApp ? ['package'] : []));
for (const path of [profile, parent, remotes, output]) mkdirSync(path, { recursive: true });
const env = { ...process.env, GIT_CONFIG_GLOBAL: join(fixture, 'gitconfig'), GIT_CONFIG_NOSYSTEM: '1', GITTOGETHER_SMOKE: '1', NODE_ENV: 'development' };
const gitBinary = join(appRoot, 'git/bin/git');
const git = (args, cwd = fixture) => execFileSync(gitBinary, args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
git(['config', '--global', 'user.name', 'Discovery Fixture']);
git(['config', '--global', 'user.email', 'discovery@example.invalid']);
git(['config', '--global', 'commit.gpgsign', 'false']);
const serverErrors = [];
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  const child = spawn('git', ['http-backend'], { env: { ...env, GIT_PROJECT_ROOT: remotes, GIT_HTTP_EXPORT_ALL: '1', PATH_INFO: url.pathname, QUERY_STRING: url.search.slice(1), REQUEST_METHOD: request.method, CONTENT_TYPE: request.headers['content-type'] || '', CONTENT_LENGTH: request.headers['content-length'] || '', HTTP_GIT_PROTOCOL: request.headers['git-protocol'] || '' } });
  request.pipe(child.stdin);
  const chunks = [], errors = [];
  child.stdout.on('data', chunk => chunks.push(chunk)); child.stderr.on('data', chunk => errors.push(chunk));
  child.on('error', error => { serverErrors.push(error.message); response.writeHead(500); response.end(); });
  child.on('close', code => {
    const bytes = Buffer.concat(chunks), end = bytes.indexOf('\r\n\r\n');
    if (code !== 0 || end < 0) { serverErrors.push(Buffer.concat(errors).toString()); response.writeHead(500); response.end(); return; }
    const headers = {}; let status = 200;
    for (const line of bytes.subarray(0, end).toString().split('\r\n')) {
      const colon = line.indexOf(':'); if (colon < 0) continue;
      const key = line.slice(0, colon), value = line.slice(colon + 1).trim();
      if (key.toLowerCase() === 'status') status = Number(value.split(' ')[0]); else headers[key] = value;
    }
    response.writeHead(status, headers); response.end(bytes.subarray(end + 4));
  });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const host = 'http://127.0.0.1:' + server.address().port;
function clone(name, path) {
  const bare = join(remotes, name + '.git'); mkdirSync(resolve(bare, '..'), { recursive: true });
  git(['init', '--bare', '--initial-branch=main', bare]);
  mkdirSync(resolve(path, '..'), { recursive: true }); git(['clone', bare, path]);
  writeFileSync(join(path, 'readme.txt'), 'original\n'); git(['add', '.'], path); git(['commit', '-m', 'initial'], path); git(['push', '-u', 'origin', 'main'], path);
  git(['remote', 'set-url', 'origin', host + '/' + name + '.git'], path);
  return path;
}
const main = clone('team/project', join(parent, 'team/project/main'));
const feature = join(parent, 'team/project/feature'); git(['worktree', 'add', '-b', 'feature', feature], main);
git(['remote', 'add', 'aaa-backup', host + '/team/second.git'], main);
const otherClone = join(parent, 'team/project/other-clone'); git(['clone', join(remotes, 'team/project.git'), otherClone]); git(['remote', 'set-url', 'origin', host + '/team/project.git'], otherClone);
const second = clone('team/second', join(parent, 'other/second'));
const six = clone('team/level-six', join(parent, 'a/b/c/d/e/six'));
const seven = clone('team/level-seven', join(parent, 'a/b/c/d/e/f/seven'));
const outside = clone('team/outside', join(fixture, 'outside'));
symlinkSync(outside, join(parent, 'linked-outside'));
const foreign = clone('else/foreign', join(parent, 'foreign'));
const baseline = clone('local/baseline', join(fixture, 'baseline'));
const nested = clone('team/level-seven-nested', join(main, 'nested-repository'));
const malformed = clone('ignored/malformed', join(parent, 'malformed')); git(['remote', 'set-url', 'origin', 'https://example.invalid/%zz/repo.git'], malformed);
for (let i = 0; i < 4100; i++) mkdirSync(join(main, 'generated', String(i)), { recursive: true });
mkdirSync(join(parent, 'unrelated', ...Array.from({ length: 10 }, (_, i) => 'level' + i)), { recursive: true });
writeFileSync(join(main, 'readme.txt'), 'staged\n'); git(['add', 'readme.txt'], main); writeFileSync(join(main, 'readme.txt'), 'unstaged\n');
const snapshots = new Map([main, feature, otherClone, second, six, seven, outside, foreign, baseline, nested].map(path => [path, { head: git(['rev-parse', 'HEAD'], path), index: git(['ls-files', '--stage'], path), status: git(['status', '--porcelain'], path), text: readFileSync(join(path, 'readme.txt'), 'utf8') }]));
const account = (id, login) => ({ id, provider: 'gitea', host, login, name: login, updatedAt: new Date().toISOString() });
const alice = account('gitea:' + host + ':1', 'alice'), bob = account('gitea:' + host + ':2', 'bob');
const remote = (account, id, fullName) => ({ id: account.id + ':' + id, accountId: account.id, remoteId: id, fullName, name: fullName.split('/')[1], description: '', private: false, defaultBranch: 'main', url: host + '/' + fullName, available: true });
const targets = ['team/project', 'team/second', 'team/level-six', 'team/level-seven', 'team/outside', 'team/level-seven-nested'].map((name, index) => remote(alice, index + 1, name));
// Saved, non-secret directory metadata exercises the real persistence loader;
// this fixture neither signs in nor creates system credential-store entries.
writeFileSync(join(profile, 'gitea-accounts.json'), JSON.stringify({ version: 1, entries: [{ account: alice, userId: 1, repositories: [...targets].reverse() }, { account: bob, userId: 2, repositories: [remote(bob, 7, 'else/foreign')] }] }));
const executablePath = packagedApp ? join(resolve(packagedApp), 'Contents/MacOS', JSON.parse(readFileSync(join(appRoot, 'package.json'), 'utf8')).productName) : join(root, 'desktop/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const launch = () => _electron.launch({ executablePath, args: packagedApp ? ['--user-data-dir=' + profile] : ['--user-data-dir=' + profile, appRoot], cwd: fixture, env, timeout: 60_000 });
let app, page;
const pageErrors = [], checks = [];
const attach = async () => { page = await app.firstWindow(); page.on('pageerror', error => pageErrors.push({ message: error.message, stack: error.stack })); await page.waitForFunction(() => window.__gittogetherAdapter); };
const call = (method, input) => page.evaluate(({ method, input }) => window.__gittogetherAdapter.handle(method, input), { method, input });
const paths = async () => page.evaluate(() => window.__gittogetherAdapter.repositories().map(repo => repo.path).sort());
try {
  app = await launch(); await attach();
  await call('link', { repositoryId: '', path: baseline });
  const selected = await page.evaluate(() => window.__gittogetherAdapter.store.getState().selectedState.repository.id);
  const result = await call('matchAccountRepositories', { accountId: alice.id, path: parent });
  assert.deepEqual(result.matchedRepositoryIds.sort(), targets.slice(0, 3).map(repo => repo.id).sort());
  assert.deepEqual(await paths(), [baseline, main, feature, otherClone, second, six].sort());
  assert.equal(await page.evaluate(() => window.__gittogetherAdapter.store.getState().selectedState.repository.id), selected);
  assert.equal(result.catalog.links.find(link => link.repositoryId === targets[0].id).worktrees.length, 3);
  checks.push('Parent selection discovers multiple clones and .git-file worktrees, matches only the requested account and preserves the active Desktop repository.');
  checks.push('Six-level boundary, unrelated ten-level tree, 4100 project subdirectories, nested repository and directory symlink are bounded without losing sibling matches.');
  const repeated = await call('matchAccountRepositories', { accountId: alice.id, path: parent });
  assert.deepEqual(repeated.matchedRepositoryIds.sort(), result.matchedRepositoryIds.sort());
  assert.deepEqual(await paths(), [baseline, main, feature, otherClone, second, six].sort());
  for (const [path, before] of snapshots) assert.deepEqual({ head: git(['rev-parse', 'HEAD'], path), index: git(['ls-files', '--stage'], path), status: git(['status', '--porcelain'], path), text: readFileSync(join(path, 'readme.txt'), 'utf8') }, before, path);
  checks.push('Repeat matching deduplicates and preserves every fixture HEAD, index, staged/unstaged change and file.');
  const noMatch = join(fixture, 'empty'); mkdirSync(noMatch);
  const registered = await paths();
  assert.deepEqual((await call('matchAccountRepositories', { accountId: alice.id, path: noMatch })).matchedRepositoryIds, []);
  await assert.rejects(call('matchAccountRepositories', { accountId: 'unknown-account', path: parent }), /账号/);
  assert.deepEqual(await paths(), registered);
  const budget = join(fixture, 'budget'); mkdirSync(budget);
  const pending = join(budget, '000-match'); git(['clone', join(remotes, 'team/project.git'), pending]); git(['remote', 'set-url', 'origin', host + '/team/project.git'], pending);
  for (let i = 0; i < 4001; i++) mkdirSync(join(budget, 'candidate-' + i));
  await assert.rejects(call('matchAccountRepositories', { accountId: alice.id, path: budget }), /4000/);
  assert.deepEqual(await paths(), registered);
  checks.push('No match, invalid account and the candidate-directory budget leave existing registrations unchanged, including a match found before the limit is reached.');
  const many = join(fixture, 'many-clones'); mkdirSync(many);
  for (let i = 0; i < 62; i++) {
    const path = join(many, 'clone-' + i);
    git(['clone', '--shared', join(remotes, 'team/project.git'), path]); git(['remote', 'set-url', 'origin', host + '/team/project.git'], path);
  }
  await assert.rejects(call('matchAccountRepositories', { accountId: alice.id, path: many }), /64/);
  assert.deepEqual(await paths(), registered);
  checks.push('The 64-directory contract includes earlier associations; a later parent containing 62 more clones cannot invalidate the catalog or partially register results.');
  await call('unlink', { repositoryId: targets[0].id, branch: 'feature' });
  await call('link', { repositoryId: targets[0].id, path: parent, branch: 'feature' });
  assert.ok((await paths()).includes(feature));
  assert.ok(!(await paths()).includes(foreign));
  const own = await call('matchAccountRepositories', { accountId: bob.id, path: parent });
  assert.deepEqual(own.matchedRepositoryIds, [bob.id + ':7']);
  checks.push('Single-repository parent selection supports an exact branch; a second account matches its own repository separately.');
  // Exercise transport identity without asking the fixture to establish SSH.
  git(['remote', 'set-url', 'origin', 'ssh://git@127.0.0.1:2222/team/level-six.git'], six);
  await call('unlink', { repositoryId: targets[2].id });
  const transport = await call('matchAccountRepositories', { accountId: alice.id, path: six });
  assert.deepEqual(transport.matchedRepositoryIds, [targets[2].id]);
  git(['remote', 'set-url', 'origin', host + '/team/level-six.git'], six);
  checks.push('SSH and HTTP transport ports preserve the same repository identity while original remote configuration remains untouched by matching.');
  const first = await call('localWorkspace', { repositoryId: targets[1].id });
  await page.evaluate(async id => { const adapter = window.__gittogetherAdapter; await adapter.dispatcher.selectRepository(await adapter.repository(id)); }, targets[1].id);
  writeFileSync(join(second, 'readme.txt'), 'external first save\n');
  await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.webContents.send('blur'); window.webContents.send('focus'); });
  await page.waitForFunction(async ({ id, previous }) => { const ws = await window.__gittogetherAdapter.workspace(id); return ws.tasks[0].files.some(file => file.path === 'readme.txt') && ws.tasks[0].changeKey !== previous; }, { id: targets[1].id, previous: first.tasks[0].changeKey });
  const changed = await call('localWorkspace', { repositoryId: targets[1].id });
  writeFileSync(join(second, 'readme.txt'), 'external second save\n');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('focus'));
  await page.waitForFunction(async ({ id, previous }) => (await window.__gittogetherAdapter.workspace(id)).tasks[0].changeKey !== previous, { id: targets[1].id, previous: changed.tasks[0].changeKey });
  checks.push('The unchanged upstream focus handler refreshes external saves, including a second edit while the same file remains modified; the UI adapter invalidates its workspace cache.');
  const frame = page.frameLocator('#gittogether-ui');
  await page.evaluate(() => { const adapter = window.__gittogetherAdapter; adapter.dispatcher.closeCurrentFoldout(); adapter.dispatcher.closePopup(); });
  await frame.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await frame.locator('.repository-count-action').waitFor();
  // Return a test-owned folder from the native chooser without interacting with
  // the user's desktop; the real UI, MessagePort and result validation still run.
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, parent);
  await frame.locator('.repository-count-action').click();
  await frame.getByText(/已匹配 4\//).waitFor();
  assert.equal(await page.locator('dialog[data-gittogether-surface="Error"][open]').count(), 0);
  checks.push('The Dashboard count button traverses the actual chooser/MessagePort/import-validation flow and displays the combined account match result without an upstream not-a-repository dialog.');
  await page.screenshot({ path: join(output, 'matched-dashboard.png') });
  const saved = await paths();
  await app.close(); app = await launch(); await attach();
  const restored = await call('catalog', {});
  for (const id of [...result.matchedRepositoryIds, bob.id + ':7']) assert.ok(restored.links.some(link => link.repositoryId === id), id);
  assert.deepEqual(restored.links.find(link => link.repositoryId === targets[0].id).worktrees.map(tree => tree.path).sort(), [main, feature, otherClone].sort());
  assert.deepEqual(await paths(), saved);
  checks.push('Restart rebuilds Gitea associations from the original saved Desktop repositories before manual refresh; no second association file is required.');
  checks.push('Multiple remotes use the original Desktop default-remote rule even when a backup remote and its catalog entry sort first; malformed unrelated remote encoding does not abort matching.');
  // The upstream development shell installs browser extensions. Keep their
  // isolated-world failures visible, separate from application code failures.
  const extensionWarnings = pageErrors.filter(error => error.message === 'Unable to initialize web-extension bridge. Unsupported context: null' && error.stack.split('\n').slice(1).every(line => line.includes('chrome-extension://')));
  assert.deepEqual(pageErrors.filter(error => !extensionWarnings.includes(error)), []); assert.deepEqual(serverErrors, []);
  const report = { ok: true, build, fixture, checks, extensionWarnings, unverified: ['real user account and directories', 'Windows runtime', 'installed app or new installer'] };
  writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (app) await app.close();
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
