import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('document, descendants and portalled controls hide both scrollbar axes', () => {
  const standard = css.match(/:root,\s*:root \*\s*\{([^}]+)\}/)?.[1];
  const webkit = css.match(/:root::-webkit-scrollbar,\s*:root \*::-webkit-scrollbar\s*\{([^}]+)\}/)?.[1];
  assert.ok(standard);
  assert.ok(webkit);
  assert.match(standard, /scrollbar-width:\s*none/);
  assert.match(webkit, /display:\s*none/);
  assert.match(webkit, /width:\s*0/);
  assert.match(webkit, /height:\s*0/);
  assert.doesNotMatch(standard + webkit, /overflow|pointer-events|touch-action|user-select/);
});

test('app scroll containers retain their native scrolling behavior', () => {
  const containers = [
    ['account-sidebar-list', 'overflow-y'],
    ['remote-table-scroll', 'overflow-x'],
    ['settings-scroll', 'overflow'],
    ['repository-workspace-view', 'overflow'],
    ['repository-columns-scroll', 'overflow-x'],
    ['repository-task-stack', 'overflow'],
    ['repository-changed-files', 'overflow'],
    ['repository-graph-scroll', 'overflow'],
    ['repository-task-tree', 'overflow'],
  ];
  for (const [className, property] of containers) {
    assert.match(css, new RegExp(`\\.${className}\\s*\\{[^}]*${property}:\\s*auto`), className);
  }
  assert.match(css, /\.repository-inline-diff pre\s*\{[^}]*overflow:\s*auto/);
  assert.match(css, /\.repository-task-body \{[^}]*overflow: hidden;/);
  assert.match(css, /\.repository-change-context \{ overflow: hidden; \}/);
  assert.match(css, /button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible\s*\{\s*outline: 2px solid var\(--blue\)/);
});
