import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RepositoryActions, RepositoryActionItems } from '../src/RepositoryActions';
import type { RemoteRepository } from '../src/import-model';

const repository: RemoteRepository = { id: 'account:7', accountId: 'account', remoteId: 7, name: 'shared', fullName: 'org/shared', description: '', defaultBranch: 'main', private: true, url: 'https://github.com/org/shared', available: true };

function items(available = true, hasLocalDirectory = false) {
  return renderToStaticMarkup(createElement(RepositoryActionItems, { repository: { ...repository, available }, hasLocalDirectory, onOpen: () => {}, onConfigure: () => {} }));
}

function buttons(markup: string) {
  return [...markup.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].map(match => ({ attributes: match[1], text: match[2].replace(/<[^>]+>/g, '') }));
}

test('repository menu names and separates the confirmed Git and GitTogether groups', () => {
  const markup = items();
  assert.equal((markup.match(/role="group"/g) || []).length, 2);
  assert.match(markup, /aria-labelledby="[^"]+-git"/);
  assert.match(markup, /aria-labelledby="[^"]+-gt"/);
  assert.match(markup, />Git<\/span><small>尚未接入<\/small>/);
  assert.match(markup, />GitTogether<\/span>/);
  assert.equal((markup.match(/role="separator"/g) || []).length, 1);
  assert.deepEqual(buttons(markup).map(button => button.text), ['Fetch', 'Pull', 'Push', '提交', '打开工作台', '配置本地目录']);
});

test('unimplemented Git actions are disabled, explained and never represent success', () => {
  for (const hasLocalDirectory of [false, true]) {
    const markup = items(true, hasLocalDirectory);
    const actions = buttons(markup);
    for (const action of actions.slice(0, 4)) {
      assert.match(action.attributes, /disabled=""/);
      assert.match(action.attributes, /title="Git .*尚未接入"/);
      assert.match(action.attributes, /role="menuitem"/);
    }
    assert.doesNotMatch(markup, /已提交|已推送|操作成功/);
    for (const action of actions.slice(4)) assert.doesNotMatch(action.attributes, /disabled/);
  }
});

test('cached repositories can open while configuration requires remote access or an existing local link', () => {
  assert.doesNotMatch(buttons(items(false, false))[4].attributes, /disabled/);
  assert.match(buttons(items(false, false))[5].attributes, /disabled=""/);
  assert.doesNotMatch(buttons(items(false, true))[5].attributes, /disabled/);
});

test('row trigger uses an accessible repository and account name instead of an association button', () => {
  const markup = renderToStaticMarkup(createElement(RepositoryActions, { label: '仓库操作：org/shared · Personal', repository, hasLocalDirectory: false, onOpen: () => {}, onConfigure: () => {} }));
  assert.match(markup, /aria-label="仓库操作：org\/shared · Personal"/);
  assert.match(markup, /aria-haspopup="menu"/);
  assert.match(markup, /aria-expanded="false"/);
  assert.match(markup, /data-placement="end"/);
  assert.doesNotMatch(markup, /关联本地|配置本地/);
});

test('Dashboard annotation styles scope the 2px reduction and share the 10px icon-label gap', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const dashboard = readFileSync(new URL('../src/Dashboard.tsx', import.meta.url), 'utf8');
  assert.match(css, /--icon-label-gap:\s*10px/);
  assert.match(css, /--repository-detail-size:\s*11px/);
  assert.match(css, /\.remote-name small\s*\{[^}]*font-size:\s*var\(--repository-detail-size\)/);
  assert.match(css, /\.repository-visibility\s*\{\s*font-size:\s*9px/);
  assert.match(css, /\.remote-repo-table \.branch-label\s*\{[^}]*display:\s*inline-flex;[^}]*gap:\s*var\(--icon-label-gap\)/);
  assert.match(css, /\.nav-item\s*\{[^}]*gap:\s*var\(--icon-label-gap\)/);
  assert.doesNotMatch(dashboard, /provider-mark/);
  assert.match(dashboard, /className="repository-visibility"/);
  assert.match(dashboard, /className="branch-label" title=\{task.branch\}><Icon[^>]*\/><span>/);
  assert.match(dashboard, /aria-label=\{`配置本地目录：/);
});

test('repository table icon tile derives its square size from both text lines and their gap', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const sizing = css.match(/\.remote-name\s*\{([^}]+)\}/)?.[1] || '';
  assert.match(sizing, /--repository-name-size: 12px; --repository-detail-size: 11px;/);
  assert.match(sizing, /--repository-text-leading: 1\.45; --repository-text-gap: 3px;/);
  assert.match(sizing, /--repository-icon-size: calc\(\(var\(--repository-name-size\) \+ var\(--repository-detail-size\)\) \* var\(--repository-text-leading\) \+ var\(--repository-text-gap\)\)/);
  assert.match(css, /\.remote-name \.repository-link \{[^}]*font-size: var\(--repository-name-size\); line-height: var\(--repository-text-leading\)/);
  assert.match(css, /\.remote-name small \{[^}]*font-size: var\(--repository-detail-size\); line-height: var\(--repository-text-leading\);[^}]*margin-top: var\(--repository-text-gap\)/);
});

test('rounded repository tile centers the smaller folder and remains scoped to the table', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const tile = css.match(/\.remote-name \.repository-icon-tile \{([^}]+)\}/)?.[1] || '';
  assert.match(tile, /display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;/);
  assert.match(tile, /width: var\(--repository-icon-size\); height: var\(--repository-icon-size\)/);
  assert.match(tile, /border-radius: var\(--radius-control\)/);
  assert.match(tile, /color: var\(--blue\); background: var\(--blue-bg\)/);
  assert.doesNotMatch(tile, /box-shadow|border:|transform/);
  assert.doesNotMatch(css, /\.remote-name > svg/);
  assert.match(css, /--sidebar-icon-size: 19px;/);
  assert.match(css, /\.global-sidebar \.nav-item > svg, \.global-sidebar \.repository-logo, \.global-sidebar \.repository-logo > svg \{ width: var\(--sidebar-icon-size\); height: var\(--sidebar-icon-size\); \}/);
});
