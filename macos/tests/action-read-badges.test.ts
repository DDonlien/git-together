import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { gitSignals, type GitSignals } from '../src/branch-links';
import { RepositoryActions } from '../src/RepositoryActions';
import { preserveLocalWorkspace, type RepositoryWorkspace } from '../src/repository-model';
import { preserveRemoteWorkspace, type RemoteRepositoryState } from '../src/remote-repository-model';
import { createRemoteServiceFixture } from './remote-service-fixture';
import { isCatalog } from '../src/import-model';
import { isLocalWorkspace } from '../src/repository-model';
import { isRemoteWorkspace } from '../src/remote-repository-model';

const task = { id: 'worktree:main:/qa/main', branch: 'main', path: '/qa/main', head: 'stable-head', tree: ['a.ts'], files: Array.from({ length: 4 }, (_, index) => ({ path: `${index}.ts`, tracked: true, status: 'M' })), error: '' };
const local = { path: '/qa', snapshot: null, checkedAt: 1, error: '', loading: false, workspace: { source: 'local' as const, complete: true, tasks: [task], commits: [] } };
const remote: RemoteRepositoryState = { workspace: { source: 'remote', complete: true, checkedAt: 1, warnings: [], tasks: [{ ...task, id: 'remote:main', path: null, files: [], remote: true }], commits: [] }, loading: false, error: '' };
const counts = (signals: GitSignals) => Object.fromEntries(Object.entries(signals).map(([key, value]) => [key, value.count]));
const render = (signals: GitSignals) => renderToStaticMarkup(createElement(RepositoryActions, { label: '隔离验证', signals }));

test('unchanged Git numbers survive remote refresh, failure, retry and recovery independently of read badges', () => {
  const healthy = gitSignals([task], remote, local);
  assert.equal(healthy.commit.count, 4); assert.equal(healthy.pull.count, 0);
  for (const state of [{ ...remote, loading: true }, { ...remote, error: 'HTTP 503' }, { ...remote, loading: true, error: 'HTTP 503' }, remote]) {
    const signals = gitSignals([task], state, local);
    assert.deepEqual(counts(signals), counts(healthy));
    assert.equal(signals.commit.status, undefined, 'remote health never contaminates Commit');
    assert.equal(signals.pull.status, state.loading ? 'reading' : state.error ? 'error' : undefined);
  }
  const waiting = render(gitSignals([task], { ...remote, loading: true }, local));
  assert.match(waiting, /git-action-badge warning">4</); assert.doesNotMatch(waiting, /git-action-badge [^"]+">0</);
  assert.doesNotMatch(waiting, /git-action-read-badge reading|git-action-read-spinner/);
  const failed = render(gitSignals([task], { ...remote, error: 'HTTP 503' }, local));
  assert.match(failed, /git-action-read-badge error">!</); assert.doesNotMatch(failed, /git-action-badge error">1</);
  assert.match(failed, /HTTP 503/); assert.match(failed, /不代表本次读取成功/);
  assert.doesNotMatch(render(healthy), /git-action-read-badge/);
});

test('initial reads, unavailable accounts and unlinked errors never invent numeric counts', () => {
  for (const state of [{ workspace: null, loading: true, error: '' }, { workspace: null, loading: false, error: 'HTTP 429' }]) {
    const signals = gitSignals([], state);
    assert.ok(Object.values(signals).every(signal => signal.count === undefined));
    assert.equal(signals.fetch.status, state.loading ? 'reading' : 'error');
    assert.equal(signals.commit.status, undefined);
  }
  const denied = gitSignals([task], remote, local, undefined, false);
  assert.equal(denied.fetch.status, 'error'); assert.equal(denied.commit.count, 4);
  assert.equal(denied.commit.status, undefined);
  for (const key of ['fetch', 'latest', 'reconcile', 'clear'] as const) assert.equal(denied[key].count, undefined);
});

test('a failed remote task keeps cached numbers, and its error does not spread to another branch', () => {
  const previous = remote.workspace!;
  const second = { ...previous.tasks[0], id: 'remote:other', branch: 'other' };
  const workspace = preserveRemoteWorkspace({ ...previous, tasks: [...previous.tasks, second] }, { ...previous, complete: false, tasks: [{ ...previous.tasks[0], head: 'new-head', tree: [], error: 'branch timeout' }, second] });
  const state = { ...remote, workspace };
  assert.equal(gitSignals([task], state, local, 'main').pull.count, 0);
  assert.equal(gitSignals([task], state, local, 'main').pull.status, 'error');
  const other = { ...task, id: 'worktree:other:/qa/other', path: '/qa/other', branch: 'other' };
  assert.equal(gitSignals([other], state, local, 'other').pull.status, undefined);
  assert.equal(gitSignals([task, other], state, local).pull.status, 'error');
});

test('partial local failures keep exact task files/HEAD/history, including repeated unborn failures, without reviving removed tasks', () => {
  const previous = local.workspace;
  const failed: RepositoryWorkspace = { ...previous, complete: false, tasks: [{ ...task, head: '', files: [], tree: [], error: 'Git timeout' }] };
  const kept = preserveLocalWorkspace(previous, failed);
  assert.equal(kept.tasks[0].head, task.head); assert.deepEqual(kept.tasks[0].files, task.files);
  const signals = gitSignals(kept.tasks, remote, { ...local, workspace: kept });
  assert.equal(signals.commit.count, 4); assert.equal(signals.commit.status, 'error'); assert.equal(signals.pull.count, 0);
  assert.equal(signals.fetch.status, undefined);
  const unborn = { ...previous, tasks: [{ ...task, head: '' }] };
  assert.equal(preserveLocalWorkspace(preserveLocalWorkspace(unborn, failed), failed).tasks[0].files.length, 4);
  assert.equal(preserveLocalWorkspace(previous, previous), previous);
  const changedPath = { ...failed, tasks: [{ ...failed.tasks[0], path: '/qa/new', id: 'worktree:main:/qa/new' }] };
  assert.equal(preserveLocalWorkspace(previous, changedPath), changedPath);
  const changedBranch = { ...failed, tasks: [{ ...failed.tasks[0], branch: 'new-branch' }] };
  assert.equal(preserveLocalWorkspace(previous, changedBranch), changedBranch);
  const removed = { ...previous, tasks: [] }; assert.equal(preserveLocalWorkspace(previous, removed), removed);
  assert.equal(preserveLocalWorkspace(undefined, failed), failed, 'a new mapping cannot inherit prior data');
});

test('local loading/errors only affect dependent actions; successful changed data updates numbers', () => {
  for (const state of [{ ...local, loading: true }, { ...local, error: 'Git timeout' }, { ...local, loading: true, error: 'Git timeout' }]) {
    const signals = gitSignals([task], remote, state);
    assert.equal(signals.commit.count, 4); assert.equal(signals.pull.count, 0);
    assert.equal(signals.commit.status, state.loading ? 'reading' : 'error');
    assert.equal(signals.fetch.status, undefined);
  }
  const changed = { ...task, files: task.files.slice(0, 2) };
  assert.equal(gitSignals([changed], remote, { ...local, workspace: { ...local.workspace, tasks: [changed] } }).commit.count, 2);
  const pending = { ...task, head: '', files: [], error: '正在验证工作目录…' };
  const state = { ...local, workspace: undefined, checkedAt: 0, loading: true };
  const first = gitSignals([pending], { ...remote, workspace: null, loading: true }, state);
  assert.ok(Object.values(first).every(signal => signal.count === undefined));
  assert.equal(first.commit.status, 'reading'); assert.doesNotMatch(first.commit.detail, /没有未提交/);
});

test('error badges reuse theme roles and row checking breathes with reduced-motion support', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.git-action-read-badge\.error \{[^}]*var\(--danger\)/);
  assert.match(css, /\.is-reading[\s\S]*animation: git-action-breathe 1\.6s/);
  assert.match(css, /prefers-reduced-motion: reduce\)[\s\S]*animation: none/);
  assert.doesNotMatch(css, /git-action-read-spinner|git-action-reading/);
  assert.match(css, /\.git-action-read-badge \{[^}]*pointer-events: none/);
  const html = render(gitSignals([task], { ...remote, loading: true }, local));
  assert.equal((html.match(/aria-disabled="true"/g) || []).length, 7);
  assert.doesNotMatch(html, /role="tooltip"|title="[^\"]+"/);
});

test('real temporary Git content stays unchanged while an isolated provider fails and recovers', async t => {
  const fixture = await createRemoteServiceFixture('gitea'); t.after(fixture.cleanup);
  const catalog = await fixture.service.handle('catalog', {}); assert.ok(isCatalog(catalog));
  await fixture.git(fixture.directory, ['remote', 'add', 'origin', catalog.repositories[0].url]);
  await fixture.service.handle('link', { repositoryId: fixture.repositoryId, path: fixture.directory, branch: 'main' });
  const workspace = await fixture.service.handle('localWorkspace', { repositoryId: fixture.repositoryId }); assert.ok(isLocalWorkspace(workspace));
  const latest = await fixture.service.handle('remoteWorkspace', { repositoryId: fixture.repositoryId }); assert.ok(isRemoteWorkspace(latest));
  const localState = { ...local, path: fixture.directory, workspace };
  const initial = gitSignals(workspace.tasks, { workspace: latest, error: '', loading: false }, localState);
  fixture.fail(503);
  await assert.rejects(fixture.service.handle('remoteWorkspace', { repositoryId: fixture.repositoryId }), /HTTP 503/);
  const failed = gitSignals(workspace.tasks, { workspace: latest, error: 'HTTP 503', loading: false }, localState);
  assert.deepEqual(counts(failed), counts(initial)); assert.equal(failed.pull.status, 'error');
  fixture.fail(0);
  const recovered = await fixture.service.handle('remoteWorkspace', { repositoryId: fixture.repositoryId }); assert.ok(isRemoteWorkspace(recovered));
  assert.deepEqual(counts(gitSignals(workspace.tasks, { workspace: recovered, error: '', loading: false }, localState)), counts(initial));
  assert.equal(await fixture.unchanged(), true);
});
