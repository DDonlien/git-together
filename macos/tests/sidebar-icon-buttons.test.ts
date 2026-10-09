import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('only permanent sidebar destinations receive an outlined decorative icon slot', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const accounts = readFileSync(new URL('../src/AccountSidebar.tsx', import.meta.url), 'utf8');
  assert.equal((app.match(/className="sidebar-button-icon" aria-hidden="true"/g) || []).length, 2);
  assert.match(app, /aria-label="Dashboard" onClick=\{showDashboard\}/);
  assert.match(app, /aria-label="设置" onClick=\{showSettings\}/);
  assert.doesNotMatch(accounts, /sidebar-button-icon|sidebar-permanent/);
  assert.match(accounts, /<RepositoryLogo \/><span>\{repo.name\}<\/span>/);
  assert.match(accounts, /title=\{repo.fullName\} aria-label=/);
});

test('permanent icon frames are square, use current semantic colors and align with the original expanded icon column', () => {
  assert.match(css, /\.global-sidebar \{ --sidebar-button-size: 32px; --sidebar-button-radius: 10px; --sidebar-label-inset:/);
  assert.match(css, /\.sidebar-button-icon \{[^}]*width: var\(--sidebar-button-size\); height: var\(--sidebar-button-size\); border: 1px solid var\(--card-edge\); border-radius: var\(--sidebar-button-radius\)/);
  assert.match(css, /\.nav-item\.sidebar-permanent \{[^}]*padding: 0 var\(--sidebar-label-inset\); gap: var\(--icon-label-gap\)/);
  assert.match(css, /\.sidebar-permanent\.active \.sidebar-button-icon \{ background: var\(--selection\); color: var\(--blue\); \}/);
  assert.match(css, /\.global-sidebar \.sidebar-disclosure\.icon-button\.ogui-control--small \{[^}]*border: 1px solid var\(--card-edge\); border-radius: var\(--sidebar-button-radius\)/);
});

test('compact hit areas use the expanded 32px icon frame size without enlargement or resting folder outlines', () => {
  assert.match(css, /\.global-sidebar \{ --sidebar-button-size: 32px; --sidebar-button-radius: 10px; --sidebar-label-inset:/);
  assert.doesNotMatch(css, /\.global-sidebar\.is-collapsed\s*\{[^}]*--sidebar-button-(?:size|radius)/);
  assert.match(css, /\.global-sidebar\.is-collapsed \.nav-item\.sidebar-permanent \{ width: var\(--sidebar-button-size\); height: var\(--sidebar-button-size\); margin-inline: auto; padding: 0; gap: 0; border-radius: var\(--sidebar-button-radius\); \}/);
  assert.match(css, /\.global-sidebar\.is-collapsed :is\(\.repository-item,\.sidebar-account-toggle\) \{ width: var\(--sidebar-button-size\); height: var\(--sidebar-button-size\); margin-inline: auto; padding: 0; border: 0; border-radius: var\(--sidebar-button-radius\); \}/);
  assert.match(css, /\.repository-item \{ box-shadow: none; \}/);
  assert.match(css, /\.nav-item > span:not\(\.repository-logo\):not\(\.sidebar-button-icon\)/);
  assert.match(css, /\.global-sidebar\.is-collapsed \{ width: 56px; padding-inline: 4px; \}/);
});

test('repository selection outlines the entire rectangular button without shifting glyphs or replacing keyboard focus', () => {
  assert.match(css, /\.repository-item\.active \{ box-shadow: inset 0 0 0 1px var\(--card-edge\); \}/);
  assert.match(css, /\.nav-item\.active \{ background: var\(--selection\);/);
  assert.doesNotMatch(css, /\.repository-item(?:\.active)?\s*(?:>[^{]*)?\{[^}]*outline:\s*(?:0|none)/);
  const accounts = readFileSync(new URL('../src/AccountSidebar.tsx', import.meta.url), 'utf8');
  assert.match(accounts, /repo\.id === selectedRepositoryId \? 'active' : ''/);
  assert.match(accounts, /className="sidebar-account-toggle" aria-expanded=\{!collapsed\}/);
});
