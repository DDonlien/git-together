import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateGitSignals, associationStatus, gitSignals, repositoryReadFeedback } from '../src/branch-links';
import { localRefreshInterval, syncIntervals } from '../src/auto-refresh';
import { isLocalWorkspace } from '../src/repository-model';
import { repositoryActionTargets } from '../src/repository-action-model';
import type { LocalLink, RemoteRepository } from '../src/import-model';
import type { LocalRepositoryState } from '../src/use-workspace';
import type { RemoteRepositoryState } from '../src/remote-repository-model';

test('a verified directory with an incomplete file scan keeps its association without an invented count or commit', () => {
  const task = { id: 'worktree:main:/fixture', path: '/fixture', branch: 'main', head: 'a'.repeat(40), error: '', tree: [], files: [{ path: 'known.txt', status: 'M', tracked: true }], filesComplete: false };
  const workspace = { source: 'local' as const, complete: false, tasks: [task], commits: [] };
  const local: LocalRepositoryState = { path: '/fixture', snapshot: null, checkedAt: 1, error: '', workspace };
  const link: LocalLink = { repositoryId: 'repo', path: '/fixture', worktrees: [{ path: '/fixture', branch: 'main' }] };
  const remote: RemoteRepositoryState = { loading: false, error: '', workspace: { source: 'remote', complete: true, checkedAt: 1, warnings: [], tasks: [{ ...task, id: 'remote:main', path: null, files: [], remote: true }], commits: [] } };
  assert.ok(isLocalWorkspace(workspace));
  assert.equal(isLocalWorkspace({ ...workspace, tasks: [{ ...task, filesComplete: 'false' }] }), false);
  assert.equal(isLocalWorkspace({ ...workspace, tasks: [{ ...task, changeKey: 'a'.repeat(64) }] }), false);
  assert.equal(associationStatus(link, local, remote).label, '完全关联');
  const signals = gitSignals([task], remote, local);
  assert.equal(signals.commit.count, undefined);
  assert.match(signals.commit.detail, /尚未完整读取/);
  assert.equal(signals.commit.status, undefined);
  assert.deepEqual(repositoryActionTargets({ id: 'repo', available: true } as RemoteRepository, [task], 'commit', remote, local, link), []);
  assert.deepEqual(repositoryActionTargets({ id: 'repo', available: true } as RemoteRepository, [{ ...task, changeKey: 'a'.repeat(64) }], 'commit', remote, local, link), []);
  const completeTask = { ...task, filesComplete: true, changeKey: 'a'.repeat(64) };
  assert.equal(aggregateGitSignals([signals, gitSignals([completeTask], remote, local)]).commit.count, undefined);
  assert.equal(localRefreshInterval(workspace), syncIntervals.maxBackoff);
  assert.equal(localRefreshInterval({ ...workspace, tasks: [{ filesComplete: true }] }), 30_000);
  assert.equal(localRefreshInterval({ ...workspace, complete: true, tasks: [] }), syncIntervals.local);
});

test('a repeated read error is reported once', () => {
  const task = { id: 'worktree:main:/fixture', path: '/fixture', branch: 'main', head: '', error: 'Git操作超时，请稍后重试。', tree: [], files: [] };
  const local: LocalRepositoryState = { path: '/fixture', snapshot: null, checkedAt: 1, error: '', workspace: { source: 'local', complete: false, tasks: [task], commits: [] } };
  const remote: RemoteRepositoryState = { workspace: null, loading: false, error: '' };
  const feedback = repositoryReadFeedback(gitSignals([task], remote, local, undefined, true, true));
  assert.equal(feedback.error.match(/Git操作超时/g)?.length, 1);
});
