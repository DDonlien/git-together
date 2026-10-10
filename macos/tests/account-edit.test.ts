import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AccountService, type CredentialStore, type SavedState } from '../server/account-service';
import { importMiddleware } from '../server/http-api';
import { AccountEditForm } from '../src/AccountEditForm';
import { SettingsView } from '../src/SettingsView';
import { githubVerificationURL, isCatalog, type Catalog, type Provider } from '../src/import-model';
import type { WorkspaceController } from '../src/use-workspace';
import pkg from '../package.json';

const rawRepository = (id: number, fullName: string, branch = 'main') => ({ id, name: fullName.split('/')[1], full_name: fullName, default_branch: branch, private: false });
function seed(provider: Provider): SavedState {
  const host = provider === 'github' ? 'https://github.com' : 'https://git.example.test:10443';
  const accounts: SavedState['accounts'] = [
    { account: { id: 'alpha', name: 'Personal', login: 'alice', provider, host, updatedAt: '2026-10-01T00:00:00Z', error: 'previous error', authorizationExpiresAt: '2026-10-07T00:00:00Z' }, token: 'fixture-old' },
    { account: { id: 'beta', name: 'Work', login: 'bob', provider, host, updatedAt: '2026-10-01T00:00:00Z' }, token: 'fixture-other' },
  ];
  const repositories = [[1, 'alice/project', 'alpha'], [2, 'org/team', 'alpha'], [1, 'alice/project', 'beta']].map(([id, fullName, accountId]) => ({
    id: `${accountId}:${id}`, remoteId: Number(id), accountId: String(accountId), name: String(fullName).split('/')[1], fullName: String(fullName), description: '', defaultBranch: 'main', private: false, available: true, url: `${host}/${fullName}`,
  }));
  return { version: 2, accounts, repositories, links: [{ repositoryId: 'alpha:2', path: '/fixture-only/team' }] };
}
async function catalog(service: AccountService): Promise<Catalog> { const value = await service.handle('catalog', {}); assert.ok(isCatalog(value)); return value; }
function fixture(provider: Provider = 'gitea') {
  const initial = seed(provider); let saved = structuredClone(initial); let failStorage = false; let failRepos = false;
  const requests: { url: URL; token: string }[] = [];
  const request: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); const token = new Headers(init?.headers).get('Authorization')!.split(' ')[1];
    requests.push({ url, token });
    if (token === 'fixture-invalid') return new Response('do not expose provider body', { status: 401 });
    if (url.pathname.endsWith('/user')) return Response.json({ login: token === 'fixture-other' ? 'bob' : token === 'fixture-malformed' ? 'bad/login' : 'ALICE' });
    if (failRepos) return new Response('do not expose repository body', { status: 503 });
    return Response.json(url.searchParams.get('page') === '1' ? token === 'fixture-new' ? [rawRepository(1, 'alice/project', 'updated'), rawRepository(3, 'org/new')] : [rawRepository(1, 'alice/project'), rawRepository(2, 'org/team')] : []);
  };
  const store: CredentialStore = { kind: 'encrypted', load: async () => structuredClone(initial), save: async next => { if (failStorage) throw new Error('Fixture storage unavailable'); saved = structuredClone(next); } };
  return { service: new AccountService(store, request), request, initial, requests, saved: () => saved,
    failStorage: (value: boolean) => { failStorage = value; }, failRepos: (value: boolean) => { failRepos = value; } };
}

test('rename with an omitted, empty or whitespace-only token retains credentials and all identity, repositories and links without provider calls', async () => {
  const f = fixture(); const before = await catalog(f.service);
  for (const token of [undefined, '', '   ']) {
    const result = await f.service.handle('updateAccount', { accountId: 'alpha', name: ' Renamed ', ...(token === undefined ? {} : { token }) }); assert.ok(isCatalog(result));
    assert.deepEqual(result.accounts[0], { ...before.accounts[0], name: 'Renamed' });
    assert.deepEqual(result.accounts[1], before.accounts[1]); assert.deepEqual(result.repositories, before.repositories); assert.deepEqual(result.links, before.links);
    assert.equal(f.saved().accounts[0].token, 'fixture-old'); assert.equal(f.requests.length, 0);
    assert.doesNotMatch(JSON.stringify(result), /fixture-old|fixture-other/);
  }
});

for (const provider of ['github', 'gitea'] as const) test(`${provider}: replacement token verifies the saved identity case-insensitively and preserves account IDs, linked missing repositories and the other account`, async () => {
  const f = fixture(provider); const before = await catalog(f.service);
  const result = await f.service.handle('updateAccount', { accountId: 'alpha', name: 'Renamed', token: 'fixture-new' }); assert.ok(isCatalog(result));
  assert.equal(result.accounts[0].id, 'alpha'); assert.equal(result.accounts[0].login, 'alice'); assert.equal(result.accounts[0].host, before.accounts[0].host); assert.equal(result.accounts[0].provider, provider);
  assert.equal(result.accounts[0].name, 'Renamed'); assert.equal(result.accounts[0].error, undefined); assert.equal(result.accounts[0].authorizationExpiresAt, undefined); assert.notEqual(result.accounts[0].updatedAt, before.accounts[0].updatedAt);
  assert.equal(f.saved().accounts[0].token, 'fixture-new'); assert.deepEqual(f.saved().accounts[1], f.initial.accounts[1]);
  assert.deepEqual(result.repositories.find(repository => repository.accountId === 'beta'), before.repositories.find(repository => repository.accountId === 'beta'));
  assert.equal(result.repositories.find(repository => repository.id === 'alpha:1')?.defaultBranch, 'updated');
  assert.equal(result.repositories.find(repository => repository.id === 'alpha:2')?.available, false); assert.ok(result.repositories.some(repository => repository.id === 'alpha:3'));
  assert.deepEqual(result.links, before.links); assert.doesNotMatch(JSON.stringify(result), /fixture-new|fixture-other/);
  assert.ok(f.requests.every(({ url, token }) => url.origin === (provider === 'github' ? 'https://api.github.com' : f.initial.accounts[0].account.host) && token === 'fixture-new'));
});

test('invalid fields, unknown accounts, malformed identities, wrong-account tokens and attempts to change host/provider/login reject atomically', async () => {
  const f = fixture(); const before = await catalog(f.service);
  const invalid = [
    { name: '' }, { name: '   ' }, { name: 'x'.repeat(121) }, { accountId: 'unknown' },
    { token: 'fixture-invalid' }, { token: 'fixture-other' }, { token: 'fixture-malformed' },
    { token: 'two words' }, { token: 'fixture-new\n' }, { token: null }, { token: 'x'.repeat(4097) },
    { host: 'https://evil.test', token: 'fixture-new' }, { provider: 'github' }, { login: 'bob' },
  ];
  for (const fields of invalid) {
    await assert.rejects(f.service.handle('updateAccount', { accountId: 'alpha', name: 'Draft', ...fields }));
    assert.deepEqual(await catalog(f.service), before); assert.deepEqual(f.saved(), f.initial);
  }
  assert.ok(f.requests.every(({ url }) => url.origin === f.initial.accounts[0].account.host));
});

test('provider repository failure and credential persistence failure retain the old name/token/list and do not poison a retry', async () => {
  const f = fixture(); const before = await catalog(f.service);
  f.failRepos(true);
  await assert.rejects(f.service.handle('updateAccount', { accountId: 'alpha', name: 'Draft', token: 'fixture-new' }), /HTTP 503/);
  assert.deepEqual(await catalog(f.service), before); assert.deepEqual(f.saved(), f.initial);
  f.failRepos(false); f.failStorage(true);
  for (const token of [undefined, 'fixture-new']) {
    await assert.rejects(f.service.handle('updateAccount', { accountId: 'alpha', name: 'Draft', token }), /storage unavailable/);
    assert.deepEqual(await catalog(f.service), before); assert.deepEqual(f.saved(), f.initial);
  }
  f.failStorage(false); await f.service.handle('updateAccount', { accountId: 'alpha', name: 'Saved', token: 'fixture-new' });
  assert.equal((await catalog(f.service)).accounts[0].name, 'Saved'); assert.equal(f.saved().accounts[0].token, 'fixture-new');
});

test('an account removed during token verification is not resurrected by the delayed save', async () => {
  const f = fixture(); let release!: () => void; let started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }); const seen = new Promise<void>(resolve => { started = resolve; });
  const service = new AccountService({ kind: 'session', load: async () => seed('gitea'), save: async () => {} }, async (input, init) => { if (new URL(String(input)).pathname.endsWith('/user')) { started(); await gate; } return f.request(input, init); });
  const update = service.handle('updateAccount', { accountId: 'alpha', name: 'Draft', token: 'fixture-new' });
  await seen; await service.handle('removeAccount', { accountId: 'alpha' }); release();
  await assert.rejects(update, /已移除/); const result = await catalog(service);
  assert.deepEqual(result.accounts.map(account => account.id), ['beta']); assert.ok(result.repositories.every(repository => repository.accountId === 'beta')); assert.equal(result.links.length, 0);
});

test('a concurrent credential replacement cannot be overwritten by an edit that verified the old state', async () => {
  const f = fixture(); let release!: () => void; let started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }); const seen = new Promise<void>(resolve => { started = resolve; });
  let saved = seed('gitea');
  const service = new AccountService({ kind: 'session', load: async () => structuredClone(saved), save: async next => { saved = structuredClone(next); } }, async (input, init) => {
    if (new Headers(init?.headers).get('Authorization')?.endsWith('fixture-new') && new URL(String(input)).pathname.endsWith('/user')) { started(); await gate; }
    return f.request(input, init);
  });
  const delayed = service.handle('updateAccount', { accountId: 'alpha', name: 'Old draft', token: 'fixture-new' }); await seen;
  await service.handle('updateAccount', { accountId: 'alpha', name: 'Newer edit', token: 'fixture-newer' }); const updated = await catalog(service);
  release(); await assert.rejects(delayed, /凭据已更新/);
  assert.deepEqual(await catalog(service), updated); assert.equal(saved.accounts[0].token, 'fixture-newer');
});

for (const fail of [false, true]) test(`a delayed old-token refresh ${fail ? 'failure' : 'success'} cannot overwrite the new token's repository list or account status`, async () => {
  const f = fixture(); let release!: () => void; let started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }); const seen = new Promise<void>(resolve => { started = resolve; });
  const service = new AccountService({ kind: 'session', load: async () => seed('gitea'), save: async () => {} }, async (input, init) => {
    const token = new Headers(init?.headers).get('Authorization'); const url = new URL(String(input));
    if (token?.endsWith('fixture-old') && url.searchParams.get('page') === '1') { started(); await gate; if (fail) return new Response('old failure', { status: 503 }); }
    return f.request(input, init);
  });
  const refresh = service.handle('refresh', { accountId: 'alpha' }); await seen;
  await service.handle('updateAccount', { accountId: 'alpha', name: 'Saved', token: 'fixture-new' }); const updated = await catalog(service);
  release(); await refresh; const result = await catalog(service);
  assert.deepEqual(result.accounts, updated.accounts); assert.deepEqual(result.repositories, updated.repositories); assert.deepEqual(result.links, updated.links);
});

test('the real protected loopback API saves edits and returns no token, while rejecting foreign origins', async t => {
  const f = fixture(); const middleware = importMiddleware(f.service);
  const server = createServer((request, response) => { void middleware(request, response, () => { response.statusCode = 404; response.end(); }); });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done)); t.after(() => new Promise<void>(done => server.close(() => done())));
  const address = server.address(); assert.ok(address && typeof address !== 'string'); const origin = `http://127.0.0.1:${address.port}`;
  const headers = { 'Content-Type': 'application/json', 'X-GitTogether-Client': '1', Origin: origin };
  const body = JSON.stringify({ accountId: 'alpha', name: 'Saved over HTTP', token: 'fixture-new' });
  const rejected = await fetch(`${origin}/api/import/updateAccount`, { method: 'POST', headers: { ...headers, Origin: 'https://foreign.test' }, body }); assert.equal(rejected.status, 403);
  assert.equal((await catalog(f.service)).accounts[0].name, 'Personal');
  const response = await fetch(`${origin}/api/import/updateAccount`, { method: 'POST', headers, body }); assert.equal(response.status, 200);
  const result = await response.json() as { ok: boolean; value: unknown }; assert.equal(result.ok, true); assert.ok(isCatalog(result.value));
  assert.equal(result.value.accounts[0].name, 'Saved over HTTP'); assert.doesNotMatch(JSON.stringify(result), /fixture-new|fixture-old|fixture-other/);
});

function controllerFor(value: Catalog, busy: Record<string, boolean> = {}): WorkspaceController {
  return { catalog: value, busy, localStates: {}, remoteStates: {}, preferences: { theme: 'system', reducedGlass: false, collapsedAccounts: [] }, loading: false, error: '', storageError: '', needsReload: false,
    service: { instanceId: value.instanceId, version: pkg.version, githubWebAuth: false }, updatePreferences: () => {}, reload: async () => {},
    connect: async () => value, updateAccount: async () => value, refresh: async () => value, removeAccount: async () => value, link: async () => value, matchAccountRepositories: async () => [], unlink: async () => value,
    downloadBranch: async () => { throw new Error('This fixture does not download branches.'); },
    startGithubAuthorization: async () => ({ id: 'fixture', userCode: 'ABCD-EFGH', verificationURL: githubVerificationURL, expiresAt: Date.now() + 900000, interval: 5 }),
    pollGithubAuthorization: async () => ({ status: 'pending', retryAfter: 5 }), cancelGithubAuthorization: async () => ({ cancelled: true }) };
}

test('both providers distinguish same-host, same-name Settings accounts by identity, show only Edit, and disable only the busy account', async () => {
  for (const provider of ['github', 'gitea'] as const) {
    const value = await catalog(fixture(provider).service); value.accounts = value.accounts.map(account => ({ ...account, name: 'Shared name' }));
    const markup = renderToStaticMarkup(createElement(SettingsView, { controller: controllerFor(value, { alpha: true }), onDashboard: () => {} }));
    const actions = [...markup.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].filter(match => /编辑|移除/.test(match[2]));
    assert.equal(actions.length, 2); const host = provider === 'github' ? 'github.com' : 'git.example.test:10443';
    assert.ok(actions[0][1].includes(`aria-label="编辑 Shared name · alice@${host}"`)); assert.ok(actions[1][1].includes(`aria-label="编辑 Shared name · bob@${host}"`));
    assert.ok(actions.every(match => match[2].includes('编辑') && !match[2].includes('移除')));
    assert.match(actions[0][1], /disabled/); assert.doesNotMatch(actions[1][1], /disabled/);
    assert.equal((markup.match(/>重新授权</g) || []).length, provider === 'github' ? 2 : 0);
  }
});

test('edit form prefills the name, never exposes a stored token or editable host/login/provider, and disables unchanged or pending saves', () => {
  const account = seed('gitea').accounts[0].account;
  for (const busy of [false, true]) {
    const markup = renderToStaticMarkup(createElement(AccountEditForm, { account, busy, onSubmit: async () => {}, onSaved: () => {}, onCancel: () => {}, onRemove: () => {} }));
    const inputs = [...markup.matchAll(/<input\b([^>]*)>/g)].map(match => match[1]); assert.equal(inputs.length, 2);
    assert.match(inputs[0], /value="Personal"/); assert.match(inputs[0], /required/); assert.match(inputs[0], /maxLength="120"/);
    assert.match(inputs[1], /type="password"/); assert.match(inputs[1], /value=""/); assert.match(inputs[1], /placeholder="留空保留当前令牌"/); assert.match(inputs[1], /autoComplete="new-password"/);
    assert.doesNotMatch(markup, /fixture-old|fixture-other/); assert.match(markup, /alice/); assert.match(markup, /Gitea · git.example.test:10443/);
    assert.match(markup.match(/<button\b([^>]*)type="submit"([^>]*)>/)?.[0] || '', /disabled/);
    assert.ok(inputs.every(input => /disabled/.test(input) === busy));
  }
});

test('edit forms put one non-submitting Remove before Cancel/Save, keep it enabled for unchanged drafts, and disable it while busy', () => {
  for (const provider of ['github', 'gitea'] as const) for (const busy of [false, true]) {
    const markup = renderToStaticMarkup(createElement(AccountEditForm, { account: seed(provider).accounts[0].account, busy, onSubmit: async () => {}, onSaved: () => {}, onCancel: () => {}, onRemove: () => {} }));
    const buttons = [...markup.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
    assert.equal(buttons.length, 3);
    assert.match(buttons[0][1], /type="button"/); assert.match(buttons[0][1], /danger-text remove-account-button/);
    assert.match(buttons[0][2], /移除/); assert.match(buttons[1][2], /取消/); assert.match(buttons[2][2], /保存/);
    assert.equal(/disabled/.test(buttons[0][1]), busy); assert.equal(/disabled/.test(buttons[1][1]), busy);
    assert.match(buttons[2][1], /type="submit"/); assert.match(buttons[2][1], /disabled/);
  }
});

test('only the account-edit footer pushes its existing quiet destructive action to the left', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.account-edit-form \.modal-actions \.remove-account-button\s*\{\s*margin:\s*0 auto 0 0;\s*\}/);
  assert.match(css, /\.account-edit-form \.modal-actions\s*\{[^}]*align-items:\s*center;/);
  assert.match(css, /\.modal-actions\s*\{[^}]*justify-content:\s*flex-end;/);
});

test('the unchanged removal API keeps the account on storage failure and removes only that identity on retry', async () => {
  for (const provider of ['github', 'gitea'] as const) {
    const f = fixture(provider); const before = await catalog(f.service); f.failStorage(true);
    await assert.rejects(f.service.handle('removeAccount', { accountId: 'alpha' }), /storage unavailable/);
    assert.deepEqual(await catalog(f.service), before); assert.deepEqual(f.saved(), f.initial);
    f.failStorage(false); await f.service.handle('removeAccount', { accountId: 'alpha' }); const removed = await catalog(f.service);
    assert.deepEqual(removed.accounts.map(account => account.id), ['beta']);
    assert.deepEqual(removed.repositories, before.repositories.filter(repository => repository.accountId === 'beta'));
    assert.equal(removed.links.length, 0); assert.equal(f.requests.length, 0);
  }
});
