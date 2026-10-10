import test from 'node:test';
import assert from 'node:assert/strict';
import { associationStatus, hiddenEntryKey, linkedTasks } from '../src/branch-links';
import type { LocalLink } from '../src/import-model';
import type { RemoteRepositoryState } from '../src/remote-repository-model';
import type { LocalRepositoryState } from '../src/use-workspace';

const task = (branch: string, error = '') => ({ id: `worktree:${branch}`, branch, path: `/qa/${branch}`, head: 'a'.repeat(40), tree: [], files: [], error });
const link: LocalLink = { repositoryId: 'personal:1', path: '/qa', worktrees: [{ branch: 'main', path: '/qa/main' }, { branch: 'feature', path: '/qa/feature' }] };
const local: LocalRepositoryState = { path: link.path, snapshot: null, error: '', checkedAt: 1, workspace: { tasks: [task('main'), task('feature')], commits: [], complete: true } };
const remote: RemoteRepositoryState = { error: '', loading: false, workspace: { source: 'remote', checkedAt: 1, warnings: [], complete: true, commits: [], tasks: ['main', 'feature', 'review'].map(branch => ({ ...task(branch), path: null, remote: true })) } };
const hidden = (...branches: string[]) => new Set(branches.map(branch => hiddenEntryKey(link.repositoryId, branch)));

test('hiding an unlinked remote branch permits complete association; restoring it restores partial association', () => {
  assert.equal(associationStatus(link, local, remote).label, '部分关联');
  const status = associationStatus(link, local, remote, hidden('review'));
  assert.equal(status.label, '完全关联'); assert.match(status.detail, /^2\/2 个分支已验证/);
  assert.match(associationStatus(link, local, remote, new Set()).detail, /^2\/3 个分支已验证/);
});

test('hidden local worktree errors do not block visible branches, but a whole local read failure still does', () => {
  const failed = { ...local, workspace: { ...local.workspace!, tasks: [task('main'), task('feature', '工作目录已不存在')] } };
  assert.equal(associationStatus(link, failed, remote, hidden('review')).label, '部分关联');
  const status = associationStatus(link, failed, remote, hidden('feature', 'review'));
  assert.equal(status.label, '完全关联'); assert.match(status.detail, /^1\/1 个分支已验证/);
  assert.doesNotMatch(status.detail, /工作目录已不存在/);
  assert.equal(associationStatus(link, { ...failed, error: '读取本地状态失败' }, remote, hidden('feature', 'review')).label, '部分关联');
  assert.equal(linkedTasks(link, failed).length, 2, 'unfiltered Git readers still receive both saved worktrees');
});

test('hiding all associated branches leaves visible remote branches unlinked and never produces vacuous completeness', () => {
  assert.equal(associationStatus(link, local, remote, hidden('main', 'feature')).label, '尚未关联');
  const status = associationStatus(link, local, remote, hidden('main', 'feature', 'review'));
  assert.equal(status.label, '尚未关联'); assert.match(status.detail, /^0\/0 个分支已验证/);
  assert.deepEqual(linkedTasks(link, local, hidden('main', 'feature')), []);
  assert.equal(link.worktrees!.length, 2); assert.equal(local.workspace!.tasks.length, 2);
});

test('hiding cannot turn unverified local tasks or missing, failed or truncated remote branch reads into completeness', () => {
  const entries = hidden('feature', 'review');
  assert.equal(associationStatus(link, undefined, remote, entries).label, '部分关联');
  for (const state of [{ ...remote, workspace: null }, { ...remote, error: '网络不可用' }, { ...remote, workspace: { ...remote.workspace!, warnings: ['分支超过读取上限'] } }]) {
    const status = associationStatus(link, local, state, entries);
    assert.equal(status.label, '部分关联'); assert.match(status.detail, /远端分支范围尚未完整读取/);
  }
});

test('current read branch identity controls hiding, while pending reads use the saved branch identity', () => {
  const saved = { ...link, worktrees: [{ branch: 'old', path: '/qa/main' }] };
  const actual = { ...local, workspace: { ...local.workspace!, tasks: [task('main')] } };
  assert.equal(linkedTasks(saved, undefined, hidden('old')).length, 0);
  assert.equal(linkedTasks(saved, actual, hidden('old')).length, 1);
  assert.equal(linkedTasks(saved, actual, hidden('main')).length, 0);
});

test('hide keys isolate accounts, repository-level choices and literal branch names', () => {
  const entries = new Set([hiddenEntryKey('work:1', 'review'), hiddenEntryKey(link.repositoryId)]);
  assert.equal(associationStatus(link, local, remote, entries).label, '部分关联');
  assert.equal(linkedTasks(link, local, entries).length, 2);
  const branch = 'feature/"quoted"/[]';
  assert.deepEqual(JSON.parse(hiddenEntryKey(link.repositoryId, branch)), [link.repositoryId, branch]);
  assert.notEqual(hiddenEntryKey(link.repositoryId), hiddenEntryKey(link.repositoryId, 'null'));
});
