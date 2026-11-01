import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RepositoryActions } from '../src/RepositoryActions';
import { RepositoryOperationProvider } from '../src/RepositoryOperationProvider';
import { RepositoryActionDraftsProvider } from '../src/RepositoryActionDialog';
import { RepositoryCommitComposer } from '../src/RepositoryCommitComposer';
import { branchHiddenEntries, toggleBranchVisibility } from '../src/branch-behavior';
import { gitSignals } from '../src/branch-links';
import { graphActionLabels } from '../src/graph-operation-model';

const wrap = (child: React.ReactNode) => createElement(RepositoryActionDraftsProvider, { sessionId: 'lite-test', children: createElement(RepositoryOperationProvider, { sessionId: 'lite-test', children: child }) });
const signals = gitSignals([], { workspace: null, loading: false, error: '' });

test('lite exposes Fetch/Pull/Commit/Push and no custom sync controls', () => {
  const markup = renderToStaticMarkup(wrap(createElement(RepositoryActions, { label: 'Git 操作', signals, onFetch() {}, onPull() {} })));
  for (const label of ['Fetch', 'Pull', 'Commit', 'Push']) assert.match(markup, new RegExp(`data-action-name="${label}"`));
  assert.doesNotMatch(markup, /Get Latest|Submit|Clear|Clean|AI 分析/);
  assert.match(markup, /Fetch：[^"<>]*获取远端引用/);
});

test('GitHub composer without generation capability has no AI control', () => {
  const task = { id: 'local', branch: 'main', head: 'a'.repeat(40), path: '/fixture', files: [{ path: 'a.txt', status: 'M', tracked: true }], tree: [], error: '', changeKey: 'b'.repeat(64) };
  const plain = renderToStaticMarkup(wrap(createElement(RepositoryCommitComposer, { repositoryId: 'github:1', task })));
  assert.doesNotMatch(plain, /AI 生成提交说明|取消 AI 生成|Submit/);
  const assisted = renderToStaticMarkup(wrap(createElement(RepositoryCommitComposer, { repositoryId: 'gitea:1', task, onGenerate: async () => ({ summary: 'sample', description: '' }) })));
  assert.match(assisted, /AI 生成提交说明/);
});

test('manual hidden entries stay reversible without contribution-based rules', () => {
  const oldPreference = { unworkedBranchBehavior: 'hide' as const, hiddenEntries: [] };
  const hidden = branchHiddenEntries('repo', oldPreference, [{ id: 'remote:main', branch: 'main', head: 'a'.repeat(40), path: null, files: [], tree: [], error: '', hasAccountCommits: false, hasAccountCreation: false }]);
  assert.equal(hidden.size, 0);
  const key = '["repo","main"]';
  const next = toggleBranchVisibility(oldPreference, key, false);
  assert.ok(branchHiddenEntries('repo', next).has(key));
  assert.ok(!branchHiddenEntries('repo', toggleBranchVisibility(next, key, true)).has(key));
});

test('graph keeps ordinary branch operations and removes AI and worktree extras', () => {
  assert.ok('checkout' in graphActionLabels && 'branch' in graphActionLabels && 'merge' in graphActionLabels);
  assert.ok(!('ai-sync' in graphActionLabels) && !('worktree' in graphActionLabels));
});
