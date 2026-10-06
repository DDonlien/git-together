import test from 'node:test';
import assert from 'node:assert/strict';
import { AccountService, sessionStore, type CredentialStore, type SavedState } from '../server/account-service';
import { emptyCatalog, githubVerificationURL, isCatalog, latestCatalog, type GitHubAuthorization, type GitHubAuthorizationCancellation, type GitHubAuthorizationProgress } from '../src/import-model';
import { authorizationDelay, openGitHubAuthorization, waitForGitHubAuthorization } from '../src/github-auth-flow';
import pkg from '../package.json';

const deviceCode = 'fixture-private-device-code';
const accessToken = 'fixture-private-access-token';
const clientId = 'Iv1.fixture-owned-application';
const deviceResponse = { device_code: deviceCode, user_code: 'ABCD-EFGH', verification_uri: githubVerificationURL, expires_in: 900, interval: 5 };
const tokenResponse = { access_token: accessToken, token_type: 'bearer', expires_in: 28800, refresh_token: 'fixture-unused-refresh-token' };
const defer = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
function fixture(store: CredentialStore = sessionStore()) {
  let time = 1_800_000_000_000;
  let tokenBody: unknown = tokenResponse;
  let deviceBody: unknown = deviceResponse;
  let tokenWait: Promise<Response> | undefined;
  let userWait: Promise<Response> | undefined;
  let login = 'fixture-user';
  const calls: { url: URL; headers: Headers; fields: URLSearchParams; signal?: AbortSignal | null }[] = [];
  const request: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(init?.redirect, 'error');
    const headers = new Headers(init?.headers);
    calls.push({ url, headers, fields: new URLSearchParams(String(init?.body || '')), signal: init?.signal });
    if (url.pathname === '/login/device/code') return Response.json(deviceBody);
    if (url.pathname === '/login/oauth/access_token') return tokenWait ? tokenWait : Response.json(tokenBody);
    assert.equal(url.hostname, 'api.github.com'); assert.equal(init?.method, 'GET');
    assert.equal(headers.get('Authorization'), `Bearer ${accessToken}`);
    if (url.pathname === '/user') return userWait ? userWait : Response.json({ login, name: 'Fixture Account' });
    return Response.json(url.searchParams.get('page') === '1' ? [{ id: 1, name: 'repo', full_name: `${login}/repo`, private: true, default_branch: 'main' }] : []);
  };
  const service = new AccountService(store, request, { githubClientId: clientId, now: () => time });
  return { service, calls, advance: (ms: number) => { time += ms; }, token: (value: unknown) => { tokenBody = value; }, device: (value: unknown) => { deviceBody = value; }, tokenWait: (value: Promise<Response>) => { tokenWait = value; }, userWait: (value: Promise<Response>) => { userWait = value; }, login: (value: string) => { login = value; } };
}
const start = async (service: AccountService) => await service.handle('githubAuthStart', { name: 'Fixture' }) as GitHubAuthorization;
const poll = async (service: AccountService, session: GitHubAuthorization) => await service.handle('githubAuthPoll', { sessionId: session.id }) as GitHubAuthorizationProgress;
const cancel = async (service: AccountService, session: GitHubAuthorization) => await service.handle('githubAuthCancel', { sessionId: session.id }) as GitHubAuthorizationCancellation;

test('missing application identity is a configuration error, not a service outage; status exposes no client ID', async () => {
  let calls = 0;
  const service = new AccountService(sessionStore(), async () => { calls++; throw new Error(); }, { githubClientId: '' });
  const status = await service.handle('status', {}) as { githubWebAuth: boolean; instanceId: string; version: string };
  assert.equal(status.githubWebAuth, false); assert.ok(status.instanceId); assert.equal(status.version, pkg.version);
  await assert.rejects(start(service), /Client ID/); assert.equal(calls, 0);
  await assert.rejects(service.handle('status', null), /无效/);
});

test('device grant is server-side, scope-minimal, throttled, and imports through the real account service contract', async () => {
  let saved: SavedState | undefined;
  const f = fixture({ kind: 'encrypted', load: async () => null, save: async state => { saved = structuredClone(state); } });
  const session = await start(f.service);
  assert.equal(session.verificationURL, githubVerificationURL);
  assert.doesNotMatch(JSON.stringify(session), /private-device|device_code|client_id|access_token/);
  assert.deepEqual([...f.calls[0].fields.keys()], ['client_id']);
  assert.equal(f.calls[0].fields.get('client_id'), clientId);
  assert.equal(f.calls[0].headers.get('Authorization'), null);
  assert.deepEqual(await poll(f.service, session), { status: 'pending', retryAfter: 5 });
  assert.equal(f.calls.length, 1);
  f.advance(5000); f.token({ error: 'authorization_pending' });
  assert.deepEqual(await poll(f.service, session), { status: 'pending', retryAfter: 5 });
  f.advance(5000); f.token({ error: 'slow_down', interval: 10 });
  assert.deepEqual(await poll(f.service, session), { status: 'pending', retryAfter: 10 });
  const previous = f.calls.length; f.advance(1000); await poll(f.service, session); assert.equal(f.calls.length, previous);
  f.advance(9000); f.token(tokenResponse);
  const result = await poll(f.service, session); assert.equal(result.status, 'complete');
  if (result.status !== 'complete') throw new Error();
  assert.equal(result.catalog.accounts.length, 1); assert.equal(result.catalog.repositories.length, 1);
  assert.ok(result.catalog.accounts[0].authorizationExpiresAt); assert.equal(result.catalog.credentialStorage, 'encrypted');
  assert.equal(saved?.accounts[0].token, accessToken);
  assert.doesNotMatch(JSON.stringify(result), /private-access|private-device|unused-refresh|access_token/);
  assert.ok(f.calls.every(call => call.url.protocol === 'https:' && ['github.com', 'api.github.com'].includes(call.url.hostname)));
  assert.equal(f.calls[1].fields.get('grant_type'), 'urn:ietf:params:oauth:grant-type:device_code');
  assert.equal(f.calls[1].fields.get('client_secret'), null); assert.equal(f.calls[1].fields.get('scope'), null);
  const count = f.calls.length; assert.deepEqual(await poll(f.service, session), result); assert.equal(f.calls.length, count);
  assert.equal((await cancel(f.service, session)).cancelled, false);
});

test('simultaneous polls share one token exchange and one imported identity', async () => {
  const f = fixture(); const session = await start(f.service); f.advance(5000);
  const response = defer<Response>(); f.tokenWait(response.promise);
  const a = poll(f.service, session); const b = poll(f.service, session);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.filter(call => call.url.pathname === '/login/oauth/access_token').length, 1);
  response.resolve(Response.json(tokenResponse));
  assert.deepEqual(await a, await b);
  const catalog = await f.service.handle('catalog', {}); assert.ok(isCatalog(catalog)); assert.equal(catalog.accounts.length, 1);
});

test('cancelled in-flight token exchange cannot import or save an account', async () => {
  let writes = 0; const f = fixture({ kind: 'encrypted', load: async () => null, save: async () => { writes++; } });
  const session = await start(f.service); f.advance(5000);
  const response = defer<Response>(); f.tokenWait(response.promise);
  const pending = poll(f.service, session); const rejected = assert.rejects(pending, /取消/);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(await cancel(f.service, session), { cancelled: true });
  response.resolve(Response.json(tokenResponse)); await rejected;
  assert.equal(writes, 0); assert.ok(!f.calls.some(call => call.url.pathname === '/user'));
});

test('cancelled identity verification cannot pass the credential persistence gate', async () => {
  let writes = 0; const f = fixture({ kind: 'encrypted', load: async () => null, save: async () => { writes++; } });
  const session = await start(f.service); f.advance(5000);
  const response = defer<Response>(); f.userWait(response.promise);
  const pending = poll(f.service, session); const rejected = assert.rejects(pending, /取消/);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(await cancel(f.service, session), { cancelled: true });
  response.resolve(Response.json({ login: 'fixture-user' })); await rejected;
  assert.equal(writes, 0); const catalog = await f.service.handle('catalog', {}); assert.ok(isCatalog(catalog)); assert.equal(catalog.accounts.length, 0);
});

test('cancel after the atomic commit point truthfully returns the completed catalog', async () => {
  const saving = defer<void>(); const release = defer<void>();
  const f = fixture({ kind: 'encrypted', load: async () => null, save: async () => { saving.resolve(); await release.promise; } });
  const session = await start(f.service); f.advance(5000);
  const pending = poll(f.service, session); await saving.promise;
  const cancellation = cancel(f.service, session); release.resolve();
  assert.equal((await pending).status, 'complete');
  const result = await cancellation; assert.equal(result.cancelled, false);
  if (!result.cancelled) assert.equal(result.catalog.accounts.length, 1);
});

test('reauthorization preserves an existing account ID and same-host different identities stay separate', async () => {
  const f = fixture(); const first = await start(f.service); f.advance(5000);
  const initial = await poll(f.service, first); assert.equal(initial.status, 'complete');
  const second = await start(f.service); f.advance(5000);
  const refreshed = await poll(f.service, second); assert.equal(refreshed.status, 'complete');
  if (initial.status !== 'complete' || refreshed.status !== 'complete') throw new Error();
  assert.equal(refreshed.catalog.accounts.length, 1); assert.equal(refreshed.catalog.accounts[0].id, initial.catalog.accounts[0].id);
  f.login('fixture-other'); const third = await start(f.service); f.advance(5000);
  const other = await poll(f.service, third); assert.equal(other.status, 'complete');
  if (other.status === 'complete') { assert.equal(other.catalog.accounts.length, 2); assert.equal(new Set(other.catalog.repositories.map(repo => repo.id)).size, 2); }
});

test('expired, refused and malformed grants never write credentials or expose provider descriptions', async () => {
  const expired = fixture(); const session = await start(expired.service); expired.advance(900001);
  await assert.rejects(poll(expired.service, session), /过期/); assert.equal(expired.calls.length, 1);
  for (const error of ['access_denied', 'expired_token', 'device_flow_disabled', 'incorrect_client_credentials']) {
    const f = fixture(); const flow = await start(f.service); f.advance(5000); f.token({ error, error_description: 'provider private payload' });
    await assert.rejects(poll(f.service, flow), problem => problem instanceof Error && !problem.message.includes('private payload'));
    const catalog = await f.service.handle('catalog', {}); assert.ok(isCatalog(catalog)); assert.equal(catalog.accounts.length, 0);
  }
  const malicious = fixture(); malicious.device({ ...deviceResponse, verification_uri: 'https://foreign.test/login' });
  await assert.rejects(start(malicious.service), /信息无效/);
  const badCredential = fixture(); const flow = await start(badCredential.service); badCredential.advance(5000); badCredential.token({ ...tokenResponse, access_token: 'invalid\r\ncredential' });
  await assert.rejects(poll(badCredential.service, flow), /凭据格式/);
});

test('pending sessions are bounded and expired sessions release their capacity', async () => {
  const f = fixture(); for (let i = 0; i < 8; i++) await start(f.service);
  await assert.rejects(start(f.service), /正在等待/);
  f.advance(900001); assert.ok((await start(f.service)).id);
});

test('a new service instance accepts revision zero and old in-flight catalogs cannot replace it', async () => {
  const first = new AccountService(); const second = new AccountService();
  const a = await first.handle('catalog', {}); const b = await second.handle('catalog', {}); assert.ok(isCatalog(a) && isCatalog(b));
  assert.notEqual(a.instanceId, b.instanceId);
  const stale = { ...a, revision: 99 };
  assert.equal(latestCatalog(stale, b, b.instanceId), b);
  assert.equal(latestCatalog(b, stale, b.instanceId), b);
  assert.equal(latestCatalog({ ...b, revision: 10 }, { ...b, revision: 9 }, b.instanceId).revision, 10);
});

test('client waiting respects server retry intervals, expiry and explicit cancellation', async () => {
  let time = 0; const intervals: number[] = []; let polls = 0;
  const session: GitHubAuthorization = { id: 'fixture', userCode: 'ABCD-EFGH', verificationURL: githubVerificationURL, expiresAt: 900000, interval: 5 };
  const result = await waitForGitHubAuthorization(session, async () => ++polls === 1 ? { status: 'pending', retryAfter: 10 } : { status: 'complete', catalog: emptyCatalog }, new AbortController().signal, { now: () => time, sleep: async ms => { intervals.push(ms); time += ms; } });
  assert.equal(result, emptyCatalog); assert.deepEqual(intervals, [5000, 10000]);
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(waitForGitHubAuthorization(session, async () => { throw new Error('must not poll'); }, cancelled.signal));
  await assert.rejects(waitForGitHubAuthorization({ ...session, expiresAt: 1 }, async () => { throw new Error('must not poll'); }, new AbortController().signal, { now: () => 2 }), /过期/);
  const delay = new AbortController(); const waiting = authorizationDelay(60000, delay.signal); delay.abort(); await assert.rejects(waiting);
});

test('popup denial is explicit, the navigation target is fixed, and browser opener is severed', async t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'window', previous); else Reflect.deleteProperty(globalThis, 'window'); });
  const browser: { open: (url: string) => unknown; gittogether?: { openGithubAuthorization: () => Promise<void> } } = { open: url => { assert.equal(url, githubVerificationURL); return null; } };
  Object.defineProperty(globalThis, 'window', { value: browser, configurable: true });
  assert.equal(await openGitHubAuthorization(), false);
  browser.open = () => { throw new Error('popup denied'); }; assert.equal(await openGitHubAuthorization(), false);
  const popup = { opener: 'fixture-opener' as string | null };
  browser.open = url => { assert.equal(url, githubVerificationURL); return popup; };
  assert.equal(await openGitHubAuthorization(), true); assert.equal(popup.opener, null);
  browser.gittogether = { openGithubAuthorization: async () => { throw new Error('native bridge unavailable'); } };
  assert.equal(await openGitHubAuthorization(), false);
});
