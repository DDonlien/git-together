import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RepositoryGraph } from '../src/RepositoryGraph';
import { RepositoryChangesColumn } from '../src/RepositoryChangesColumn';
import { layoutCommitGraph, repositoryGraphBranches, repositoryGraphCommits } from '../src/commit-graph';
import { combineRepositoryWorkspaces, repositoryCommitTask, type RepositoryCommit, type RepositoryTask, type RepositoryWorkspace } from '../src/repository-model';
import { readRepositoryWorkspace } from '../server/repository-reader';
import { createRepositoryFixture } from './repository-fixture';

const commit = (id: string, parents: string[] = [], refs: string[] = []): RepositoryCommit => ({ id, parents, refs, summary: id, author: 'QA', time: '2026-10-09T10:00:00Z' });
const task = (id: string, branch: string, head: string, remote = false): RepositoryTask => ({ id, branch, head, remote, path: remote ? null : `/qa/${id}`, files: [], tree: [], error: '' });
const workspace: RepositoryWorkspace = {
  source: 'mixed', complete: true,
  commits: [commit('local', ['remote'], ['main']), commit('feature', ['base'], ['task/search']), commit('remote', ['base'], ['origin/main']), commit('base'), commit('review', [], ['task/review'])],
  tasks: [task('local', 'main', 'local'), task('remote', 'main', 'remote', true), task('search', 'task/search', 'feature')],
};
const graph = (source: RepositoryWorkspace, selection: ReadonlySet<string> | null = null) => repositoryGraphCommits(source, repositoryGraphBranches(source), selection);

test('all branches include local tips, remote tips and branch refs without a checked-out directory', () => {
  assert.deepEqual(graph(workspace).map(item => item.id), workspace.commits.map(item => item.id));
  const branches = repositoryGraphBranches(workspace);
  assert.deepEqual(branches.map(item => item.branch), ['main', 'task/review', 'task/search']);
  assert.equal(branches.filter(item => item.branch === 'main').length, 1);
  assert.deepEqual(branches[0].localHeads, ['local']);
  assert.deepEqual(branches[0].remoteHeads, ['remote']);
});

test('multi-select includes the union of true ancestors, deduplicates joins and supports empty selection', () => {
  assert.deepEqual(graph(workspace, new Set(['main'])).map(item => item.id), ['local', 'remote', 'base']);
  assert.deepEqual(graph(workspace, new Set(['main', 'task/search'])).map(item => item.id), ['local', 'feature', 'remote', 'base']);
  assert.deepEqual(graph(workspace, new Set()).map(item => item.id), []);
  assert.deepEqual(graph(workspace, new Set(['removed-branch'])).map(item => item.id), []);
});

test('refresh adds newly read branches to all selection while retaining an explicit subset', () => {
  const refreshed = { ...workspace, tasks: [...workspace.tasks, task('new', 'task/new', 'new')], commits: [commit('new'), ...workspace.commits] };
  assert.ok(graph(refreshed).some(item => item.id === 'new'));
  assert.deepEqual(graph(refreshed, new Set(['main'])).map(item => item.id), ['local', 'remote', 'base']);
});

test('commit selection uses a reachable task even when another task is focused or one directory read failed', () => {
  for (const complete of [true, false]) {
    const source = { ...workspace, complete };
    assert.equal(repositoryCommitTask(source, 'feature', 'local')?.id, 'search');
    assert.equal(repositoryCommitTask(source, 'local', 'search')?.id, 'local');
    assert.equal(repositoryCommitTask(source, 'remote', null)?.id, 'remote');
    assert.equal(repositoryCommitTask(source, 'missing', 'local'), undefined);
  }
});

test('unpublished labels require a loaded remote ancestor rather than absence from a limited remote page', () => {
  assert.equal(graph(workspace).find(item => item.id === 'local')!.unpublished, true);
  assert.equal(graph(workspace).find(item => item.id === 'remote')!.localOnly, false);
  assert.equal(graph(workspace).find(item => item.id === 'feature')!.unpublished, false);
  for (const head of ['not-loaded', 'review']) {
    const unknown = { ...workspace, tasks: workspace.tasks.map(item => item.remote ? { ...item, head } : item), commits: workspace.commits.map(item => ({ ...item, refs: item.refs.filter(ref => ref !== 'origin/main') })) };
    assert.equal(graph(unknown).find(item => item.id === 'local')!.unpublished, false);
  }
});

test('missing parents retain boundary stubs under branch filters instead of joining unrelated rows', () => {
  const truncated = { ...workspace, commits: workspace.commits.filter(item => item.id !== 'base') };
  const rows = layoutCommitGraph(graph(truncated, new Set(['main', 'task/search'])));
  assert.ok(rows.find(row => row.commit.id === 'remote')!.edges.some(edge => edge.boundary));
  assert.ok(rows.find(row => row.commit.id === 'feature')!.edges.some(edge => edge.boundary));
  assert.ok(rows.every(row => row.commit.id !== 'review'));
});

test('each dirty directory has a separate view node linked to its own HEAD with no invented commit metadata', () => {
  const source = { ...workspace, tasks: workspace.tasks.map(item => item.path ? { ...item, files: [{ path: `${item.id}.ts`, status: 'M', tracked: true }] } : item) };
  const nodes = graph(source).filter(item => item.workingTask);
  assert.equal(nodes.length, 2);
  for (const node of nodes) {
    assert.deepEqual(node.parents, [node.workingTask!.head]);
    assert.equal(node.time, ''); assert.deepEqual(node.refs, []);
  }
  assert.equal(graph(source, new Set(['main'])).filter(item => item.workingTask).length, 1);
  const markup = renderToStaticMarkup(createElement(RepositoryGraph, { workspace: source, search: '', focusedTask: null }));
  assert.equal((markup.match(/data-working-task=/g) || []).length, 2);
  assert.equal((markup.match(/data-commit-id=/g) || []).length, workspace.commits.length);
  assert.match(markup, /graph-working-node/); assert.match(markup, /未推送/);
  assert.doesNotMatch(markup, /Invalid Date|dateTime=""|<code>working:/);
});

test('an unborn HEAD has a working node without a fake zero-hash parent', () => {
  const source: RepositoryWorkspace = { source: 'local', complete: true, commits: [], tasks: [{ ...task('unborn', 'main', '0'.repeat(40)), files: [{ path: 'new.ts', status: '??', tracked: false }] }] };
  const nodes = graph(source);
  assert.equal(nodes.length, 1); assert.deepEqual(nodes[0].parents, []);
  assert.deepEqual(layoutCommitGraph(nodes)[0].edges, []);
});

test('working-node choice selects the matching mounted local context and preserves the other composer', () => {
  const source = { ...workspace, tasks: workspace.tasks.map(item => item.path ? { ...item, files: [{ path: `${item.id}.ts`, status: 'M', tracked: true }] } : item) };
  const markup = renderToStaticMarkup(createElement(RepositoryChangesColumn, { tasks: source.tasks, selection: null, remoteCommits: {}, selectedFiles: {}, onSelect() {}, search: '', focus: null, onFocus() {}, localChoice: 'search', onLocalChoice() {}, localPath: '/qa/local', loading: false, readDiff: async () => '' }));
  assert.match(markup, /class="repository-task-slot"><section class="repository-change-task" aria-label="更改任务：task\/search"/);
  assert.equal((markup.match(/<textarea/g) || []).length, 2);
});

test('real Git supplies staged, unstaged, untracked, two directories and unpublished history without graph writes', async t => {
  const fixture = await createRepositoryFixture({ localAhead: true });
  t.after(() => fixture.cleanup());
  const local = await readRepositoryWorkspace(fixture.directory);
  const remoteHead = (await fixture.git(fixture.directory, ['rev-parse', 'refs/remotes/origin/main'])).stdout.trim();
  const remote: RepositoryWorkspace = { source: 'remote', complete: true, tasks: [task('remote:main', 'main', remoteHead, true)], commits: local.commits.filter(item => item.id === remoteHead) };
  const combined = combineRepositoryWorkspaces(remote, { ...local, source: 'local' });
  const nodes = graph(combined);
  assert.equal(nodes.filter(item => item.workingTask).length, 2);
  const main = local.tasks.find(item => item.branch === 'main')!;
  assert.equal(main.files.find(file => file.path === 'src/staged.ts')!.status, 'A');
  assert.equal(main.files.find(file => file.path === 'src/app.ts')!.status, 'M');
  assert.equal(main.files.find(file => file.path === 'src/new.ts')!.status, '??');
  assert.equal(nodes.find(item => item.summary === 'Local commit waiting to be pushed')!.unpublished, true);
  assert.ok(local.commits.some(item => item.refs.includes('refs/remotes/upstream/task/search')));
  assert.equal(repositoryGraphBranches(combined).filter(item => item.branch === 'task/search').length, 1);
  assert.ok(await fixture.unchanged());
});
