import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { gitSignals } from '../src/branch-links';
import { RepositoryActions } from '../src/RepositoryActions';
import { RepositoryOperationProvider } from '../src/RepositoryOperationProvider';
import { acceptRemoteWorkspace, recordVerifiedPush, type RemoteRepositoryState, type RemoteRepositoryWorkspace } from '../src/remote-repository-model';
import type { RepositoryCommit, RepositoryTask, RepositoryWorkspace } from '../src/repository-model';

const commit = (id: string, ...parents: string[]): RepositoryCommit => ({ id, parents, refs: [], summary: id, author: 'Test', time: '2026-10-28T00:00:00Z' });
const localTask = (branch: string, head: string): RepositoryTask => ({ id: `worktree:${branch}`, branch, head, path: `/test/${branch}`, files: [], tree: [], error: '' });
const remoteTask = (branch: string, head: string): RepositoryTask => ({ id: `remote:${branch}`, branch, head, path: null, files: [], tree: [`${head}.txt`], error: '', remote: true, treeComplete: true });
const main = localTask('main', 'c');
const other = localTask('other', 'y');
const history = [commit('c', 'b'), commit('b', 'a'), commit('a'), commit('y', 'x'), commit('x')];
const localWorkspace: RepositoryWorkspace = { source: 'local', complete: true, tasks: [main, other], commits: history };
const local = { path: '/test', snapshot: null, workspace: localWorkspace, checkedAt: 1, error: '' };
const remoteWorkspace: RemoteRepositoryWorkspace = { source: 'remote', complete: true, branchesComplete: true, checkedAt: 1, warnings: [], tasks: [remoteTask('main', 'a'), remoteTask('other', 'x')], commits: history };
const initial: RemoteRepositoryState = { workspace: remoteWorkspace, loading: false, error: '' };
const pushGroup = (state: RemoteRepositoryState, tasks: RepositoryTask[]) => {
  const actions = createElement(RepositoryActions, { label: 'Git 操作', signals: gitSignals(tasks, state, local) });
  const markup = renderToStaticMarkup(createElement(RepositoryOperationProvider, { sessionId: 'fixture' }, actions));
  return markup.match(/<div class="git-action-group" role="group" aria-label="待推送">([\s\S]*?)<\/div>/)?.[1] || '';
};

test('verified Push updates only the matching branch while preserving the remote content snapshot', () => {
  assert.equal(gitSignals([main], initial, local, 'main').push.count, 1);
  assert.equal(gitSignals([main, other], initial, local).push.count, 2);
  assert.match(pushGroup(initial, [main]), /git-action-badge warning">1</);

  const pushed = recordVerifiedPush(initial, 'main', 'c');
  assert.equal(gitSignals([main], pushed, local, 'main').push.count, undefined);
  assert.doesNotMatch(pushGroup(pushed, [main]), /git-action-badge/);
  assert.equal(gitSignals([main, other], pushed, local).push.count, 1);
  assert.equal(gitSignals([other], pushed, local, 'other').push.count, 1);
  assert.equal(pushed.workspace?.tasks[0].head, 'a');
  assert.deepEqual(pushed.workspace?.tasks[0].tree, ['a.txt']);

  const partial = recordVerifiedPush(initial, 'main', 'b');
  assert.equal(gitSignals([main], partial, local, 'main').push.count, 1, 'pushing an older commit leaves newer commits pending');
});

test('an older or failed remote read cannot erase the verified Push; later valid reads supersede it', () => {
  const pushed = recordVerifiedPush(initial, 'main', 'c');
  const olderRead = acceptRemoteWorkspace(pushed, remoteWorkspace, true);
  assert.equal(olderRead.verifiedPushHeads?.get('main'), 'c');
  assert.equal(gitSignals([main], olderRead, local).push.count, undefined);

  const failedBranch = { ...remoteWorkspace, complete: false, tasks: [{ ...remoteWorkspace.tasks[0], error: 'read failed' }, remoteWorkspace.tasks[1]] };
  const failedRead = acceptRemoteWorkspace(pushed, failedBranch, false);
  assert.equal(failedRead.verifiedPushHeads?.get('main'), 'c');
  assert.equal(gitSignals([main], { ...failedRead, error: 'HTTP 503' }, local).push.count, undefined);

  const advanced = { ...remoteWorkspace, tasks: [remoteTask('main', 'd'), remoteWorkspace.tasks[1]], commits: [commit('d', 'c'), ...history] };
  const newRead = acceptRemoteWorkspace(pushed, advanced, false);
  assert.equal(newRead.verifiedPushHeads?.has('main'), false);
  assert.equal(gitSignals([main], newRead, local).pull.count, 1);
  assert.equal(gitSignals([main], newRead, local).push.count, undefined);

  const reset = acceptRemoteWorkspace(pushed, remoteWorkspace, false);
  assert.equal(gitSignals([main], reset, local).push.count, 1, 'a later confirmed remote change is not masked');

  const missing = { ...remoteWorkspace, branchesComplete: false, tasks: [remoteWorkspace.tasks[1]] };
  assert.equal(acceptRemoteWorkspace(pushed, missing, false).verifiedPushHeads?.get('main'), 'c');
  assert.equal(acceptRemoteWorkspace(pushed, { ...missing, branchesComplete: true }, false).verifiedPushHeads?.has('main'), false);
});
