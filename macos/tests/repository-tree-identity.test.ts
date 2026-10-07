import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RepositoryFileTree } from '../src/RepositoryFileTree';
import type { RepositoryTask } from '../src/repository-model';

const task: RepositoryTask = { id: 'remote:main', branch: 'main', head: '1234567890abcdef', path: null, remote: true, treeComplete: true, files: [], tree: ['docs/notes.md', 'README.md'], error: '' };
const render = (value: RepositoryTask) => renderToStaticMarkup(createElement(RepositoryFileTree, { task: value, selected: 'README.md', complete: true, onSelect: () => {} }));

test('remote branch and short tree-baseline hash share one identity row without a second metadata line', () => {
  const markup = render(task);
  assert.match(markup, /class="repository-tree-identity"><span class="repository-tree-branch">.*<strong title="main">main<\/strong><\/span><code title="1234567890abcdef">12345678<\/code><\/div>/);
  assert.doesNotMatch(markup, /repository-task-path|repository-task-header/);
  assert.match(markup, /aria-label="文件树：main"/);
  assert.match(markup, /aria-pressed="true".*README.md/);
});

test('local worktree identity and path remain while the current short hash moves into its branch row', () => {
  const markup = render({ ...task, remote: false, path: '/qa/feature worktree' });
  assert.match(markup, /<small>worktree<\/small><code title="1234567890abcdef">12345678<\/code><\/div>/);
  assert.match(markup, /class="repository-task-path" title="\/qa\/feature worktree">\/qa\/feature worktree<\/p>/);
  assert.match(render({ ...task, remote: false, path: null, head: '' }), /<small>分支<\/small><code>未读取<\/code>.*repository-task-path">未检出/);
});

test('long branch text stays complete and safely escaped in both tooltip and accessible tree identity', () => {
  const branch = 'feature/' + 'very-long-branch-name-'.repeat(12) + '<&>';
  const markup = render({ ...task, branch });
  const escaped = branch.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  assert.ok(markup.includes(`aria-label="文件树：${escaped}"`));
  assert.ok(markup.includes(`<strong title="${escaped}">${escaped}</strong>`));
  assert.match(markup, /<code title="1234567890abcdef">12345678<\/code>/);
});

test('identity layout is right-aligned, fades only branch text, keeps SHA fixed, and shares the column inset', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.repository-tree-identity \{[^}]*display: flex;[^}]*justify-content: flex-end;[^}]*min-width: 0;/);
  assert.match(css, /\.repository-tree-branch \{[^}]*flex: 0 1 auto; min-width: 0;/);
  const name = css.match(/\.repository-tree-branch > strong \{([^}]*)\}/)?.[1];
  assert.ok(name);
  assert.match(name, /overflow: hidden; white-space: nowrap; padding-right: 12px; mask-image: linear-gradient/);
  assert.doesNotMatch(name, /ellipsis|word-break|flex-wrap/);
  assert.match(css, /\.repository-tree-identity > code, \.repository-tree-identity > small \{[^}]*flex-shrink: 0;[^}]*white-space: nowrap;/);
  assert.match(css, /\.repository-tree-identity \{[^}]*margin: 10px var\(--repository-column-inset\);/);
});
