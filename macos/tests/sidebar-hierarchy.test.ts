import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AccountSidebar } from '../src/AccountSidebar';
import type { Catalog } from '../src/import-model';

const catalog: Catalog = {
  instanceId: 'sidebar-test', revision: 1, credentialStorage: 'session', links: [],
  accounts: [{ id: 'work', provider: 'github', host: 'https://github.com', login: 'work-user', name: 'Work', updatedAt: '2026-10-06T00:00:00Z' }],
  repositories: [{ id: 'work:1', remoteId: 1, accountId: 'work', name: 'project', fullName: 'work-user/project', description: '', defaultBranch: 'main', private: false, url: 'https://github.com/work-user/project', available: true }],
};

function render(collapsedAccounts: string[] = []) {
  return renderToStaticMarkup(createElement(AccountSidebar, {
    catalog, collapsedAccounts, selectedRepositoryId: 'work:1', loading: false,
    onToggleAccount: () => {}, onOpen: () => {},
  }));
}

test('disclosure has a centered decorative slot without changing account naming or expansion semantics', () => {
  for (const collapsed of [false, true]) {
    const markup = render(collapsed ? ['work'] : []);
    assert.match(markup, new RegExp(`aria-expanded="${!collapsed}" aria-controls="account-work"`));
    assert.match(markup, /aria-label="Work · work-user@github.com"/);
    assert.match(markup, /class="sidebar-account-disclosure" aria-hidden="true"><svg[^>]*width="11"[^>]*height="11"/);
    assert.match(markup, /class="sidebar-account-name">Work<\/span><small>1<\/small>/);
    assert.equal(markup.includes('id="account-work"'), !collapsed);
  }
});

test('child repositories keep full row selection, their label and the attached Presence badge', () => {
  const markup = render();
  assert.match(markup, /class="sidebar-account-repositories"><button class="nav-item repository-item active"/);
  assert.match(markup, /title="work-user\/project" aria-label="project"/);
  assert.match(markup, /class="repository-logo"[^>]*aria-label="Presence 尚未连接"/);
  assert.match(markup, /class="repository-presence offline" aria-hidden="true"/);
  assert.match(markup, /<span>project<\/span>/);
  assert.doesNotMatch(markup, /style="[^"]*(?:margin|transform)/);
});

test('expanded sidebar folders and accounts share one icon and label column without child indentation', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /--sidebar-icon-size: 19px; --sidebar-row-inset: 10px; --sidebar-level-indent: 0px/);
  assert.match(css, /\.account-sidebar-list \{[^}]*margin-inline: 0;/);
  assert.match(css, /\.sidebar-account-toggle \{[^}]*gap: var\(--icon-label-gap\); padding: 6px var\(--sidebar-row-inset\)/);
  assert.match(css, /\.sidebar-account-disclosure \{[^}]*justify-content: center; flex: 0 0 var\(--sidebar-icon-size\); width: var\(--sidebar-icon-size\)/);
  assert.match(css, /\.sidebar-account-repositories \{ --sidebar-item-indent: var\(--sidebar-level-indent\); \}/);
  const inset = 'padding-inline-start: calc(var(--sidebar-row-inset) + var(--sidebar-item-indent, 0px));';
  assert.equal(css.split(inset).length - 1, 1, 'all expanded rows use the same leading inset without responsive re-indentation');
  assert.match(css, /\.global-sidebar \.nav-item > svg, \.global-sidebar \.repository-logo, \.global-sidebar \.repository-logo > svg \{ width: var\(--sidebar-icon-size\); height: var\(--sidebar-icon-size\); \}/);
  assert.match(css, /\.global-sidebar\.is-collapsed \.nav-item \{ justify-content: center; padding: 8px; gap: 0; \}/, 'compact icon rail stays centered');
});

test('unavailable repository rail controls retain their warning in the accessible label', () => {
  const unavailable = { ...catalog, repositories: catalog.repositories.map(repo => ({ ...repo, available: false })) };
  const markup = renderToStaticMarkup(createElement(AccountSidebar, { catalog: unavailable, collapsedAccounts: [], loading: false, onToggleAccount() {}, onOpen() {} }));
  assert.match(markup, /aria-label="project（不可访问）"/);
});
