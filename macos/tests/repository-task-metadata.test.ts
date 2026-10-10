import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RepositoryRemoteChanges } from '../src/RepositoryRemoteChanges';
import { RepositoryChanges } from '../src/RepositoryChanges';
import type { RepositoryTask } from '../src/repository-model';
import type { RemoteCommitDetails } from '../src/remote-repository-model';

const task: RepositoryTask = { id: 'remote:main', branch: 'main', head: 'a'.repeat(40), path: null, files: [], tree: ['src/app.ts'], remote: true, treeComplete: true, error: '' };
const details: RemoteCommitDetails = {
  commit: { id: task.head, summary: 'Existing graph summary', author: 'Existing author', time: '2026-10-07T00:00:00Z', parents: [], refs: ['origin/main'] },
  files: [{ path: 'src/app.ts', status: 'modified', patch: '+real-content' }], diff: '+real-content', tree: task.tree, treeComplete: true, warnings: ['Existing warning'],
};
const props = { task, commitId: task.head, state: { id: task.head, details, error: '' }, onSelect() {}, search: '' };
const render = (changes: Partial<Parameters<typeof RepositoryRemoteChanges>[0]> = {}) => renderToStaticMarkup(createElement(RepositoryRemoteChanges, { ...props, ...changes }));

test('explicit remote commit reads start with the file list without duplicate branch, SHA or commit metadata', () => {
  for (const selectedCommit of [undefined, details.commit]) {
    const html = render({ selectedCommit, selected: 'src/app.ts' });
    assert.doesNotMatch(html, /repository-remote-commit|repository-task-header|repository-task-path|class="branch-label"|repository-inline-diff|<pre\b/);
    assert.match(html, /远端提交：main/); assert.match(html, /已提交文件：main/); assert.match(html, /aria-pressed="true"/); assert.match(html, /Existing warning/);
    if (selectedCommit) {
      assert.match(html, /提交详情：main/); assert.equal((html.match(/Existing graph summary/g) || []).length, 1); assert.equal((html.match(/Existing author/g) || []).length, 1);
    } else {
      assert.doesNotMatch(html, /Existing graph summary|Existing author|提交说明：main|<textarea|>Commit</);
    }
  }
});

test('multiple remote tasks have no focus button or empty controls header', () => {
  for (const branch of ['main', 'task/search']) for (const selectedCommit of [undefined, details.commit]) {
    const html = render({ task: { ...task, id: `remote:${branch}`, branch }, selectedCommit });
    assert.doesNotMatch(html, /repository-task-header|repository-task-controls|退出聚焦|聚焦远端任务|repository-task-path|class="branch-label"|repository-remote-commit/);
    assert.ok(html.includes(`aria-label="远端提交：${branch}"`));
    assert.match(html, /已提交文件：|src\/app.ts|Existing warning/);
  }
});

test('removing remote focus wiring preserves the overview exit and persistent local task state', async () => {
  const view = await readFile(new URL('../src/RepositoryView.tsx', import.meta.url), 'utf8');
  const column = await readFile(new URL('../src/RepositoryChangesColumn.tsx', import.meta.url), 'utf8');
  const remote = column.split('<RepositoryRemoteChanges ')[1]?.split(' />')[0];
  assert.ok(remote); assert.doesNotMatch(remote, /focused=|onFocus=|showFocus=/);
  assert.match(view, /取消聚焦/); assert.match(view, /onClick=\{\(\) => setFocusedTask\(null\)\}/);
  assert.match(view, /key=\{task.id\} className="repository-task-slot" hidden=/);
  const local = column.split('<RepositoryChanges ')[1]?.split(' />')[0];
  assert.ok(local); assert.match(local, /onFocus=/);
  const component = await readFile(new URL('../src/RepositoryRemoteChanges.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(component, /focused|onFocus|showFocus|repository-task-controls|useEffect/);
});

test('metadata removal preserves remote loading, failure and search notices plus local task identity', async () => {
  const pending = render({ state: undefined }); assert.match(pending, /正在读取远端提交/);
  const cached = render({ search: 'missing', state: { id: task.head, details, error: 'Read failed' } });
  assert.match(cached, /Read failed/); assert.match(cached, /显示上次读取的提交/); assert.match(cached, /没有符合搜索条件的文件/); assert.match(cached, /Existing warning/);
  assert.doesNotMatch(pending + cached, /repository-remote-commit|repository-task-header|repository-task-path/);
  const local = renderToStaticMarkup(createElement(RepositoryChanges, { task: { ...task, id: 'local:main', remote: false, path: '/isolated/qa' }, onSelect() {}, search: '', focused: false, onFocus() {}, loading: false, linked: true, showFocus: false }));
  assert.match(local, /class="branch-label"/); assert.match(local, /repository-task-path/); assert.match(local, /\/isolated\/qa/); assert.match(local, /aria-label="Description：main"/);
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /\.repository-remote-commit|\.repository-task-controls/);
});
