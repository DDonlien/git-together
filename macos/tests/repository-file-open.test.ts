import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { symlink, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { repositoryFileURL, isRepositoryFilePath } from '../src/repository-file-url';
import { RepositoryFileTree } from '../src/RepositoryFileTree';
import { readRepositoryWorkspace, repositoryTaskFile } from '../server/repository-reader';
import { importMiddleware } from '../server/http-api';
import { importAPI } from '../src/import-api';
import { createRemoteServiceFixture } from './remote-service-fixture';
import type { FileOpenTarget } from '../server/system-file-open';

const account = { id: 'qa', provider: 'github' as const, host: 'https://github.com', name: 'QA', login: 'qa', updatedAt: '' };
const repository = { id: 'qa:1', accountId: 'qa', remoteId: 1, name: 'project', fullName: 'qa/project', url: 'https://foreign.test/untrusted', private: false, available: true, description: '', defaultBranch: 'task/feature' };
const head = 'a'.repeat(40);

test('GitHub/Gitea file links use the trusted host, immutable tree HEAD and individually encoded literal segments', () => {
  assert.equal(repositoryFileURL(account, repository, head, 'docs/ 文件 #?%+.md'), `https://github.com/qa/project/blob/${head}/docs/%20%E6%96%87%E4%BB%B6%20%23%3F%25%2B.md`);
  assert.equal(repositoryFileURL({ ...account, provider: 'gitea', host: 'https://git.example.test:10443' }, repository, head, 'src/:(top)all.ts'), `https://git.example.test:10443/qa/project/src/commit/${head}/src/%3A(top)all.ts`);
  assert.equal(repositoryFileURL(account, repository, 'b'.repeat(64), ' README.md '), `https://github.com/qa/project/blob/${'b'.repeat(64)}/%20README.md%20`);
});

test('unsafe hosts, mismatched identities, branch-as-SHA and traversal cannot become external links', () => {
  for (const host of ['javascript:alert(1)', 'https://foreign.test', 'https://user:secret@github.com', 'https://github.com/path', 'https://github.com?token=private', 'file:///tmp']) assert.equal(repositoryFileURL({ ...account, host }, repository, head, 'README.md'), null);
  assert.equal(repositoryFileURL(account, { ...repository, accountId: 'other' }, head, 'README.md'), null);
  assert.equal(repositoryFileURL(account, { ...repository, fullName: '../project' }, head, 'README.md'), null);
  assert.equal(repositoryFileURL(account, repository, 'main', 'README.md'), null);
  for (const path of ['', '/etc/passwd', '../secret', 'docs/../secret', 'src//app.ts', 'src/./app.ts', '.git/config', 'src\\secret', 'bad\0file']) {
    assert.equal(isRepositoryFilePath(path), false, path);
    assert.equal(repositoryFileURL(account, repository, head, path), null);
  }
});

test('tree actions are sibling public buttons, preserve selection/status, and do not appear on directories', () => {
  const task = { id: 'remote:main', branch: 'main', head, remote: true, path: null, files: [], tree: ['README.md', 'src/app.ts'], error: '', treeComplete: true };
  const html = renderToStaticMarkup(createElement(RepositoryFileTree, { task, repository, account, complete: true, selected: 'src/app.ts', changes: [{ path: 'src/app.ts', status: 'modified' }, { path: 'deleted.md', status: 'removed' }], onSelect: () => {} }));
  assert.equal((html.match(/class="[^"]*\brepository-tree-open\b/g) || []).length, 3);
  assert.match(html, /<button type="button" class="repository-tree-select"[^>]*aria-pressed="true"/);
  assert.match(html, /<\/button><button[^>]*aria-label="在 GitHub 打开 src\/app.ts"/);
  const missing = html.match(/<button[^>]*aria-label="deleted.md：当前目录中不存在，无法打开"[^>]*>/)?.[0];
  assert.ok(missing); assert.match(missing, /\bdisabled/);
  assert.match(html, /data-change="modified"/); assert.match(html, /<code aria-hidden="true">M<\/code>/);
  for (const summary of html.match(/<summary[\s\S]*?<\/summary>/g) || []) assert.doesNotMatch(summary, /repository-tree-open/);
});

test('local actions identify default-app opening and unchecked-out branches are disabled', () => {
  const task = { id: 'worktree:main:/qa/main', branch: 'main', head, path: '/qa/main', files: [], tree: ['README.md'], error: '' };
  const html = renderToStaticMarkup(createElement(RepositoryFileTree, { task, repository, account, complete: true, onSelect: () => {} }));
  assert.match(html, /aria-label="用默认应用打开 README.md"/);
  const unchecked = renderToStaticMarkup(createElement(RepositoryFileTree, { task: { ...task, path: null }, repository, account, complete: true, onSelect: () => {} }));
  const disabled = unchecked.match(/<button[^>]*aria-label="README.md：这个分支未检出到本地"[^>]*>/)?.[0];
  assert.ok(disabled); assert.match(disabled, /\bdisabled/);
});

test('hover/focus and touch affordance keep layout and keyboard access without a nested selection click', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../src/RepositoryFileTree.tsx', import.meta.url), 'utf8');
  assert.match(css, /\.repository-tree-row:hover \.repository-tree-open, \.repository-tree-row:focus-within \.repository-tree-open/);
  assert.match(css, /@media \(hover: none\) \{ \.repository-tree-open.icon-button \{ opacity: 1; pointer-events: auto;/);
  assert.match(css, /flex: 0 0 24px; width: 24px; height: 24px;/);
  assert.match(source, /repositoryFileURL\(account, repository, task.head, path\)/);
  assert.match(source, /window.open\(url, '_blank', 'noopener,noreferrer'\)/);
  assert.doesNotMatch(source, /onClick=\{\(\) => \{ onSelect.*actions\.open|tabIndex=\{-1\}|visibility: hidden/);
});

for (const provider of ['github', 'gitea'] as const) test(`${provider} finite service opens a bound provider link without reading files or passing credentials`, async t => {
  const opened: FileOpenTarget[] = [];
  const fixture = await createRemoteServiceFixture(provider, { openFile: async target => { opened.push(target); } });
  t.after(fixture.cleanup);
  const before = fixture.requests.length;
  assert.deepEqual(await fixture.service.handle('openFile', { repositoryId: fixture.repositoryId, source: 'remote', commitId: head, path: 'docs/file #.md' }), { opened: true });
  assert.deepEqual(opened, [{ source: 'remote', value: `${provider === 'github' ? 'https://github.com' : 'https://git.fixture.test'}/qa/project/${provider === 'github' ? 'blob' : 'src/commit'}/${head}/docs/file%20%23.md` }]);
  assert.equal(fixture.requests.length, before);
  await assert.rejects(fixture.service.handle('openFile', { repositoryId: fixture.repositoryId, source: 'remote', commitId: head, path: 'README.md', url: 'https://foreign.test' }), /仅接受/);
  await assert.rejects(fixture.service.handle('openFile', { repositoryId: 'unknown', source: 'remote', commitId: head, path: 'README.md' }), /仓库不存在/);
  await assert.rejects(fixture.service.handle('openFile', { repositoryId: fixture.repositoryId, source: 'remote', commitId: 'main', path: 'README.md' }), /文件身份/);
  assert.equal(opened.length, 1); assert.equal(await fixture.unchanged(), true);
});

test('local service resolves main/worktree files and literal Git pathspec names through the verified association', async t => {
  const opened: FileOpenTarget[] = [];
  const fixture = await createRemoteServiceFixture('gitea', { openFile: async target => { opened.push(target); } }); t.after(fixture.cleanup);
  await fixture.git(fixture.directory, ['remote', 'add', 'origin', 'https://git.fixture.test/qa/project.git']);
  const input = { repositoryId: fixture.repositoryId, source: 'local', path: 'README.md', taskId: `worktree:main:${fixture.directory}` };
  await assert.rejects(fixture.service.handle('openFile', input), /关联本地目录/);
  await fixture.service.handle('link', { repositoryId: fixture.repositoryId, path: fixture.directory });
  const workspace = await readRepositoryWorkspace(fixture.directory);
  for (const task of workspace.tasks.filter(task => task.path)) {
    for (const path of ['README.md', 'src/:(top)all.ts']) {
      assert.deepEqual(await fixture.service.handle('openFile', { ...input, taskId: task.id, path }), { opened: true });
      assert.deepEqual(opened.at(-1), { source: 'local', value: join(task.path!, path) });
    }
  }
  assert.deepEqual(await fixture.service.handle('openFile', { ...input, path: 'src/new.ts' }), { opened: true });
  assert.equal(await fixture.unchanged(), true);
});

test('local resolver rejects outside symlinks, missing/ignored files, metadata, unknown worktrees and directories', async t => {
  const fixture = await createRemoteServiceFixture('gitea'); t.after(fixture.cleanup);
  const taskId = `worktree:main:${fixture.directory}`;
  for (const path of ['../README.md', '/etc/passwd', '.git/config', 'src/../README.md', 'bad\0file']) await assert.rejects(repositoryTaskFile(fixture.directory, taskId, path), /文件路径/);
  for (const path of ['ignored.txt', 'unknown.txt', 'src']) await assert.rejects(repositoryTaskFile(fixture.directory, taskId, path), /文件树中/);
  await assert.rejects(repositoryTaskFile(fixture.directory, `worktree:main:${fixture.feature}`, 'README.md'), /工作目录/);
  await symlink(join(fixture.feature, 'README.md'), join(fixture.directory, 'outside.md'));
  await assert.rejects(repositoryTaskFile(fixture.directory, taskId, 'outside.md'), /目录外/);
  await symlink(join(fixture.directory, 'README.md'), join(fixture.directory, 'inside.md'));
  assert.equal(await repositoryTaskFile(fixture.directory, taskId, 'inside.md'), join(fixture.directory, 'README.md'));
  await unlink(join(fixture.directory, 'README.md'));
  await assert.rejects(repositoryTaskFile(fixture.directory, taskId, 'README.md'), /已不存在/);
  assert.equal(await fixture.unchanged(), true);
});

test('default-app failure is not returned as successful and unlink/remove prevents subsequent opening', async t => {
  const fixture = await createRemoteServiceFixture('gitea', { openFile: async () => { throw new Error('没有可用的默认应用'); } }); t.after(fixture.cleanup);
  await fixture.git(fixture.directory, ['remote', 'add', 'origin', 'https://git.fixture.test/qa/project.git']);
  await fixture.service.handle('link', { repositoryId: fixture.repositoryId, path: fixture.directory });
  const input = { repositoryId: fixture.repositoryId, source: 'local', taskId: `worktree:main:${fixture.directory}`, path: 'README.md' };
  await assert.rejects(fixture.service.handle('openFile', input), /默认应用/);
  await fixture.service.handle('unlink', { repositoryId: fixture.repositoryId });
  await assert.rejects(fixture.service.handle('openFile', input), /关联本地目录/);
  await fixture.service.handle('removeAccount', { accountId: fixture.accountId });
  await assert.rejects(fixture.service.handle('openFile', input), /仓库不存在/);
});

test('protected HTTP/client opens only the bound local file and validates the minimal acknowledgement', async t => {
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
  const input = { repositoryId: fixture.repositoryId, source: 'local' as const, taskId: `worktree:main:${fixture.directory}`, path: 'README.md' };
  t.mock.method(globalThis, 'fetch', (url: string, init?: RequestInit) => request(new URL(url, origin), { ...init, headers: { ...init?.headers, Origin: origin } }));
  assert.deepEqual(await importAPI('openFile', input), { opened: true });
  assert.deepEqual(opened, [{ source: 'local', value: join(fixture.directory, 'README.md') }]);
  const forbidden = await request(`${origin}/api/import/openFile`, { method: 'POST', headers: { Origin: 'https://foreign.test', 'Content-Type': 'application/json', 'X-GitTogether-Client': '1' }, body: JSON.stringify(input) });
  assert.equal(forbidden.status, 403); assert.equal(opened.length, 1);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ ok: true, value: { opened: false } }));
  await assert.rejects(importAPI('openFile', input), /打开结果无效/);
});

test('Electron keeps main-frame import security and dispatches default application opening outside the renderer', () => {
  const source = readFileSync(new URL('../electron/main.ts', import.meta.url), 'utf8');
  assert.match(source, /gittogether:import.*[\s\S]*isMainRenderer\(event\)/);
  assert.match(source, /shell.openExternal\(target.value\)/); assert.match(source, /shell.openPath\(target.value\)/);
  assert.match(source, /else if \(await shell.openPath\(target.value\)\) throw new Error/);
  assert.match(source, /setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/);
});
