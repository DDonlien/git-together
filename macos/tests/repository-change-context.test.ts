import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RepositoryChangesColumn } from '../src/RepositoryChangesColumn';
import { RepositoryChangedFiles } from '../src/RepositoryChangedFiles';
import { RepositoryChanges } from '../src/RepositoryChanges';
import { fileChangeKind } from '../src/file-tree';
import type { RepositoryCommit, RepositoryTask } from '../src/repository-model';
import type { RemoteCommitDetails } from '../src/remote-repository-model';
import { createGitRemoteFixture } from './git-remote-fixture';
import { RemoteRepositoryReader } from '../server/remote-repository-reader';

const commit: RepositoryCommit = { id: 'a'.repeat(40), summary: 'Selected commit\nFull comment <escaped>', author: 'QA', time: '2026-10-07T00:00:00Z', parents: [], refs: [] };
const tasks: RepositoryTask[] = Array.from({ length: 8 }, (_, index) => ({ id: `remote:${index}`, branch: index ? `task/${index}` : 'main', head: index.toString().repeat(40), path: null, files: [], tree: ['global.ts'], remote: true, treeComplete: true, error: '' }));
const files = Array.from({ length: 180 }, (_, index) => ({ path: `src/file-${String(index).padStart(3, '0')}.ts`, status: index < 120 ? 'added' : index < 160 ? 'modified' : 'removed', patch: null }));
const details: RemoteCommitDetails = { commit, files, diff: 'Not an inline preview', tree: ['historical.ts'], treeComplete: true, warnings: ['Provider limit warning'] };
const props = { tasks, selection: null, remoteCommits: {}, selectedFiles: {}, onSelect() {}, search: '', focus: null, onFocus() {}, localChoice: null, onLocalChoice() {}, loading: false, readDiff: async () => '' };
const render = (overrides: Partial<Parameters<typeof RepositoryChangesColumn>[0]> = {}) => renderToStaticMarkup(createElement(RepositoryChangesColumn, { ...props, ...overrides }));
const slots = (html: string) => Array.from(html.matchAll(/<div class="repository-task-slot"( hidden="")?><section class="repository-change-task" aria-label="([^"]+)"/g)).map(match => ({ hidden: !!match[1], label: match[2] }));

test('eight remote branches have no default HEAD change context or composer before a commit is selected', () => {
  const html = render();
  assert.equal(slots(html).length, 8);
  assert.ok(slots(html).every(slot => slot.hidden));
  assert.match(html, /选择一个提交查看差异/);
  assert.doesNotMatch(html, /<textarea|repository-commit-composer|提交详情：|aria-label="已提交文件/);
  assert.match(html, /aria-label="差异显示方式"/);
});

test('selecting any remote branch exposes exactly one context with every changed file and its bottom comment', () => {
  for (const task of [tasks[0], tasks[7]]) {
    const html = render({ selection: { taskId: task.id, commitId: commit.id }, commit, remoteCommits: { [task.id]: { id: commit.id, details, error: '' } }, selectedFiles: { [task.id]: files[170].path } });
    assert.deepEqual(slots(html).filter(slot => !slot.hidden), [{ hidden: false, label: `远端提交：${task.branch}` }]);
    assert.equal((html.match(/class="readonly-file /g) || []).length, 180);
    assert.match(html, /file-179\.ts/); assert.match(html, /aria-pressed="true"/); assert.match(html, /Provider limit warning/);
    assert.equal((html.match(/class="repository-commit-details"/g) || []).length, 1);
    assert.ok(html.indexOf('class="repository-commit-details"') > html.indexOf('file-179.ts'));
    assert.ok(html.includes('Full comment &lt;escaped&gt;')); assert.ok(html.includes(commit.id));
    assert.doesNotMatch(html, /<textarea|repository-inline-diff|Not an inline preview/);
  }
});

test('deselected remote context hides cached files and metadata, rather than falling back to HEAD', () => {
  const html = render({ remoteCommits: { [tasks[0].id]: { id: commit.id, details, error: '' } } });
  assert.ok(slots(html).every(slot => slot.hidden));
  assert.match(html, /选择一个提交查看差异/);
  assert.doesNotMatch(html, /file-179\.ts|Full comment|提交详情：/);
});

test('loading, failure and late responses retain the selected comment without displaying another commit', () => {
  for (const state of [undefined, { id: tasks[0].head, details: { ...details, commit: { ...commit, summary: 'Stale commit' } }, error: '' }, { id: commit.id, details: null, error: 'Read failed' }]) {
    const html = render({ selection: { taskId: tasks[0].id, commitId: commit.id }, commit, remoteCommits: state ? { [tasks[0].id]: state } : {} });
    assert.match(html, /Full comment &lt;escaped&gt;/); assert.ok(html.includes(commit.id));
    assert.doesNotMatch(html, /Stale commit|file-179\.ts|<textarea/);
    assert.equal(slots(html).filter(slot => !slot.hidden).length, 1);
    if (state?.error) assert.match(html, /Read failed/);
  }
});

test('state grouping retains all files, selected rows, unknown statuses and the same local/remote classifier', () => {
  const statuses = ['added', '??', 'copied', 'A ', 'modified', 'renamed', ' M', 'UU', 'removed', 'deleted', 'MD', 'future'];
  const sample = statuses.map((status, index) => ({ path: `file-${index}.ts`, status }));
  const html = renderToStaticMarkup(createElement(RepositoryChangedFiles, { files: sample, grouped: true, search: '', selected: 'file-11.ts', label: 'Changes', onSelect() {} }));
  assert.equal((html.match(/class="readonly-file /g) || []).length, 12);
  for (const [label, count] of [['新增 Added', 4], ['修改 Modified', 4], ['删除 Deleted', 3], ['其他', 1]]) assert.ok(html.includes(`${label}<small>${count}</small>`));
  assert.match(html, /aria-pressed="true"/); assert.match(html, /future/);
  assert.deepEqual(statuses.map(fileChangeKind), ['added', 'added', 'added', 'added', 'modified', 'modified', 'modified', 'modified', 'deleted', 'deleted', 'deleted', undefined]);
});

test('flat and grouped search filter the same full file list without fixed slices or empty groups', () => {
  for (const grouped of [false, true]) {
    const html = renderToStaticMarkup(createElement(RepositoryChangedFiles, { files, grouped, search: 'FILE-17', label: 'Changes', onSelect() {} }));
    assert.equal((html.match(/class="readonly-file /g) || []).length, 10);
    assert.match(html, /file-179\.ts/); assert.doesNotMatch(html, /新增 Added|修改 Modified/);
    const empty = renderToStaticMarkup(createElement(RepositoryChangedFiles, { files, grouped, search: 'not-there', label: 'Changes', onSelect() {} }));
    assert.match(empty, /没有符合搜索条件的文件/); assert.doesNotMatch(empty, /<h3|readonly-file/);
  }
  const noFiles = renderToStaticMarkup(createElement(RepositoryChangedFiles, { files: [], grouped: true, search: '', label: 'Changes', onSelect() {} }));
  assert.match(noFiles, /此提交没有文件差异/);
});

test('a linked working directory is the default context while all separate task drafts stay mounted', () => {
  const local: RepositoryTask[] = ['main', 'search', 'review'].map(branch => ({ id: `local:${branch}`, branch, head: 'b'.repeat(40), path: `/isolated/${branch}`, files: [{ path: `${branch}.ts`, status: ' M', tracked: true }], tree: [`${branch}.ts`], error: '' }));
  const html = render({ tasks: [...tasks, ...local], localPath: '/isolated/search' });
  assert.deepEqual(slots(html).filter(slot => !slot.hidden), [{ hidden: false, label: '更改任务：search' }]);
  assert.equal((html.match(/<textarea/g) || []).length, 3);
  for (const branch of ['main', 'search', 'review']) assert.ok(html.includes(`提交说明：${branch}`));
  assert.match(html, /aria-label="选择本地工作目录"/);
  assert.doesNotMatch(html, /选择一个提交查看差异/);
  const history = render({ tasks: [...tasks, ...local], localPath: '/isolated/search', selection: { taskId: tasks[7].id, commitId: commit.id }, commit });
  assert.deepEqual(slots(history).filter(slot => !slot.hidden), [{ hidden: false, label: '远端提交：task/7' }]);
  assert.equal((history.match(/<textarea/g) || []).length, 3);
});

test('local history does not pass working changes off as a commit Diff or poll its file', () => {
  const local = { ...tasks[0], remote: false, path: '/isolated/main', files: [{ path: 'working-only.ts', status: ' M', tracked: true }] };
  const html = renderToStaticMarkup(createElement(RepositoryChanges, { task: local, selectedCommit: commit, selected: 'working-only.ts', onSelect() {}, search: '', focused: false, onFocus() {}, readDiff: async () => '', loading: false, linked: true, active: true, showFocus: false }));
  assert.match(html, /本地历史提交差异尚未接入/);
  assert.match(html, /repository-working-changes" hidden=""/);
  assert.match(html, /repository-commit-composer" hidden=""/);
  assert.match(html, /提交详情：main/);
  const source = readFileSync(new URL('../src/RepositoryChanges.tsx', import.meta.url), 'utf8');
  assert.match(source, /resources: active && !selectedCommit && changed && task.path/);
});

test('remote subscriptions and full-tree decoration depend on one explicit selection, never a default HEAD', () => {
  const hook = readFileSync(new URL('../src/use-remote-commits.ts', import.meta.url), 'utf8');
  const view = readFileSync(new URL('../src/RepositoryView.tsx', import.meta.url), 'utf8');
  assert.match(hook, /task.remote && selected\[task.id\]/);
  assert.doesNotMatch(hook, /task.head|\|\|.*head/);
  assert.match(hook, /if \(signal.aborted\) return;/);
  assert.match(view, /useState<\{ taskId: string; commitId: string \} \| null>\(null\)/);
  assert.match(view, /if \(!id\) \{ setCommitSelection\(null\); return; \}/);
  assert.match(view, /const commitId = selectedCommits\[task.id\];/);
  assert.match(view, /changes=\{task.remote \? details\?\.files \|\| noChanges : undefined\}/);
  assert.doesNotMatch(view, /selectedCommits\[task.id\] \|\| task.head|setSelectedCommits/);
});

test('only the complete file list scrolls while the single context and its footer fit the column', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.repository-change-context \{ overflow: hidden; \}/);
  assert.match(css, /\.repository-change-context > \.repository-task-slot \{ flex: 1 1 0; overflow: hidden; \}/);
  assert.match(css, /\.repository-task-body \{[^}]*min-height: 0;[^}]*overflow: hidden;/);
  const list = css.match(/\.repository-changed-files \{([^}]+)\}/)?.[1];
  assert.ok(list); assert.match(list, /flex: 1; min-height: 0; overflow: auto;/); assert.doesNotMatch(list, /max-height|160px|flex-shrink: 0/);
  assert.match(css, /\.repository-commit-details \{[^}]*flex-shrink: 0;/);
  assert.match(css, /\.repository-commit-composer \{[^}]*flex-shrink: 0;/);
  const column = readFileSync(new URL('../src/RepositoryChangesColumn.tsx', import.meta.url), 'utf8');
  assert.match(column, /key=\{task.id\}[^>]*hidden=\{activeId !== task.id\}/);
  assert.match(column, /按状态分组/); assert.match(column, /文件列表/);
  assert.doesNotMatch(column, /useEffect|importAPI|localStorage|@refresh reset/);
});

for (const provider of ['github', 'gitea'] as const) test(`${provider} real Git exposes every dense commit file in one grouped context without changing HEAD or index`, async t => {
  const fixture = await createGitRemoteFixture(provider, { treeChanges: true, denseChanges: true });
  t.after(() => fixture.cleanup());
  const reader = new RemoteRepositoryReader(provider, { fullName: 'qa/project', defaultBranch: 'main' }, fixture.transport);
  const workspace = await reader.workspace();
  const selected = workspace.commits.find(item => item.summary === 'Update project files')!;
  const loaded = await reader.commit(selected.id);
  assert.equal(loaded.files.length, 99);
  const html = renderToStaticMarkup(createElement(RepositoryChangedFiles, { files: loaded.files, search: '', grouped: true, label: 'Changes', onSelect() {} }));
  assert.equal((html.match(/class="readonly-file /g) || []).length, 99);
  assert.match(html, /新增 Added<small>97<\/small>/);
  assert.match(html, /修改 Modified<small>1<\/small>/);
  assert.match(html, /删除 Deleted<small>1<\/small>/);
  assert.match(html, /file-095\.ts/);
  assert.ok(await fixture.unchanged());
});
