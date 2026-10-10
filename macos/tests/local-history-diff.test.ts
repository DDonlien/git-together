import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRepositoryFixture } from './repository-fixture';
import { createRemoteServiceFixture } from './remote-service-fixture';
import { readRepositoryWorkspace, readRepositoryCommit, readRepositoryCommitDiff } from '../server/repository-reader';
import { RepositoryChanges } from '../src/RepositoryChanges';
import { RepositoryFileTree } from '../src/RepositoryFileTree';
import { isLocalCommitDetails } from '../src/local-commit-model';
import { isCatalog } from '../src/import-model';
import { isLocalWorkspace } from '../src/repository-model';
import { importAPI } from '../src/import-api';
import { importMiddleware } from '../server/http-api';

test('root, normal and merge commits read their real file changes rather than the dirty index or worktree', async t => {
  const fixture = await createRepositoryFixture({ treeChanges: true, denseChanges: true }); t.after(fixture.cleanup);
  const workspace = await readRepositoryWorkspace(fixture.directory);
  const initial = workspace.commits.find(commit => commit.summary === 'Initial project structure')!;
  const root = await readRepositoryCommit(fixture.directory, initial.id);
  assert.ok(isLocalCommitDetails(root)); assert.equal(root.files.length, 5); assert.ok(root.files.every(file => file.status === 'A'));
  const rootDiff = await readRepositoryCommitDiff(fixture.directory, initial.id, 'src/app.ts');
  assert.match(rootDiff, /\+export const value = 0/); assert.doesNotMatch(rootDiff, /value = 10/);
  const update = workspace.commits.find(commit => commit.summary === 'Update project files')!;
  const details = await readRepositoryCommit(fixture.directory, update.id);
  assert.equal(details.files.length, 99);
  assert.ok(details.files.some(file => file.path === 'docs/notes.md' && file.status === 'D'));
  const diff = await readRepositoryCommitDiff(fixture.directory, update.id, 'src/app.ts');
  assert.match(diff, /-export const value = 0/); assert.match(diff, /\+export const value = 1/); assert.doesNotMatch(diff, /value = 10/);
  assert.match(await readRepositoryCommitDiff(fixture.directory, update.id, 'docs/notes.md'), /-# Project notes/);
  const merge = workspace.commits.find(commit => commit.parents.length === 2)!;
  const merged = await readRepositoryCommit(fixture.directory, merge.id);
  assert.equal(merged.commit.parents.length, 2);
  assert.deepEqual(merged.files.map(file => file.path), ['src/search.ts']);
  assert.match(await readRepositoryCommitDiff(fixture.directory, merge.id, 'src/search.ts'), /\+export const search = true/);
  await assert.rejects(readRepositoryCommitDiff(fixture.directory, update.id, 'src/new.ts'), /不在这个提交/);
  assert.ok(await fixture.unchanged());
});

test('renames, tabs, newlines, leading/trailing spaces and pathspec characters remain literal; binary and mode changes stay truthful', async t => {
  const fixture = await createRepositoryFixture(); t.after(fixture.cleanup);
  const renamed = 'src/:(top)重命名\tline\nend .ts';
  const spaced = ' spaced file.txt ';
  await fixture.git(fixture.directory, ['mv', 'src/search.ts', renamed]);
  await writeFile(join(fixture.directory, spaced), 'Literal spaced path\n');
  await writeFile(join(fixture.directory, 'binary.dat'), Buffer.from([0, 1, 2, 3]));
  await fixture.git(fixture.directory, ['add', '--', spaced, 'binary.dat']);
  await fixture.git(fixture.directory, ['update-index', '--chmod=+x', 'README.md']);
  await fixture.git(fixture.directory, ['commit', '-m', 'Rename and metadata', '-m', 'Body <escaped>\n  Indented line\n\nFinal paragraph']);
  const id = (await fixture.git(fixture.directory, ['rev-parse', 'HEAD'])).stdout.trim();
  const before = await readFile(join(fixture.directory, '.git/index'));
  const details = await readRepositoryCommit(fixture.directory, id);
  assert.equal(details.commit.description, 'Body <escaped>\n  Indented line\n\nFinal paragraph');
  assert.deepEqual(details.files.find(file => file.path === renamed), { path: renamed, previousPath: 'src/search.ts', status: 'R100' });
  const rename = await readRepositoryCommitDiff(fixture.directory, id, renamed);
  assert.match(rename, /similarity index 100%/); assert.match(rename, /rename from src\/search.ts/);
  assert.doesNotMatch(rename, /value = 10/);
  assert.match(await readRepositoryCommitDiff(fixture.directory, id, spaced), /\+Literal spaced path/);
  assert.match(await readRepositoryCommitDiff(fixture.directory, id, 'binary.dat'), /Binary files.*differ/);
  assert.match(await readRepositoryCommitDiff(fixture.directory, id, 'README.md'), /old mode 100644\nnew mode 100755/);
  assert.equal((await fixture.git(fixture.directory, ['rev-parse', 'HEAD'])).stdout.trim(), id);
  assert.ok(before.equals(await readFile(join(fixture.directory, '.git/index'))));
});

test('empty commits have no changes; invalid hashes, non-commit and dangling objects, unsafe paths and cancellation are rejected', async t => {
  const fixture = await createRepositoryFixture(); t.after(fixture.cleanup);
  await fixture.git(fixture.directory, ['commit', '--allow-empty', '-m', 'Empty commit']);
  const id = (await fixture.git(fixture.directory, ['rev-parse', 'HEAD'])).stdout.trim();
  assert.deepEqual((await readRepositoryCommit(fixture.directory, id)).files, []);
  for (const invalid of ['HEAD', '--all', 'a'.repeat(41), 'a'.repeat(63), '../outside']) await assert.rejects(readRepositoryCommit(fixture.directory, invalid), /对象标识/);
  const blob = (await fixture.git(fixture.directory, ['rev-parse', 'HEAD:README.md'])).stdout.trim();
  await assert.rejects(readRepositoryCommit(fixture.directory, blob), /不是本地提交/);
  const dangling = (await fixture.git(fixture.directory, ['commit-tree', 'HEAD^{tree}', '-m', 'Dangling object'])).stdout.trim();
  await assert.rejects(readRepositoryCommit(fixture.directory, dangling), /不属于当前仓库历史/);
  for (const path of ['../outside', '/etc/passwd', '.git/config', 'src/../README.md', 'bad\0name']) await assert.rejects(readRepositoryCommitDiff(fixture.directory, id, path), /文件路径/);
  const cancellation = new AbortController(); cancellation.abort();
  await assert.rejects(readRepositoryCommit(fixture.directory, id, cancellation.signal), error => error === cancellation.signal.reason);
});

test('shallow boundaries fail explicitly instead of treating a non-root commit as a new-file snapshot', async t => {
  const fixture = await createRepositoryFixture(); t.after(fixture.cleanup);
  const shallow = join(fixture.root, 'shallow');
  await fixture.git(fixture.directory, ['clone', '--depth=1', '--no-local', fixture.directory, shallow]);
  const id = (await fixture.git(shallow, ['rev-parse', 'HEAD'])).stdout.trim();
  await assert.rejects(readRepositoryCommit(shallow, id), /浅克隆|父提交/);
  assert.ok(await fixture.unchanged());
});

test('partial clones do not download missing blobs or mutate the object store while browsing Diff', async t => {
  const fixture = await createRepositoryFixture(); t.after(fixture.cleanup);
  await fixture.git(fixture.directory, ['config', 'uploadpack.allowFilter', 'true']);
  const partial = join(fixture.root, 'partial');
  await fixture.git(fixture.directory, ['clone', '--filter=blob:none', '--no-checkout', '--no-local', fixture.directory, partial]);
  const initial = (await fixture.git(fixture.directory, ['rev-list', '--max-parents=0', 'HEAD'])).stdout.trim();
  const packs = await readdir(join(partial, '.git/objects/pack'));
  assert.ok((await readRepositoryCommit(partial, initial)).files.some(file => file.path === 'src/app.ts'));
  await assert.rejects(readRepositoryCommitDiff(partial, initial, 'src/app.ts'));
  assert.deepEqual(await readdir(join(partial, '.git/objects/pack')), packs);
  assert.ok(await fixture.unchanged());
});

for (const provider of ['github', 'gitea'] as const) test(`${provider}: AccountService → HTTP → client DTO reads selected local commits/files and preserves both worktrees`, async t => {
  const fixture = await createRemoteServiceFixture(provider, { treeChanges: true }); t.after(fixture.cleanup);
  const catalog = await fixture.service.handle('catalog', {}); assert.ok(isCatalog(catalog));
  await fixture.git(fixture.directory, ['remote', 'add', 'origin', catalog.repositories[0].url]);
  await fixture.service.handle('link', { repositoryId: fixture.repositoryId, path: fixture.root });
  const middleware = importMiddleware(fixture.service);
  const server = createServer((req, res) => { void middleware(req, res, () => { res.statusCode = 404; res.end(); }); });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  t.after(() => { server.closeAllConnections(); return new Promise<void>(done => server.close(() => done())); });
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`; const request = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', (input: string, init: RequestInit) => request(new URL(input, origin), { ...init, headers: { ...Object.fromEntries(new Headers(init.headers)), Origin: origin } }));
  const workspace = await importAPI('localWorkspace', { repositoryId: fixture.repositoryId }); assert.ok(isLocalWorkspace(workspace));
  const commitId = workspace.commits.find(commit => commit.summary === 'Update project files')!.id;
  for (const task of workspace.tasks) {
    const details = await importAPI('localCommit', { repositoryId: fixture.repositoryId, taskId: task.id, commitId });
    assert.ok(isLocalCommitDetails(details)); assert.equal(details.commit.id, commitId);
    const diff = await importAPI('diff', { repositoryId: fixture.repositoryId, taskId: task.id, commitId, path: 'src/app.ts' });
    assert.match(diff.text, /\+export const value = 1/); assert.doesNotMatch(diff.text, /value = (10|20)/);
    const working = await importAPI('diff', { repositoryId: fixture.repositoryId, taskId: task.id, path: 'src/app.ts' });
    assert.match(working.text, task.branch === 'main' ? /value = 10/ : /value = 20/);
  }
  const taskId = workspace.tasks[0].id;
  await assert.rejects(importAPI('localCommit', { repositoryId: 'unknown', taskId, commitId }), /仓库不存在/);
  await assert.rejects(fixture.service.handle('localCommit', { repositoryId: fixture.repositoryId, taskId, commitId, root: '/outside' }), /仅接受/);
  await assert.rejects(importAPI('localCommit', { repositoryId: fixture.repositoryId, taskId: 'worktree:main:/outside', commitId }), /不属于已关联/);
  await assert.rejects(importAPI('diff', { repositoryId: fixture.repositoryId, taskId, commitId, path: '../outside' }), /文件路径/);
  await fixture.service.handle('unlink', { repositoryId: fixture.repositoryId });
  await assert.rejects(importAPI('localCommit', { repositoryId: fixture.repositoryId, taskId, commitId }), /先关联/);
  assert.ok(await fixture.unchanged());
});

test('client rejects mismatched SHA and malformed local commit envelopes', async t => {
  const input = { repositoryId: 'qa', taskId: 'qa:main', commitId: 'a'.repeat(40) };
  let value: unknown = { commit: { id: input.commitId, summary: 'Commit', description: '', parents: [], refs: [], author: 'QA', time: '2026-10-10T00:00:00Z' }, files: [] };
  t.mock.method(globalThis, 'fetch', async () => Response.json({ ok: true, value }));
  assert.ok(isLocalCommitDetails(await importAPI('localCommit', input)));
  value = { ...(value as object), commit: { id: 'b'.repeat(40), summary: 'Wrong commit', description: '', parents: [], refs: [], author: 'QA', time: '2026-10-10T00:00:00Z' } };
  await assert.rejects(importAPI('localCommit', input), /本地提交返回格式无效/);
  value = { commit: { id: input.commitId, summary: 'Commit', parents: [], refs: [], author: 'QA', time: '' }, files: [] };
  await assert.rejects(importAPI('localCommit', input), /本地提交返回格式无效/);
});

test('loaded local history keeps the working composer mounted, shows current body and full file list, and ignores another SHA', async t => {
  const fixture = await createRepositoryFixture({ treeChanges: true }); t.after(fixture.cleanup);
  const workspace = await readRepositoryWorkspace(fixture.directory);
  const task = workspace.tasks.find(task => task.branch === 'main')!;
  const commit = workspace.commits.find(commit => commit.summary === 'Update project files')!;
  const details = await readRepositoryCommit(fixture.directory, commit.id);
  details.commit.description = 'Current body <escaped>\n  Indented line';
  const props = { task, selectedCommit: commit, selected: 'src/app.ts', onSelect() {}, search: '', focused: false, onFocus() {}, loading: false, linked: true, showFocus: false };
  const loaded = renderToStaticMarkup(createElement(RepositoryChanges, { ...props, historyState: { id: commit.id, details, error: '' } }));
  assert.match(loaded, /aria-label="已提交文件：main"/); assert.match(loaded, /docs\/notes.md/);
  assert.match(loaded, /Current body &lt;escaped&gt;\n  Indented line/);
  assert.doesNotMatch(loaded, /repository-inline-diff|is-history-diff|<pre\b|正在读取 Diff/);
  assert.match(loaded, /class="readonly-file selected"[^>]*aria-pressed="true"/);
  assert.match(loaded, /repository-commit-composer" hidden=""/);
  assert.doesNotMatch(loaded, /本地历史提交差异尚未接入/);
  for (const state of [{ id: task.head, details, error: '' }, { id: commit.id, details: null, error: 'Historical read failed' }]) {
    const markup = renderToStaticMarkup(createElement(RepositoryChanges, { ...props, historyState: state }));
    assert.doesNotMatch(markup, /Current body|aria-label="已提交文件|repository-inline-diff/);
    assert.ok(markup.includes(commit.id));
    if (state.error) assert.match(markup, /Historical read failed/);
  }
  const tree = renderToStaticMarkup(createElement(RepositoryFileTree, { task, changes: details.files, complete: true, onSelect() {} }));
  assert.match(tree, /later.ts/); assert.match(tree, new RegExp(task.head.slice(0, 8)));
  assert.match(tree, /data-missing="true"/); assert.match(tree, /notes.md/);
  assert.ok(await fixture.unchanged());
});
