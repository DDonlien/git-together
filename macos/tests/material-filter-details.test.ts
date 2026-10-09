import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
test('all expanded sidebar leading slots share one inset and a 10px label gap without heavier frames', () => {
  assert.match(css, /--icon-label-gap: 10px/);
  for (const selector of ['.sidebar-header', '.sidebar-account-toggle', '.nav-item', '.nav-item.sidebar-permanent']) {
    const rule = css.slice(css.indexOf(`${selector} {`)).split('}')[0];
    assert.match(rule, /gap: var\(--icon-label-gap\)/);
    assert.match(rule, /var\(--sidebar-label-inset\)/);
  }
  assert.match(css, /\.sidebar-button-icon \{[^}]*border: 1px solid var\(--card-edge\)/);
  assert.match(css, /\.global-sidebar \.sidebar-disclosure[^}]*border: 1px solid var\(--card-edge\)/);
});
test('checkboxes use semantic checked/ink colors and only keyboard checkbox focus, not a selected row outline', () => {
  assert.doesNotMatch(css, /\.multi-filter-option:focus-within|\.multi-filter-option\[.*checked/);
  assert.match(css, /\.multi-filter-option input:checked \{ border-color: var\(--blue\); background: var\(--blue\)/);
  assert.match(css, /\.multi-filter-option input:checked::after \{[^}]*var\(--on-primary\)/);
  assert.match(css, /\.multi-filter-option input:focus-visible/);
  assert.match(css, /@media \(forced-colors: active\).*appearance: auto/);
  const source = readFileSync(new URL('../src/MultiFilterMenu.tsx', import.meta.url), 'utf8');
  assert.match(source, /<label className="multi-filter-option"/);
  assert.match(source, /event\.relatedTarget && !event\.currentTarget\.contains/);
  assert.doesNotMatch(source, /<MenuItem|onClick=.*onToggle/);
});
test('expanded branch rows inherit the card neutral surface and override every inherited row divider', () => {
  assert.match(css, /\.dashboard-repository-branches \{ background: transparent; \}/);
  assert.match(css, /\.remote-repo-table \.dashboard-branch-row td, \.remote-repo-table \.dashboard-branch-message td \{[^}]*border-bottom: 0;/);
  assert.doesNotMatch(css, /\.dashboard-repository-branches \{[^}]*blue-bg/);
});
