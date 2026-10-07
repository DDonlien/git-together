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
const render = (source = workspace, defaultBranch?: string, focusedTask: string | null = null) => renderToStaticMarkup(createElement(RepositoryGraph, { workspace: source, defaultBranch, focusedTask, search: '' }));
const heading = (markup: string) => markup.match(/<header class="repository-column-heading">[\s\S]*?<\/header>/)![0];

test('actual default branch replaces graph text with the sole public branch dropdown', () => {
  const markup = heading(render(workspace, 'main'));
  assert.match(markup, /<h2>[\s\S]*aria-label="选择分支：main"[\s\S]*>main<\//);
  assert.match(markup, /ogui-button--quiet[^>]*repository-graph-branch-trigger/);
  assert.equal((markup.match(/aria-label="选择分支：/g) || []).length, 1);
  assert.doesNotMatch(markup, /定位分支|>分支图<\/h2>/);
  assert.match(markup, /aria-label="收起分支图"/);
  assert.doesNotMatch(markup, /aria-label="分支图选项"/);
});

test('focused task is the initial branch even if the repository default differs', () => {
  assert.match(heading(render(workspace, 'main', 'remote:feature/search')), /选择分支：feature\/search/);
});

test('fallback uses real loaded branch or metadata, never an invented main', () => {
  assert.match(heading(render(workspace)), /选择分支：feature\/search/);
  const empty = { ...workspace, tasks: [], commits: [] };
  assert.match(heading(render(empty, 'trunk')), /选择分支：trunk/);
  assert.match(heading(render(empty)), /选择分支：未读取分支/);
  assert.match(heading(render(empty)), /disabled=""/);
});

test('long or special-character branch names remain literal accessible text with truncation', () => {
  const name = 'feature/<safe>&"' + 'long-name-'.repeat(30);
  const source = { ...workspace, tasks: [{ ...workspace.tasks[0], branch: name }] };
  assert.match(heading(render(source)), /feature\/&lt;safe&gt;&amp;&quot;/);
  assert.doesNotMatch(heading(render(source)), /<safe>/);
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.graph-branch-name \{[^}]*text-overflow: ellipsis/);
});

test('branch menu retains source identity, loaded-head guards and existing read-only location', () => {
  const graph = readFileSync(new URL('../src/RepositoryGraph.tsx', import.meta.url), 'utf8');
  const view = readFileSync(new URL('../src/RepositoryView.tsx', import.meta.url), 'utf8');
  const header = readFileSync(new URL('../src/RepositoryColumnHeading.tsx', import.meta.url), 'utf8');
  assert.match(graph, /setBranchChoice\(item.id\); locateFromMenu\(item.head\)/);
  assert.match(graph, /disabled=\{!byId.has\(item.head\)\}/);
  assert.match(graph, /item.remote \? '远端' : item.path \? '本地工作目录' : '本地分支'/);
  assert.match(graph, /aria-current=\{branchTask\?\.id === item.id/);
  assert.match(view, /defaultBranch=\{repository.defaultBranch\}/);
  assert.match(header, /collapsed \? title : titleContent \?\? title/);
  assert.doesNotMatch(graph, /checkout|importAPI|fetch\(|setFocusedTask/);
});

test('title trigger overrides the later generic small-button sizing without expanding the 44px heading', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.repository-column-heading \.app-button\.repository-graph-branch-trigger \{[^}]*min-height: 28px; height: 28px;[^}]*font-size: 12px;/);
  assert.match(css, /\.repository-column-heading \{ min-height: 44px; padding: 7px var\(--repository-column-inset\);/);
});
