import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { graphRowHeight, graphVisibleWindow } from '../src/commit-graph';
import { RepositoryGraph } from '../src/RepositoryGraph';
import type { RepositoryWorkspace } from '../src/repository-model';

test('large history windows include viewport rows and eight buffered rows on each side', () => {
  assert.deepEqual(graphVisibleWindow(10000, 0, 420), { start: 0, end: 18, firstVisible: 0 });
  assert.deepEqual(graphVisibleWindow(10000, 42000, 420), { start: 992, end: 1018, firstVisible: 1000 });
  const bottom = graphVisibleWindow(10000, 10000 * graphRowHeight - 420, 420);
  assert.deepEqual(bottom, { start: 9982, end: 10000, firstVisible: 9990 });
  assert.equal(bottom.start * graphRowHeight + (bottom.end - bottom.start) * graphRowHeight + (10000 - bottom.end) * graphRowHeight, 420000);
});

test('rubber-band overscroll and a shortened or empty history keep valid visible targets', () => {
  assert.deepEqual(graphVisibleWindow(10000, -70, 420), graphVisibleWindow(10000, 0, 420));
  assert.deepEqual(graphVisibleWindow(10000, 500000, 420), graphVisibleWindow(10000, 419580, 420));
  assert.deepEqual(graphVisibleWindow(5, 42000, 600), { start: 0, end: 5, firstVisible: 0 });
  assert.deepEqual(graphVisibleWindow(0, 42000, 600), { start: 0, end: 0, firstVisible: 0 });
});

const workspace: RepositoryWorkspace = {
  source: 'remote', complete: false,
  tasks: [{ id: 'main', branch: 'main', head: 'commit-0', path: null, remote: true, files: [], tree: [], error: '' }],
  commits: Array.from({ length: 10000 }, (_, index) => ({ id: `commit-${index}`, parents: index === 9999 ? ['unloaded-parent'] : [`commit-${index + 1}`], refs: index ? [] : ['origin/main'], summary: `Commit ${index}`, author: 'Preview', time: '2026-10-13T00:00:00Z' })),
};

test('large graph keeps complete row counts and scroll extent while initially mounting only a window', () => {
  const markup = renderToStaticMarkup(createElement(RepositoryGraph, { workspace, search: '', focusedTask: null }));
  assert.match(markup, /aria-rowcount="10000"/);
  assert.equal((markup.match(/class="repository-graph-description"/g) || []).length, 9);
  assert.equal((markup.match(/tabindex="0"/g) || []).length, 1);
  assert.match(markup, /aria-rowindex="1"/);
  assert.match(markup, /height:419622px/);
  assert.doesNotMatch(markup, /data-commit-id="commit-9999"/);
});

test('bottom spinner follows explicit reading status and never treats truncated history as active loading', () => {
  const render = (loading: boolean) => renderToStaticMarkup(createElement(RepositoryGraph, { workspace, search: '', focusedTask: null, loading }));
  const reading = render(true), idle = render(false);
  assert.match(reading, /class="repository-graph-loading" role="status"/);
  assert.match(reading, /class="spin"/);
  assert.match(reading, /正在加载/);
  assert.match(reading, /data-commit-id="commit-0"/);
  assert.doesNotMatch(idle, /repository-graph-loading/);
  assert.match(idle, /data-commit-id="commit-0"/);
});

test('remote-only branches preserve actual local unpublished and working nodes', () => {
  const source: RepositoryWorkspace = {
    ...workspace, source: 'mixed', complete: true,
    commits: [{ ...workspace.commits[0], id: 'local-tip', parents: ['base'], refs: ['main'] }, { ...workspace.commits[0], id: 'base', parents: [], refs: ['origin/main'] }],
    tasks: [
      { ...workspace.tasks[0], id: 'local', remote: false, head: 'local-tip', path: '/preview/main', files: [{ path: 'draft.txt', status: 'M', tracked: true }] },
      { ...workspace.tasks[0], head: 'base' },
      ...Array.from({ length: 200 }, (_, index) => ({ ...workspace.tasks[0], id: `remote-${index}`, branch: `feature/${index}`, head: 'base' })),
    ],
  };
  const markup = renderToStaticMarkup(createElement(RepositoryGraph, { workspace: source, search: '', focusedTask: null }));
  assert.match(markup, /graph-working-node/);
  assert.equal((markup.match(/graph-unpublished-node/g) || []).length, 1);
  assert.match(markup, /data-commit-id="local-tip"/);
  assert.match(markup, /data-commit-id="base"/);
});

test('timestamp labels retain the existing locale and timezone representation', () => {
  const markup = renderToStaticMarkup(createElement(RepositoryGraph, { workspace: { ...workspace, commits: workspace.commits.slice(0, 1) }, search: '', focusedTask: null }));
  const date = new Date(workspace.commits[0].time);
  assert.ok(markup.includes(date.toLocaleString()));
  assert.ok(markup.includes(`>${date.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}</time>`));
});
