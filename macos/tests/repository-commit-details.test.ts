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
const remoteProps = { task, commitId: commit.id, selectedCommit: commit, search: '', onSelect() {}, focused: false, onFocus() {}, showFocus: false };

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
  assert.match(markup, /class="repository-commit-composer" hidden=""/);
  assert.match(markup, /<\/section><\/section>$/);
  assert.doesNotMatch(markup, /class="repository-remote-commit"/);
  assert.equal((markup.match(/QA author/g) || []).length, 1);
  assert.equal((markup.match(/aria-label="提交详情：main"/g) || []).length, 1);
  assert.ok(markup.indexOf('class="repository-commit-details"') > markup.indexOf('class="repository-commit-composer"'));
  const normal = renderToStaticMarkup(createElement(RepositoryRemoteChanges, { ...remoteProps, selectedCommit: undefined, state: { id: commit.id, details, error: '' } }));
  assert.match(normal, /class="repository-commit-composer"><label/);
  assert.doesNotMatch(normal, /提交详情：main/);
});

test('loading or failed selection uses the selected graph record rather than a previously loaded commit', () => {
  const stale = { ...details, commit: { ...commit, id: task.head, summary: 'Previous commit must not appear' } };
  for (const state of [undefined, { id: task.head, details: stale, error: '' }, { id: commit.id, details: null, error: 'Network unavailable' }]) {
    const markup = renderToStaticMarkup(createElement(RepositoryRemoteChanges, { ...remoteProps, state }));
    assert.ok(markup.includes(commit.id));
    assert.match(markup, /Merge pull request with a long description/);
    assert.doesNotMatch(markup, /Previous commit must not appear/);
    assert.match(markup, /class="repository-commit-composer" hidden=""/);
  }
});

test('local history hides but does not discard its original draft composer and restores normal editing when deselected', () => {
  const local: RepositoryTask = { ...task, id: 'local:main', remote: false, path: '/isolated/qa' };
  const props = { task: local, onSelect() {}, search: '', focused: false, onFocus() {}, readDiff: async () => '', loading: false, linked: true, active: true, showFocus: false };
  const history = renderToStaticMarkup(createElement(RepositoryChanges, { ...props, selectedCommit: commit }));
  assert.match(history, /class="repository-commit-composer" hidden=""/);
  assert.match(history, /<textarea/);
  assert.match(history, /提交详情：main/);
  const current = renderToStaticMarkup(createElement(RepositoryChanges, props));
  assert.match(current, /class="repository-commit-composer"><label/);
  assert.doesNotMatch(current, /hidden=""|提交详情：main|<textarea[^>]*disabled/);
  const view = readFileSync(new URL('../src/RepositoryView.tsx', import.meta.url), 'utf8');
  assert.equal((view.match(/selectedCommit=\{selectedCommit\}/g) || []).length, 2);
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
