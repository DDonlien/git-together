import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AccountSidebar } from '../src/AccountSidebar';
import { Dashboard } from '../src/Dashboard';
import { RepositoryView } from '../src/RepositoryView';
import { githubVerificationURL, type Catalog } from '../src/import-model';
import type { WorkspaceController } from '../src/use-workspace';
import pkg from '../package.json';

const catalog: Catalog = {
  instanceId: 'catalog-test', revision: 1, credentialStorage: 'session',
  accounts: [
    { id: 'personal', provider: 'github', host: 'https://github.com', login: 'personal-login', name: 'Personal', updatedAt: '2026-10-06T00:00:00Z' },
    { id: 'work', provider: 'gitea', host: 'https://git.example.test:10443', login: 'work-login', name: 'Work', updatedAt: '2026-10-06T00:00:00Z' },
  ],
  repositories: [
    { id: 'personal:1', remoteId: 1, accountId: 'personal', name: 'shared', fullName: 'org/shared', description: 'Personal copy', defaultBranch: 'main', private: false, url: 'https://github.com/org/shared', available: true },
    { id: 'personal:2', remoteId: 2, accountId: 'personal', name: 'archive', fullName: 'personal-login/archive', description: '', defaultBranch: 'legacy', private: true, url: 'https://github.com/personal-login/archive', available: false },
    { id: 'work:1', remoteId: 1, accountId: 'work', name: 'shared', fullName: 'org/shared', description: 'Work copy', defaultBranch: 'develop', private: true, url: 'https://git.example.test:10443/org/shared', available: true },
  ],
  links: [],
};

function controllerFor(value: Catalog): WorkspaceController {
  return {
    catalog: value, localStates: {}, preferences: { theme: 'system', reducedGlass: false, collapsedAccounts: [] },
    loading: false, error: '', storageError: '', busy: {},
    service: { instanceId: value.instanceId, version: pkg.version, githubWebAuth: false }, needsReload: false,
    updatePreferences: () => {}, reload: async () => {},
    connect: async () => value, updateAccount: async () => value, refresh: async () => value, removeAccount: async () => value,
    link: async () => value, matchAccountRepositories: async () => [], unlink: async () => value,
    startGithubAuthorization: async () => ({ id: 'catalog-test', userCode: 'ABCD-EFGH', verificationURL: githubVerificationURL, expiresAt: Date.now() + 900000, interval: 5 }),
    pollGithubAuthorization: async () => ({ status: 'pending', retryAfter: 5 }),
    cancelGithubAuthorization: async () => ({ cancelled: true }),
  };
}

function sidebar(value = catalog, collapsedAccounts: string[] = [], selectedRepositoryId?: string) {
  return renderToStaticMarkup(createElement(AccountSidebar, { catalog: value, collapsedAccounts, selectedRepositoryId, loading: false, onToggleAccount: () => {}, onOpen: () => {} }));
}

function dashboard(value = catalog, globalSearch = '') {
  return renderToStaticMarkup(createElement(Dashboard, { controller: controllerFor(value), globalSearch, onSearchChange: () => {}, onSettings: () => {}, onConfigure: () => {}, onOpen: () => {} }));
}

function rows(markup: string) {
  return [...markup.matchAll(/<tr class="dashboard-repository-row">([\s\S]*?)<\/tr>/g)].map(match => match[1]);
}

test('zero local links still display every repository and complete counts under its account', () => {
  const markup = sidebar();
  const sections = [...markup.matchAll(/<section class="sidebar-account">([\s\S]*?)<\/section>/g)].map(match => match[1]);
  assert.equal(sections.length, 2);
  assert.match(sections[0], /Personal<\/span><small>2<\/small>/);
  assert.match(sections[1], /Work<\/span><small>1<\/small>/);
  assert.equal((sections[0].match(/class="nav-item repository-item /g) || []).length, 2);
  assert.equal((sections[1].match(/class="nav-item repository-item /g) || []).length, 1);
  assert.match(sections[0], /title="personal-login\/archive"/);
  assert.doesNotMatch(sections[1], /title="personal-login\/archive"/);
  assert.equal((markup.match(/title="org\/shared"/g) || []).length, 2);
  assert.doesNotMatch(markup, /在 Dashboard 关联仓库/);
});

test('collapse and active state are account and repository specific, even for identical names', () => {
  const markup = sidebar(catalog, ['personal'], 'work:1');
  assert.match(markup, /aria-expanded="false" aria-controls="account-personal"/);
  assert.doesNotMatch(markup, /id="account-personal"/);
  assert.match(markup, /aria-expanded="true" aria-controls="account-work"/);
  assert.equal((markup.match(/class="nav-item repository-item active"/g) || []).length, 1);
  assert.equal((markup.match(/title="org\/shared"/g) || []).length, 1);
  assert.match(markup, /Personal<\/span><small>2<\/small>/);
});

test('sidebar represents an empty or failed account without asking for a local association', () => {
  const emptyAccount = { ...catalog, repositories: [] };
  assert.equal((sidebar(emptyAccount).match(/此账号暂无仓库/g) || []).length, 2);
  assert.match(sidebar({ ...emptyAccount, accounts: [{ ...catalog.accounts[0], error: 'Access denied' }] }), /仓库读取失败/);
  assert.doesNotMatch(sidebar(emptyAccount), /关联仓库/);
});

test('Dashboard has five repository columns with inline Git actions, not a separate status or default-branch column', () => {
  const markup = dashboard();
  assert.equal((markup.match(/<table\b/g) || []).length, 1);
  assert.deepEqual([...markup.matchAll(/<th scope="col">(.*?)<\/th>/g)].map(match => match[1]), ['仓库', '组织 / 用户', '账号', '本地目录', '<span class="sr-only">Git 操作</span>']);
  assert.doesNotMatch(markup, /remote-account-heading|remote-account-group/);
  const repositories = rows(markup);
  assert.equal(repositories.length, 3);
  for (const row of repositories) {
    assert.equal((row.match(/<td>/g) || []).length, 5);
    assert.match(row, /<button class="repository-link"/);
    assert.match(row, /尚未关联/);
  }
  assert.match(repositories[0], /<strong>Personal<\/strong>/);
  assert.match(repositories[0], /GitHub · personal-login@github.com/);
  assert.match(repositories[0], /aria-label="展开分支：org\/shared · Personal/);
  assert.match(repositories[2], /<strong>Work<\/strong>/);
  assert.match(repositories[2], /Gitea · work-login@git.example.test:10443/);
  assert.match(repositories[2], /aria-label="展开分支：org\/shared · Work/);
  assert.doesNotMatch(markup, />main<|>develop<|默认分支/);
  const controlled = [...markup.matchAll(/<button([^>]*)>/g)].filter(match => match[1].includes('repository-disclosure')).map(match => match[1].match(/aria-expanded="false" aria-controls="([^"]+)"/)![1]);
  assert.equal(controlled.length, 3); assert.equal(new Set(controlled).size, 3);
  for (const id of controlled) assert.ok(markup.includes(`<tbody id="${id}" class="dashboard-repository-branches"`) && markup.includes('hidden=""'));
  assert.match(repositories[1], /访问账号目前无权读取此仓库/);
});

test('repository names omit the owner prefix while retaining the complete identity in their tooltip', () => {
  const repositories = rows(dashboard());
  for (const [index, row] of repositories.entries()) {
    const link = row.match(/<button class="repository-link"([^>]*)>(.*?)<\/button>/)!;
    assert.equal(link[2], catalog.repositories[index].name);
    assert.doesNotMatch(link[2], /\//);
    assert.match(link[1], new RegExp(`title="${catalog.repositories[index].fullName}"`));
  }
});

test('organization and personal ownership comes from the repository, independently of the access account', () => {
  const repositories = rows(dashboard());
  const owners = repositories.map(row => [...row.matchAll(/<td>([\s\S]*?)<\/td>/g)][1][1]);
  assert.deepEqual(owners, [
    '<span class="repository-owner" title="org">org</span>',
    '<span class="repository-owner" title="personal-login">personal-login</span>',
    '<span class="repository-owner" title="org">org</span>',
  ]);
  const sharedPersonal = { ...catalog, repositories: [{ ...catalog.repositories[0], fullName: 'teammate/shared', url: 'https://github.com/teammate/shared' }] };
  const row = rows(dashboard(sharedPersonal))[0];
  assert.match(row, /class="repository-owner" title="teammate">teammate<\/span>/);
  assert.match(row, /<strong>Personal<\/strong>/);
  assert.match(row, /GitHub · personal-login@github.com/);
});

test('same-name repositories remain searchable by their separate ownership without mixing local associations', () => {
  const differentOwners = {
    ...catalog,
    repositories: [catalog.repositories[0], { ...catalog.repositories[2], fullName: 'another-org/shared', url: 'https://git.example.test:10443/another-org/shared' }],
    links: [{ repositoryId: 'work:1', path: '/projects/work/shared' }],
  };
  const repositories = rows(dashboard(differentOwners));
  assert.equal(repositories.length, 2);
  for (const row of repositories) assert.match(row, /class="repository-link"[^>]*>shared<\/button>/);
  const owned = rows(dashboard(differentOwners, 'ANOTHER-ORG'));
  assert.equal(owned.length, 1);
  assert.match(owned[0], /class="repository-owner" title="another-org">another-org<\/span>/);
  assert.match(owned[0], /<strong>Work<\/strong>/);
  assert.match(owned[0], /\/projects\/work\/shared/);
  assert.doesNotMatch(repositories[0], /\/projects\/work\/shared/);
});

test('each repository uses its centered folder tile as the sole disclosure beside two text lines', () => {
  for (const row of rows(dashboard())) {
    const cells = [...row.matchAll(/<td>([\s\S]*?)<\/td>/g)].map(match => match[1]);
    assert.match(cells[0], /class="remote-name"><button[^>]*repository-icon-tile repository-disclosure[^>]*>[\s\S]*?<svg[^>]*aria-hidden="true"[\s\S]*?<\/svg>[\s\S]*?<\/button><div><button class="repository-link"[\s\S]*?<\/button><small><span class="repository-visibility">(?:私有|公开)<\/span>/);
    assert.equal((cells[0].match(/repository-icon-tile/g) || []).length, 1);
    assert.equal((cells[0].match(/<svg\b/g) || []).length, 1);
    assert.equal((cells[0].match(/<small>/g) || []).length, 1);
    assert.doesNotMatch(cells[1], /<svg|provider-mark/);
    assert.doesNotMatch(cells[2], /<svg|provider-mark/);
  }
});

test('local associations decorate only their matching repository, not another account with the same remote id', () => {
  const linked = { ...catalog, links: [{ repositoryId: 'work:1', path: '/projects/work/shared' }] };
  const repositories = rows(dashboard(linked));
  assert.match(repositories[0], /尚未关联/);
  assert.doesNotMatch(repositories[0], /\/projects\/work\/shared/);
  assert.match(repositories[2], /\/projects\/work\/shared/);
  assert.match(repositories[2], /部分关联/);
  assert.match(repositories[2], /配置本地/);
  assert.equal((sidebar(linked).match(/class="nav-item repository-item /g) || []).length, 3);
});

test('same-host accounts with the same display name and shared remote repository remain distinguishable', () => {
  const shared: Catalog = {
    ...catalog,
    accounts: catalog.accounts.map(account => ({ ...account, provider: 'gitea', host: catalog.accounts[1].host, name: 'Team' })),
    repositories: [catalog.repositories[0], catalog.repositories[2]].map(repository => ({ ...repository, url: catalog.repositories[2].url })),
    links: [{ repositoryId: 'work:1', path: '/projects/team/shared' }],
  };
  const repositories = rows(dashboard(shared));
  assert.equal(repositories.length, 2);
  assert.match(repositories[0], /Team · personal-login@git.example.test:10443/);
  assert.match(repositories[1], /Team · work-login@git.example.test:10443/);
  assert.doesNotMatch(repositories[0], /\/projects\/team\/shared/);
  assert.match(repositories[1], /\/projects\/team\/shared/);
  assert.equal((sidebar(shared).match(/Team<\/span><small>1<\/small>/g) || []).length, 2);
});

test('the unlinked directory text itself is the association button without a separate row button', () => {
  const markup = dashboard();
  const directories = rows(markup).map(row => [...row.matchAll(/<td>([\s\S]*?)<\/td>/g)][3][1]);
  for (const directory of directories) {
    assert.equal((directory.match(/<button\b/g) || []).length, 1);
    assert.match(directory, /class="local-path local-path-action muted"/);
    assert.match(directory, />尚未关联<\/span><\/button>/);
    assert.match(directory, /aria-label="配置本地目录：/);
  }
  assert.match(directories[0], /配置本地目录：org\/shared · Personal · personal-login@github.com/);
  assert.match(directories[2], /配置本地目录：org\/shared · Work · work-login@git.example.test:10443/);
  assert.doesNotMatch(directories[0].match(/<button[^>]*>/)?.[0] || '', /disabled/);
  assert.match(directories[1].match(/<button[^>]*>/)?.[0] || '', /disabled/);
  assert.doesNotMatch(markup, />关联本地<\/(?:button|span)>/);
});

test('a linked directory remains a text configuration button even if remote access is lost', () => {
  const linked = { ...catalog, links: [{ repositoryId: 'personal:2', path: '/projects/personal/archive' }, { repositoryId: 'work:1', path: '/projects/work/shared' }] };
  const directories = rows(dashboard(linked)).map(row => [...row.matchAll(/<td>([\s\S]*?)<\/td>/g)][3][1]);
  for (const index of [1, 2]) {
    assert.match(directories[index], /class="local-path local-path-action "/);
    assert.match(directories[index], /title="[^"]*分支已验证/);
    assert.match(directories[index], />\/projects\/(?:personal\/archive|work\/shared)<\/small><\/button>/);
    assert.doesNotMatch(directories[index].match(/<button[^>]*>/)?.[0] || '', /disabled/);
  }
});

test('repository search includes account identity, branch and local directory', () => {
  const linked = { ...catalog, links: [{ repositoryId: 'work:1', path: '/projects/work/shared' }] };
  for (const search of ['WORK', 'work-login', 'git.example.test:10443', 'develop', '/projects/work']) {
    const repositories = rows(dashboard(linked, search));
    assert.equal(repositories.length, 1, search);
    assert.match(repositories[0], /<strong>Work<\/strong>/);
  }
  assert.equal(rows(dashboard(catalog, 'org/shared')).length, 2);
  assert.equal(rows(dashboard(catalog, 'Personal copy')).length, 1);
  assert.equal(rows(dashboard(catalog, 'no-match')).length, 0);
  assert.match(dashboard(catalog, 'no-match'), /没有符合搜索或筛选条件的仓库/);
});

test('account errors preserve cached repository rows in the same unified table', () => {
  const failed = { ...catalog, accounts: [{ ...catalog.accounts[0], error: 'Access denied' }, catalog.accounts[1]] };
  const markup = dashboard(failed);
  assert.equal((markup.match(/<table\b/g) || []).length, 1);
  assert.equal(rows(markup).length, 3);
  assert.match(markup, /Personal：Access denied 已保留上次读取的仓库列表/);
});

test('unlinked repository browsing does not claim a local association is required for remote contents', () => {
  const markup = renderToStaticMarkup(createElement(RepositoryView, { repository: catalog.repositories[2], account: catalog.accounts[1], globalSearch: '', onConfigure: () => {} }));
  assert.match(markup, /<h1>shared<\/h1>/);
  assert.match(markup, /repository-overview-description">Work copy<\/p>/);
  assert.match(markup, /aria-label="仓库信息"/);
  assert.match(markup, /<dt>访问账号<\/dt><dd[^>]*>Work<\/dd>/);
  assert.match(markup, /<p title="https:\/\/git.example.test:10443\/org\/shared">https:\/\/git.example.test:10443\/org\/shared<\/p>/);
  assert.match(markup, /<dt>默认分支<\/dt>/);
  assert.match(markup, /develop/);
  assert.doesNotMatch(markup, /<dt>本地目录<\/dt>/);
  assert.match(markup, /aria-label="分支图"/);
  assert.match(markup, /aria-label="Diff 与提交"/);
  assert.match(markup, /aria-label="文件树"/);
  assert.match(markup, /远端内容接口等待服务更新/);
  assert.match(markup, /选择一个提交查看差异/);
  assert.doesNotMatch(markup, /正在浏览已提交内容|远端仓库尚无提交/);
  assert.doesNotMatch(markup, /关联本地目录后(?:显示分支图|查看更改|显示文件树)/);
  assert.doesNotMatch(markup, /正在读取本地 Git 仓库|readonly-tabs|当前为真实仓库只读视图/);
});

test('a linked path alone does not claim loaded Git content while inaccessible unlinked repositories show cached information', () => {
  const linked = renderToStaticMarkup(createElement(RepositoryView, { repository: catalog.repositories[2], account: catalog.accounts[1], localPath: '/projects/work/shared', globalSearch: '', onConfigure: () => {} }));
  assert.doesNotMatch(linked.split('aria-label="仓库信息"')[1].split('</section>')[0], /<button|<dt>本地目录<\/dt>/);
  assert.match(linked, /更改与 Diff/);
  assert.match(linked, /分支图/);
  assert.match(linked, /远端内容接口等待服务更新/);
  assert.match(linked, /aria-label="仓库信息"/);
  const unavailable = renderToStaticMarkup(createElement(RepositoryView, { repository: catalog.repositories[1], account: catalog.accounts[0], globalSearch: '', onConfigure: () => {} }));
  assert.match(unavailable, /账号目前无权访问此仓库；这里显示上次读取的信息/);
});
