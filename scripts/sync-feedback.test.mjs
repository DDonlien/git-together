import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(join(root, 'desktop/package.json'));
const fixture = mkdtempSync(join(tmpdir(), 'gittogether-sync-feedback-'));
require('esbuild').buildSync({
  entryPoints: [join(root, 'desktop/app/src/ui/gittogether/platform-fetch.ts'), join(root, 'desktop/app/src/ui/gittogether/sync-progress.ts'), join(root, 'macos/src/branch-links.ts'), join(root, 'macos/src/repository-sync-model.ts'), join(root, 'macos/src/repository-model.ts')],
  outdir: fixture, outbase: root, bundle: true, platform: 'node', format: 'cjs', outExtension: { '.js': '.cjs' }, logLevel: 'silent',
});
const load = path => require(join(fixture, path + '.cjs'));
const { PlatformFetchGate, platformFetchMinimumInterval: interval } = load('desktop/app/src/ui/gittogether/platform-fetch');
const { SyncProgressReporter, nativeSyncProgress } = load('desktop/app/src/ui/gittogether/sync-progress');
const { gitSignals } = load('macos/src/branch-links');
const { isRepositorySyncProgress } = load('macos/src/repository-sync-model');
const { isLocalWorkspace } = load('macos/src/repository-model');
after(() => rmSync(fixture, { recursive: true, force: true }));
const repo = { gitHubRepository: null, missing: false };

test('platform Fetch coalesces a shared worktree request and observes the five-minute limit', async () => {
  let now = 1_000_000, fetched = 0, calls = 0, release;
  const gate = new PlatformFetchGate(() => now);
  const native = { lastFetched: () => fetched, busy: () => false, fetch: async () => { calls++; await new Promise(resolve => { release = resolve; }); fetched = now; } };
  const first = gate.run('common', repo, native), second = gate.run('common', repo, native);
  assert.equal(calls, 1); release(); await Promise.all([first, second]);
  await gate.run('common', repo, native); assert.equal(calls, 1);
  now += interval; const third = gate.run('common', repo, native); assert.equal(calls, 2); release(); await third;
});

test('native GitHub scheduling, recent native Fetch, missing and busy directories are left to Desktop', async () => {
  let calls = 0; const now = 2_000_000, gate = new PlatformFetchGate(() => now);
  const native = { lastFetched: () => 0, busy: () => false, fetch: async () => { calls++; } };
  await gate.run('github', { ...repo, gitHubRepository: {} }, native);
  await gate.run('missing', { ...repo, missing: true }, native);
  await gate.run('busy', repo, { ...native, busy: () => true });
  await gate.run('recent', repo, { ...native, lastFetched: () => now - 1 });
  assert.equal(calls, 0);
});

test('background failures retained by upstream get cooldown and an independent directory still fetches', async () => {
  let now = 3_000_000, calls = 0, fetched = 0;
  const gate = new PlatformFetchGate(() => now);
  const native = { lastFetched: () => fetched, busy: () => false, fetch: async () => { calls++; } };
  const failed = await gate.run('broken', repo, native);
  assert.match(failed.error, /Fetch 未能完成/); assert.equal(failed.retryAt, now + interval * 2);
  now++; assert.deepEqual(await gate.run('broken', repo, native), failed); assert.equal(calls, 1);
  await gate.run('healthy', repo, { ...native, fetch: async () => { calls++; fetched = now; } }); assert.equal(calls, 2);
  now = failed.retryAt;
  const again = await gate.run('broken', repo, { ...native, fetch: async () => { calls++; throw new Error('offline'); } });
  assert.equal(again.error, 'offline'); assert.equal(again.retryAt, now + interval * 4);
});

const task = { id: 'worktree:local-main:/fixture', branch: 'local-main', head: 'local', path: '/fixture', files: [], tree: [], error: '', tracking: { upstream: 'enterprise/main', ahead: 3, behind: 1230 } };
test('native upstream counts survive a truncated or unavailable graph and clear after Pull', () => {
  for (const remote of [{ workspace: null, loading: false, error: '' }, { workspace: null, loading: true, error: 'HTTP 503' }]) {
    const signals = gitSignals([task], remote);
    assert.equal(signals.pull.count, 1230); assert.equal(signals.push.count, 3);
    assert.match(signals.pull.detail, /enterprise\/main/); assert.match(signals.pull.detail, /分叉/);
    assert.equal(gitSignals([{ ...task, tracking: { ...task.tracking, behind: 0 } }], remote).pull.count, 0);
  }
  const unknown = gitSignals([{ ...task, tracking: { upstream: null, ahead: null, behind: null } }], { workspace: null, loading: false, error: '' });
  assert.equal(unknown.pull.count, undefined); assert.equal(unknown.push.count, undefined);
});

test('counts aggregate actual commits across work directories and the boundary rejects invalid counts', () => {
  const signals = gitSignals([task, { ...task, id: 'other', tracking: { ...task.tracking, ahead: 2, behind: 7 } }], { workspace: null, error: '', loading: false });
  assert.equal(signals.pull.count, 1237); assert.equal(signals.push.count, 5);
  const workspace = { source: 'local', complete: true, tasks: [task], commits: [] };
  assert.equal(isLocalWorkspace(workspace), true);
  for (const behind of [-1, NaN, 0.5, '7']) assert.equal(isLocalWorkspace({ ...workspace, tasks: [{ ...task, tracking: { ...task.tracking, behind } }] }), false);
});

test('Pull displays real phase percentages and never the estimated overall native weights', () => {
  assert.deepEqual(nativeSyncProgress({ kind: 'pull', value: 0.2, remote: 'enterprise', description: 'Receiving objects: 37% (37/100), 1.2 MiB | 200 KiB/s' }), { title: '接收提交对象', description: 'Receiving objects: 37% (37/100), 1.2 MiB | 200 KiB/s', value: 0.37 });
  assert.equal(nativeSyncProgress({ kind: 'generic', value: 0.95, title: 'Refreshing Repository' }).value, null);
  assert.equal(nativeSyncProgress({ kind: 'pull', value: 0, remote: 'origin' }).value, null);
  assert.equal(nativeSyncProgress(null).value, null);
  assert.equal(nativeSyncProgress({ kind: 'pull', value: 0.3, remote: 'origin', description: 'Filtering content: 50% (1/2)' }).title, '下载大文件');
});

test('progress identity, elapsed timestamps and failure state are preserved without fabricating completion', () => {
  let now = 4_000_000; const events = [];
  const reporter = new SyncProgressReporter({ repositoryId: 'repo', taskId: 'task', operationId: 'operation' }, event => events.push(event), () => now);
  now += 20_000; reporter.native({ kind: 'pull', remote: 'origin', value: 0.6, description: 'Resolving deltas: 80% (8/10)' });
  reporter.native({ kind: 'pull', remote: 'origin', value: 0.6, description: 'Resolving deltas: 80% (8/10)' }); assert.equal(events.length, 2);
  reporter.finish('failed', '需要处理冲突');
  assert.equal(events.at(-1).state, 'failed'); assert.equal(events.at(-1).value, null); assert.equal(events.at(-1).startedAt, 4_000_000);
  assert.equal(events.at(-1).updatedAt, 4_020_000); assert.ok(events.every(isRepositorySyncProgress));
  reporter.finish('completed'); assert.equal(events.at(-1).value, 1);
  assert.equal(isRepositorySyncProgress({ ...events.at(-1), value: 1.1 }), false);
});
