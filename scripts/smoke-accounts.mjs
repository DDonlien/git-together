import { sourceState } from './source-state.mjs';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { createServer as createSecureServer } from 'node:https';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const packaged = process.env.GITTOGETHER_SMOKE_APP;
const appRoot = packaged ? join(resolve(packaged), 'Contents/Resources/app') : join(root, 'desktop/out');
const build = JSON.parse(readFileSync(join(appRoot, 'build-info.json'), 'utf8'));
assert.equal(build.sourceSha256, sourceState(root), 'Rebuild changed sources before checking accounts.');
const require = createRequire(join(root, 'desktop/package.json'));
const { _electron } = require('playwright'), ts = require('typescript');
const enumBody = readFileSync(join(root, 'desktop/app/src/models/popup.ts'), 'utf8').match(/export enum PopupType\s*{([^}]+)}/s)[1];
const enums = {}; new Function('exports', ts.transpileModule('export enum PopupType {' + enumBody + '}', { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(enums);
const fixture = mkdtempSync(join(tmpdir(), 'gittogether-account-smoke-'));
const tlsConfig = join(fixture, 'tls.cnf'), tlsKey = join(fixture, 'tls.key'), tlsCertificate = join(fixture, 'tls.pem');
writeFileSync(tlsConfig, '[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=server\n[dn]\nCN=localhost\n[server]\nsubjectAltName=IP:127.0.0.1\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n');
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', tlsKey, '-out', tlsCertificate, '-config', tlsConfig], { stdio: ['ignore', 'pipe', 'pipe'] });
let tlsRequests = 0;
const tlsFailures = [];
const tlsServer = createSecureServer({ key: readFileSync(tlsKey), cert: readFileSync(tlsCertificate) }, (_request, response) => { tlsRequests++; response.end('{}'); });
tlsServer.on('tlsClientError', error => tlsFailures.push(error.code));
await new Promise(resolve => tlsServer.listen(0, '127.0.0.1', resolve));
const tlsHost = 'https://127.0.0.1:' + tlsServer.address().port;
const output = join(root, 'artifacts/account-entries', build.version); mkdirSync(output, { recursive: true });
const env = { ...process.env, GIT_CONFIG_GLOBAL: join(fixture, 'gitconfig'), GIT_CONFIG_NOSYSTEM: '1', GITTOGETHER_SMOKE: '1', NODE_ENV: 'development' };
const gitBinary = join(appRoot, 'git/bin/git');
const git = (args, cwd = fixture) => execFileSync(gitBinary, args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
git(['config', '--global', 'user.name', 'Accounts Fixture']); git(['config', '--global', 'user.email', 'accounts@example.invalid']); git(['config', '--global', 'commit.gpgsign', 'false']);
const origin = join(fixture, 'remotes/alice/work.git'), initial = join(fixture, 'initial');
mkdirSync(join(fixture, 'remotes/alice'), { recursive: true });
git(['init', '--bare', '--initial-branch=main', origin]); git(['config', 'http.receivepack', 'true'], origin);
git(['clone', origin, initial]); writeFileSync(join(initial, 'readme.txt'), 'account fixture\n'); git(['add', '.'], initial); git(['commit', '-m', 'initial'], initial); git(['push', 'origin', 'main'], initial);
const tokens = { alice: 'fixture-' + crypto.randomUUID(), bob: 'fixture-' + crypto.randomUUID() };
const requests = [], gitUsers = [], backendErrors = [];
let failedDirectory = false, invalidName = false, redirectHits = 0;
const trap = createServer((_request, response) => { redirectHits++; response.end('unexpected'); });
await new Promise(resolve => trap.listen(0, '127.0.0.1', resolve));
const rawRepositories = [
  { id: 1, name: 'work', full_name: 'alice/work', private: true, default_branch: 'main', fork: false, permissions: { pull: true, push: true } },
  { id: 2, name: 'project', full_name: 'team/project', private: true, default_branch: 'trunk', fork: false },
  { id: 3, name: 'fork', full_name: 'alice/fork', private: false, default_branch: 'main', fork: true },
];
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (url.pathname.startsWith('/api/v1/')) {
    const login = Object.keys(tokens).find(name => request.headers.authorization === 'token ' + tokens[name]);
    requests.push({ path: url.pathname, query: url.search, login: login || 'rejected', fetchMode: request.headers['sec-fetch-mode'] });
    if (request.headers.authorization === 'token fixture-redirect') { response.writeHead(302, { Location: 'http://127.0.0.1:' + trap.address().port + '/capture' }); response.end(); return; }
    response.setHeader('Content-Type', 'application/json');
    if (request.headers.authorization === 'token fixture-oversized') { response.end('x'.repeat(16 * 1024 * 1024 + 1)); return; }
    if (!login) { response.writeHead(401); response.end('{"message":"invalid token"}'); return; }
    if (url.pathname === '/api/v1/user') { response.end(JSON.stringify({ id: login === 'alice' ? 1 : 2, login, full_name: login === 'alice' ? 'Alice' : 'Bob' })); return; }
    if (failedDirectory) { response.writeHead(503); response.end('{"message":"fixture outage"}'); return; }
    const page = Number(url.searchParams.get('page'));
    if (url.pathname === '/api/v1/user/repos') { response.end(JSON.stringify(page === 1 ? [{ ...rawRepositories[0], ...(invalidName ? { name: '../escape' } : {}) }] : page === 2 ? [rawRepositories[1]] : [])); return; }
    if (url.pathname === '/api/v1/repos/search') { response.end(JSON.stringify({ ok: true, data: url.searchParams.get('mode') === 'fork' && page === 1 ? [rawRepositories[2]] : [] })); return; }
    response.writeHead(404); response.end('{}'); return;
  }
  const authorization = request.headers.authorization;
  const basic = authorization?.startsWith('Basic ') ? Buffer.from(authorization.slice(6), 'base64').toString() : '';
  const login = Object.keys(tokens).find(name => basic === name + ':' + tokens[name]);
  if (!login) { response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Gitea"' }); response.end(); return; }
  gitUsers.push(login);
  // Dugite ships the client, not Git's optional CGI server. The fixture server
  // uses host Git; every application-side operation still uses packaged Git.
  const child = spawn('git', ['http-backend'], { env: { ...env, GIT_PROJECT_ROOT: join(fixture, 'remotes'), GIT_HTTP_EXPORT_ALL: '1', PATH_INFO: url.pathname, QUERY_STRING: url.search.slice(1), REQUEST_METHOD: request.method, CONTENT_TYPE: request.headers['content-type'] || '', CONTENT_LENGTH: request.headers['content-length'] || '', REMOTE_USER: login, HTTP_GIT_PROTOCOL: request.headers['git-protocol'] || '' }, stdio: ['pipe', 'pipe', 'pipe'] });
  request.pipe(child.stdin);
  const chunks = [], errors = [];
  child.stdout.on('data', chunk => chunks.push(chunk)); child.stderr.on('data', chunk => errors.push(chunk));
  child.on('error', error => { response.writeHead(500); response.end(error.message); });
  child.on('close', code => {
    const result = Buffer.concat(chunks), end = result.indexOf('\r\n\r\n');
    if (code !== 0 || end < 0) { backendErrors.push({ code, error: Buffer.concat(errors).toString() }); response.writeHead(500); response.end('fixture Git HTTP backend failed'); return; }
    const headers = {};
    let status = 200;
    for (const line of result.subarray(0, end).toString().split('\r\n')) {
      const colon = line.indexOf(':'); if (colon < 0) continue;
      const key = line.slice(0, colon), value = line.slice(colon + 1).trim();
      if (key.toLowerCase() === 'status') status = Number(value.split(' ')[0]); else headers[key] = value;
    }
    response.writeHead(status, headers); response.end(result.subarray(end + 4));
  });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const host = 'http://127.0.0.1:' + server.address().port;
const executablePath = packaged ? join(resolve(packaged), 'Contents/MacOS', JSON.parse(readFileSync(join(appRoot, 'package.json'), 'utf8')).productName) : join(root, 'desktop/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const launch = () => _electron.launch({ executablePath, cwd: fixture, args: ['--user-data-dir=' + join(fixture, 'profile'), ...(packaged ? [] : [appRoot])], env, timeout: 60_000 });
const report = { ok: false, build, fixture, checks: [], screenshots: [], unverified: ['real GitHub/GitHub Enterprise OAuth consent', 'real Gitea server and user token', 'Windows runtime'] };
let app, page, frame;
const pageErrors = [];
const attach = async () => { page = await app.firstWindow(); page.on('pageerror', error => pageErrors.push(error.message)); await page.waitForFunction(() => window.__gittogetherAdapter); frame = page.frameLocator('#gittogether-ui'); await frame.getByRole('button', { name: '设置', exact: true }).waitFor(); };
const call = (method, input) => page.evaluate(({ method, input }) => window.__gittogetherAdapter.handle(method, input), { method, input });
const capture = async name => { await page.screenshot({ path: join(output, name + '.png') }); report.screenshots.push(name + '.png'); };
const themeParity = async expected => {
  await page.waitForFunction(expected => {
    const iframe = document.querySelector('#gittogether-ui');
    const root = document.documentElement, child = iframe?.contentDocument?.documentElement;
    return child && root.dataset.theme === child.dataset.theme && (!expected || root.dataset.theme === expected) && getComputedStyle(root).getPropertyValue('--content') === iframe.contentWindow.getComputedStyle(child).getPropertyValue('--content');
  }, expected, { timeout: 15_000 });
};
try {
  app = await launch(); await attach();
  await themeParity();
  await frame.getByRole('button', { name: '设置', exact: true }).click();
  const section = frame.locator('.desktop-accounts');
  assert.equal(await section.getByRole('group', { name: '账号列表' }).count(), 0);
  assert.equal(requests.length, 0); await capture('empty-accounts');
  await section.getByRole('button', { name: '添加账号', exact: true }).click();
  assert.equal(await section.getByRole('tab').count(), 3); await capture('github-draft');
  await section.getByRole('tab', { name: 'GitHub', exact: true }).press('ArrowRight');
  assert.equal(await section.getByRole('tab', { name: 'GitHub Enterprise', exact: true }).getAttribute('aria-selected'), 'true');
  await section.getByLabel('GitHub Enterprise 域名', { exact: true }).fill('https://github.example.invalid'); await capture('enterprise-draft');
  await section.getByRole('tab', { name: 'Gitea', exact: true }).click();
  await section.getByLabel('Gitea 服务器地址').fill(tlsHost);
  await section.getByLabel('访问令牌', { exact: true }).fill('fixture-untrusted');
  await section.getByRole('button', { name: '连接账号', exact: true }).click();
  const certificateDialog = page.locator('dialog[data-gittogether-surface="UntrustedCertificate"]');
  await certificateDialog.waitFor(); await capture('gitea-untrusted-certificate');
  await certificateDialog.getByRole('button', { name: '取消', exact: true }).click();
  await section.getByRole('alert').filter({ hasText: '无法安全连接 Gitea' }).waitFor();
  assert.equal(await section.getByLabel('访问令牌', { exact: true }).inputValue(), 'fixture-untrusted');
  assert.equal((await call('catalog', {})).accounts.length, 0);
  assert.equal(tlsRequests, 0);
  report.checks.push('Untrusted HTTPS enters the original certificate-error controller and the Material certificate dialog. TLS is rejected before any HTTP request or token is sent; Chinese error text and draft inputs remain, without changing system trust.');
  await section.getByLabel('Gitea 服务器地址').fill(host);
  await section.getByLabel('访问令牌', { exact: true }).fill('invalid-fixture');
  await section.getByRole('button', { name: '连接账号', exact: true }).click();
  await section.getByRole('alert').filter({ hasText: '拒绝访问' }).waitFor();
  assert.equal(await section.getByLabel('访问令牌', { exact: true }).inputValue(), 'invalid-fixture');
  assert.equal((await call('catalog', {})).accounts.length, 0); await capture('gitea-rejected');
  await section.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(await section.getByRole('group', { name: '账号列表' }).count(), 0);
  report.checks.push('Empty account lists contain no provider placeholders; Add creates exactly one three-tab draft; keyboard selection, failure retention and cancel work.');
  await assert.rejects(call('connect', { provider: 'gitea', host, token: 'fixture-redirect', name: '' }), /重定向/);
  assert.equal(redirectHits, 0);
  await assert.rejects(call('connect', { provider: 'gitea', host, token: 'fixture-oversized', name: '' }), /数据过大/);
  await section.getByRole('button', { name: '添加账号', exact: true }).click();
  await section.getByRole('tab', { name: 'Gitea', exact: true }).click();
  await section.getByLabel('Gitea 服务器地址').fill(host);
  await section.getByLabel('账号名称（选填）').fill('个人 Gitea');
  await section.getByLabel('访问令牌', { exact: true }).fill(tokens.alice); await capture('gitea-draft');
  await section.getByRole('button', { name: '连接账号', exact: true }).click();
  await section.getByText('个人 Gitea', { exact: true }).waitFor();
  assert.equal(await section.getByRole('tablist').count(), 0);
  let catalog = await call('catalog', {});
  assert.equal(catalog.accounts.length, 1); assert.equal(catalog.repositories.length, 3);
  assert.equal(catalog.repositories.find(r => r.fullName === 'team/project').defaultBranch, 'trunk');
  assert.equal(catalog.repositories.find(r => r.fullName === 'alice/work').private, true);
  assert.ok(requests.some(r => r.path.endsWith('/user/repos') && r.query.includes('page=2')));
  assert.ok(requests.some(r => r.fetchMode === 'cors'), 'API requests must use the Chromium network stack.');
  assert.ok(requests.some(r => r.query.includes('mode=collaborative')));
  assert.ok(!JSON.stringify(catalog).includes(tokens.alice));
  assert.ok(!readFileSync(join(fixture, 'profile/gitea-accounts.json'), 'utf8').includes(tokens.alice));
  await capture('connected-account');
  report.checks.push('Gitea validates the user, reads all capped pages plus fork/collaborative directories, preserves privacy and keeps tokens out of the catalog and JSON state; redirects do not forward tokens.');
  await page.evaluate(type => window.__gittogetherAdapter.dispatcher.showPopup({ type }), enums.PopupType.Preferences);
  const preferences = page.locator('#preferences');
  await preferences.getByRole('button', { name: '添加账号', exact: true }).click();
  await preferences.getByRole('tab', { name: 'Gitea', exact: true }).click();
  await preferences.getByLabel('Gitea 服务器地址').fill(host);
  await preferences.getByLabel('账号名称（选填）').fill('第二个 Gitea');
  await preferences.getByLabel('访问令牌', { exact: true }).fill(tokens.bob);
  await preferences.getByLabel('访问令牌', { exact: true }).press('Enter');
  await preferences.getByText('第二个 Gitea', { exact: true }).waitFor();
  assert.equal(await preferences.getByRole('form', { name: '添加账号' }).count(), 0);
  assert.equal(await preferences.isVisible(), true); await capture('native-preferences-accounts');
  await preferences.getByRole('button', { name: '取消', exact: true }).last().click();
  catalog = await call('catalog', {});
  assert.equal(catalog.accounts.length, 2); assert.equal(catalog.repositories.length, 6);
  report.checks.push('The native Preferences account tab uses the same draft design, connects a second account on the same server and handles Enter without saving or dismissing Preferences.');
  const aliceId = catalog.accounts.find(a => a.login === 'alice').id, bobId = catalog.accounts.find(a => a.login === 'bob').id;
  failedDirectory = true; const failed = await call('refresh', { accountId: aliceId });
  assert.ok(failed.accounts.find(a => a.id === aliceId).error); assert.equal(failed.repositories.length, 6);
  failedDirectory = false; await call('refresh', { accountId: aliceId });
  invalidName = true;
  const rejectedName = await call('refresh', { accountId: bobId });
  assert.match(rejectedName.accounts.find(a => a.id === bobId).error, /仓库名称/);
  assert.equal(rejectedName.repositories.length, 6);
  invalidName = false; await call('refresh', { accountId: bobId });
  await app.close(); app = await launch(); await attach();
  catalog = await call('catalog', {}); assert.equal(catalog.accounts.length, 2); assert.equal(catalog.repositories.length, 6);
  const remote = catalog.repositories.find(r => r.accountId === bobId && r.fullName === 'alice/work');
  const downloads = join(fixture, 'downloads'); mkdirSync(downloads);
  await call('downloadBranch', { repositoryId: remote.id, parentPath: downloads, folderName: 'main', branch: 'main' });
  const local = join(downloads, remote.name, 'main');
  const linked = await call('catalog', {});
  assert.equal(linked.links.find(l => l.repositoryId === remote.id)?.path, local);
  assert.match(git(['remote', 'get-url', 'origin'], local), /bob@127\.0\.0\.1/);
  assert.ok(gitUsers.includes('bob'));
  await call('localWorkspace', { repositoryId: remote.id });
  writeFileSync(join(local, 'readme.txt'), 'through original Gitea credential helper\n');
  const changed = await page.evaluate(async id => { const a = window.__gittogetherAdapter; await a.dispatcher.refreshRepository(await a.repository(id)); return a.workspace(id); }, remote.id);
  const task = changed.tasks[0];
  const commit = await call('submitCommit', { repositoryId: remote.id, taskId: task.id, expectedHead: task.head, changeKey: task.changeKey, summary: 'Gitea fixture commit', description: '', operationId: crypto.randomUUID() });
  await call('pushCommit', { repositoryId: remote.id, taskId: task.id, expectedHead: commit.commitId, commitId: commit.commitId, operationId: crypto.randomUUID() });
  assert.equal(git(['rev-parse', 'refs/heads/main'], origin), commit.commitId);
  report.checks.push('Accounts survive restart; failed refresh preserves the previous directory. A private HTTP repository clones and pushes through the original Git engine and original generic credential helper using the selected same-host account.');
  await frame.getByRole('button', { name: '设置', exact: true }).click(); await capture('two-accounts');
  await frame.locator('body').evaluate(() => window.gittogether.setTheme('dark')); await themeParity('dark'); await capture('accounts-dark');
  await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.setMinimumSize(600, 500); window.setSize(800, 700); }); await capture('accounts-dark-800');
  const entries = frame.locator('.desktop-accounts .account-settings-entry');
  await entries.filter({ hasText: '个人 Gitea' }).getByRole('button', { name: '退出登录', exact: true }).click();
  await entries.filter({ hasText: '个人 Gitea' }).waitFor({ state: 'hidden' });
  await entries.filter({ hasText: '第二个 Gitea' }).getByRole('button', { name: '退出登录', exact: true }).click();
  await entries.filter({ hasText: '第二个 Gitea' }).waitFor({ state: 'hidden' });
  assert.equal(await frame.locator('.desktop-accounts').getByRole('group', { name: '账号列表' }).count(), 0);
  assert.equal((await call('catalog', {})).accounts.filter(a => a.provider === 'gitea').length, 0);
  assert.equal(git(['rev-parse', 'HEAD'], local), commit.commitId);
  await frame.locator('body').evaluate(() => window.gittogether.setTheme('light')); await themeParity('light');
  await frame.locator('body').evaluate(() => window.gittogether.setTheme('system')); await themeParity();
  assert.deepEqual(pageErrors, []);
  report.checks.push('Both accounts can be removed without deleting the local repository. Native and main UI palettes agree for system, light and dark themes; 800px layouts render without page errors.');
  report.ok = true;
} catch (error) {
  if (page) await page.screenshot({ path: join(output, 'failure.png') });
  report.error = error.stack; throw error;
} finally {
  if (page && !page.isClosed()) {
    const ids = await call('catalog', {}).then(c => c.accounts.filter(a => a.provider === 'gitea').map(a => a.id));
    for (const id of ids) await call('removeAccount', { accountId: id });
  }
  if (app) await app.close();
  server.closeAllConnections(); trap.closeAllConnections(); tlsServer.closeAllConnections();
  await new Promise(resolve => server.close(resolve)); await new Promise(resolve => trap.close(resolve)); await new Promise(resolve => tlsServer.close(resolve));
  writeFileSync(join(output, 'report.json'), JSON.stringify({ ...report, requests, gitUsers, backendErrors, pageErrors, tlsRequests, tlsFailures }, null, 2));
}
console.log(JSON.stringify(report, null, 2));
