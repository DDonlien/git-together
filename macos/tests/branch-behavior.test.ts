import test from 'node:test';
import assert from 'node:assert/strict';
import { branchHiddenEntries } from '../src/branch-behavior';
import { hiddenEntryKey } from '../src/branch-links';
import type { RepositoryTask } from '../src/repository-model';
import { isRemoteWorkspace } from '../src/remote-repository-model';

const repositoryId = 'fixture-account:1';
const main: RepositoryTask = { id: 'remote:main', branch: 'main', head: 'a'.repeat(40), path: null, tree: [], files: [], error: '', remote: true, hasAccountCommits: false };
const feature: RepositoryTask = { ...main, id: 'remote:feature', branch: 'feature' };
const mainKey = hiddenEntryKey(repositoryId, 'main');
const featureKey = hiddenEntryKey(repositoryId, 'feature');

test('no matching commits is a normal hidden result for imported multi-branch history', () => {
  assert.deepEqual([...branchHiddenEntries(repositoryId, { unworkedBranchBehavior: 'hide' }, [main, feature])], [mainKey, featureKey]);
  assert.deepEqual([...branchHiddenEntries(repositoryId, {}, [main, feature])], []);
});

test('import creation preserves the sole branch without claiming commit authorship', () => {
  for (const hasAccountCreation of [true, undefined]) {
    assert.deepEqual([...branchHiddenEntries(repositoryId, { unworkedBranchBehavior: 'hide' }, [{ ...main, hasAccountCreation }])], []);
  }
  assert.deepEqual([...branchHiddenEntries(repositoryId, { unworkedBranchBehavior: 'hide' }, [{ ...main, hasAccountCreation: false }])], [mainKey]);
});

test('unknown identity, history or local changes cannot hide a branch', () => {
  const preferences = { unworkedBranchBehavior: 'hide' } as const;
  for (const task of [
    { ...main, hasAccountCommits: undefined },
    { ...main, hasAccountCommits: true },
    { ...main, participationError: '邮箱读取失败' },
    { ...main, participationError: '历史尚未完整读取' },
    { ...main, error: '文件树读取失败' },
  ]) assert.ok(!branchHiddenEntries(repositoryId, preferences, [task, feature]).has(mainKey));
  for (const local of [
    { ...main, path: '/fixture/main', error: '读取本地失败' },
    { ...main, path: '/fixture/main', head: 'c'.repeat(40) },
    { ...main, path: '/fixture/main', files: [{ path: 'changed.txt' } as RepositoryTask['files'][number]] },
  ]) assert.ok(!branchHiddenEntries(repositoryId, preferences, [main, feature], [local]).has(mainKey));
});

test('explicit restore and manual hide keep their original precedence', () => {
  assert.deepEqual([...branchHiddenEntries(repositoryId, { unworkedBranchBehavior: 'hide', shownBranches: [mainKey] }, [main, feature])], [featureKey]);
  assert.ok(branchHiddenEntries(repositoryId, { unworkedBranchBehavior: 'hide', shownBranches: [mainKey], hiddenEntries: [mainKey] }, [{ ...main, hasAccountCommits: true }]).has(mainKey));
});

test('authenticated push keeps multi-branch history visible without claiming authorship', () => {
  const pushed = { ...main, hasAccountPush: true };
  assert.deepEqual([...branchHiddenEntries(repositoryId, { unworkedBranchBehavior: 'hide' }, [pushed, { ...feature, hasAccountPush: true }])], []);
  assert.deepEqual([...branchHiddenEntries(repositoryId, { unworkedBranchBehavior: 'hide' }, [{ ...main, hasAccountPush: false }, feature])], [mainKey, featureKey]);
  assert.ok(branchHiddenEntries(repositoryId, { unworkedBranchBehavior: 'hide', hiddenEntries: [mainKey] }, [pushed, feature]).has(mainKey));
});

test('remote DTO accepts optional push proof and rejects an invalid proof type', () => {
  const workspace = { source: 'remote', checkedAt: 1, complete: true, warnings: [], commits: [], tasks: [{ ...main, treeComplete: true }] };
  assert.ok(isRemoteWorkspace(workspace));
  for (const hasAccountPush of [true, false]) assert.ok(isRemoteWorkspace({ ...workspace, tasks: [{ ...workspace.tasks[0], hasAccountPush }] }));
  assert.ok(!isRemoteWorkspace({ ...workspace, tasks: [{ ...workspace.tasks[0], hasAccountPush: 'true' }] }));
});
