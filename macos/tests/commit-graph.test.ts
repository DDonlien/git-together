import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { RepositoryGraph } from '../src/RepositoryGraph';
import { commitMatchesSearch, graphNavigationIndex, layoutCommitGraph, nextGraphMatch, parseCommitSearch } from '../src/commit-graph';
import type { RepositoryCommit, RepositoryWorkspace } from '../src/repository-model';

const commit = (id: string, parents: string[] = [], refs: string[] = []): RepositoryCommit => ({ id, parents, refs, summary: `Message ${id}`, author: 'QA Author', time: '2026-10-07T00:00:00Z' });
const commits = [commit('merge', ['left', 'right'], ['main']), commit('left', ['base']), commit('right', ['base'], ['origin/task/search']), commit('base'), commit('unrelated')];
const workspace: RepositoryWorkspace = { source: 'local', complete: true, commits, tasks: [{ id: 'main', branch: 'main', head: 'merge', path: '/qa/main', files: [], tree: [], error: '' }] };
const render = (source = workspace, search = '') => renderToStaticMarkup(createElement(RepositoryGraph, { workspace: source, search, focusedTask: null }));

test('tracks keep their colors through forks, intervening rows and joins', () => {
  const rows = layoutCommitGraph(commits);
  assert.equal(rows[0].color, rows[1].color);
  assert.notEqual(rows[1].color, rows[2].color);
  const continuing = rows[1].edges.find(edge => !edge.node)!;
  assert.equal(continuing.color, rows[2].color);
  assert.equal(rows[2].edges.find(edge => edge.node)!.color, rows[3].color);
  assert.equal(rows[3].color, rows[0].color);
  assert.ok(rows[3].incoming);
  assert.equal(rows[4].incoming, false);
  assert.equal(rows[4].edges.length, 0);
});

test('missing parents terminate in a boundary stub without reserving a ghost lane', () => {
  const rows = layoutCommitGraph([commit('tip', ['unloaded']), commit('unrelated')]);
  assert.deepEqual(rows[0].edges, [{ from: 0, to: 0, color: 0, node: true, boundary: true }]);
  assert.equal(rows[1].width, 1);
  assert.equal(rows[1].incoming, false);
  assert.equal(rows[1].edges.length, 0);
  const markup = render({ ...workspace, commits: [commit('tip', ['unloaded'])] });
  assert.match(markup, /graph-boundary/);
  assert.match(markup, /父提交未读取/);
});

test('unknown second parent does not suppress the known first-parent edge', () => {
  const rows = layoutCommitGraph([commit('tip', ['base', 'unloaded']), commit('base')]);
  assert.equal(rows[0].edges.length, 2);
  assert.equal(rows[0].edges.filter(edge => edge.boundary).length, 1);
  assert.equal(rows[1].incoming, true);
});

test('graph keyboard navigation clamps at loaded boundaries and moves by viewport pages', () => {
  for (const [key, index, expected] of [['ArrowDown', 0, 1], ['ArrowUp', 0, 0], ['ArrowDown', 9, 9], ['Home', 9, 0], ['End', 0, 9], ['PageDown', 1, 5], ['PageUp', 7, 3]] as const) assert.equal(graphNavigationIndex(key, index, 10, 4), expected);
  assert.equal(graphNavigationIndex('ArrowDown', 0, 0, 4), null);
  assert.equal(graphNavigationIndex('Enter', 3, 10, 4), null);
});

test('search result navigation wraps in both directions and tolerates a nonmatching selection', () => {
  assert.equal(nextGraphMatch([1, 4, 8], 1, 1), 4);
  assert.equal(nextGraphMatch([1, 4, 8], 8, 1), 1);
  assert.equal(nextGraphMatch([1, 4, 8], 1, -1), 8);
  assert.equal(nextGraphMatch([1, 4, 8], 6, -1), 4);
  assert.equal(nextGraphMatch([1], -1, 1), 1);
  assert.equal(nextGraphMatch([], 0, 1), null);
});

test('case-insensitive search supports author, message, SHA and ref fields without regex interpretation', () => {
  const item = commit('abcdef123', [], ['origin/feature/[a]']);
  for (const search of ['AUTHOR: qa author', 'message: Message', 'commit: ABCDEF', 'ref: [a]', '  origin/feature  ']) assert.equal(commitMatchesSearch(item, parseCommitSearch(search)), true);
  for (const search of ['author: abcdef', 'message: origin', 'ref: QA', 'not present']) assert.equal(commitMatchesSearch(item, parseCommitSearch(search)), false);
  assert.equal(commitMatchesSearch(item, parseCommitSearch('')), true);
});

test('graph retains branch refs, merge styling, author/date, SHA and a single keyboard entry', () => {
  const markup = render();
  assert.equal((markup.match(/class="repository-graph-description" tabindex="0"/g) || []).length, 1);
  assert.equal((markup.match(/class="repository-graph-description" tabindex="-1"/g) || []).length, 4);
  assert.match(markup, /height="36"/);
  assert.match(markup, /graph-merge-node/);
  assert.match(markup, /graph-remote-ref/);
  assert.match(markup, /graph-head-marker/);
  assert.match(markup, /title="全部分支"/);
  assert.doesNotMatch(markup, /分支图选项|repository-graph-tools|repository-column-accessory/);
  assert.doesNotMatch(markup, /5 条提交|repository-graph-status|<thead|repository-commit-details|<textarea|checkout|rebase/);
});

test('remote branch tips are not falsely marked as checked-out HEADs', () => {
  const markup = render({ ...workspace, source: 'remote', tasks: workspace.tasks.map(task => ({ ...task, path: null, remote: true })) });
  assert.doesNotMatch(markup, /graph-head-marker|graph-head-ref/);
  assert.match(markup, /Message merge/);
});

test('search keeps every topology row and highlights text without restoring a bottom result bar', () => {
  const markup = render(workspace, 'message: right');
  assert.equal((markup.match(/data-commit-id=/g) || []).length, commits.length);
  assert.equal((markup.match(/graph-dimmed/g) || []).length, 4);
  assert.match(markup, /Message <mark>right<\/mark>/);
  assert.doesNotMatch(markup, /个匹配|repository-graph-status|graph-search-navigation/);
  assert.doesNotMatch(render(workspace, 'not found'), /没有匹配提交|repository-graph-status/);
});

test('graph text, search and refs are escaped rather than rendered as markup', () => {
  const markup = render({ ...workspace, commits: [{ ...commit('a'), summary: '<img onerror=alert(1)>', refs: ['<script>'] }] }, 'img');
  assert.doesNotMatch(markup, /<img|<script/);
  assert.match(markup, /&lt;<mark>img<\/mark>/);
});

test('local graph styles preserve lane continuity, flat selection, hidden scrollbars and fixed two-line density', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /repository-graph-scroll \{ --graph-row-height: 36px/);
  assert.doesNotMatch(css, /is-compact|repository-graph-tools/);
  assert.doesNotMatch(css, /tr.graph-dimmed \{ opacity/);
  assert.match(css, /graph-boundary \{ stroke-dasharray/);
  const source = readFileSync(new URL('../src/RepositoryGraph.tsx', import.meta.url), 'utf8');
  assert.match(source, /onContextMenu=/);
  assert.match(source, /navigator.clipboard.writeText/);
  assert.match(source, /window.addEventListener\('keydown', navigate\)/);
  assert.match(source, /window.removeEventListener\('keydown', navigate\)/);
  assert.doesNotMatch(source, /fetch\(|importAPI|localStorage/);
});
