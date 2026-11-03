import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { gitSignals } from '../src/branch-links';
import { RepositoryActions } from '../src/RepositoryActions';
import { RepositoryOperationProvider } from '../src/RepositoryOperationProvider';
import { RepositoryActionDraftsProvider } from '../src/RepositoryActionDialog';
import { repositoryUpdateDecision, repositoryUpdateScope } from '../src/repository-update-model';
import type { RepositoryActionTarget } from '../src/repository-action-model';

const signals = gitSignals([], { workspace: null, loading: false, error: '' });
function target(id: string, ahead: number | null, behind: number | null, upstream: string | null = 'origin/main'): RepositoryActionTarget {
  return { repositoryId: 'repo', repositoryName: 'owner/repo', task: { id, branch: id, head: 'a'.repeat(40), path: `/fixture/${id}`, files: [], tree: [], error: '', tracking: { upstream, ahead, behind } } };
}
const decision = (targets: RepositoryActionTarget[]) => repositoryUpdateDecision(targets, signals);

test('Update fetches when synchronized or synchronization is unknown', () => {
  assert.equal(decision([]).action, 'fetch');
  assert.equal(decision([target('main', 0, 0)]).action, 'fetch');
  assert.equal(decision([target('main', null, null)]).action, 'fetch');
  assert.equal(decision([target('main', 0, 0, null)]).action, 'fetch');
  assert.equal(decision([target('main', 1, 0), target('unknown', null, null)]).action, 'fetch');
  assert.equal(repositoryUpdateDecision([target('main', 0, 1)], { ...signals, pull: { ...signals.pull, status: 'error' } }).action, 'fetch');
});

test('Update prioritizes Pull and never mixes other worktrees into its target scope', () => {
  const local = target('local', 3, 0), remote = target('remote', 0, 2), divergent = target('divergent', 1, 2), unknown = target('unknown', null, null);
  const result = decision([local, remote, divergent, unknown]);
  assert.equal(result.action, 'pull');
  assert.deepEqual(result.targets.map(item => item.task.id), ['remote', 'divergent']);
  assert.match(result.detail, /其他工作目录不参与/);
});

test('Update pushes only confirmed ahead worktrees after remote changes are dealt with', () => {
  const result = decision([target('synced', 0, 0), target('feature', 2, 0)]);
  assert.equal(result.action, 'push');
  assert.deepEqual(result.targets.map(item => item.task.id), ['feature']);
  assert.equal(decision([{ ...target('invalid', 2, 0), task: { ...target('invalid', 2, 0).task, error: '状态未知' } }, target('feature', 2, 0)]).action, 'fetch');
});

test('Update presents the selected action while preserving separate controls', () => {
  const props = { label: 'Git 操作', signals, operationTargets: [target('main', 1, 2)], onFetch() {}, onPull() {}, onPush() {}, onUpdate() {} };
  const markup = renderToStaticMarkup(createElement(RepositoryActionDraftsProvider, { sessionId: 'update-test', children: createElement(RepositoryOperationProvider, { sessionId: 'update-test', children: createElement(RepositoryActions, props) }) }));
  assert.match(markup, /data-action-name="Update · Pull"/);
  for (const action of ['Fetch', 'Pull', 'Push']) assert.match(markup, new RegExp(`data-action-name="${action}"`));
});

test('Update operation scope distinguishes newer synchronization states', () => {
  const original = target('main', 0, 2), changed = target('main', 0, 3);
  const scope = repositoryUpdateScope('repository', 'pull', [original]);
  assert.equal(scope, repositoryUpdateScope('repository', 'pull', [original]));
  assert.notEqual(scope, repositoryUpdateScope('repository', 'pull', [changed]));
  assert.notEqual(scope, repositoryUpdateScope('repository', 'push', [original]));
});
