import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RemoteRepositoryReader, attachDiffPatches, type RemoteTransport } from '../server/remote-repository-reader';
import { isRemoteWorkspace, isRemoteCommitDetails, isRemoteFileContent, preserveRemoteWorkspace } from '../src/remote-repository-model';
import { combineRepositoryWorkspaces, taskCommitHistory, topologicalCommits } from '../src/repository-model';
import { RepositoryView } from '../src/RepositoryView';
import { RepositoryRemoteChanges } from '../src/RepositoryRemoteChanges';
import { createGitRemoteFixture } from './git-remote-fixture';

const hash = (digit: number) => String(digit).repeat(40);
const commit = (id = hash(1), parents: string[] = []) => ({ sha: id, commit: { message: `Commit ${id.slice(0, 4)}`, author: { name: 'QA', date: '2026-10-06T09:00:00Z' }, tree: { sha: hash(9) } }, parents: parents.map(sha => ({ sha })) });
const response = (value: unknown, headers = new Headers()) => ({ value, headers });
const reader = (request: RemoteTransport) => new RemoteRepositoryReader('github', { fullName: 'qa/project', defaultBranch: 'main' }, request, () => 1234);

for (const provider of ['github', 'gitea'] as const) test(`${provider} reads real branch ancestry, complete trees, commit Diff and blob with zero local links`, async () => {
  const fixture = await createGitRemoteFixture(provider);
  try {
    const remote = new RemoteRepositoryReader(provider, { fullName: 'qa/project', defaultBranch: 'main' }, fixture.transport);
    const workspace = await remote.workspace();
    assert.equal(isRemoteWorkspace(workspace), true); assert.equal(workspace.complete, true);
    assert.equal(workspace.tasks.length, 3); assert.equal(workspace.tasks[0].branch, 'main');
    assert.ok(workspace.tasks.every(task => task.path === null && task.remote && task.files.length === 0));
    assert.ok(workspace.commits.some(commit => commit.parents.length === 2));
    const main = workspace.tasks[0]; assert.ok(main.tree.includes('src/search.ts')); assert.ok(!main.tree.includes('src/new.ts')); assert.ok(!main.tree.includes('ignored.txt'));
    assert.ok(workspace.commits.find(commit => commit.id === main.head)?.refs.includes('origin/main'));
    const review = workspace.tasks.find(task => task.branch === 'task/review')!;
    assert.ok(!review.tree.includes('src/search.ts')); assert.equal(taskCommitHistory(workspace, review.id).length, 1);
    const details = await remote.commit(main.head); assert.equal(isRemoteCommitDetails(details), true); assert.ok(details.files.some(file => file.path === 'src/search.ts'));
    assert.match(details.diff, /export const search = true/);
    const file = await remote.file(main.head, 'src/app.ts'); assert.equal(isRemoteFileContent(file), true); assert.equal(file.text, 'export const value = 0;\n');
    await assert.rejects(remote.file(main.head, 'src/new.ts'), /文件不在/); await assert.rejects(remote.file(main.head, '../private'), /无效的文件路径/);
    const before = fixture.calls.filter(path => path.includes('/git/trees/') || path.includes('/commits?')).length;
    await remote.workspace();
    assert.equal(fixture.calls.filter(path => path.includes('/git/trees/') || path.includes('/commits?')).length, before);
    assert.equal(await fixture.unchanged(), true);
  } finally { await fixture.cleanup(); }
});

test('branch pagination follows only locally constructed pages even when provider links name another host', async () => {
  const calls: string[] = [];
  const remote = reader(async path => {
    calls.push(path); const url = new URL(path, 'https://fixed.example.test');
    if (url.pathname.endsWith('/branches')) return url.searchParams.get('page') === '1' ? response([{ name: 'main', commit: { sha: hash(1) } }], new Headers({ link: '<https://attacker.test/steal>; rel="next"' })) : response([{ name: 'feature/a', commit: { sha: hash(2) } }]);
    if (url.pathname.endsWith('/commits')) return response([commit(url.searchParams.get('sha')!)]);
    return response({ tree: [], truncated: false });
  });
  const workspace = await remote.workspace(); assert.equal(workspace.tasks.length, 2); assert.ok(calls.every(path => path.startsWith('/repos/qa/project/'))); assert.ok(calls.some(path => path.includes('page=2')));
});

test('an actually empty remote repository keeps the remote tree source and never demands a local directory', () => {
  const account = { id: 'qa', provider: 'gitea' as const, host: 'https://git.fixture.test', login: 'qa', name: 'QA', updatedAt: '' };
  const repository = { id: 'qa:1', accountId: 'qa', remoteId: 1, name: 'empty', fullName: 'qa/empty', description: '', defaultBranch: '', private: false, available: true, url: 'https://git.fixture.test/qa/empty' };
  const workspace = { source: 'remote' as const, complete: true, checkedAt: 1, warnings: [], tasks: [], commits: [] };
  const html = renderToStaticMarkup(createElement(RepositoryView, { repository, account, globalSearch: '', onConfigure() {}, remoteState: { workspace, loading: false, error: '' } }));
  assert.match(html, /远端仓库尚无文件/); assert.match(html, /远端仓库尚无提交/);
  assert.doesNotMatch(html, /尚未关联本地目录|远端文件树尚未接入|远端内容接口等待/);
});

test('a failed branch retains its last true SHA/tree/history, marks it stale and never relabels the old SHA as a moved HEAD', () => {
  const previous = { source: 'remote' as const, checkedAt: 1, complete: true, warnings: [], tasks: [{ id: 'remote:main', branch: 'main', head: hash(1), path: null, files: [], tree: ['old.ts'], treeComplete: true, remote: true, error: '' }], commits: [{ id: hash(1), summary: 'old', author: 'QA', time: '2026-10-06T09:00:00Z', parents: [], refs: ['origin/main'] }] };
  const next = { ...previous, checkedAt: 2, complete: false, tasks: [{ ...previous.tasks[0], head: hash(2), tree: [], treeComplete: false, error: 'network' }], commits: [] };
  const retained = preserveRemoteWorkspace(previous, next);
  assert.equal(retained.tasks[0].head, hash(1)); assert.deepEqual(retained.tasks[0].tree, ['old.ts']);
  assert.match(retained.tasks[0].error, /显示上次读取的 11111111；本次远端 HEAD 为 22222222/);
  assert.equal(retained.commits.length, 1); assert.deepEqual(retained.commits[0].refs, []); assert.equal(retained.complete, false);
  assert.equal(preserveRemoteWorkspace(retained, previous), previous);
  const deleted = { ...previous, tasks: [], commits: [] }; assert.equal(preserveRemoteWorkspace(previous, deleted), deleted);
});

test('GitHub truncated recursive trees are replaced by complete nonrecursive traversal', async () => {
  const calls: string[] = [];
  const remote = reader(async path => {
    calls.push(path); const url = new URL(path, 'https://fixed.example.test');
    if (url.pathname.endsWith('/branches')) return response([{ name: 'main', commit: { sha: hash(1) } }]);
    if (url.pathname.endsWith('/commits')) return response([commit()]);
    if (url.searchParams.has('recursive')) return response({ tree: [{ path: 'wrong.txt', type: 'blob', sha: hash(4) }], truncated: true });
    return url.pathname.endsWith(hash(9)) ? response({ tree: [{ path: 'src', type: 'tree', sha: hash(8) }], truncated: false }) : response({ tree: [{ path: 'app.ts', type: 'blob', sha: hash(4) }], truncated: false });
  });
  const workspace = await remote.workspace(); assert.deepEqual(workspace.tasks[0].tree, ['src/app.ts']); assert.equal(workspace.complete, true); assert.equal(calls.filter(path => path.includes('/git/trees/')).length, 3);
});

test('Gitea recursive tree pagination uses truncation and totals even below requested page size', async () => {
  const remote = new RemoteRepositoryReader('gitea', { fullName: 'qa/project', defaultBranch: 'main' }, async path => {
    const url = new URL(path, 'https://fixed.example.test');
    if (url.pathname.endsWith('/branches')) return response([{ name: 'main', commit: { id: hash(1) } }]);
    if (url.pathname.endsWith('/commits')) return response([commit()]);
    return response({ tree: [{ path: url.searchParams.get('page') === '1' ? 'a.ts' : 'b.ts', type: 'blob', sha: hash(4) }], total_count: 2, truncated: url.searchParams.get('page') === '1' });
  });
  const workspace = await remote.workspace(); assert.deepEqual(workspace.tasks[0].tree, ['a.ts', 'b.ts']); assert.equal(workspace.complete, true);
});

test('remote failures remain task errors, not a successful empty repository, and cancellation propagates', async () => {
  const remote = reader(async path => path.includes('/branches?') ? response([{ name: 'main', commit: { sha: hash(1) } }]) : Promise.reject(new Error('权限不足')));
  const workspace = await remote.workspace(); assert.equal(workspace.complete, false); assert.match(workspace.tasks[0].error, /权限不足/);
  const controller = new AbortController(); controller.abort(new Error('cancelled')); await assert.rejects(remote.workspace(controller.signal), /cancelled/);
  await assert.rejects(reader(async () => response([{ name: 'main', commit: { sha: '../../other' } }])).workspace(), /Git 对象标识/);
  const empty = await reader(async () => response([])).workspace(); assert.equal(empty.tasks.length, 0); assert.equal(empty.complete, true);
});

test('remote commit graph follows parent topology even if author timestamps are skewed', () => {
  const parent = { id: hash(1), summary: 'parent', author: 'QA', time: '2026-10-07', parents: [], refs: [] };
  const child = { ...parent, id: hash(2), summary: 'child', time: '2026-10-01', parents: [hash(1)] };
  assert.deepEqual(topologicalCommits([parent, child]).map(commit => commit.id), [child.id, parent.id]);
  assert.throws(() => topologicalCommits([{ ...parent, parents: [child.id] }, child]), /关系不合法/);
});

test('Gitea file patches match additions, deletions, whitespace and quoted UTF-8 paths without inventing binary Diff', () => {
  const diff = 'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old\n+new\ndiff --git a/old.ts b/old.ts\n--- a/old.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-old\ndiff --git a/x b/x\n--- "a/\\346\\226\\207 a.ts"\n+++ "b/\\346\\226\\207 a.ts"\n@@ -0,0 +1 @@\n+hello\n';
  const files = attachDiffPatches(diff, ['a.ts', 'old.ts', '文 a.ts', 'image.png'].map(path => ({ path, status: 'modified', patch: null })));
  assert.match(files[0].patch!, /\+new/); assert.match(files[1].patch!, /-old/); assert.match(files[2].patch!, /\+hello/); assert.equal(files[3].patch, null);
});

test('remote and local task identities coexist without relabeling committed data as working changes', () => {
  const remote = { source: 'remote' as const, tasks: [{ id: 'remote:main', branch: 'main', head: hash(1), path: null, files: [], tree: ['a.ts'], error: '', remote: true }], commits: [{ id: hash(1), summary: 'committed', author: 'QA', time: '', parents: [hash(2)], refs: ['origin/main'] }], complete: true };
  const local = { tasks: [{ id: 'worktree:main:/qa', branch: 'main', head: hash(1), path: '/qa', files: [{ path: 'a.ts', status: 'M', tracked: true }], tree: ['a.ts'], error: '' }], commits: [{ ...remote.commits[0], parents: [], refs: ['HEAD'] }], complete: false };
  const combined = combineRepositoryWorkspaces(remote, local); assert.equal(combined.tasks.length, 2); assert.deepEqual(combined.commits[0].parents, [hash(2)]); assert.deepEqual(combined.commits[0].refs, ['origin/main', 'HEAD']); assert.equal(combined.tasks[0].files.length, 0);
});

test('the unlinked three-column view renders remote branches, history and trees while keeping local actions disabled', async () => {
  const fixture = await createGitRemoteFixture('gitea');
  try {
    const remote = new RemoteRepositoryReader('gitea', { fullName: 'qa/project', defaultBranch: 'main' }, fixture.transport); const workspace = await remote.workspace();
    const account = { id: 'qa', provider: 'gitea' as const, host: 'https://fixture.example.test', login: 'qa', name: 'QA', updatedAt: '' };
    const repository = { id: 'qa:1', remoteId: 1, accountId: 'qa', name: 'project', fullName: 'qa/project', description: '', defaultBranch: 'main', private: true, url: 'https://fixture.example.test/qa/project', available: true };
    const markup = renderToStaticMarkup(createElement(RepositoryView, { repository, account, remoteState: { workspace, loading: false, error: '' }, globalSearch: '', onConfigure: () => {} }));
    assert.match(markup, /Merge search task/); assert.match(markup, /task\/search/); assert.match(markup, /src/); assert.match(markup, /3 个任务/); assert.match(markup, /远端提交：main/);
    assert.doesNotMatch(markup, /关联本地目录后|正在读取本地|没有未提交的更改/);
    const details = await remote.commit(workspace.tasks[0].head);
    const pane = renderToStaticMarkup(createElement(RepositoryRemoteChanges, { task: workspace.tasks[0], commitId: details.commit.id, state: { id: details.commit.id, details, error: '' }, onSelect: () => {}, search: '', focused: false, onFocus: () => {}, showFocus: true }));
    assert.match(pane, /src\/search.ts/); assert.match(pane, /正在浏览已提交内容/); assert.match(pane, /<button disabled=""/); assert.doesNotMatch(pane, /repository-inline-diff|<pre\b|export const search = true/);
  } finally { await fixture.cleanup(); }
});
