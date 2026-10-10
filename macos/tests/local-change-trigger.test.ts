import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, utimes } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRepositoryFixture } from './repository-fixture';
import { readRepositoryWorkspace } from '../server/repository-reader';
import { isLocalWorkspace } from '../src/repository-model';

test('branch fingerprints stay stable on reads and change on another save, staging, deletion and commit', async t => {
  const f = await createRepositoryFixture(); t.after(f.cleanup);
  const scan = async () => ({ ...await readRepositoryWorkspace(f.directory, new Set([f.directory, f.feature])), source: 'local' as const });
  const before = await scan(); const again = await scan();
  assert.ok(isLocalWorkspace(before)); assert.ok(before.tasks.every(task => /^[a-f0-9]{64}$/.test(task.changeKey!)));
  assert.deepEqual(again.tasks.map(task => task.changeKey), before.tasks.map(task => task.changeKey));
  assert.equal(await f.unchanged(), true, 'scans preserve HEAD, branch and index');
  const key = (workspace: typeof before, path: string) => workspace.tasks.find(task => task.path === path)!.changeKey;
  const app = join(f.directory, 'src/app.ts');
  await writeFile(app, 'export const value = 11;\n');
  await utimes(app, new Date(), new Date(Date.now() + 2_000));
  const saved = await scan(); assert.notEqual(key(saved, f.directory), key(before, f.directory));
  assert.equal(key(saved, f.feature), key(before, f.feature), 'another branch keeps its baseline');
  await f.git(f.directory, ['add', 'src/app.ts']);
  const staged = await scan(); assert.notEqual(key(staged, f.directory), key(saved, f.directory));
  await writeFile(app, 'export const value = 12;\n'); await f.git(f.directory, ['add', 'src/app.ts']);
  const restaged = await scan(); assert.notEqual(key(restaged, f.directory), key(staged, f.directory), 'same XY status still detects new index content');
  await f.git(f.directory, ['rm', 'README.md']);
  const deleted = await scan(); assert.notEqual(key(deleted, f.directory), key(restaged, f.directory));
  await f.git(f.directory, ['commit', '-m', 'Trigger fixture change']);
  const committed = await scan(); assert.notEqual(key(committed, f.directory), key(deleted, f.directory));
  assert.notEqual(committed.tasks.find(task => task.path === f.directory)!.head, before.tasks.find(task => task.path === f.directory)!.head);
  assert.equal(await readFile(join(f.feature, 'src/app.ts'), 'utf8'), 'export const value = 20;\n');
  assert.equal(isLocalWorkspace({ ...before, tasks: [{ ...before.tasks[0], changeKey: 'not-a-fingerprint' }] }), false);
});

test('workspace owns linked checks, preserves failed baselines and supplies shared row/page state', () => {
  const workspace = readFileSync(new URL('../src/use-workspace.ts', import.meta.url), 'utf8');
  assert.match(workspace, /if \(task.error\) \{ if \(previous !== undefined\) nextChanges.set\(task.path, previous\); continue; \}/);
  assert.match(workspace, /previous !== undefined && previous !== next/);
  assert.match(workspace, /useRemoteRepositories\(catalog.repositories.filter\(repository => linkedRepositoryIds.has\(repository.id\)\), catalog.instanceId, monitoring, changeVersions\)/);
  const hook = readFileSync(new URL('../src/use-remote-repository.ts', import.meta.url), 'utf8');
  assert.match(hook, /changes\[repository.id\] \?\? 0/); assert.match(hook, /if \(taskFailures\) throw new Error/);
  const scheduler = readFileSync(new URL('../src/use-auto-refresh.ts', import.meta.url), 'utf8');
  assert.match(scheduler, /previous !== undefined && previous !== version\) monitors.current.get\(key\)\?\.trigger\(\)/);
});
