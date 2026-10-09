import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createRemoteServiceFixture } from './remote-service-fixture';
import { AccountService, type SavedState } from '../server/account-service';
import { discoverLocalWorktrees } from '../server/local-discovery';
import { isCatalog, type Catalog } from '../src/import-model';
import { isLocalWorkspace } from '../src/repository-model';
import { associationStatus, gitSignals, linkedTasks } from '../src/branch-links';
import { isRemoteWorkspace } from '../src/remote-repository-model';

async function catalog(service: AccountService) { const result = await service.handle('catalog', {}); assert.ok(isCatalog(result)); return result; }

for (const provider of ['github', 'gitea'] as const) test(`${provider}: parent discovery atomically associates real child worktrees; each reads its own files/Diff`, async t => {
  const f = await createRemoteServiceFixture(provider); t.after(f.cleanup);
  const repo = (await catalog(f.service)).repositories[0];
  await f.git(f.directory, ['remote', 'add', 'origin', repo.url]);
  const before = await catalog(f.service);
  await f.service.handle('link', { repositoryId: f.repositoryId, path: f.directory, branch: 'main' });
  let current = await catalog(f.service); assert.equal(current.links[0].worktrees?.length, 1);
  let local = await f.service.handle('localWorkspace', { repositoryId: f.repositoryId }); assert.ok(isLocalWorkspace(local));
  const remote = await f.service.handle('remoteWorkspace', { repositoryId: f.repositoryId }); assert.ok(isRemoteWorkspace(remote));
  const remoteState = { workspace: remote, error: '', loading: false };
  const localState = { path: current.links[0].path, workspace: local, snapshot: null, error: '', checkedAt: 1 };
  assert.equal(associationStatus(current.links[0], localState, remoteState).label, '部分关联');
  await f.service.handle('link', { repositoryId: f.repositoryId, path: f.root });
  current = await catalog(f.service); assert.equal(current.links[0].path, f.root); assert.equal(current.links[0].worktrees?.length, 2);
  local = await f.service.handle('localWorkspace', { repositoryId: f.repositoryId }); assert.ok(isLocalWorkspace(local));
  assert.equal(local.tasks.length, 2); assert.ok(local.tasks.every(task => task.tree.includes('README.md') && task.files.some(file => file.path === 'src/app.ts')));
  for (const task of local.tasks) {
    const diff = await f.service.handle('diff', { repositoryId: f.repositoryId, taskId: task.id, path: 'src/app.ts' }) as { text: string };
    assert.match(diff.text, task.branch === 'main' ? /value = 10/ : /value = 20/);
  }
  await assert.rejects(f.service.handle('diff', { repositoryId: f.repositoryId, taskId: 'worktree:main:/outside', path: 'src/app.ts' }), /不属于已关联/);
  const revision = current.revision;
  await assert.rejects(f.service.handle('link', { repositoryId: f.repositoryId, path: f.root, branch: 'wrong-name' }), /未找到真实检出分支/);
  assert.equal((await catalog(f.service)).revision, revision);
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(f.service.handle('link', { repositoryId: f.repositoryId, path: f.root }, cancelled.signal));
  assert.equal((await catalog(f.service)).revision, revision);
  assert.deepEqual(current.accounts, before.accounts);
  assert.equal(await f.unchanged(), true);
  const review = join(f.root, 'review'); await f.git(f.directory, ['worktree', 'add', review, 'task/review']);
  await f.service.handle('link', { repositoryId: f.repositoryId, path: f.root }); current = await catalog(f.service);
  const all = await f.service.handle('localWorkspace', { repositoryId: f.repositoryId }); assert.ok(isLocalWorkspace(all));
  assert.equal(associationStatus(current.links[0], { ...localState, path: f.root, workspace: all }, remoteState).label, '完全关联');
  assert.equal(associationStatus(current.links[0], { ...localState, path: f.root, workspace: all }, { ...remoteState, workspace: null }).label, '部分关联');
  await f.service.handle('unlink', { repositoryId: f.repositoryId, branch: 'task/search' });
  const partial = await catalog(f.service); assert.equal(partial.links[0].worktrees?.length, 2);
  assert.equal(await readFile(join(f.feature, 'src/app.ts'), 'utf8'), 'export const value = 20;\n');
  await f.service.handle('unlink', { repositoryId: f.repositoryId }); assert.equal((await catalog(f.service)).links.length, 0);
  assert.equal(await f.unchanged(), true);
});

test('discovery excludes symlink and foreign checkouts, preserves distinct clones and discovers registered nested worktrees', async t => {
  const f = await createRemoteServiceFixture('github'); t.after(f.cleanup);
  const remote = 'https://github.com/qa/project'; await f.git(f.directory, ['remote', 'add', 'origin', remote]);
  const scope = join(f.root, 'container'); await mkdir(scope);
  await symlink(f.directory, join(scope, 'alias'));
  await assert.rejects(discoverLocalWorktrees(scope, remote), /远端不是/);
  const clone = join(scope, 'clone'); await f.git(f.directory, ['clone', f.directory, clone]); await f.git(clone, ['remote', 'set-url', 'origin', remote]);
  const other = join(scope, 'other'); await f.git(f.directory, ['clone', f.directory, other]);
  const nested = join(clone, 'nested'); await f.git(clone, ['worktree', 'add', '-b', 'nested/task', nested]);
  const found = await discoverLocalWorktrees(scope, remote);
  assert.deepEqual(found.worktrees.map(task => task.path).sort(), [clone, nested].sort());
  const all = await discoverLocalWorktrees(f.root, remote);
  assert.equal(all.worktrees.filter(task => task.branch === 'main').length, 2, 'separate clones must not collapse by common remote');
  let deep = join(scope, 'deep'); await mkdir(deep);
  for (let depth = 0; depth < 9; depth++) { deep = join(deep, 'child'); await mkdir(deep); }
  await assert.rejects(discoverLocalWorktrees(scope, remote), /8层/);
});

test('legacy v2 single-directory links read without migration; failed save preserves credential and link state; current branch controls unlink', async t => {
  const f = await createRemoteServiceFixture('gitea'); t.after(f.cleanup);
  const base = await catalog(f.service); const repository = base.repositories[0]; await f.git(f.directory, ['remote', 'add', 'origin', repository.url]);
  let saved: SavedState = { version: 2, accounts: base.accounts.map(account => ({ account, token: 'fixture-persisted-secret' })), repositories: base.repositories, links: [{ repositoryId: repository.id, path: f.directory }] };
  let fail = true;
  const service = new AccountService({ kind: 'encrypted', load: async () => structuredClone(saved), save: async next => { if (fail) throw new Error('Fixture storage failed'); saved = structuredClone(next); } });
  const old = await catalog(service); const workspace = await service.handle('localWorkspace', { repositoryId: repository.id }); assert.ok(isLocalWorkspace(workspace)); assert.equal(workspace.tasks.length, 1);
  await assert.rejects(service.handle('link', { repositoryId: repository.id, path: f.root }), /storage failed/);
  assert.deepEqual(await catalog(service), old); assert.equal(saved.accounts[0].token, 'fixture-persisted-secret');
  fail = false; await service.handle('link', { repositoryId: repository.id, path: f.root });
  const restored = new AccountService({ kind: 'encrypted', load: async () => structuredClone(saved), save: async next => { saved = structuredClone(next); } });
  assert.equal((await catalog(restored)).links[0].worktrees?.length, 2);
  await f.git(f.feature, ['branch', '-m', 'task/search', 'task/renamed']);
  await restored.handle('unlink', { repositoryId: repository.id, branch: 'task/renamed' });
  assert.equal((await catalog(restored)).links[0].worktrees?.length, 1);
  assert.equal(saved.accounts[0].token, 'fixture-persisted-secret'); assert.doesNotMatch(JSON.stringify(await catalog(restored)), /fixture-persisted-secret/);
});

test('lamps distinguish equal, ahead, behind, unknown ancestry, changes, unlinked and read errors', () => {
  const task = { id: 'w', branch: 'main', path: '/qa/main', head: 'local', tree: [], files: [], error: '' };
  const remote = { workspace: { source: 'remote' as const, tasks: [{ ...task, path: null, remote: true, head: 'remote' }], commits: [], complete: true, checkedAt: 1, warnings: [] }, error: '', loading: false };
  const state = { path: '/qa', snapshot: null, error: '', checkedAt: 1, workspace: { tasks: [task], commits: [{ id: 'remote', parents: ['local'], summary: '', author: '', time: '', refs: [] }], complete: true } };
  assert.equal(gitSignals([], remote).pull.tone, 'off');
  const pending = linkedTasks({ repositoryId: 'qa', path: '/qa', worktrees: [{ branch: 'main', path: '/qa/main' }] });
  assert.equal(gitSignals(pending, { workspace: null, error: '', loading: true }, { path: '/qa', snapshot: null, error: '', checkedAt: 0 }).pull.tone, 'off', 'pending verification is not an actual read failure');
  assert.match(gitSignals([task], remote, state).pull.detail, /落后/);
  state.workspace.commits = [{ ...state.workspace.commits[0], id: 'local', parents: ['remote'] }];
  assert.equal(gitSignals([task], remote, state).pull.tone, 'good'); assert.equal(gitSignals([task], remote, state).push.tone, 'warning');
  const synchronized = gitSignals([{ ...task, head: 'remote' }], remote, state);
  assert.equal(synchronized.pull.tone, 'good');
  for (const key of ['latest', 'reconcile', 'clear'] as const) {
    assert.equal(synchronized[key].tone, 'off', `${key}: equal HEADs do not measure storage or file contents`);
    assert.equal(synchronized[key].count, undefined);
  }
  state.workspace.commits = []; const unknown = gitSignals([task], remote, state); assert.equal(unknown.pull.tone, 'warning'); assert.match(unknown.pull.detail, /无法确认领先、落后或分叉/);
  assert.equal(gitSignals([{ ...task, files: [{ path: 'file', status: 'M', tracked: true }] }], remote, state).commit.tone, 'warning');
  assert.equal(gitSignals([{ ...task, error: 'Unreadable' }], remote, state).pull.tone, 'error');
  assert.equal(associationStatus(undefined, state, remote).label, '尚未关联');
});
