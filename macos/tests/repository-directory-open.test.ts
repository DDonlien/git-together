import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { rename } from 'node:fs/promises';
import { createRemoteServiceFixture } from './remote-service-fixture';
import { readRepositoryWorkspace } from '../server/repository-reader';
import { importMiddleware } from '../server/http-api';
import { importAPI } from '../src/import-api';
import type { FileOpenTarget } from '../server/system-file-open';

test('directory opening resolves each actual linked worktree, not a renderer-supplied path, without Git writes', async t => {
  const opened: FileOpenTarget[] = [];
  const fixture = await createRemoteServiceFixture('gitea', { openFile: async target => { opened.push(target); } }); t.after(fixture.cleanup);
  await fixture.git(fixture.directory, ['remote', 'add', 'origin', 'https://git.fixture.test/qa/project.git']);
  const input = { repositoryId: fixture.repositoryId, taskId: `worktree:main:${fixture.directory}` };
  await assert.rejects(fixture.service.handle('openDirectory', input), /关联本地目录/);
  await fixture.service.handle('link', { repositoryId: fixture.repositoryId, path: fixture.root });
  for (const task of (await readRepositoryWorkspace(fixture.directory)).tasks.filter(task => task.path)) {
    assert.deepEqual(await fixture.service.handle('openDirectory', { ...input, taskId: task.id }), { opened: true });
    assert.deepEqual(opened.at(-1), { source: 'local', value: task.path });
  }
  const count = opened.length;
  for (const extra of [{ path: '/etc' }, { url: 'file:///etc' }, { command: 'open' }, { source: 'remote' }]) await assert.rejects(fixture.service.handle('openDirectory', { ...input, ...extra }), /仅接受/);
  await assert.rejects(fixture.service.handle('openDirectory', { ...input, taskId: `worktree:wrong:${fixture.directory}` }), /任务不属于/);
  await assert.rejects(fixture.service.handle('openDirectory', { ...input, taskId: 'worktree:main:/etc' }), /任务不属于/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(fixture.service.handle('openDirectory', input, controller.signal), /abort/i);
  assert.equal(opened.length, count); assert.equal(await fixture.unchanged(), true);
});

test('open failure, changed remote, unlink and removed account never report a successful directory open', async t => {
  const fixture = await createRemoteServiceFixture('gitea', { openFile: async () => { throw new Error('文件浏览器打开失败'); } }); t.after(fixture.cleanup);
  await fixture.git(fixture.directory, ['remote', 'add', 'origin', 'https://git.fixture.test/qa/project.git']);
  await fixture.service.handle('link', { repositoryId: fixture.repositoryId, path: fixture.directory });
  const input = { repositoryId: fixture.repositoryId, taskId: `worktree:main:${fixture.directory}` };
  await assert.rejects(fixture.service.handle('openDirectory', input), /文件浏览器打开失败/);
  await fixture.git(fixture.directory, ['remote', 'set-url', 'origin', 'https://git.fixture.test/other/project.git']);
  await assert.rejects(fixture.service.handle('openDirectory', input), /远端不是/);
  await fixture.service.handle('unlink', { repositoryId: fixture.repositoryId });
  await assert.rejects(fixture.service.handle('openDirectory', input), /关联本地目录/);
  await fixture.service.handle('removeAccount', { accountId: fixture.accountId });
  await assert.rejects(fixture.service.handle('openDirectory', input), /仓库不存在/);
});

test('a directory that disappeared after association does not reach the system opener', async t => {
  let opened = false;
  const fixture = await createRemoteServiceFixture('gitea', { openFile: async () => { opened = true; } }); t.after(fixture.cleanup);
  await fixture.git(fixture.directory, ['remote', 'add', 'origin', 'https://git.fixture.test/qa/project.git']);
  await fixture.service.handle('link', { repositoryId: fixture.repositoryId, path: fixture.directory });
  await rename(fixture.directory, `${fixture.directory}-moved`);
  await assert.rejects(fixture.service.handle('openDirectory', { repositoryId: fixture.repositoryId, taskId: `worktree:main:${fixture.directory}` }));
  assert.equal(opened, false);
});

test('directory opening uses the same protected HTTP/client boundary and validates its acknowledgement', async t => {
  const opened: FileOpenTarget[] = [];
  const fixture = await createRemoteServiceFixture('gitea', { openFile: async target => { opened.push(target); } }); t.after(fixture.cleanup);
  await fixture.git(fixture.directory, ['remote', 'add', 'origin', 'https://git.fixture.test/qa/project.git']);
  await fixture.service.handle('link', { repositoryId: fixture.repositoryId, path: fixture.directory });
  const middleware = importMiddleware(fixture.service);
  const server = createServer((request, response) => { void middleware(request, response, () => response.end()); });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  t.after(() => { server.closeAllConnections(); return new Promise<void>(done => server.close(() => done())); });
  const address = server.address(); assert.ok(address && typeof address !== 'string'); const origin = `http://127.0.0.1:${address.port}`;
  const request = fetch;
  const input = { repositoryId: fixture.repositoryId, taskId: `worktree:main:${fixture.directory}` };
  t.mock.method(globalThis, 'fetch', (url: string, init?: RequestInit) => request(new URL(url, origin), { ...init, headers: { ...init?.headers, Origin: origin } }));
  assert.deepEqual(await importAPI('openDirectory', input), { opened: true });
  assert.deepEqual(opened, [{ source: 'local', value: fixture.directory }]);
  const forbidden = await request(`${origin}/api/import/openDirectory`, { method: 'POST', headers: { Origin: 'https://foreign.test', 'Content-Type': 'application/json', 'X-GitTogether-Client': '1' }, body: JSON.stringify(input) });
  assert.equal(forbidden.status, 403); assert.equal(opened.length, 1);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ ok: true, value: { opened: false } }));
  await assert.rejects(importAPI('openDirectory', input), /目录打开结果无效/);
});
