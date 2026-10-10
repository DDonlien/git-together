import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RepositoryCommitDetails } from '../src/RepositoryCommitDetails';
import { RepositoryGraph } from '../src/RepositoryGraph';
import { RepositoryChanges } from '../src/RepositoryChanges';
import { RepositoryRemoteChanges } from '../src/RepositoryRemoteChanges';
import type { RepositoryCommit, RepositoryTask } from '../src/repository-model';
import type { RemoteCommitDetails } from '../src/remote-repository-model';

const commit: RepositoryCommit = { id: 'a'.repeat(40), summary: 'Merge pull request with a long description\nA second line <not markup>', author: 'QA author', time: '2026-10-07T00:00:00Z', parents: [], refs: [] };
const task: RepositoryTask = { id: 'remote:main', branch: 'main', head: 'b'.repeat(40), path: null, files: [], tree: [], remote: true, error: '' };
const details: RemoteCommitDetails = { commit, files: [], diff: '', tree: [], treeComplete: true, warnings: [] };
const remoteProps = { task, commitId: commit.id, selectedCommit: commit, search: '', onSelect() {} };

test('graph only renders history while the shared footer shows the complete, escaped selected metadata', () => {
  const graph = renderToStaticMarkup(createElement(RepositoryGraph, { workspace: { commits: [commit], tasks: [task], complete: true }, search: '', focusedTask: null }));
  assert.doesNotMatch(graph, /repository-commit-details|提交详情/);
  const footer = renderToStaticMarkup(createElement(RepositoryCommitDetails, { commit, branch: task.branch }));
  assert.match(footer, /<section class="repository-commit-details" aria-label="提交详情：main">/);
  assert.ok(footer.includes('A second line &lt;not markup&gt;'));
  assert.ok(footer.includes(commit.id));
  assert.match(footer, /QA author · <time dateTime="2026-10-07T00:00:00Z">/);
  assert.doesNotMatch(footer, /<textarea|<button|not markup>/);
});

test('selected remote metadata replaces the composer at the task bottom without a duplicate summary', () => {
  const markup = renderToStaticMarkup(createElement(RepositoryRemoteChanges, { ...remoteProps, state: { id: commit.id, details, error: '' } }));
  assert.doesNotMatch(markup, /repository-commit-composer|<textarea|>Commit</);
  assert.match(markup, /<\/section><\/section>$/);
  assert.doesNotMatch(markup, /class="repository-remote-commit"/);
  assert.equal((markup.match(/QA author/g) || []).length, 1);
  assert.equal((markup.match(/aria-label="提交详情：main"/g) || []).length, 1);
  assert.ok(markup.indexOf('class="repository-commit-details"') > markup.indexOf('class="repository-task-body"'));
  const normal = renderToStaticMarkup(createElement(RepositoryRemoteChanges, { ...remoteProps, selectedCommit: undefined, state: { id: commit.id, details, error: '' } }));
  assert.doesNotMatch(normal, /repository-commit-composer|<textarea|提交详情：main/);
});

test('history shows its summary and multiline description as escaped, unframed text instead of form controls', () => {
  const described = { ...commit, summary: 'Fix login item', description: 'Keep the installed app selected.\n\n  Preserve indentation.\n<script>not executable</script>' };
  const footer = renderToStaticMarkup(createElement(RepositoryCommitDetails, { commit: described, branch: 'sub/main' }));
  assert.match(footer, /<strong>Fix login item<\/strong><p class="repository-commit-description">/);
  assert.ok(footer.includes('Keep the installed app selected.\n\n  Preserve indentation.\n&lt;script&gt;not executable&lt;/script&gt;'));
  assert.doesNotMatch(footer, /<textarea|<input|<button|<script>|提交说明|正在浏览|Description[:：]/);
  assert.equal((footer.match(/Fix login item/g) || []).length, 1);
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.repository-commit-description \{[^}]*white-space: pre-wrap;[^}]*overflow-wrap: anywhere;/);
});

test('a commit without description does not leave an empty field or invent body text', () => {
  for (const selected of [commit, { ...commit, description: '' }]) {
    const footer = renderToStaticMarkup(createElement(RepositoryCommitDetails, { commit: selected, branch: 'main' }));
    assert.doesNotMatch(footer, /repository-commit-description|<p|<textarea|placeholder|填写|正在浏览/);
    assert.ok(footer.includes(commit.id));
  }
});

test('remote history only shows the current selection description, not a previously loaded body', () => {
  const selected = { ...commit, summary: 'Selected summary', description: 'Selected body\nSecond line' };
  const old = { ...details, commit: { ...commit, id: task.head, description: 'Wrong previous body' } };
  const props = { ...remoteProps, selectedCommit: selected };
  const loading = renderToStaticMarkup(createElement(RepositoryRemoteChanges, { ...props, state: { id: task.head, details: old, error: '' } }));
  assert.ok(loading.includes('Selected body\nSecond line'));
  assert.doesNotMatch(loading, /Wrong previous body|<textarea|正在浏览/);
  const currentDetails = { ...details, commit: { ...selected, description: 'Current server body' } };
  const loaded = renderToStaticMarkup(createElement(RepositoryRemoteChanges, { ...props, state: { id: commit.id, details: currentDetails, error: '' } }));
  assert.match(loaded, /Current server body/);
  assert.doesNotMatch(loaded, /Selected body|Wrong previous body/);
});

test('loading or failed selection uses the selected graph record rather than a previously loaded commit', () => {
  const stale = { ...details, commit: { ...commit, id: task.head, summary: 'Previous commit must not appear' } };
  for (const state of [undefined, { id: task.head, details: stale, error: '' }, { id: commit.id, details: null, error: 'Network unavailable' }]) {
    const markup = renderToStaticMarkup(createElement(RepositoryRemoteChanges, { ...remoteProps, state }));
    assert.ok(markup.includes(commit.id));
    assert.match(markup, /Merge pull request with a long description/);
    assert.doesNotMatch(markup, /Previous commit must not appear/);
    assert.doesNotMatch(markup, /repository-commit-composer|<textarea/);
  }
});

test('local history hides but does not discard its original draft composer and restores normal editing when deselected', () => {
  const local: RepositoryTask = { ...task, id: 'local:main', remote: false, path: '/isolated/qa' };
  const props = { task: local, onSelect() {}, search: '', focused: false, onFocus() {}, loading: false, linked: true, showFocus: false };
  const history = renderToStaticMarkup(createElement(RepositoryChanges, { ...props, selectedCommit: commit }));
  assert.match(history, /class="repository-commit-composer" hidden=""/);
  assert.match(history, /<textarea/);
  assert.match(history, /提交详情：main/);
  const current = renderToStaticMarkup(createElement(RepositoryChanges, props));
  assert.match(current, /class="repository-commit-composer"><label/);
  assert.doesNotMatch(current, /hidden=""|提交详情：main|<textarea[^>]*disabled/);
  const view = readFileSync(new URL('../src/RepositoryView.tsx', import.meta.url), 'utf8');
  const column = readFileSync(new URL('../src/RepositoryChangesColumn.tsx', import.meta.url), 'utf8');
  assert.equal((column.match(/selectedCommit=\{selectedCommit\}/g) || []).length, 2);
  assert.match(view, /if \(task.remote\) setSelectedFiles/);
  assert.match(view, /workspace.tasks.find\(task => task.id === focus\)/);
});

test('history uses a bounded flat footer with wrapping metadata, hidden inputs and no new data hooks', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.repository-commit-composer\[hidden\] \{ display: none; \}/);
  assert.match(css, /\.repository-commit-details \{[^}]*margin-top: auto;[^}]*flex-shrink: 0;[^}]*max-height: 45%;[^}]*overflow: auto;/);
  assert.match(css, /\.repository-commit-details > strong \{ white-space: pre-wrap; overflow-wrap: anywhere; \}/);
  const component = readFileSync(new URL('../src/RepositoryCommitDetails.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(component, /useState|useEffect|importAPI|localStorage|dangerouslySetInnerHTML/);
});
