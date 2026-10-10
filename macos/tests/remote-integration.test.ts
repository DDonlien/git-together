import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { importMiddleware } from '../server/http-api';
import { importAPI } from '../src/import-api';
import { isCatalog } from '../src/import-model';
import { isRemoteWorkspace, isRemoteCommitDetails, isRemoteFileContent } from '../src/remote-repository-model';
import { createRemoteServiceFixture } from './remote-service-fixture';

for (const provider of ['github', 'gitea'] as const) test(`${provider}: actual AccountService → HTTP → client DTO reads Git without a local association`, async t => {
  const fixture = await createRemoteServiceFixture(provider); t.after(fixture.cleanup);
  const middleware = importMiddleware(fixture.service);
  const server = createServer((req, res) => { void middleware(req, res, () => { res.statusCode = 404; res.end(); }); });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  t.after(() => { server.closeAllConnections(); return new Promise<void>(done => server.close(() => done())); });
  const address = server.address(); assert.ok(address && typeof address !== 'string'); const origin = `http://127.0.0.1:${address.port}`;
  const request = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', (input: string, init: RequestInit) => request(new URL(input, origin), { ...init, headers: { ...Object.fromEntries(new Headers(init.headers)), Origin: origin } }));
  const { repositoryId } = fixture;
  const workspace = await importAPI('remoteWorkspace', { repositoryId }); assert.ok(isRemoteWorkspace(workspace));
  assert.equal(workspace.tasks.length, 3); assert.equal(workspace.commits.length, 4); assert.ok(workspace.complete);
  assert.ok(workspace.tasks.every(task => task.path === null && task.remote && task.head && task.tree.length && !task.error));
  assert.equal(workspace.commits.find(commit => commit.summary === 'Merge search task')?.parents.length, 2);
  const main = workspace.tasks.find(task => task.branch === 'main')!;
  const details = await importAPI('remoteCommit', { repositoryId, commitId: main.head }); assert.ok(isRemoteCommitDetails(details));
  assert.match(details.diff, /export const search = true/); assert.ok(details.files.length > 0); assert.equal(details.commit.id, main.head);
  const file = await importAPI('remoteFile', { repositoryId, commitId: main.head, path: 'src/app.ts' }); assert.ok(isRemoteFileContent(file));
  assert.match(file.text, /value = 0/); assert.doesNotMatch(file.text, /value = 10/);
  const literal = await importAPI('remoteFile', { repositoryId, commitId: main.head, path: 'src/:(top)all.ts' }); assert.match(literal.text, /literal = 0/);
  const catalog = await importAPI('catalog', {}); assert.equal(catalog.links.length, 0);
  assert.ok(!JSON.stringify({ workspace, details, file, catalog }).includes('fixture-remote-old'));
  assert.ok(fixture.requests.every(({ url }) => url.origin === (provider === 'github' ? 'https://api.github.com' : 'https://git.fixture.test')));
  assert.equal(await fixture.unchanged(), true);
});

test('remote reads reject URLs, traversal, unapproved repositories and invalid SHAs before provider requests', async t => {
  const fixture = await createRemoteServiceFixture('gitea'); t.after(fixture.cleanup);
  const { service, repositoryId } = fixture; const before = fixture.requests.length;
  await assert.rejects(service.handle('remoteWorkspace', { repositoryId, url: 'https://foreign.test/credentials' }), /仅接受/);
  await assert.rejects(service.handle('remoteWorkspace', { repositoryId: 'unknown' }), /仓库不存在/);
  await assert.rejects(service.handle('remoteCommit', { repositoryId, commitId: 'main' }), /对象标识/);
  for (const path of ['../secret', '/etc/passwd', 'folder/../secret', 'bad\0file']) await assert.rejects(service.handle('remoteFile', { repositoryId, commitId: 'a'.repeat(40), path }), /文件路径/);
  assert.equal(fixture.requests.length, before);
});

test('remote HEAD checks reuse immutable history/tree, invalidate replaced credentials and cannot publish removed accounts', async t => {
  const fixture = await createRemoteServiceFixture('gitea'); t.after(fixture.cleanup);
  const { service, repositoryId, accountId } = fixture;
  const first = await service.handle('remoteWorkspace', { repositoryId }); assert.ok(isRemoteWorkspace(first));
  const before = fixture.calls.length;
  await service.handle('remoteWorkspace', { repositoryId });
  assert.deepEqual(fixture.calls.slice(before).map(path => new URL(path, 'https://fixture.test').pathname), ['/repos/qa/project/branches']);
  const main = first.tasks.find(task => task.branch === 'main')!; const review = first.tasks.find(task => task.branch === 'task/review')!;
  // Simulate another writer moving a ref in our disposable fixture. The app
  // must observe it without fetch/checkout; restore the ref before the guard.
  await fixture.git(fixture.directory, ['update-ref', 'refs/heads/main', review.head, main.head]);
  try {
    const moved = await service.handle('remoteWorkspace', { repositoryId }); assert.ok(isRemoteWorkspace(moved));
    assert.equal(moved.tasks.find(task => task.branch === 'main')?.head, review.head);
    assert.ok(!moved.tasks.find(task => task.branch === 'main')?.tree.includes('src/search.ts'));
  } finally { await fixture.git(fixture.directory, ['update-ref', 'refs/heads/main', main.head, review.head]); }
  assert.equal(await fixture.unchanged(), true);
  await service.handle('updateAccount', { accountId, name: '隔离测试账号', token: 'fixture-remote-new' });
  const updated = fixture.requests.length;
  await service.handle('remoteWorkspace', { repositoryId });
  assert.ok(fixture.requests.slice(updated).length > 1);
  assert.ok(fixture.requests.slice(updated).every(request => request.authorization === 'token fixture-remote-new'));
  let release!: () => void; let started!: () => void;
  const ready = new Promise<void>(done => { started = done; }); const paused = new Promise<void>(done => { release = done; });
  fixture.holdNext(async () => { started(); await paused; });
  const pending = service.handle('remoteWorkspace', { repositoryId });
  const rejected = assert.rejects(pending, /已更新|已移除/);
  await ready; await service.handle('removeAccount', { accountId }); release(); await rejected;
  const catalog = await service.handle('catalog', {}); assert.ok(isCatalog(catalog)); assert.equal(catalog.accounts.length, 0);
  await assert.rejects(service.handle('remoteWorkspace', { repositoryId }), /仓库不存在/);
});

test('provider failure is safe and cancelled reads cannot be published', async t => {
  const fixture = await createRemoteServiceFixture('gitea'); t.after(fixture.cleanup);
  fixture.fail(403);
  await assert.rejects(fixture.service.handle('remoteWorkspace', { repositoryId: fixture.repositoryId }), problem => problem instanceof Error && /读取权限/.test(problem.message) && !/diagnostic|credentials/.test(problem.message));
  fixture.fail(0);
  let release!: () => void; let started!: () => void;
  const ready = new Promise<void>(done => { started = done; }); const paused = new Promise<void>(done => { release = done; });
  fixture.holdNext(async () => { started(); await paused; });
  const cancellation = new AbortController();
  const pending = fixture.service.handle('remoteWorkspace', { repositoryId: fixture.repositoryId }, cancellation.signal);
  const rejected = assert.rejects(pending, problem => problem === cancellation.signal.reason);
  await ready; cancellation.abort(); release(); await rejected;
  assert.equal(await fixture.unchanged(), true);
});

test('production App wires remote workspace and commit reads without the removed file preview or a local-path gate', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /useRemoteRepository\(page === 'repo' \? repository/);
  assert.match(app, /remoteState=\{remote.state\}/); assert.match(app, /readRemoteCommit=\{remote.readCommit\}/); assert.doesNotMatch(app, /readRemoteFile|remote\.readFile/);
  const hook = await readFile(new URL('../src/use-remote-repository.ts', import.meta.url), 'utf8');
  assert.match(hook, /intervalMs: syncIntervals.remote/); assert.match(hook, /!current.current.has\(key\)/); assert.match(hook, /workspace: previous\[key\]\?\.workspace/);
  assert.match(app, /controller.remoteStates\[repoId\]/);
  assert.match(hook, /repository && !sharedState \? \[repository\] : \[\]/);
  assert.doesNotMatch(hook, /localPath|\blink\b|setInterval|importAPI\('remoteFile'/);
});

test('disconnecting the protected HTTP read aborts the provider request instead of a normal POST completion', { timeout: 5000 }, async t => {
  const fixture = await createRemoteServiceFixture('gitea'); t.after(fixture.cleanup);
  const middleware = importMiddleware(fixture.service);
  const server = createServer((req, res) => { void middleware(req, res, () => res.end()); });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  t.after(() => { server.closeAllConnections(); return new Promise<void>(done => server.close(() => done())); });
  const address = server.address(); assert.ok(address && typeof address !== 'string'); const origin = `http://127.0.0.1:${address.port}`;
  let release!: () => void; let started!: () => void;
  const ready = new Promise<void>(done => { started = done; }); const paused = new Promise<void>(done => { release = done; });
  t.after(() => release?.());
  fixture.holdNext(async () => { started(); await paused; });
  const cancellation = new AbortController();
  const pending = fetch(`${origin}/api/import/remoteWorkspace`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GitTogether-Client': '1', Origin: origin }, body: JSON.stringify({ repositoryId: fixture.repositoryId }), signal: cancellation.signal });
  const rejected = assert.rejects(pending, problem => problem === cancellation.signal.reason);
  await ready;
  const signal = fixture.requests.at(-1)?.signal; assert.ok(signal); assert.equal(signal.aborted, false);
  const aborted = new Promise<void>(done => signal.addEventListener('abort', () => done(), { once: true }));
  cancellation.abort(); await rejected; await aborted; release();
});
