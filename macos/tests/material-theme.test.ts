import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MaterialProvider, Button } from '../src/ui';
import { componentTheme } from '../src/theme';

test('Material boundary uses non-optical public primitives and preserves disabled actions in both themes', () => {
  for (const appearance of ['light', 'dark'] as const) {
    const markup = renderToStaticMarkup(createElement(MaterialProvider, { appearance, children: createElement(Button, { variant: 'primary', disabled: true }, 'Commit') }));
    assert.match(markup, new RegExp(`data-ogui-appearance="${appearance}"`));
    assert.match(markup, /data-ogui-design="classic"/);
    assert.match(markup, /<button disabled="" type="button"/);
    assert.match(markup, /ogui-button--primary/);
    assert.doesNotMatch(markup, /ogui-optical|ogui-rim/);
  }
});

test('content and portalled primitives share semantic colors and Material shapes', () => {
  assert.equal(componentTheme['--ogui-color-surface'], 'var(--content)');
  assert.equal(componentTheme['--ogui-color-accent-ink'], 'var(--on-primary)');
  assert.equal(componentTheme['--ogui-color-secondary'], 'var(--teal)');
  assert.equal(componentTheme['--ogui-color-tertiary'], 'var(--purple)');
  assert.equal(componentTheme['--ogui-radius-control'], 'var(--radius-control)');
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /@fontsource\/roboto\/latin-400\.css/);
  assert.match(css, /\.ogui-overlay__surface \{[^}]*border-radius: 28px;[^}]*background: var\(--menu-surface\);/);
  assert.match(css, /\.ogui-disclosure__surface \{[^}]*background: var\(--menu-surface\) !important;[^}]*border: 1px solid var\(--card-edge\) !important;[^}]*backdrop-filter: none !important;/);
});

test('light and dark semantic cards are flat while menus retain independent shadow elevation', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  for (const theme of [css.match(/:root \{([^}]+)\}/)?.[1], css.match(/:root\[data-theme='dark'\] \{([^}]+)\}/)?.[1]]) {
    assert.ok(theme);
    assert.match(theme, /--card-shadow: none;/);
    assert.match(theme, /--menu-shadow: 0 4px 16px/);
    assert.match(theme, /--content: #[0-9a-f]+;/);
  }
});

test('native Material shell and package omit optical modules without weakening the trusted bridge', () => {
  const main = readFileSync(new URL('../electron/main.ts', import.meta.url), 'utf8');
  const packager = readFileSync(new URL('../scripts/package-desktop.ts', import.meta.url), 'utf8');
  const packageJSON = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.doesNotMatch(main + packager, /electron-liquid-glass|addView|setEffect/);
  assert.equal(packageJSON.dependencies['electron-liquid-glass'], undefined);
  assert.match(main, /backgroundColor: nativeTheme\.shouldUseDarkColors \? '#131318' : '#f6f5fa'/);
  assert.match(main, /nativeGlass: false/);
  assert.match(main, /contextIsolation: true, nodeIntegration: false, sandbox: true/);
  assert.match(main, /isMainRenderer\(event\)/);
  assert.match(main, /dialog\.showOpenDialog/);
  // Font attribution travels with both the browser build and native snapshot.
  assert.match(packager, /sourceEntries = \[[^\n]*'public'/);
  const license = readFileSync(new URL('../public/licenses/Roboto-OFL.txt', import.meta.url), 'utf8');
  assert.match(license, /SIL OPEN FONT LICENSE/);
});
