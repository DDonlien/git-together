import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { actionNamePosition, DashboardActionNames } from '../src/DashboardActionNames';
import { RepositoryActions } from '../src/RepositoryActions';
import { gitSignals } from '../src/branch-links';

test('action names sit beside the mouse and flip at right/bottom viewport edges', () => {
  const size = { width: 96, height: 29 }; const viewport = { width: 849, height: 853 };
  assert.deepEqual(actionNamePosition({ x: 600, y: 300 }, size, viewport), { left: 612, top: 316 });
  assert.deepEqual(actionNamePosition({ x: 840, y: 846 }, size, viewport), { left: 732, top: 805 });
  assert.deepEqual(actionNamePosition({ x: -10, y: -20 }, size, viewport), { left: 8, top: 8 });
  for (const x of [0, 8, 420, 760, 848]) for (const y of [0, 8, 420, 820, 852]) {
    const position = actionNamePosition({ x, y }, size, viewport);
    assert.ok(position.left >= 8 && position.left + size.width <= viewport.width - 8);
    assert.ok(position.top >= 8 && position.top + size.height <= viewport.height - 8);
  }
});

test('all seven names keep existing disabled Git actions and accessible detail', () => {
  const signals = gitSignals([], { workspace: null, loading: false, error: '' });
  const html = renderToStaticMarkup(createElement(DashboardActionNames, null, createElement(RepositoryActions, { label: 'Git 操作', signals })));
  assert.deepEqual([...html.matchAll(/data-action-name="([^"]+)"/g)].map(match => match[1]), ['Commit', 'Fetch', 'Pull', 'Push', 'Get Latest', 'Reconcile', 'Clear']);
  assert.equal((html.match(/aria-disabled="true"/g) || []).length, 7);
  assert.equal((html.match(/disabled=""/g) || []).length, 7);
  assert.match(html, /尚未接入执行，不会修改工作目录/);
  assert.doesNotMatch(html, /role="tooltip"|title="[^"]+"/);
});

test('name overlay is scoped to Dashboard row actions, including Hide/Restore, without layout or pointer capture', () => {
  const dashboard = readFileSync(new URL('../src/Dashboard.tsx', import.meta.url), 'utf8');
  assert.match(dashboard, /<DashboardActionNames>\s*<div className="remote-table-scroll"/);
  assert.match(dashboard, /data-action-name=\{hidden \? '恢复显示' : '隐藏'\}/);
  assert.doesNotMatch(readFileSync(new URL('../src/RepositoryView.tsx', import.meta.url), 'utf8'), /DashboardActionNames/);
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.dashboard-action-names \{ display: contents; \}/);
  assert.match(css, /\.dashboard-action-name \{[^}]*position: fixed;[^}]*pointer-events: none;[^}]*background: var\(--text\); color: var\(--content\)/);
});
