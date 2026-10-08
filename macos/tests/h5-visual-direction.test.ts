import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('H5 canvas blends the sidebar into the shared background without changing desktop material', () => {
  assert.match(css, /:root:not\(\[data-desktop='true'\]\) \.global-sidebar\.glass-panel \{[^}]*background: transparent !important;[^}]*border: 0;[^}]*box-shadow: none;/);
  assert.match(css, /:root:not\(\[data-desktop='true'\]\) \{[^}]*--h5-card-edge:/);
  assert.match(css, /:root\[data-theme='dark'\]:not\(\[data-desktop='true'\]\) \{[^}]*--h5-card-shadow:/);
});

test('H5 elevation applies to content groups, not individual repository rows', () => {
  assert.match(css, /:root:not\(\[data-desktop='true'\]\) :is\(\.import-stats \.stat-card, \.import-empty, \.remote-repository-group, \.repository-overview, \.repository-column\) \{[^}]*border: 1px solid var\(--h5-card-edge\);[^}]*box-shadow: var\(--h5-card-shadow\);/);
  assert.doesNotMatch(css, /:root:not\(\[data-desktop='true'\]\) \.remote-repo-table td \{[^}]*box-shadow/);
});

test('H5 visual direction leaves the three-column workspace and narrow-window scrolling unchanged', () => {
  assert.match(css, /\.repository-columns-scroll \{ flex: 1; min-height: 380px; overflow-x: auto; display: flex; \}/);
  assert.match(css, /\.repository-columns \{[^}]*grid-template-columns: var\(--graph-width\) var\(--changes-width\) var\(--tree-width\);/);
  assert.doesNotMatch(css, /:root:not\(\[data-desktop='true'\]\)\s+\.repository-columns(?:-scroll)?\s*\{/);
  assert.match(css, /\.repository-column-heading\.is-collapsed > h2 \{[^}]*writing-mode: vertical-rl;/);
});
