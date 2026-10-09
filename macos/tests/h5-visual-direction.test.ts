import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('Material canvas blends the sidebar into the shared background in both hosts', () => {
  assert.match(css, /\.global-sidebar \{[^}]*background: transparent;[^}]*border: 0;[^}]*border-radius: 0;[^}]*box-shadow: none;/);
  assert.doesNotMatch(css, /:root:not\(\[data-desktop='true'\]\)|--h5-card/);
  assert.match(css, /--window-background: #f6f5fa/);
  assert.match(css, /:root\[data-theme='dark'\] \{[^}]*--window-background: #131318/);
});

test('Material elevation applies to semantic content groups, not individual repository rows', () => {
  assert.match(css, /\.flat-group \{[^}]*border: 1px solid var\(--card-edge\);[^}]*box-shadow: var\(--card-shadow\);/);
  assert.match(css, /\.import-stats \.stat-card \{[^}]*box-shadow: var\(--card-shadow\);/);
  assert.doesNotMatch(css, /\.remote-repo-table td \{[^}]*box-shadow/);
});

test('Material visual direction leaves the three-column workspace and narrow-window scrolling unchanged', () => {
  assert.match(css, /\.repository-columns-scroll \{ flex: 1; min-height: 380px; overflow-x: auto; display: flex; \}/);
  assert.match(css, /\.repository-columns \{[^}]*grid-template-columns: var\(--graph-width\) var\(--changes-width\) var\(--tree-width\);/);
  assert.doesNotMatch(css, /:root:not\(\[data-desktop='true'\]\)\s+\.repository-columns(?:-scroll)?\s*\{/);
  assert.match(css, /\.repository-column-heading\.is-collapsed > h2 \{[^}]*writing-mode: vertical-rl;/);
});
