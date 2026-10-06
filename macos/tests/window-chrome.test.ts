import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WindowChrome } from '../src/WindowChrome';
import { SidebarHeader } from '../src/SidebarHeader';

test('brand row exposes the same public sidebar disclosure and replaces its identity when collapsed', () => {
  for (const collapsed of [false, true]) {
    const markup = renderToStaticMarkup(createElement(SidebarHeader, { collapsed, onToggle() {} }));
    const label = collapsed ? '展开侧边栏' : '收起侧边栏';
    assert.match(markup, /^<div class="brand"><span class="brand-identity"/);
    assert.equal(markup.includes('class="brand-identity" hidden=""'), collapsed);
    assert.match(markup, /GitTogether<\/span><\/span><button/);
    assert.match(markup, new RegExp(`aria-expanded="${!collapsed}" aria-controls="global-sidebar"`));
    assert.match(markup, new RegExp(`aria-label="${label}"`));
    assert.match(markup, /<button[^>]*ogui-button/);
    assert.match(markup, /sidebar-disclosure/);
    assert.match(markup, /type="button"/);
    assert.equal((markup.match(/<button/g) || []).length, 1);
  }
});

test('browser window controls keep traffic lights and fullscreen but contain no sidebar toggle', () => {
  const markup = renderToStaticMarkup(createElement(WindowChrome, { native: false }));
  assert.match(markup, /^<header class="window-chrome" aria-label="窗口控制">/);
  assert.match(markup, /aria-label="切换全屏"/);
  assert.equal((markup.match(/class="traffic-light traffic-light-/g) || []).length, 3);
  assert.match(markup, /<span class="traffic-light traffic-light-close" aria-hidden="true"><\/span>/);
  assert.match(markup, /<span class="traffic-light traffic-light-minimize" aria-hidden="true"><\/span>/);
  assert.match(markup, /<button class="traffic-light traffic-light-fullscreen" type="button"/);
  assert.doesNotMatch(markup, /<svg/);
  assert.equal((markup.match(/<button/g) || []).length, 1);
  assert.doesNotMatch(markup, /侧边栏|GitTogether|sidebar-disclosure/);
});

test('native window chrome reserves traffic-light space without drawing or replacing system buttons', () => {
  const markup = renderToStaticMarkup(createElement(WindowChrome, { native: true }));
  assert.match(markup, /<div class="traffic-lights"><\/div>/);
  assert.doesNotMatch(markup, /切换全屏|traffic-light-close|traffic-light-minimize|traffic-light-fullscreen/);
  assert.doesNotMatch(markup, /<button/);
});

test('production and real-Git QA shells keep navigation mounted with a shared header and rail class', () => {
  for (const file of ['../src/App.tsx', './repository-preview-client.tsx']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /<WindowChrome native=/);
    assert.match(source, /<SidebarHeader collapsed=\{sidebarCollapsed\} onToggle=\{\(\) => setSidebarCollapsed\(value => !value\)\}/);
    assert.match(source, /<div className="app-body">\s*<aside id="global-sidebar" className=\{`global-sidebar glass-panel\$\{sidebarCollapsed \? ' is-collapsed' : ''\}`\}/);
    assert.doesNotMatch(source, /hidden=\{sidebarCollapsed\}|sidebarCollapsed\s*&&|@refresh reset/);
    assert.doesNotMatch(source, /<aside[^>]*>[\s\S]*className="traffic-lights"/);
    assert.match(source, /<div className="app-content">/);
  }
});

test('collapsed layout retains a single icon column at every viewport and keeps traffic lights independent', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.app-frame \{[^}]*flex-direction: column;[^}]*overflow: hidden;/);
  assert.match(css, /\.app-body \{[^}]*display: flex; flex: 1; gap: var\(--workspace-gap\); min-width: 0; min-height: 0; overflow: hidden;/);
  assert.doesNotMatch(css, /\.global-sidebar\[hidden\]/);
  assert.match(css, /\.global-sidebar\.is-collapsed \{ width: 56px; padding-inline: 4px; \}/);
  assert.match(css, /\.brand-identity\[hidden\] \{ display: none; \}/);
  assert.match(css, /\.global-sidebar\.is-collapsed \.nav-item \{ justify-content: center; padding: 8px; gap: 0; \}/);
  assert.match(css, /\.global-sidebar\.is-collapsed \.sidebar-disclosure \{ margin-left: 0; \}/);
  assert.ok(css.indexOf('.global-sidebar.is-collapsed {') > css.indexOf('@media (max-width: 760px)'));
  assert.match(css, /\.window-chrome \{[^}]*height: 32px; flex-shrink: 0; -webkit-app-region: drag;/);
  assert.match(css, /\.traffic-lights \{ width: 72px; height: 32px; flex-shrink: 0;/);
  assert.equal((css.match(/\.traffic-lights \{/g) || []).length, 1);
});

test('native traffic lights remain at the external control strip regardless of sidebar width', () => {
  const source = readFileSync(new URL('../electron/main.ts', import.meta.url), 'utf8');
  assert.match(source, /trafficLightPosition: \{ x: 20, y: 18 \}/);
  assert.match(source, /window\.setWindowButtonVisibility\(true\)/);
  assert.doesNotMatch(source, /setWindowButtonPosition|width <= 760/);
});

test('browser traffic lights paint a full 12px diameter at 20px center spacing without icon padding', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.traffic-lights \{[^}]*gap: 8px; align-items: center; padding-left: 12px;/);
  assert.match(css, /\.traffic-light \{ display: block; width: 12px; height: 12px; flex: 0 0 12px; border-radius: 50%; \}/);
  assert.match(css, /\.traffic-light-close \{ background: #ff6058; \}/);
  assert.match(css, /\.traffic-light-minimize \{ background: #febc2e; \}/);
  assert.match(css, /\.traffic-light-fullscreen \{ background: #29c840; \}/);
  assert.doesNotMatch(css, /\.traffic-lights button \{/);
});
