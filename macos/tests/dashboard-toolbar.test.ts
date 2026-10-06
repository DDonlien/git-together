import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FilterMenu, FilterOptions } from '../src/FilterMenu';
import { RepositoryView } from '../src/RepositoryView';
import type { Account, RemoteRepository } from '../src/import-model';

const options = [{ value: 'all', label: '全部账号' }, { value: 'a', label: 'Team', detail: 'alice@git.example.test' }, { value: 'b', label: 'Team', detail: 'bob@git.example.test' }];
test('filter triggers are public menus with category, selection, disclosure and no native select frame', () => {
  const markup = renderToStaticMarkup(createElement(FilterMenu, { label: '筛选账号', options, value: 'a', onChange: () => {} }));
  assert.match(markup, /aria-label="筛选账号：Team"/);
  assert.match(markup, /aria-haspopup="menu"/); assert.match(markup, /aria-expanded="false"/);
  assert.match(markup, /data-placement="start"/); assert.match(markup, /ogui-button--quiet/);
  assert.doesNotMatch(markup, /<select|ogui-select/);
});

test('filter items distinguish same-name accounts and mark exactly one current choice', () => {
  const markup = renderToStaticMarkup(createElement(FilterOptions, { options, value: 'b', onChange: () => {} }));
  assert.equal((markup.match(/role="menuitem"/g) || []).length, 3);
  assert.equal((markup.match(/aria-current="true"/g) || []).length, 1);
  assert.match(markup, /alice@git.example.test/); assert.match(markup, /bob@git.example.test/);
  assert.doesNotMatch(markup, /menuitemradio|aria-checked/);
});

test('Dashboard places the search first in the filter row, removes reload and does not show an empty topbar', () => {
  const dashboard = readFileSync(new URL('../src/Dashboard.tsx', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(dashboard, /className="import-filterbar" role="search"/);
  assert.ok(dashboard.indexOf('className="dashboard-search"') < dashboard.indexOf('<FilterMenu'));
  assert.doesNotMatch(dashboard, /重新加载|refreshRepositories|<Select/);
  assert.doesNotMatch(app, /<header className="topbar/);
  assert.match(app, /onSearchChange=\{setGlobalSearch\} searchRef=\{searchRef\}/);
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.dashboard-filter \.filter-trigger\s*\{[^}]*border:\s*0;[^}]*box-shadow:\s*none/);
  assert.match(css, /\.import-filterbar\s*\{[^}]*display:\s*flex/);
  assert.match(css, /\.search-field\s*\{\s*display:\s*grid;/);
  assert.doesNotMatch(css, /\.search-field\s*\{\s*display:\s*block;/);
});

test('a local background error retains the last good file view with an explicit stale-data notice', () => {
  const repository: RemoteRepository = { id: 'a:1', accountId: 'a', remoteId: 1, name: 'project', fullName: 'alice/project', description: '', defaultBranch: 'main', private: true, url: 'https://git.example.test/alice/project', available: true };
  const account: Account = { id: 'a', provider: 'gitea', host: 'https://git.example.test', name: 'Team', login: 'alice', updatedAt: '' };
  const markup = renderToStaticMarkup(createElement(RepositoryView, { repository, account, localPath: '/projects/project', globalSearch: '', onConfigure: () => {}, localState: { path: '/projects/project', snapshot: { path: '/projects/project', branch: 'working', files: [{ path: 'app.ts', status: 'M', tracked: true }], commits: [] }, error: 'Directory unavailable', checkedAt: 123 } }));
  assert.match(markup, /Directory unavailable/); assert.match(markup, /显示上次读取的本地状态/);
  assert.match(markup, /app.ts/); assert.match(markup, /working/);
  assert.doesNotMatch(markup, /正在读取本地 Git 仓库|>刷新</);
});
