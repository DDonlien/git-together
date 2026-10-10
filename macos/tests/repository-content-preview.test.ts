import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RepositoryRemoteChanges } from '../src/RepositoryRemoteChanges';
import { RepositoryChanges } from '../src/RepositoryChanges';
import type { RepositoryTask } from '../src/repository-model';
import type { RemoteCommitDetails } from '../src/remote-repository-model';

const task: RepositoryTask = { id: 'remote:main', branch: 'main', head: 'a'.repeat(40), path: null, files: [], tree: ['changed.ts', 'unchanged.ts'], remote: true, treeComplete: true, error: '' };
const details: RemoteCommitDetails = {
  commit: { id: task.head, summary: 'Real commit summary', author: 'QA', time: '2026-10-07T00:00:00Z', parents: [], refs: ['origin/main'] },
  files: [{ path: 'changed.ts', status: 'modified', patch: '@@ -1 +1 @@\n-old-content\n+preview-content' }],
  diff: 'whole-commit-preview', tree: task.tree, treeComplete: true, warnings: ['Provider warning'],
};

test('remote task retains file selection, warnings and its footer without any inline content preview', () => {
  for (const selected of [undefined, 'changed.ts', 'unchanged.ts']) {
    const html = renderToStaticMarkup(createElement(RepositoryRemoteChanges, {
      task, commitId: task.head, state: { id: task.head, details, error: '' }, selected, onSelect() {}, search: '',
    }));
    assert.doesNotMatch(html, /repository-inline-diff|<pre\b|preview-content|whole-commit-preview|关闭远端文件|正在读取所选提交的文件内容/);
    assert.match(html, /远端提交：main/); assert.doesNotMatch(html, /repository-remote-commit|Real commit summary/);
    assert.match(html, /已提交文件：main/); assert.match(html, /changed.ts/); assert.match(html, /modified/); assert.match(html, /Provider warning/);
    assert.match(html, new RegExp(`class="readonly-file${selected === 'changed.ts' ? ' selected' : ''}\\s*"[^>]*aria-pressed="${selected === 'changed.ts'}"`));
    assert.doesNotMatch(html, /提交说明：main|<textarea|>Commit</);
  }
  const historical = renderToStaticMarkup(createElement(RepositoryRemoteChanges, {
    task, commitId: task.head, selectedCommit: details.commit, state: { id: task.head, details, error: '' }, selected: 'changed.ts', onSelect() {}, search: '',
  }));
  assert.doesNotMatch(historical, /repository-inline-diff|<pre\b|preview-content|whole-commit-preview/);
  assert.match(historical, /已提交文件：main/); assert.match(historical, /changed.ts/);
  assert.match(historical, /提交详情：main/); assert.match(historical, /Real commit summary/);
});

test('removing the preview retains remote search, loading, errors and cached-data notices', () => {
  const props = { task, commitId: task.head, onSelect() {}, search: 'missing' };
  const pending = renderToStaticMarkup(createElement(RepositoryRemoteChanges, props));
  assert.match(pending, /正在读取远端提交/); assert.doesNotMatch(pending, /repository-inline-diff|<pre\b|<textarea/);
  const cached = renderToStaticMarkup(createElement(RepositoryRemoteChanges, { ...props, state: { id: task.head, details, error: 'Network error' } }));
  assert.match(cached, /Network error/); assert.match(cached, /显示上次读取的提交/); assert.match(cached, /没有符合搜索条件的文件/); assert.match(cached, /Provider warning/);
  assert.doesNotMatch(cached, /repository-inline-diff|<pre\b/);
});

test('local working files retain selection and the editable draft without any content preview', () => {
  const local = { ...task, id: 'local:main', remote: false, path: '/isolated/qa', files: [{ path: 'changed.ts', status: 'M', tracked: true }, { path: 'scene.uasset', status: 'M', tracked: true }] };
  for (const selected of [undefined, 'changed.ts', 'scene.uasset', 'unchanged.ts']) {
    const html = renderToStaticMarkup(createElement(RepositoryChanges, { task: local, selected, onSelect() {}, search: '', focused: false, onFocus() {}, loading: false, linked: true, showFocus: false }));
    assert.doesNotMatch(html, /repository-inline-diff|is-history-diff|<pre\b|关闭 Diff|正在读取 Diff|这个文件没有未提交的更改/);
    assert.match(html, /changed.ts/); assert.match(html, /scene.uasset/); assert.match(html, /填写提交说明/);
    assert.doesNotMatch(html, /<textarea[^>]*disabled/);
    assert.match(html, new RegExp(`class="readonly-file${selected === 'changed.ts' ? ' selected' : ''}\\s*"[^>]*aria-pressed="${selected === 'changed.ts'}"`));
  }
});

test('file-preview readers and polling are removed from the production and isolated view wiring', async () => {
  for (const path of ['../src/RepositoryRemoteChanges.tsx', '../src/RepositoryView.tsx', '../src/App.tsx', '../src/use-remote-repository.ts', './repository-preview-client.tsx']) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /readRemoteFile|readFile=|importAPI\('remoteFile'|RemoteFileContent|contentKey/);
  }
  const remote = await readFile(new URL('../src/RepositoryRemoteChanges.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(remote, /useAutoRefresh|useState|IconButton|repository-inline-diff/);
  assert.match(remote, /<RepositoryChangedFiles[^>]*onSelect=\{onSelect\}/);
  const files = await readFile(new URL('../src/RepositoryChangedFiles.tsx', import.meta.url), 'utf8');
  assert.match(files, /onClick=\{\(\) => onSelect\(file.path\)\}/);
  for (const path of ['../src/RepositoryChanges.tsx', '../src/RepositoryChangesColumn.tsx', '../src/RepositoryView.tsx', './repository-preview-client.tsx']) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /readDiff|ReadTaskDiff|importAPI\('diff'|fixture\/diff|repository-inline-diff|is-history-diff/);
  }
  const local = await readFile(new URL('../src/RepositoryChanges.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(local, /useAutoRefresh|setDiff|syncIntervals/);
});
