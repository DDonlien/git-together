import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (file: string) => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');

test('the restored shell and Dashboard use only the original OpenGlass adapters', () => {
  const app = source('App.tsx');
  const dashboard = source('Dashboard.tsx');
  const entry = source('main.tsx');
  const actions = source('RepositoryActions.tsx');
  for (const text of [app, dashboard, entry, actions]) assert.doesNotMatch(text, /@jetbrains\/ring-ui-built|DashboardRing|dashboard-ring|ring-app-frame|ring-shell-theme/);
  assert.match(app, /<GlassSystemProvider/);
  assert.match(app, /className="app-frame"/);
  assert.match(dashboard, /from '\.\/ui'/);
  assert.match(dashboard, /from '\.\/FilterMenu'/);
  assert.match(dashboard, /from '\.\/MultiFilterMenu'/);
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.dependencies['@jetbrains/ring-ui-built'], undefined);
});

test('the restored search/filter row is outside the flat repository group and keeps sidebar/scrolling geometry', () => {
  const dashboard = source('Dashboard.tsx');
  const toolbar = dashboard.indexOf('<div className="import-filterbar"');
  const card = dashboard.indexOf('<section className="remote-repository-group flat-group"');
  const table = dashboard.indexOf('<div className="remote-table-scroll"');
  assert.ok(toolbar >= 0 && toolbar < card && card < table);
  assert.match(dashboard.slice(toolbar, card), /<\/div>/);
  assert.equal((dashboard.match(/aria-label="仓库列表"/g) || []).length, 1);
  const css = source('styles.css');
  assert.match(css, /--workspace-gap: 16px/);
  assert.match(css, /--radius-sidebar: 22px/);
  assert.match(css, /\.global-sidebar[^}]*border-radius: var\(--radius-sidebar\)/);
  assert.match(css, /\.global-sidebar\.is-collapsed[^}]*width: 56px/);
  assert.match(css, /scrollbar-width: none/);
  assert.match(css, /\.remote-table-scroll[^}]*overflow-x: auto/);
});
