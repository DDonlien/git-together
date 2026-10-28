import test from 'node:test';
import assert from 'node:assert/strict';
import { repositoryGraphBranches, repositoryGraphCommits } from '../src/commit-graph';
import { publishedCommitsByBranch, type RepositoryCommit, type RepositoryTask, type RepositoryWorkspace } from '../src/repository-model';

const commit = (id: string, ...parents: string[]): RepositoryCommit => ({ id, parents, refs: [], summary: id, author: 'Fixture', time: '2026-10-28T00:00:00Z' });
const task = (branch: string, head: string, remote: boolean): RepositoryTask => ({ id: `${remote ? 'remote' : 'local'}:${branch}`, branch, head, path: remote ? null : `/fixture/${branch}`, files: [], tree: remote ? [`${head}.txt`] : [], error: '', ...(remote ? { remote: true } : {}) });
const workspace: RepositoryWorkspace = { source: 'mixed', complete: true, tasks: [task('main', 'c', false), task('main', 'a', true), task('other', 'y', false), task('other', 'x', true)], commits: [commit('c', 'b'), commit('b', 'a'), commit('a'), commit('y', 'x'), commit('x')] };

test('verified Push evidence fixes graph and selected commit status without changing the cached tree', () => {
  const graph = (heads?: ReadonlyMap<string, string>) => repositoryGraphCommits(workspace, repositoryGraphBranches(workspace, heads), null);
  assert.equal(graph().find(item => item.id === 'c')?.unpublished, true);
  const partial = new Map([['main', 'b']]);
  assert.equal(graph(partial).find(item => item.id === 'b')?.unpublished, false);
  assert.equal(graph(partial).find(item => item.id === 'c')?.unpublished, true);
  assert.equal(publishedCommitsByBranch(workspace, partial).get('main')?.has('b'), true);
  assert.equal(publishedCommitsByBranch(workspace, partial).get('main')?.has('c'), false);

  const complete = new Map([['main', 'c']]);
  assert.equal(graph(complete).find(item => item.id === 'c')?.unpublished, false);
  assert.equal(graph(complete).find(item => item.id === 'y')?.unpublished, true);
  assert.equal(publishedCommitsByBranch(workspace, complete).get('main')?.has('c'), true);
  assert.deepEqual(workspace.tasks[1].tree, ['a.txt']);
  assert.equal(workspace.tasks[1].head, 'a');
});

test('the selected commit uses the actual local tracking ref when the remote tree is stale', () => {
  const tracked: RepositoryWorkspace = { source: 'local', complete: true, tasks: [{ ...task('main', 'c', false), tracking: { upstream: 'origin/main', ahead: 0, behind: 0 } }], commits: [commit('c', 'b'), commit('b', 'a'), commit('a')] };
  tracked.commits[0].refs = ['origin/main'];
  assert.equal(publishedCommitsByBranch(workspace, undefined, tracked).get('main')?.has('c'), true);
  tracked.commits[0].refs = [];
  tracked.commits[2].refs = ['origin/main'];
  assert.equal(publishedCommitsByBranch(workspace, undefined, tracked).get('main')?.has('c'), false);
  tracked.tasks[0].tracking!.upstream = 'upstream/release';
  tracked.commits[0].refs = ['refs/remotes/upstream/release'];
  assert.equal(publishedCommitsByBranch(workspace, undefined, tracked).get('main')?.has('c'), true);
});
