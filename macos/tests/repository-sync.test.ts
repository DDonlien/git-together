import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createGitNetworkFixture } from './git-network-fixture';
import { readRepositoryWorkspace } from '../server/repository-reader';
import { repositoryNetwork } from '../server/repository-network';
import { prepareRepositorySync, applyRepositorySync } from '../server/repository-sync';
import type { RepositorySyncPlan, RepositorySyncResult } from '../src/repository-sync-model';
import type { LocalSubmitResult, LocalPushResult } from '../src/local-submit-model';
import { downloadBranchWorktree } from '../server/branch-download';
import { diagnosticCode } from '../src/diagnostics-model';

const task = async (f: Awaited<ReturnType<typeof createGitNetworkFixture>>, root = f.directory) => (await readRepositoryWorkspace(root, new Set([root]))).tasks.find(t => t.path === root)!;
const prepare = async (f: Awaited<ReturnType<typeof createGitNetworkFixture>>, mode: 'pull' | 'latest' | 'clean') => f.service.handle('prepareSync', { repositoryId: f.repository.id, taskId: (await task(f)).id, mode }) as Promise<RepositorySyncPlan>;
const apply = (f: Awaited<ReturnType<typeof createGitNetworkFixture>>, plan: RepositorySyncPlan, operationId = randomUUID()) => f.service.handle('applySync', { repositoryId: f.repository.id, taskId: plan.taskId, planId: plan.id, operationId }) as Promise<RepositorySyncResult>;

test('real background fetch updates remote tracking refs and leaves HEAD, index and files unchanged', async t => {
  const f = await createGitNetworkFixture(); t.after(f.cleanup);
  const before = await f.git(f.directory, ['rev-parse', 'HEAD']), index = await readFile(join(f.directory, '.git/index'));
  const head = await f.advance('second\n'); await writeFile(join(f.directory, 'local-only.txt'), 'uncommitted');
  const fetched = await f.service.handle('fetchRepository', { repositoryId: f.repository.id }) as { branches: number; checkedAt: number };
  assert.equal(fetched.branches, 1); assert.ok(fetched.checkedAt > 0);
  assert.equal(await f.git(f.directory, ['rev-parse', 'refs/remotes/origin/main']), head);
  assert.equal(await f.git(f.directory, ['rev-parse', 'HEAD']), before); assert.ok(index.equals(await readFile(join(f.directory, '.git/index'))));
  assert.equal(await readFile(join(f.directory, 'README.md'), 'utf8'), 'first\n'); assert.equal(await readFile(join(f.directory, 'local-only.txt'), 'utf8'), 'uncommitted');
});

test('Pull previews incoming paths and performs a real fast-forward once', async t => {
  const f = await createGitNetworkFixture(); t.after(f.cleanup); const head = await f.advance('second\n');
  const plan = await prepare(f, 'pull'); assert.deepEqual(plan.files, [{ path: 'README.md', action: 'restore' }]);
  const id = randomUUID(), result = await apply(f, plan, id); assert.equal(result.head, head); assert.equal(await readFile(join(f.directory, 'README.md'), 'utf8'), 'second\n');
  assert.deepEqual(await apply(f, plan, id), result);
});

test('Pull rejects dirty workspaces and divergent histories without creating merges or discarding commits', async t => {
  const f = await createGitNetworkFixture(); t.after(f.cleanup); await f.advance('remote\n');
  await writeFile(join(f.directory, 'local.txt'), 'local'); await assert.rejects(prepare(f, 'pull'), /先 Commit/);
  await f.git(f.directory, ['add', '.']); await f.git(f.directory, ['commit', '-m', 'local']); const head = await f.git(f.directory, ['rev-parse', 'HEAD']);
  await assert.rejects(prepare(f, 'pull'), /分叉/); assert.equal(await f.git(f.directory, ['rev-parse', 'HEAD']), head); assert.equal(await readFile(join(f.directory, 'local.txt'), 'utf8'), 'local');
});

test('Clean previews tracked, untracked and ignored files, restores the remote version and preserves index bytes and local commits', async t => {
  const f = await createGitNetworkFixture(); t.after(f.cleanup);
  await writeFile(join(f.directory, 'staged.txt'), 'staged'); await f.git(f.directory, ['add', 'staged.txt']);
  await writeFile(join(f.directory, 'README.md'), 'edited'); await writeFile(join(f.directory, 'extra.txt'), 'extra'); await writeFile(join(f.directory, 'ignored.txt'), 'ignored');
  const before = await f.git(f.directory, ['rev-parse', 'HEAD']), index = await readFile(join(f.directory, '.git/index'));
  const plan = await prepare(f, 'clean'); assert.deepEqual(plan.files, [
    { path: 'README.md', action: 'restore' }, { path: 'extra.txt', action: 'delete' }, { path: 'ignored.txt', action: 'delete' }, { path: 'staged.txt', action: 'delete' },
  ]);
  await apply(f, plan); assert.equal(await readFile(join(f.directory, 'README.md'), 'utf8'), 'first\n');
  assert.equal(await f.git(f.directory, ['rev-parse', 'HEAD']), before); assert.ok(index.equals(await readFile(join(f.directory, '.git/index'))));
  for (const path of ['extra.txt', 'ignored.txt', 'staged.txt']) await assert.rejects(readFile(join(f.directory, path)), { code: 'ENOENT' });
});

test('stale local/index and remote snapshots stop Clean before modifying files', async t => {
  const f = await createGitNetworkFixture(); t.after(f.cleanup); await writeFile(join(f.directory, 'README.md'), 'local');
  const plan = await prepare(f, 'clean'); await writeFile(join(f.directory, 'README.md'), 'new edit');
  await assert.rejects(apply(f, plan), /已变化/); assert.equal(await readFile(join(f.directory, 'README.md'), 'utf8'), 'new edit');
  const next = await prepare(f, 'clean'); await f.advance('remote changed\n'); await assert.rejects(apply(f, next), /远端分支已更新/); assert.equal(await readFile(join(f.directory, 'README.md'), 'utf8'), 'new edit');
});

test('nested repositories and independently owned index locks are retained', async t => {
  const f = await createGitNetworkFixture(); t.after(f.cleanup); const nested = join(f.directory, 'independent'); await mkdir(nested); await f.git(nested, ['init']);
  await assert.rejects(prepare(f, 'clean'), /独立 Git 仓库/); assert.ok((await readdir(nested)).includes('.git')); await rm(nested, { recursive: true });
  const plan = await prepare(f, 'clean'); await writeFile(join(f.directory, '.git/index.lock'), 'other writer');
  await assert.rejects(apply(f, plan), /暂存区正在使用/); assert.equal(await readFile(join(f.directory, '.git/index.lock'), 'utf8'), 'other writer');
});

test('Get Latest downloads and verifies depth one, removes old Git objects and retains local commit settings', async t => {
  const f = await createGitNetworkFixture(); t.after(f.cleanup); const old = await f.git(f.directory, ['rev-parse', 'HEAD']);
  await f.advance('second\n'); const head = await f.advance('third\n');
  const plan = await prepare(f, 'latest'); assert.equal(plan.protectedHistory, false); await apply(f, plan);
  assert.equal(await f.git(f.directory, ['rev-parse', 'HEAD']), head); assert.equal(await f.git(f.directory, ['rev-list', '--count', 'HEAD']), '1');
  await assert.rejects(f.git(f.directory, ['cat-file', '-e', old])); assert.equal(await f.git(f.directory, ['config', '--local', 'user.name']), 'QA');
  assert.equal(await readFile(join(f.directory, 'README.md'), 'utf8'), 'third\n'); assert.ok(!(await readdir(f.root)).some(name => name.startsWith('.gittogether-sync-')));
});

test('Get Latest failures leave original history and working files intact; primary shared repositories are protected', async t => {
  const f = await createGitNetworkFixture(); t.after(f.cleanup); const old = await f.git(f.directory, ['rev-parse', 'HEAD']); f.setFailure(true);
  await assert.rejects(prepare(f, 'latest'), /Git 操作未完成/); assert.equal(await f.git(f.directory, ['rev-parse', 'HEAD']), old); assert.equal(await readFile(join(f.directory, 'README.md'), 'utf8'), 'first\n');
  f.setFailure(false); const feature = join(f.root, 'feature'); await f.git(f.directory, ['worktree', 'add', '-b', 'feature', feature]);
  await assert.rejects(prepare(f, 'latest'), /其他分支/); assert.equal(await f.git(feature, ['rev-parse', 'HEAD']), old);
});

test('Get Latest isolates a linked worktree and preserves the other worktree and shared history', async t => {
  const f = await createGitNetworkFixture(); t.after(f.cleanup); await f.advance('second\n'); await f.advance('third\n'); await apply(f, await prepare(f, 'pull'));
  const linked = join(f.root, 'linked'); await f.git(f.directory, ['worktree', 'add', '-b', 'feature', linked]); await f.git(f.directory, ['push', f.bare, 'feature']);
  const before = await f.git(f.directory, ['show-ref']), otherIndex = await readFile(join(f.directory, '.git/index'));
  const network = repositoryNetwork(f.repository, f.account, 'isolated-qa-token'), local = await task(f, linked);
  const plan = await prepareRepositorySync(linked, { repositoryId: f.repository.id, taskId: local.id, mode: 'latest' }, network, join(f.root, 'managed'), () => {});
  assert.equal(plan.public.protectedHistory, true); const result = await applyRepositorySync(plan, network, () => {}); assert.equal(result.reclaimedBytes, 0);
  const after = (await f.git(f.directory, ['show-ref'])).split('\n'); for (const ref of before.split('\n')) assert.ok(after.includes(ref));
  assert.equal(await f.git(f.directory, ['rev-list', '--count', 'HEAD']), '3'); assert.ok(otherIndex.equals(await readFile(join(f.directory, '.git/index'))));
  assert.equal(await f.git(linked, ['rev-list', '--count', 'HEAD']), '1'); assert.equal(await f.git(linked, ['rev-parse', '--git-common-dir']), '.git');
});

test('snapshot hydration preserves current LFS bytes and removes the old private historical LFS cache', async t => {
  const f = await createGitNetworkFixture(); t.after(f.cleanup);
  const content = Buffer.from('isolated LFS content\n'.repeat(1000)), oid = createHash('sha256').update(content).digest('hex'); f.objects.set(oid, content);
  await writeFile(join(f.writer, '.gitattributes'), '*.bin filter=lfs diff=lfs merge=lfs -text\n');
  await writeFile(join(f.writer, 'asset.bin'), `version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize ${content.length}\n`);
  await f.git(f.writer, ['add', '.']); await f.git(f.writer, ['commit', '-m', 'LFS']); await f.git(f.writer, ['push', 'origin', 'main']);
  const historical = join(f.directory, '.git/lfs/objects/aa/bb/old'); await mkdir(join(f.directory, '.git/lfs/objects/aa/bb'), { recursive: true }); await writeFile(historical, 'old historical cache');
  const plan = await prepare(f, 'latest'); await apply(f, plan); assert.ok(content.equals(await readFile(join(f.directory, 'asset.bin'))));
  assert.ok(content.equals(await readFile(join(f.directory, '.git/lfs/objects', oid.slice(0, 2), oid.slice(2, 4), oid)))); await assert.rejects(readFile(historical), { code: 'ENOENT' });
});

test('real Commit then Push is authenticated, idempotent and pushes only the selected commit', async t => {
  const f = await createGitNetworkFixture(); t.after(f.cleanup); await writeFile(join(f.directory, 'selected.txt'), 'selected'); const change = await task(f);
  const committed = await f.service.handle('submitCommit', { repositoryId: f.repository.id, taskId: change.id, expectedHead: change.head, changeKey: change.changeKey, operationId: randomUUID(), summary: 'selected', description: '' }) as LocalSubmitResult;
  await writeFile(join(f.directory, 'later.txt'), 'later'); await f.git(f.directory, ['add', '.']); await f.git(f.directory, ['commit', '-m', 'later']); const head = await f.git(f.directory, ['rev-parse', 'HEAD']);
  const input = { repositoryId: f.repository.id, taskId: change.id, expectedHead: head, commitId: committed.commitId, operationId: randomUUID() };
  const pushed = await f.service.handle('pushCommit', input) as LocalPushResult; assert.equal(pushed.commitId, committed.commitId); assert.equal(await f.git(f.bare, ['rev-parse', 'main']), committed.commitId);
  assert.deepEqual(await f.service.handle('pushCommit', input), pushed); assert.notEqual(head, committed.commitId);
});

test('finite sync API rejects foreign tasks, injected origins and recycled operation ids', async t => {
  const f = await createGitNetworkFixture(); t.after(f.cleanup); const current = await task(f);
  await assert.rejects(f.service.handle('fetchRepository', { repositoryId: f.repository.id, remote: 'https://elsewhere.test' }), /仅接受/);
  await assert.rejects(f.service.handle('prepareSync', { repositoryId: f.repository.id, taskId: 'worktree:main:/outside', mode: 'clean' }), /不属于/);
  const plan = await prepare(f, 'clean'); await assert.rejects(apply(f, { ...plan, taskId: 'worktree:main:/outside' }), /预览已过期/);
  const id = randomUUID(); await apply(f, plan, id); const next = await prepare(f, 'clean'); await assert.rejects(apply(f, next, id), /标识已被使用/);
  await f.service.handle('discardSync', { repositoryId: f.repository.id, taskId: current.id, planId: next.id });
});

test('background fetch, Commit and Push serialize on a shared object store', async t => {
  const f = await createGitNetworkFixture(); t.after(f.cleanup); await writeFile(join(f.directory, 'serial.txt'), 'serial'); const change = await task(f);
  const committed = await f.service.handle('submitCommit', { repositoryId: f.repository.id, taskId: change.id, expectedHead: change.head, changeKey: change.changeKey, operationId: randomUUID(), summary: 'serial', description: '' }) as LocalSubmitResult;
  const fetched = f.service.handle('fetchRepository', { repositoryId: f.repository.id });
  const input = { repositoryId: f.repository.id, taskId: change.id, expectedHead: committed.commitId, commitId: committed.commitId, operationId: randomUUID() };
  const [result] = await Promise.all([f.service.handle('pushCommit', input), fetched]); assert.equal((result as LocalPushResult).commitId, committed.commitId);
  assert.equal(await f.git(f.bare, ['rev-parse', 'main']), committed.commitId);
});

test('non-fast-forward Push preserves the local commit and remote branch', async t => {
  const f = await createGitNetworkFixture(); t.after(f.cleanup); await writeFile(join(f.directory, 'local.txt'), 'local'); const change = await task(f);
  const committed = await f.service.handle('submitCommit', { repositoryId: f.repository.id, taskId: change.id, expectedHead: change.head, changeKey: change.changeKey, operationId: randomUUID(), summary: 'local', description: '' }) as LocalSubmitResult;
  const remote = await f.advance('diverged remote\n');
  await assert.rejects(f.service.handle('pushCommit', { repositoryId: f.repository.id, taskId: change.id, expectedHead: committed.commitId, commitId: committed.commitId, operationId: randomUUID() }), /远端已有新提交.*本地提交已保留/);
  assert.equal(await f.git(f.directory, ['rev-parse', 'HEAD']), committed.commitId); assert.equal(await f.git(f.bare, ['rev-parse', 'main']), remote);
});

test('an unavailable LFS hook produces a specific safe error and keeps the commit for a Push-only retry', async t => {
  const f = await createGitNetworkFixture(); t.after(f.cleanup);
  const remote = await f.git(f.bare, ['rev-parse', 'main']);
  await writeFile(join(f.directory, 'local.txt'), 'local'); const change = await task(f);
  const committed = await f.service.handle('submitCommit', { repositoryId: f.repository.id, taskId: change.id, expectedHead: change.head, changeKey: change.changeKey, operationId: randomUUID(), summary: 'local', description: '' }) as LocalSubmitResult;
  const hooks = join(f.root, 'hooks'); await mkdir(hooks); await f.git(f.directory, ['config', 'core.hooksPath', hooks]);
  const hook = join(hooks, 'pre-push');
  await writeFile(hook, '#!/bin/sh\nprintf "This repository is configured for Git LFS but git-lfs was not found. PRIVATE_PROVIDER_RESPONSE\\n" >&2\nexit 2\n'); await chmod(hook, 0o700);
  const input = { repositoryId: f.repository.id, taskId: change.id, expectedHead: committed.commitId, commitId: committed.commitId, operationId: randomUUID() };
  await assert.rejects(f.service.handle('pushCommit', input), problem => {
    assert.ok(problem instanceof Error); assert.match(problem.message, /未找到可运行的 Git LFS.*本地提交已保留/);
    assert.doesNotMatch(problem.message, /PRIVATE_PROVIDER_RESPONSE|分支权限/); assert.equal(diagnosticCode(problem), 'git-lfs-missing'); return true;
  });
  assert.equal(await f.git(f.directory, ['rev-parse', 'HEAD']), committed.commitId); assert.equal(await f.git(f.bare, ['rev-parse', 'main']), remote);
  await rm(hook); const pushed = await f.service.handle('pushCommit', input) as LocalPushResult;
  assert.equal(pushed.commitId, committed.commitId); assert.equal(await f.git(f.bare, ['rev-parse', 'main']), committed.commitId);
  assert.equal(await f.git(f.directory, ['rev-parse', 'HEAD']), committed.commitId);
});

test('Get Latest preserves unpublished commits and rejects another index writer', async t => {
  const f = await createGitNetworkFixture(); t.after(f.cleanup); await writeFile(join(f.directory, 'unpublished.txt'), 'unpublished'); await f.git(f.directory, ['add', '.']); await f.git(f.directory, ['commit', '-m', 'unpublished']);
  const head = await f.git(f.directory, ['rev-parse', 'HEAD']); await assert.rejects(prepare(f, 'latest'), /未推送/); assert.equal(await f.git(f.directory, ['rev-parse', 'HEAD']), head);
  await f.git(f.directory, ['push', f.bare, 'main']); const plan = await prepare(f, 'latest'); await writeFile(join(f.directory, '.git/index.lock'), 'external writer');
  await assert.rejects(apply(f, plan), /暂存区正在使用/); assert.equal(await readFile(join(f.directory, '.git/index.lock'), 'utf8'), 'external writer');
});

test('Get Latest reclaims the exclusive application-owned bare object store only after publishing verified files', async t => {
  const f = await createGitNetworkFixture(); t.after(f.cleanup); const storageRoot = join(f.root, 'managed');
  const root = await downloadBranchWorktree({ repository: f.repository, account: f.account, token: 'isolated-qa-token', branch: 'main', parentPath: f.root, folderName: 'downloaded', storageRoot, validate: () => {} });
  const common = (await f.git(root, ['rev-parse', '--git-common-dir'])).trim(); const current = await task(f, root), network = repositoryNetwork(f.repository, f.account, 'isolated-qa-token');
  const plan = await prepareRepositorySync(root, { repositoryId: f.repository.id, taskId: current.id, mode: 'latest' }, network, storageRoot, () => {}); assert.equal(plan.reclaimStore, true);
  await applyRepositorySync(plan, network, () => {}); await assert.rejects(readdir(common), { code: 'ENOENT' }); assert.equal(await f.git(root, ['rev-list', '--count', 'HEAD']), '1');
});

test('Clean handles file/directory transitions and symlinks without following a link outside the selected directory', async t => {
  const f = await createGitNetworkFixture(); t.after(f.cleanup);
  await mkdir(join(f.writer, 'folder')); await writeFile(join(f.writer, 'folder/remote.txt'), 'remote'); await f.git(f.writer, ['add', '.']); await f.git(f.writer, ['commit', '-m', 'folder']); await f.git(f.writer, ['push', 'origin', 'main']);
  await writeFile(join(f.directory, 'folder'), 'local file'); const outside = join(f.root, 'outside.txt'); await writeFile(outside, 'outside'); const { symlink } = await import('node:fs/promises'); await symlink(outside, join(f.directory, 'link'));
  const plan = await prepare(f, 'clean'); await apply(f, plan); assert.equal(await readFile(join(f.directory, 'folder/remote.txt'), 'utf8'), 'remote'); assert.equal(await readFile(outside, 'utf8'), 'outside'); await assert.rejects(readFile(join(f.directory, 'link')), { code: 'ENOENT' });
});

test('Pull hydrates newly added LFS files after the fast-forward', async t => {
  const f = await createGitNetworkFixture(); t.after(f.cleanup); const content = Buffer.from('LFS pull bytes\n'.repeat(1000)), oid = createHash('sha256').update(content).digest('hex'); f.objects.set(oid, content);
  await writeFile(join(f.writer, '.gitattributes'), '*.bin filter=lfs diff=lfs merge=lfs -text\n'); await writeFile(join(f.writer, 'asset.bin'), `version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize ${content.length}\n`);
  await f.git(f.writer, ['add', '.']); await f.git(f.writer, ['commit', '-m', 'LFS pull']); await f.git(f.writer, ['push', 'origin', 'main']);
  const result = await apply(f, await prepare(f, 'pull')); assert.equal(result.warning, undefined); assert.ok(content.equals(await readFile(join(f.directory, 'asset.bin'))));
});
