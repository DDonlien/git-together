import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, stat, writeFile, mkdir, symlink, rename, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { EventEmitter } from 'node:events';
import { LocalDiagnostics, traceOperation } from '../server/diagnostics';
import { diagnosticsMiddleware } from '../server/diagnostics-http';
import { diagnosticsCommand } from '../server/diagnostics-command';
import { diagnosticCode, diagnosticFailure, rendererDiagnostic, sanitizeDiagnostic, type DiagnosticRecord } from '../src/diagnostics-model';
import { createRemoteServiceFixture } from './remote-service-fixture';
import { readLocalGit } from '../server/repository-reader';
import { AppUpdater, type UpdateEngine } from '../electron/app-updater';
import { createAutoRefresh } from '../src/auto-refresh';

const hour = 3_600_000;
const base = Date.UTC(2026, 9, 9);
const secret = 'SECRET_TOKEN_PASSWORD_PRIVATE_PATH_PAYLOAD';
async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'gittogether-diagnostics-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
async function records(directory: string): Promise<DiagnosticRecord[]> {
  const files = (await readdir(directory)).filter(name => name.endsWith('.jsonl')).sort();
  return (await Promise.all(files.map(name => readFile(join(directory, name), 'utf8')))).flatMap(text => text.trim().split('\n').filter(Boolean).map(line => JSON.parse(line)));
}

test('copy uses only retained regular logger files and reports actual system success or failure', async t => {
  const directory = await fixture(t);
  const log = new LocalDiagnostics(directory, 'test', { now: () => base, timer: false }); t.after(() => log.close());
  await assert.rejects(diagnosticsCommand(log, 'copy', {}, async () => {}, async () => {}), /暂无可复制/);
  log.record({ event: 'lifecycle', outcome: 'start' });
  const [file] = log.files(); assert.ok(file);
  await writeFile(join(directory, 'user-data.txt'), secret);
  const alias = join(directory, `diagnostics-${base}-test-${randomUUID()}.jsonl`);
  await symlink(file, alias);
  let copied: string[] = [];
  const count = await diagnosticsCommand(log, 'copy', { path: '/untrusted/path' }, async () => {}, async files => { copied = files; });
  assert.equal(count, 1); assert.deepEqual(copied, [file]);
  assert.equal(await readFile(join(directory, 'user-data.txt'), 'utf8'), secret);
  await assert.rejects(diagnosticsCommand(log, 'copy', {}, async () => {}, async () => { throw new Error('Fixture clipboard failed'); }), /clipboard failed/);
  const script = await readFile(new URL('../server/system-clipboard.ts', import.meta.url), 'utf8');
  assert.match(script, /NSURL.fileURLWithPath\(path\)/); assert.match(script, /NSPasteboard.generalPasteboard/);
  assert.match(script, /writeObjects/); assert.match(script, /timeout: 4000/);
});

test('finite diagnostic fields strip secrets, raw errors, URLs, bodies and untrusted server spans', () => {
  const clean = sanitizeDiagnostic({ event: 'api', outcome: 'failure', method: 'remoteWorkspace', code: secret, message: secret, stack: secret, path: secret, token: secret, url: secret, input: { secret }, response: secret, httpStatus: 503, durationMs: 23, requestId: randomUUID(), resource: secret, tasks: -1 });
  assert.ok(clean); assert.equal(clean.httpStatus, 503); assert.equal(clean.durationMs, 23);
  assert.ok(!JSON.stringify(clean).includes(secret)); assert.ok(!('tasks' in clean));
  assert.equal(sanitizeDiagnostic({ event: secret, outcome: 'failure' }), null);
  assert.equal(rendererDiagnostic({ event: 'storage', outcome: 'failure' }), null);
  const renderer = rendererDiagnostic({ event: 'api', outcome: 'failure', resource: 'a'.repeat(24), spanId: randomUUID(), parentId: randomUUID() });
  assert.deepEqual(renderer, { event: 'api', outcome: 'failure' });
  assert.equal(diagnosticCode(Object.assign(new Error(secret), { code: secret })), 'unknown');
  assert.equal(diagnosticCode(Object.assign(new Error(secret), { cause: { code: 'ECONNRESET', token: secret } })), 'ECONNRESET');
  assert.deepEqual(diagnosticFailure(Object.assign(new TypeError(secret), { status: 503, code: 128, signal: 'SIGKILL' })), { code: 'unknown', httpStatus: 503, exitCode: 128, signal: 'SIGKILL', errorKind: 'TypeError' });
});

test('24-hour rolling boundary retains exact cutoff, prunes older rows and cleans cold startup', async t => {
  const directory = await fixture(t); let now = base;
  const log = new LocalDiagnostics(directory, 'test', { now: () => now, timer: false }); t.after(() => log.close());
  log.record({ event: 'api', outcome: 'start', method: 'status' });
  now += 10 * 60_000; log.record({ event: 'api', outcome: 'success', method: 'status' });
  now = base + 24 * hour + 10 * 60_000; log.status();
  assert.deepEqual((await records(directory)).map(row => row.time), [new Date(base + 10 * 60_000).toISOString()]);
  await writeFile(join(directory, 'user-data.txt'), secret);
  now += 1;
  const next = new LocalDiagnostics(directory, 'test', { now: () => now, timer: false }); t.after(() => next.close());
  assert.equal((await records(directory)).length, 0);
  assert.equal(await readFile(join(directory, 'user-data.txt'), 'utf8'), secret);
  next.record({ event: 'lifecycle', outcome: 'start' });
  now += 25 * hour; next.status(); assert.equal((await records(directory)).length, 0);
});

test('files are private, salted identities cannot expose names, and each session owns a distinct file', async t => {
  const directory = join(await fixture(t), 'logs');
  const a = new LocalDiagnostics(directory, 'app', { now: () => base, timer: false });
  const b = new LocalDiagnostics(directory, 'authorization', { now: () => base, timer: false }); t.after(() => { a.close(); b.close(); });
  assert.equal(a.key(secret), a.key(secret)); assert.notEqual(a.key(secret), b.key(secret));
  a.record({ event: 'api', outcome: 'start', resource: a.key(secret) }); b.record({ event: 'authorization', outcome: 'received' });
  assert.equal((await readdir(directory)).length, 2);
  assert.equal((await stat(directory)).mode & 0o777, 0o700);
  for (const file of await readdir(directory)) assert.equal((await stat(join(directory, file))).mode & 0o777, 0o600);
  assert.ok(!JSON.stringify(await records(directory)).includes(secret));
});

test('minute maintenance removes expired logs without a new request or status read', async t => {
  const directory = await fixture(t); let now = base;
  t.mock.timers.enable({ apis: ['setInterval'] });
  const log = new LocalDiagnostics(directory, 'test', { now: () => now }); t.after(() => log.close());
  log.record({ event: 'lifecycle', outcome: 'start' }); assert.equal((await records(directory)).length, 1);
  now += 25 * hour; t.mock.timers.tick(60_000); assert.equal((await records(directory)).length, 0);
});

test('two independent processes do not interleave or lose rows in shared directory', async t => {
  const directory = join(await fixture(t), 'logs');
  const script = "import { LocalDiagnostics } from './server/diagnostics.ts'; const log = new LocalDiagnostics(process.env.GT_DIAGNOSTICS_TEST_DIR, 'test', {timer:false}); for(let i=0;i<100;i++)log.record({event:'api',outcome:'success',tasks:i});log.close();";
  await Promise.all([1, 2].map(() => promisify(execFile)(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], { env: { ...process.env, GT_DIAGNOSTICS_TEST_DIR: directory } })));
  const rows = await records(directory); assert.equal(rows.length, 200); assert.equal(new Set(rows.map(row => row.session)).size, 2);
});

test('write failure is visible without changing application result and recovery clears it', async t => {
  const root = await fixture(t); const directory = join(root, 'logs'); await writeFile(directory, secret);
  const log = new LocalDiagnostics(directory, 'test', { timer: false }); t.after(() => log.close());
  assert.equal(await log.run('api', { method: 'catalog' }, async () => 42), 42);
  assert.match(log.status().error, /写入失败.*EEXIST/); assert.ok(!log.status().error.includes(secret));
  const problem = new Error(secret); await assert.rejects(log.run('api', {}, async () => { throw problem; }), error => error === problem);
  await rename(directory, join(root, 'original-data')); await mkdir(directory);
  log.record({ event: 'api', outcome: 'success' }); assert.equal(log.status().error, '');
  assert.equal(await readFile(join(root, 'original-data'), 'utf8'), secret);
});

test('pruning refuses symlink targets, reports failures and respects storage cap', async t => {
  const root = await fixture(t); const directory = join(root, 'logs');
  const log = new LocalDiagnostics(directory, 'test', { now: () => base, timer: false, maxBytes: 1500 }); t.after(() => log.close());
  await writeFile(join(directory, 'keep.txt'), secret);
  const outside = join(root, 'outside'); await writeFile(outside, secret);
  await symlink(outside, join(directory, `diagnostics-${base - 30 * hour}-test-${randomUUID()}.jsonl`));
  for (let i = 0; i < 50; i++) log.record({ event: 'api', outcome: 'success', tasks: i });
  const status = log.status(); assert.equal(status.limited, true); assert.equal(status.error, '');
  const ownFiles = (await readdir(directory)).filter(name => name.endsWith('.jsonl'));
  let size = 0; for (const name of ownFiles) { const info = await import('node:fs/promises').then(fs => fs.lstat(join(directory, name))); if (!info.isSymbolicLink()) size += info.size; }
  assert.ok(size <= 1500); assert.equal(await readFile(outside, 'utf8'), secret); assert.equal(await readFile(join(directory, 'keep.txt'), 'utf8'), secret);
  const linkDirectory = join(root, 'linked-logs'); await symlink(directory, linkDirectory);
  const refused = new LocalDiagnostics(linkDirectory, 'test', { timer: false }); t.after(() => refused.close());
  assert.match(refused.status().error, /清理失败.*ELOOP/);
});

test('nested operations retain request/span correlation, duration and safe numeric status', async t => {
  const directory = await fixture(t); const log = new LocalDiagnostics(directory, 'test', { timer: false }); t.after(() => log.close());
  const requestId = randomUUID();
  await assert.rejects(log.run('api', { method: 'remoteWorkspace' }, () => traceOperation('provider-read', { provider: 'gitea', endpoint: 'tree' }, async () => { throw Object.assign(new Error(secret), { status: 503 }); }), requestId));
  const rows = await records(directory); assert.equal(rows.length, 4); assert.ok(rows.every(row => row.requestId === requestId));
  const root = rows[0], child = rows[1]; assert.equal(child.parentId, root.spanId);
  assert.equal(rows[2].httpStatus, 503); assert.ok(Number.isInteger(rows[2].durationMs));
  assert.ok(!JSON.stringify(rows).includes(secret));
});

test('abandoned boundary copies are removed without touching current rewrites or unrelated files', async t => {
  const directory = await fixture(t); const now = Date.now(); const start = Math.floor(now / hour) * hour;
  const log = new LocalDiagnostics(directory, 'test', { now: () => now, timer: false }); t.after(() => log.close());
  const copy = () => `diagnostics-${start}-test-${randomUUID()}.jsonl.${randomUUID()}.tmp`;
  const old = copy(), fresh = copy(); await writeFile(join(directory, old), secret); await writeFile(join(directory, fresh), secret);
  await utimes(join(directory, old), new Date(now - 600_000), new Date(now - 600_000));
  await writeFile(join(directory, 'unrelated.tmp'), secret); log.status();
  assert.ok(!(await readdir(directory)).includes(old)); assert.equal(await readFile(join(directory, fresh), 'utf8'), secret);
  assert.equal(await readFile(join(directory, 'unrelated.tmp'), 'utf8'), secret);
});

test('real temporary Git/provider reads produce failures, partial outcomes and recovery without raw credentials', async t => {
  const directory = await fixture(t); const log = new LocalDiagnostics(directory, 'test', { timer: false }); t.after(() => log.close());
  const remote = await createRemoteServiceFixture('gitea', { diagnostics: log }); t.after(remote.cleanup);
  remote.fail(503, url => url.pathname.includes('/git/trees/'));
  const partial = await remote.service.handle('remoteWorkspace', { repositoryId: remote.repositoryId });
  assert.ok(partial && typeof partial === 'object' && 'complete' in partial && partial.complete === false);
  const requestId = randomUUID(); remote.fail(503);
  await assert.rejects(remote.service.handle('remoteWorkspace', { repositoryId: remote.repositoryId }, undefined, requestId));
  remote.fail(0); await remote.service.handle('remoteWorkspace', { repositoryId: remote.repositoryId });
  await assert.rejects(log.run('api', { method: 'localWorkspace' }, () => readLocalGit(join(directory, 'not-a-git-directory'), ['status'])));
  const rows = await records(directory);
  assert.ok(rows.some(row => row.event === 'provider-read' && row.httpStatus === 503 && row.requestId === requestId));
  assert.ok(rows.some(row => row.event === 'api' && row.method === 'remoteWorkspace' && row.outcome === 'success'));
  assert.ok(rows.some(row => row.event === 'api' && row.method === 'remoteWorkspace' && row.outcome === 'partial' && row.tasks! > 0));
  assert.ok(rows.some(row => row.event === 'git-read' && row.outcome === 'failure' && row.verb === 'status' && row.exitCode === 128));
  const text = JSON.stringify(rows); for (const forbidden of ['fixture-remote-old', 'provider diagnostic and credentials', 'git.fixture.test', remote.repositoryId, remote.accountId, directory]) assert.ok(!text.includes(forbidden));
});

test('loopback diagnostics API rejects foreign/malformed requests and opens only fixed directory', async t => {
  const directory = await fixture(t); const log = new LocalDiagnostics(directory, 'test', { timer: false }); t.after(() => log.close());
  const opened: string[] = []; const middleware = diagnosticsMiddleware(log, async path => { opened.push(path); });
  const server = createServer((req, res) => { void middleware(req, res, () => { res.statusCode = 404; res.end(); }); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  const call = (method: string, body: unknown = {}, headers: Record<string, string> = {}) => fetch(`${origin}/api/diagnostics/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GitTogether-Client': '1', ...headers }, body: JSON.stringify(body) });
  assert.equal((await call('status', {}, { Origin: 'https://evil.test' })).status, 403);
  assert.equal((await call('status', {}, { 'X-GitTogether-Client': '' })).status, 403);
  assert.equal((await call('record', { event: 'storage', outcome: 'failure' })).status, 400);
  assert.equal((await call('record', { event: 'api', outcome: 'failure', token: secret, message: secret })).status, 200);
  assert.equal((await call('record', { message: secret.repeat(100) })).status, 413);
  assert.equal((await call('unsupported')).status, 404);
  assert.equal((await call('open', { path: secret })).status, 200); assert.deepEqual(opened, [directory]);
  const status = await (await call('status')).json(); assert.equal(status.value.retentionHours, 24); assert.equal(status.value.error, '');
  assert.ok(!JSON.stringify(await records(directory)).includes(secret));
});

test('updater records user operation, phase, safe failure and blocked install without raw errors', async t => {
  const directory = await fixture(t); const log = new LocalDiagnostics(directory, 'test', { timer: false }); t.after(() => log.close());
  const engine = Object.assign(new EventEmitter(), { autoDownload: false, autoInstallOnAppQuit: false, allowDowngrade: false, allowPrerelease: false, disableDifferentialDownload: false, checkForUpdates: async () => { throw Object.assign(new Error(secret), { code: 'ERR_UPDATER_INVALID_SIGNATURE' }); }, downloadUpdate: async () => {}, quitAndInstall: () => {} }) as UpdateEngine;
  const updater = new AppUpdater(engine, '0.13.0', () => false, log);
  await updater.check(); engine.emit('update-available', { version: secret }); await updater.download(); engine.emit('update-downloaded', { version: secret }); updater.install();
  const rows = await records(directory); assert.ok(rows.some(row => row.event === 'update' && row.code === 'ERR_UPDATER_INVALID_SIGNATURE'));
  assert.ok(rows.some(row => row.outcome === 'blocked' && row.method === 'install')); assert.ok(!JSON.stringify(rows).includes(secret));
});

test('refresh backoff observer records actual failure count/delay but does not count cancellation', async () => {
  let callback: (() => void) | undefined; const retries: number[][] = [];
  const monitor = createAutoRefresh({ intervalMs: 1000, run: async () => { throw new Error(secret); }, onRetry: (failures, retryMs) => retries.push([failures, retryMs]), clock: { now: () => 0, schedule: run => { callback = run; return () => { callback = undefined; }; } } });
  callback!(); await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(retries, [[1, 2000]]); monitor.stop();
  const cancelled = createAutoRefresh({ intervalMs: 1000, run: signal => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')))), onRetry: (failures, retryMs) => retries.push([failures, retryMs]), clock: { now: () => 0, schedule: run => { callback = run; return () => { callback = undefined; }; } } });
  callback!(); cancelled.pause(); await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(retries, [[1, 2000]]); cancelled.stop();
});

test('native bridge is finite, trusted-main-frame guarded and has no caller-controlled log path', async () => {
  const [main, preload] = await Promise.all(['main', 'preload'].map(name => readFile(new URL(`../electron/${name}.ts`, import.meta.url), 'utf8')));
  const handler = main.slice(main.indexOf("ipcMain.handle('gittogether:diagnostics'"), main.indexOf("ipcMain.handle('gittogether:import'"));
  assert.match(handler, /isMainRenderer\(event\)/); assert.match(handler, /diagnosticsCommand\(diagnostics, method, input/); assert.ok(!handler.includes('input.path'));
  const command = await readFile(new URL('../server/diagnostics-command.ts', import.meta.url), 'utf8');
  assert.match(command, /rendererDiagnostic\(input\)/); assert.match(command, /open\(log.directory\)/); assert.ok(!command.includes('input.path'));
  assert.match(preload, /gittogether:diagnostics', 'status'/); assert.match(preload, /gittogether:diagnostics', 'record'/); assert.match(preload, /gittogether:diagnostics', 'open'/);
});
