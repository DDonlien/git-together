import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RepositoryFileTree } from '../src/RepositoryFileTree';
import type { RepositoryTask } from '../src/repository-model';

const task: RepositoryTask = { id: 'remote:main', branch: 'main', head: '1234567890abcdef', path: null, remote: true, treeComplete: true, files: [], tree: ['docs/notes.md', 'README.md'], error: '' };
const render = (value: RepositoryTask) => renderToStaticMarkup(createElement(RepositoryFileTree, { task: value, selected: 'README.md', complete: true, onSelect: () => {} }));

test('remote branch and short tree-baseline hash appear only in the footer after the full tree', () => {
  const markup = render(task);
  assert.match(markup, /<footer class="repository-tree-identity"><span class="repository-tree-branch">.*<strong title="main">main<\/strong><\/span><code title="1234567890abcdef">12345678<\/code><\/footer><\/section>$/);
  assert.equal(markup.split('class="repository-tree-identity"').length - 1, 1);
  assert.ok(markup.indexOf('repository-task-tree') < markup.indexOf('repository-tree-identity'));
  assert.doesNotMatch(markup, /repository-task-path|repository-task-header/);
  assert.match(markup, /aria-label="文件树：main"/);
  assert.match(markup, /aria-pressed="true".*README.md/);
});

test('local path follows the branch as an accessible button in the footer without another metadata line', () => {
  const markup = render({ ...task, remote: false, path: '/qa/feature worktree' });
  assert.match(markup, /<\/strong><\/span><button[^>]*title="\/qa\/feature worktree"[^>]*aria-label="在文件浏览器中打开 \/qa\/feature worktree"/);
  assert.match(markup, /repository-tree-path/);
  assert.match(markup, /<span class="ogui-button__label">\/qa\/feature worktree<\/span>/);
  assert.doesNotMatch(markup, /repository-task-path|<small>worktree/);
  assert.match(render({ ...task, remote: false, path: null, head: '' }), /<small>未检出<\/small><code>未读取<\/code>/);
});

test('long branch text stays complete and safely escaped in both tooltip and accessible tree identity', () => {
  const branch = 'feature/' + 'very-long-branch-name-'.repeat(12) + '<&>';
  const markup = render({ ...task, branch });
  const escaped = branch.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  assert.ok(markup.includes(`aria-label="文件树：${escaped}"`));
  assert.ok(markup.includes(`<strong title="${escaped}">${escaped}</strong>`));
  assert.match(markup, /<code title="1234567890abcdef">12345678<\/code>/);
});

test('footer keeps branch left, fixed SHA right and ellipsized path between them with shared inset', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.repository-tree-identity \{[^}]*display: flex;[^}]*min-width: 0;[^}]*flex-shrink: 0;[^}]*padding: 8px var\(--repository-column-inset\);/);
  assert.doesNotMatch(css.match(/\.repository-tree-identity \{[^}]*\}/)?.[0] || '', /justify-content: flex-end/);
  assert.match(css, /\.repository-tree-branch \{[^}]*flex: 0 1 auto; min-width: 0;/);
  const name = css.match(/\.repository-tree-branch > strong \{([^}]*)\}/)?.[1];
  assert.ok(name);
  assert.match(name, /overflow: hidden; white-space: nowrap; padding-right: 12px; mask-image: linear-gradient/);
  assert.doesNotMatch(name, /ellipsis|word-break|flex-wrap/);
  assert.match(css, /\.repository-tree-identity > code, \.repository-tree-identity > small \{[^}]*flex-shrink: 0;[^}]*white-space: nowrap;/);
  assert.match(css, /\.repository-tree-identity > code \{ margin-left: auto;/);
  assert.match(css, /\.repository-tree-path.ogui-button \{[^}]*flex: 1 1 0;[^}]*min-width: 0;/);
  assert.match(css, /\.repository-tree-path \.ogui-button__label \{[^}]*overflow: hidden; text-overflow: ellipsis; white-space: nowrap;/);
});
