// Run in an isolated Electron window against the production-built browser App.
// Synthetic account, real temporary Git, no installed-app profile or credentials.
import { app, BrowserWindow, nativeTheme } from 'electron';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { createRemoteServiceFixture } from './remote-service-fixture';
import { importMiddleware } from '../server/http-api';
import { isCatalog } from '../src/import-model';

async function run() {
const evidence = dirname(process.argv[1]);
await writeFile(join(evidence, 'stage.txt'), 'Starting isolated UI\n');
const profile = await mkdtemp(join(tmpdir(), 'gittogether-read-badges-profile-'));
app.setPath('userData', profile);
await app.whenReady();
// The default Electron launcher otherwise quits during finally before errors
// and cleanup can be reported. This is a disposable test process only.
app.removeAllListeners('window-all-closed');
app.on('window-all-closed', () => {});
await writeFile(join(evidence, 'stage.txt'), 'App ready\n');
const fixture = await createRemoteServiceFixture('gitea');
const catalog = await fixture.service.handle('catalog', {}); assert.ok(isCatalog(catalog));
await fixture.git(fixture.directory, ['remote', 'add', 'origin', catalog.repositories[0].url]);
await fixture.service.handle('link', { repositoryId: fixture.repositoryId, path: fixture.directory, branch: 'main' });
const middleware = importMiddleware(fixture.service); const root = resolve('dist/client');
let release: (() => void) | undefined; let hold = false; let failed = false; let localFailed = false;
const server = createServer((request, response) => { void (async () => {
  if (hold && request.url === '/api/import/remoteWorkspace') { hold = false; await new Promise<void>(done => { release = done; }); }
  if (request.url === '/api/import/remoteWorkspace') fixture.fail(failed ? 503 : 0);
  if (localFailed && request.url === '/api/import/localWorkspace') { response.statusCode = 503; response.end(); return; }
  await middleware(request, response, () => { void (async () => {
    const path = resolve(root, `.${decodeURIComponent(request.url === '/' ? '/index.html' : request.url || '/')}`);
    if (!path.startsWith(`${root}${sep}`)) { response.statusCode = 403; response.end(); return; }
    response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' } as Record<string, string>)[extname(path)] || 'application/octet-stream');
    response.end(await readFile(path));
  })().catch(() => { response.statusCode = 404; response.end(); }); });
})().catch(() => { response.statusCode = 500; response.end(); }); });
await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
const address = server.address(); assert.ok(address && typeof address !== 'string');
const window = new BrowserWindow({ show: true, title: 'GitTogether · 隔离角标验证', width: 1400, height: 850, webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
const evaluate = (source: string) => window.webContents.executeJavaScript(source);
const failures: string[] = [];
window.webContents.on('console-message', details => { if (details.level === 'error') failures.push(details.message); });
async function wait(source: string) {
  const until = Date.now() + 10_000;
  while (Date.now() < until) { if (await evaluate(source)) return; await new Promise(done => setTimeout(done, 50)); }
  await writeFile(join(evidence, 'timeout.json'), JSON.stringify({ source, labels: await evaluate(`[...document.querySelectorAll('.git-action-anchor')].map(el => el.getAttribute('aria-label'))`), failures }));
  throw new Error(`Isolated UI condition timed out: ${source}`);
}
const state = () => evaluate(`JSON.parse(JSON.stringify([...document.querySelector('.repository-actions').children].map(el => ({label: el.getAttribute('aria-label').split('：')[0], count: el.querySelector('.git-action-badge')?.textContent ?? null, status: el.querySelector('.git-action-read-badge')?.classList.contains('reading') ? 'reading' : el.querySelector('.git-action-read-badge') ? 'error' : null}))))`);
const wake = () => evaluate(`{const now=Date.now; Date.now=()=>now()+360000; window.dispatchEvent(new Event('focus'));}`);
try {
  nativeTheme.themeSource = 'light';
  await window.loadURL(`http://127.0.0.1:${address.port}/`);
  await writeFile(join(evidence, 'stage.txt'), 'Production App loaded\n');
  await wait(`!!document.querySelector('.repository-actions .git-action-badge.good') && !document.querySelector('.git-action-read-badge')`);
  const initial = await state();
  const counts = (items: typeof initial) => items.map((item: { count: string | null }) => item.count);
  hold = true; await wake();
  await wait(`!!document.querySelector('.git-action-read-badge.reading') && !document.querySelector('.repository-actions').firstElementChild.querySelector('.git-action-read-badge')`);
  assert.deepEqual(counts(await state()), counts(initial));
  assert.equal((await state())[0].status, null, 'remote waiting does not affect Commit');
  const light = await evaluate(`({width: getComputedStyle(document.querySelector('.git-action-anchor')).width, readSize: getComputedStyle(document.querySelector('.git-action-read-badge')).width, animation: getComputedStyle(document.querySelector('.git-action-read-spinner')).animationName, numeric: getComputedStyle(document.querySelector('.git-action-badge')).backgroundColor})`);
  assert.equal(light.width, '28px'); assert.equal(light.readSize, '12px'); assert.equal(light.animation, 'git-action-reading');
  await writeFile(join(evidence, 'reading-light.png'), (await window.webContents.capturePage()).toPNG());
  failed = true; assert.ok(release); release(); release = undefined;
  await wait(`!!document.querySelector('.git-action-read-badge.error') && !document.querySelector('.git-action-read-badge.reading')`);
  assert.deepEqual(counts(await state()), counts(initial));
  assert.equal((await state())[0].status, null);
  nativeTheme.themeSource = 'dark';
  await wait(`matchMedia('(prefers-color-scheme: dark)').matches`);
  const dark = await evaluate(`({error: getComputedStyle(document.querySelector('.git-action-read-badge.error')).backgroundColor, badge: document.querySelector('.git-action-read-badge.error').textContent})`);
  assert.equal(dark.badge, '!');
  await writeFile(join(evidence, 'error-dark.png'), (await window.webContents.capturePage()).toPNG());
  await window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  hold = true; failed = false; await wake();
  await wait(`!!document.querySelector('.git-action-read-spinner')`);
  const reducedMotion = await evaluate(`getComputedStyle(document.querySelector('.git-action-read-spinner')).animationName`);
  assert.equal(reducedMotion, 'none'); assert.ok(release); release(); release = undefined;
  await window.webContents.debugger.detach();
  failed = false;
  await wait(`!document.querySelector('.git-action-read-badge')`);
  assert.deepEqual(counts(await state()), counts(initial));
  localFailed = true; await wake();
  await wait(`document.querySelector('.repository-actions').firstElementChild.querySelector('.git-action-read-badge.error') !== null && !document.querySelector('.repository-actions').children[1].querySelector('.git-action-read-badge')`);
  assert.deepEqual(counts(await state()), counts(initial));
  assert.equal((await state())[1].status, null, 'local failure does not affect Fetch');
  localFailed = false; await wake();
  await wait(`!document.querySelector('.git-action-read-badge')`);
  assert.deepEqual(counts(await state()), counts(initial));
  assert.deepEqual(failures, []);
  const result = { productionUI: true, fixtureOnly: true, counts: counts(initial), refreshFailureRecoveryStable: true, dependencyIsolation: true, light, dark, reducedMotion, consoleErrors: 0, gitUnchanged: await fixture.unchanged() };
  await writeFile(join(evidence, 'result.json'), JSON.stringify(result));
  console.log(JSON.stringify(result));
} finally {
  release?.(); window.destroy(); server.closeAllConnections(); await new Promise<void>(done => server.close(() => done()));
  await fixture.cleanup(); await rm(profile, { recursive: true, force: true });
}
}
void run().then(() => app.quit()).catch(async problem => {
  await writeFile(join(dirname(process.argv[1]), 'failure.json'), JSON.stringify({ message: String(problem), stack: problem instanceof Error ? problem.stack : undefined }));
  console.error(problem); app.exit(1);
});
