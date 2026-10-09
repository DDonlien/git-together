import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RepositoryGraph } from '../src/RepositoryGraph';
import type { RepositoryWorkspace } from '../src/repository-model';

const workspace: RepositoryWorkspace = {
  source: 'remote', complete: true,
  commits: [{ id: 'tip', parents: [], refs: ['origin/main'], summary: 'Real tip', author: 'QA', time: '2026-10-07T00:00:00Z' }],
  tasks: ['feature/search', 'main'].map(branch => ({ id: `remote:${branch}`, branch, head: 'tip', path: null, remote: true, files: [], tree: [], error: '' })),
};
const render = (source = workspace, focusedTask: string | null = null) => renderToStaticMarkup(createElement(RepositoryGraph, { workspace: source, focusedTask, search: '' }));
const heading = (markup: string) => markup.match(/<header class="repository-column-heading">[\s\S]*?<\/header>/)![0];

test('graph defaults to all branches with a sole filter trigger and independent collapse', () => {
  const markup = heading(render());
  assert.match(markup, /<h2>[\s\S]*title="全部分支"[\s\S]*>全部分支<\//);
  assert.match(markup, /ogui-button--quiet[^>]*repository-graph-branch-trigger/);
  assert.equal((markup.match(/repository-graph-branch-trigger/g) || []).length, 1);
  assert.doesNotMatch(markup, /定位分支|>分支图<\/h2>/);
  assert.match(markup, /aria-label="收起分支图"/);
  assert.doesNotMatch(markup, /aria-label="分支图选项"/);
});

test('task focus does not change the all-branch heading', () => {
  assert.match(heading(render(workspace, 'remote:feature/search')), /title="全部分支"/);
});

test('unloaded branches retain filtering while an empty graph disables the trigger', () => {
  assert.doesNotMatch(heading(render({ ...workspace, commits: [] })), /disabled=""/);
  const empty = { ...workspace, tasks: [], commits: [] };
  assert.match(heading(render(empty)), /title="全部分支"/);
  assert.match(heading(render(empty)), /disabled=""/);
  const pending = { ...empty, tasks: [{ ...workspace.tasks[0], id: 'remote:pending', head: '' }] };
  assert.match(heading(render(pending)), /disabled=""/);
});

test('long or special-character branch refs remain literal accessible text with truncation', () => {
  const name = 'feature/<safe>&"' + 'long-name-'.repeat(30);
  const source = { ...workspace, tasks: [{ ...workspace.tasks[0], branch: name }], commits: [{ ...workspace.commits[0], refs: [name] }] };
  assert.match(render(source), /feature\/&lt;safe&gt;&amp;&quot;/);
  assert.doesNotMatch(render(source), /<safe>/);
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.graph-branch-name \{[^}]*text-overflow: ellipsis/);
});

test('filter uses native checkboxes and changes only graph scope', () => {
  const graph = readFileSync(new URL('../src/RepositoryGraph.tsx', import.meta.url), 'utf8');
  const view = readFileSync(new URL('../src/RepositoryView.tsx', import.meta.url), 'utf8');
  const header = readFileSync(new URL('../src/RepositoryColumnHeading.tsx', import.meta.url), 'utf8');
  assert.match(graph, /Popover label="分支筛选"/);
  assert.match(graph, /type="checkbox"/);
  assert.match(graph, /indeterminate = count > 0/);
  assert.match(view, /RepositoryGraph workspace=\{workspace\}/);
  assert.doesNotMatch(view, /graphWorkspace|defaultBranch=\{repository.defaultBranch\}/);
  assert.match(header, /collapsed \? title : titleContent \?\? title/);
  assert.doesNotMatch(graph, /checkout|importAPI|fetch\(|setFocusedTask/);
});

test('title trigger overrides the later generic small-button sizing without expanding the 44px heading', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.repository-column-heading \.app-button\.repository-graph-branch-trigger \{[^}]*min-height: 28px; height: 28px;[^}]*font-size: 12px;/);
  assert.match(css, /\.repository-column-heading \{ min-height: 44px; padding: 7px var\(--repository-column-inset\);/);
});
