import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { readFileSync } from 'node:fs';
import { GitHubWebAuthorization, type WebCredential } from '../server/github-web-authorization';
import { createGitHubOAuthServer, previewConnector, previewOrigin } from '../server/github-oauth-dev-server';
import { AccountService, type SavedState } from '../server/account-service';
import { emptyCatalog, isCatalog, type Catalog } from '../src/import-model';
import { githubDevClientId, githubOAuthCallback, githubOAuthOrigin, isGitHubAuthorizationURL, isGitHubWebSession } from '../src/github-web-model';
import { cancelGitHubWebAuthorization, navigateGitHubWebWindow, pollGitHubWebAuthorization, reserveGitHubWebWindow, startGitHubWebAuthorization, waitForGitHubWebAuthorization } from '../src/github-web-api';

test('renderer CSP permits only the exact local authorization API alongside existing connections', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(policy, 'the renderer must declare its security policy');
  const directives = new Map(policy.split(';').map(value => {
    const [name, ...sources] = value.trim().split(/\s+/);
    return [name, sources] as const;
  }));
  assert.deepEqual(directives.get('connect-src'), ["'self'", 'ws://127.0.0.1:4173', `${githubOAuthOrigin}/api/`]);
  for (const name of ['default-src', 'script-src', 'font-src', 'base-uri']) {
    assert.deepEqual(directives.get(name), ["'self'"]);
  }
  assert.deepEqual(directives.get('object-src'), ["'none'"]);
});

const fixtureSecret = 'fixture-only-client-secret';
const fixtureToken = 'ghu_fixture_only_access_token';
const fixtureCatalog: Catalog = { ...emptyCatalog, instanceId: 'fixture-main', revision: 1 };
const grant = { access_token: fixtureToken, token_type: 'bearer', expires_in: 28800, refresh_token: 'ghr_fixture_unused_refresh' };
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { resolve, promise }; };
function fixture(connect?: (credential: WebCredential) => Promise<Catalog>) {
  let time = 1800000000000; let body: unknown = grant; let response: Promise<Response> | undefined;
  const calls: { url: string; init?: RequestInit }[] = []; const imports: WebCredential[] = [];
  const request: typeof fetch = async (url, init) => { calls.push({ url: String(url), init }); return response || Response.json(body); };
  const flow = new GitHubWebAuthorization(connect || (async credential => { credential.signal.throwIfAborted(); credential.commit(); imports.push(credential); return fixtureCatalog; }), request, () => time);
  flow.configure(fixtureSecret);
  return { flow, calls, imports, advance: (ms: number) => { time += ms; }, body: (value: unknown) => { body = value; }, response: (value: Promise<Response>) => { response = value; } };
}
const callbackFor = (session: ReturnType<GitHubWebAuthorization['start']>, code = 'fixture-code') => new URLSearchParams({ state: new URL(session.authorizationURL).searchParams.get('state')!, code });

test('browser flow uses our own public identity, one-time state, PKCE and a registered fixed callback', async () => {
  const f = fixture(); const session = f.flow.start(' Personal '); const url = new URL(session.authorizationURL);
  assert.ok(isGitHubWebSession(session)); assert.equal(url.origin, 'https://github.com');
  assert.equal(url.pathname, '/login/oauth/authorize'); assert.equal(url.searchParams.get('client_id'), githubDevClientId);
  assert.equal(url.searchParams.get('redirect_uri'), githubOAuthCallback); assert.equal(url.searchParams.get('prompt'), 'select_account');
  assert.equal(url.searchParams.has('scope'), false); assert.equal(url.searchParams.has('client_secret'), false);
  assert.doesNotMatch(JSON.stringify(session), /fixture-only|code_verifier|access_token|refresh_token/);
  assert.deepEqual(f.flow.poll(session.id), { status: 'pending' }); assert.equal(f.calls.length, 0);
  await f.flow.callback(callbackFor(session)); assert.equal(f.calls.length, 1); assert.equal(f.imports.length, 1);
  const call = f.calls[0]; const fields = new URLSearchParams(String(call.init?.body));
  assert.equal(call.url, 'https://github.com/login/oauth/access_token'); assert.equal(call.init?.redirect, 'error');
  assert.equal(fields.get('client_secret'), fixtureSecret); assert.equal(fields.get('redirect_uri'), githubOAuthCallback);
  assert.equal(createHash('sha256').update(fields.get('code_verifier')!).digest('base64url'), url.searchParams.get('code_challenge'));
  assert.equal(f.imports[0].name, 'Personal'); assert.equal(f.imports[0].token, fixtureToken); assert.ok(f.imports[0].expiresAt);
  assert.doesNotMatch(JSON.stringify(f.flow.poll(session.id)), /ghu_|ghr_|fixture-only/);
  assert.deepEqual(await f.flow.cancel(session.id), { cancelled: false, catalog: fixtureCatalog });
});
test('an unconfigured app and PAT-as-secret never cause provider calls', () => {
  let requests = 0; const flow = new GitHubWebAuthorization(async () => fixtureCatalog, async () => { requests++; throw new Error(); });
  assert.equal(flow.configured, false); assert.throws(() => flow.start(''), /开发配置/);
  assert.throws(() => flow.configure('github_pat_fixture'), /不是账号/); assert.throws(() => flow.configure('ghp_fixture'), /不是账号/);
  assert.equal(requests, 0);
});
test('wrong, duplicate and missing states cannot exchange codes; valid callbacks are single-use', async () => {
  const f = fixture(); const session = f.flow.start('');
  await assert.rejects(f.flow.callback(new URLSearchParams({ state: 'foreign-state', code: 'fixture' })), /失效/);
  await assert.rejects(f.flow.callback(new URLSearchParams('code=fixture')), /无法验证/);
  const duplicate = callbackFor(session); duplicate.append('state', duplicate.get('state')!);
  await assert.rejects(f.flow.callback(duplicate), /无法验证/); assert.equal(f.calls.length, 0);
  const first = f.flow.callback(callbackFor(session));
  await assert.rejects(f.flow.callback(callbackFor(session)), /已处理/); await first;
  assert.equal(f.calls.length, 1); assert.equal(f.imports.length, 1);
});
test('provider refusal and malformed callbacks retain only safe human-readable errors', async () => {
  for (const parameters of ['error=access_denied&error_description=provider-sensitive-data', 'code=first&code=second', 'code=bad%0Acode']) {
    const f = fixture(); const session = f.flow.start(''); const params = new URLSearchParams(parameters);
    params.set('state', callbackFor(session).get('state')!);
    await assert.rejects(f.flow.callback(params), problem => problem instanceof Error && !/sensitive-data/.test(problem.message));
    assert.throws(() => f.flow.poll(session.id)); assert.equal(f.calls.length, 0); assert.equal(f.imports.length, 0);
  }
});
test('cancelling before or during token exchange prevents account import even if the provider ignores abort', async () => {
  const before = fixture(); const session = before.flow.start('');
  assert.deepEqual(await before.flow.cancel(session.id), { cancelled: true });
  await assert.rejects(before.flow.callback(callbackFor(session)), /失效/); assert.equal(before.calls.length, 0);
  const f = fixture(); const active = f.flow.start(''); const response = deferred<Response>(); f.response(response.promise);
  const pending = f.flow.callback(callbackFor(active)); const rejected = assert.rejects(pending, /取消/);
  assert.deepEqual(await f.flow.cancel(active.id), { cancelled: true }); response.resolve(Response.json(grant)); await rejected;
  assert.equal(f.imports.length, 0); assert.equal(f.calls[0].init?.signal?.aborted, true);
});
test('cancelling identity lookup blocks persistence; after the commit gate it reports the completed account', async () => {
  const looking = deferred<void>(); const lookup = deferred<void>(); let writes = 0;
  const f = fixture(async credential => { looking.resolve(); await lookup.promise; credential.signal.throwIfAborted(); credential.commit(); writes++; return fixtureCatalog; });
  const session = f.flow.start(''); const pending = f.flow.callback(callbackFor(session)); const rejected = assert.rejects(pending);
  await looking.promise; assert.deepEqual(await f.flow.cancel(session.id), { cancelled: true }); lookup.resolve(); await rejected; assert.equal(writes, 0);
  const saving = deferred<void>(); const saved = deferred<void>();
  const committed = fixture(async credential => { credential.commit(); saving.resolve(); await saved.promise; return fixtureCatalog; });
  const next = committed.flow.start(''); const completion = committed.flow.callback(callbackFor(next)); await saving.promise;
  const cancellation = committed.flow.cancel(next.id); saved.resolve(); await completion;
  assert.deepEqual(await cancellation, { cancelled: false, catalog: fixtureCatalog });
});
test('expiry blocks exchange and persistence, session capacity is bounded and names are validated', async () => {
  const f = fixture(); const session = f.flow.start(''); f.advance(600001);
  await assert.rejects(f.flow.callback(callbackFor(session)), /过期/); assert.equal(f.calls.length, 0);
  assert.throws(() => f.flow.start('bad\nname'), /名称无效/);
  for (let i = 0; i < 8; i++) f.flow.start('');
  assert.throws(() => f.flow.start(''), /等待/); assert.throws(() => f.flow.configure(fixtureSecret), /结束/);
  f.advance(600001); assert.ok(f.flow.start('').id);
  const late = fixture(); const active = late.flow.start(''); const response = deferred<Response>(); late.response(response.promise);
  const callback = late.flow.callback(callbackFor(active)); const rejected = assert.rejects(callback, /过期/);
  late.advance(600001); response.resolve(Response.json(grant)); await rejected; assert.equal(late.imports.length, 0);
});
test('bad tokens, oversized payloads, provider errors and response failures never disclose payloads', async () => {
  for (const value of [{ error: 'incorrect_client_credentials', error_description: fixtureSecret }, { ...grant, access_token: 'bad\r\ntoken' }, { ...grant, expires_in: -1 }, { ...grant, token_type: 'unknown' }, { arbitrary: fixtureSecret }]) {
    const f = fixture(); f.body(value); const session = f.flow.start('');
    await assert.rejects(f.flow.callback(callbackFor(session)), problem => problem instanceof Error && !problem.message.includes(fixtureSecret)); assert.equal(f.imports.length, 0);
  }
  const huge = fixture(); huge.response(Promise.resolve(Response.json({ access_token: 'x'.repeat(40000) })));
  await assert.rejects(huge.flow.callback(callbackFor(huge.flow.start(''))), /响应无效/);
});
test('successful OAuth imports via the real account service without replacing an existing Gitea session', async () => {
  const saved: SavedState = { version: 2, accounts: [{ account: { id: 'gitea-existing', name: 'Existing', login: 'existing', provider: 'gitea', host: 'https://git.fixture.test', updatedAt: '' }, token: 'fixture-gitea-token' }], repositories: [], links: [] };
  const service = new AccountService({ kind: 'session', load: async () => saved, save: async () => {} }, async url => Response.json(new URL(String(url)).pathname === '/user' ? { login: 'fixture-github' } : []));
  const original = await service.handle('catalog', {}); assert.ok(isCatalog(original));
  const f = fixture(async credential => { credential.commit(); const next = await service.handle('connect', { provider: 'github', host: 'https://github.com', token: credential.token, name: credential.name }); assert.ok(isCatalog(next)); return next; });
  const session = f.flow.start('GitHub Fixture'); await f.flow.callback(callbackFor(session)); const progress = f.flow.poll(session.id);
  assert.equal(progress.status, 'complete');
  if (progress.status === 'complete') { assert.equal(progress.catalog.accounts.length, 2); assert.equal(progress.catalog.instanceId, original.instanceId); assert.deepEqual(progress.catalog.accounts[0], original.accounts[0]); assert.doesNotMatch(JSON.stringify(progress), /fixture-gitea-token|ghu_/); }
});
test('local bootstrap rejects foreign origins, unconfirmed rotation and wrong keys; no secret is returned', async t => {
  let verifications = 0;
  const server = createGitHubOAuthServer({ connect: async () => fixtureCatalog, verify: async () => { verifications++; } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => { server.closeAllConnections(); server.close(); });
  const address = server.address(); assert.ok(address && typeof address === 'object'); const origin = `http://127.0.0.1:${address.port}`;
  const setup = await fetch(`${origin}/setup`); const html = await setup.text();
  assert.equal(setup.headers.get('cache-control'), 'no-store'); assert.equal(setup.headers.get('referrer-policy'), 'no-referrer');
  assert.match(setup.headers.get('content-security-policy')!, /frame-ancestors 'none'/); assert.match(html, /type="password"/);
  const setupKey = html.match(/X-GitTogether-Setup':"([\w-]+)"/)?.[1]; assert.ok(setupKey);
  const configure = (source = origin, key = setupKey, rotated = true) => fetch(`${origin}/api/config`, { method: 'POST', headers: { Origin: source, 'Content-Type': 'application/json', 'X-GitTogether-Setup': key! }, body: JSON.stringify({ secret: fixtureSecret, rotated }) });
  assert.equal((await configure('https://foreign.test')).status, 403); assert.equal((await configure(origin, 'wrong')).status, 403);
  const unconfirmed = await configure(origin, setupKey, false); assert.equal(unconfirmed.status, 400); assert.doesNotMatch(await unconfirmed.text(), /fixture-only/);
  assert.equal((await configure()).status, 200); assert.doesNotMatch(await (await fetch(`${origin}/setup`)).text(), /fixture-only/);
  const post = (path: string, source = previewOrigin) => fetch(`${origin}/api/${path}`, { method: 'POST', headers: { Origin: source, 'Content-Type': 'application/json', 'X-GitTogether-Client': '1' }, body: '{}' });
  const foreign = await post('start', 'https://foreign.test'); assert.equal(foreign.status, 403); assert.equal(foreign.headers.get('access-control-allow-origin'), null); assert.equal(verifications, 0);
  const status = await post('status'); assert.deepEqual(await status.json(), { ok: true, value: { configured: true } });
  const start = await post('start'); assert.equal(start.headers.get('access-control-allow-origin'), previewOrigin); const envelope = await start.json(); assert.ok(isGitHubWebSession(envelope.value)); assert.equal(verifications, 1);
  const preflight = await fetch(`${origin}/api/poll`, { method: 'OPTIONS', headers: { Origin: previewOrigin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-gittogether-client' } }); assert.equal(preflight.status, 204);
  // Node fetch normalizes Host; use HTTP's public request API to send the actual
  // forged authority rather than accidentally testing another valid request.
  const hostSpoofStatus = await new Promise<number>(resolve => {
    const request = httpRequest(`${origin}/setup`, { headers: { Host: 'foreign.test' } }, response => { response.resume(); resolve(response.statusCode!); }); request.end();
  }); assert.equal(hostSpoofStatus, 403);
  const invalid = await fetch(`${origin}/api/start`, { method: 'POST', headers: { Origin: previewOrigin, 'Content-Type': 'application/json', 'X-GitTogether-Client': '1' }, body: '{bad fixture-only-client-secret' }); assert.equal(invalid.status, 400); assert.doesNotMatch(await invalid.text(), /fixture-only/);
  const callback = await fetch(`${origin}/oauth/github/callback?state=foreign&code=fixture-private-code&error_description=fixture-only-client-secret`); assert.equal(callback.status, 400); assert.doesNotMatch(await callback.text(), /fixture-private-code|fixture-only/);
});
test('valid callbacks stream a nonce-protected progress page before exchange, then complete or fail safely', async t => {
  for (const succeeds of [true, false]) {
    const held = deferred<Response>(); let imports = 0;
    const server = createGitHubOAuthServer({ connect: async () => { imports++; return fixtureCatalog; }, verify: async () => {}, request: async () => held.promise });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(() => { server.closeAllConnections(); server.close(); });
    const address = server.address(); assert.ok(address && typeof address === 'object'); const origin = `http://127.0.0.1:${address.port}`;
    const setup = await (await fetch(`${origin}/setup`)).text(); const key = setup.match(/X-GitTogether-Setup':"([\w-]+)"/)![1];
    await fetch(`${origin}/api/config`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-GitTogether-Setup': key }, body: JSON.stringify({ secret: fixtureSecret, rotated: true }) });
    const start = await fetch(`${origin}/api/start`, { method: 'POST', headers: { Origin: previewOrigin, 'Content-Type': 'application/json', 'X-GitTogether-Client': '1' }, body: '{}' });
    const { value: session } = await start.json(); assert.ok(isGitHubWebSession(session));
    // If HTML is held behind the exchange this times out, instead of hanging the test.
    const response = await fetch(`${origin}/oauth/github/callback?${callbackFor(session)}`, { signal: AbortSignal.timeout(2000) });
    assert.equal(response.status, 200); assert.equal(imports, 0);
    const reader = response.body!.getReader(); const initial = await reader.read(); const progress = new TextDecoder().decode(initial.value);
    assert.match(progress, /正在完成 GitHub 授权/); assert.match(progress, /role="status"/); assert.match(progress, /history.replaceState/);
    assert.doesNotMatch(progress, /fixture-code|fixture-only-client-secret|ghu_fixture/);
    const nonce = response.headers.get('content-security-policy')!.match(/script-src 'nonce-([^']+)'/)![1];
    assert.match(progress, new RegExp(`<script nonce="${nonce.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">`));
    held.resolve(Response.json(succeeds ? grant : { error: 'incorrect_client_credentials', error_description: fixtureSecret }));
    let ending = ''; while (true) { const part = await reader.read(); if (part.done) break; ending += new TextDecoder().decode(part.value); }
    assert.match(ending, succeeds ? /data-status.*complete/ : /data-status.*failed/);
    assert.match(ending, succeeds ? /window.close\(\)/ : /应用客户端密钥无效/);
    assert.doesNotMatch(ending, /fixture-code|fixture-only-client-secret|ghu_fixture/);
    assert.equal(imports, succeeds ? 1 : 0);
  }
});
test('callback progress is only accepted after state, denial and code validation', async () => {
  const f = fixture(); let accepted = 0;
  await assert.rejects(f.flow.callback(new URLSearchParams('state=foreign&code=fixture'), () => { accepted++; }));
  const session = f.flow.start(''); const params = callbackFor(session); params.set('error', 'access_denied');
  await assert.rejects(f.flow.callback(params, () => { accepted++; }));
  assert.equal(accepted, 0); assert.equal(f.calls.length, 0);
  await f.flow.callback(callbackFor(f.flow.start('')), () => { accepted++; assert.equal(f.calls.length, 0); });
  assert.equal(accepted, 1);
});
test('preview bridge keeps remote identity and protected loopback requests on separate transports', async () => {
  const methods: string[] = []; let lookups = 0;
  const local: typeof fetch = async (url, init) => {
    assert.ok(String(url).startsWith(`${previewOrigin}/api/import/`));
    assert.equal(new Headers(init?.headers).get('X-GitTogether-Client'), '1');
    const method = String(url).split('/').at(-1)!; methods.push(method);
    return Response.json({ ok: true, value: method === 'status' ? { instanceId: 'fixture-main', version: 'fixture-version' } : fixtureCatalog });
  };
  const remote: typeof fetch = async (url, init) => {
    assert.equal(url, 'https://api.github.com/user'); assert.equal(init?.redirect, 'error'); lookups++;
    return Response.json({ login: 'fixture' });
  };
  const bridge = previewConnector({ instanceId: 'fixture-main', version: 'fixture-version' }, remote, local);
  assert.deepEqual(await bridge.connect({ token: fixtureToken, name: '', signal: new AbortController().signal, commit: () => {} }), fixtureCatalog);
  assert.equal(lookups, 1); assert.deepEqual(methods, ['status', 'catalog', 'status', 'connect']);
});
test('preview bridge is server-to-server, preserves instance identity and does not replay after service restart', async t => {
  const actualFetch = globalThis.fetch; t.after(() => { globalThis.fetch = actualFetch; });
  const calls: { url: string; input: Record<string, unknown> }[] = []; let instanceId = 'fixture-main';
  globalThis.fetch = async (url, init) => {
    if (String(url) === 'https://api.github.com/user') { assert.equal(new Headers(init?.headers).get('Authorization'), `Bearer ${fixtureToken}`); return Response.json({ login: 'Fixture' }); }
    assert.equal(new Headers(init?.headers).get('X-GitTogether-Client'), '1'); assert.equal(init?.redirect, 'error');
    const input = JSON.parse(String(init?.body)); calls.push({ url: String(url), input });
    return Response.json({ ok: true, value: String(url).endsWith('/status') ? { instanceId, version: 'fixture-version' } : fixtureCatalog });
  };
  const bridge = previewConnector({ instanceId, version: 'fixture-version' }); let commits = 0;
  const credential = { token: fixtureToken, name: 'Fixture', signal: new AbortController().signal, commit: () => { commits++; } };
  assert.deepEqual(await bridge.connect(credential), fixtureCatalog); assert.equal(commits, 1);
  assert.ok(calls.every(call => call.url.startsWith(`${previewOrigin}/api/import/`))); assert.equal(calls.find(call => call.url.endsWith('/connect'))!.input.token, fixtureToken);
  instanceId = 'restarted'; await assert.rejects(bridge.connect(credential), /已更新/); assert.equal(commits, 1); assert.equal(calls.filter(call => call.url.endsWith('/connect')).length, 1);
});
test('web reauthorization uses the existing account edit contract and keeps the same identity and local links', async t => {
  const actualFetch = globalThis.fetch; t.after(() => { globalThis.fetch = actualFetch; });
  const account = { id: 'existing-github', provider: 'github' as const, host: 'https://github.com', name: 'Existing Name', login: 'Fixture', updatedAt: '' };
  const catalog = { ...fixtureCatalog, accounts: [account], links: [{ repositoryId: 'existing-repo', path: '/fixture-only/repo' }] };
  let edits = 0;
  globalThis.fetch = async (url, init) => {
    if (String(url) === 'https://api.github.com/user') return Response.json({ login: 'fixture' });
    if (String(url).endsWith('/status')) return Response.json({ ok: true, value: { instanceId: 'fixture-main', version: 'fixture-version' } });
    if (String(url).endsWith('/catalog')) return Response.json({ ok: true, value: catalog });
    assert.equal(String(url), `${previewOrigin}/api/import/updateAccount`);
    assert.deepEqual(JSON.parse(String(init?.body)), { accountId: account.id, name: account.name, token: fixtureToken }); edits++;
    return Response.json({ ok: true, value: catalog });
  };
  const bridge = previewConnector({ instanceId: 'fixture-main', version: 'fixture-version' });
  assert.deepEqual(await bridge.connect({ token: fixtureToken, name: '', signal: new AbortController().signal, commit: () => {} }), catalog); assert.equal(edits, 1);
});
test('browser DTO validators reject foreign navigation and keep token-free progress and cancellation contracts', async t => {
  const actualFetch = globalThis.fetch; t.after(() => { globalThis.fetch = actualFetch; });
  const f = fixture(); const session = f.flow.start(''); let value: unknown = session;
  globalThis.fetch = async (_url, init) => { assert.equal(init?.credentials, 'omit'); assert.equal(init?.redirect, 'error'); return Response.json({ ok: true, value }); };
  assert.deepEqual(await startGitHubWebAuthorization(''), session);
  value = { ...session, authorizationURL: 'https://foreign.test/login' }; await assert.rejects(startGitHubWebAuthorization(''), /信息无效/);
  assert.equal(isGitHubAuthorizationURL(`https://github.com@foreign.test/login/oauth/authorize`), false);
  value = { status: 'complete', catalog: fixtureCatalog }; assert.deepEqual(await pollGitHubWebAuthorization(session.id, new AbortController().signal), value);
  value = { cancelled: false, catalog: fixtureCatalog }; assert.deepEqual(await cancelGitHubWebAuthorization(session.id), value);
  value = { status: 'complete', token: fixtureToken }; await assert.rejects(pollGitHubWebAuthorization(session.id, new AbortController().signal), /格式无效/);
});
test('popup is reserved synchronously without an opener, then navigates only to validated GitHub; polling cancels', async t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window'); t.after(() => { if (original) Object.defineProperty(globalThis, 'window', original); else Reflect.deleteProperty(globalThis, 'window'); });
  let navigation = ''; const popup = { opener: 'fixture-opener' as string | null, location: { replace: (url: string) => { navigation = url; } } };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { open: (url: string) => { assert.equal(url, 'about:blank'); return popup; } } });
  const f = fixture(); const session = f.flow.start(''); const reserved = reserveGitHubWebWindow(); assert.equal(popup.opener, null);
  assert.equal(navigateGitHubWebWindow(reserved, session.authorizationURL), true); assert.equal(navigation, session.authorizationURL);
  assert.equal(navigateGitHubWebWindow(null, session.authorizationURL), false);
  assert.throws(() => navigateGitHubWebWindow(reserved, 'https://foreign.test'), /网址无效/);
  let now = session.expiresAt - 10000; let polls = 0;
  assert.deepEqual(await waitForGitHubWebAuthorization(session, new AbortController().signal, { now: () => now, sleep: async ms => { now += ms; }, poll: async () => ++polls === 2 ? { status: 'complete', catalog: fixtureCatalog } : { status: 'pending' } }), fixtureCatalog);
  const abort = new AbortController(); abort.abort(); await assert.rejects(waitForGitHubWebAuthorization(session, abort.signal));
  await assert.rejects(waitForGitHubWebAuthorization(session, new AbortController().signal, { now: () => session.expiresAt }), /过期/);
});
test('browser waiting UI stays token-free and the helper is isolated from the main preview and credentials', () => {
  const modal = readFileSync(new URL('../src/GitHubBrowserAuthorizationModal.tsx', import.meta.url), 'utf8');
  assert.match(modal, /在 GitHub 完成登录和授权/); assert.doesNotMatch(modal, /userCode|复制验证码|Client secret|使用指南|settings-footer/);
  const settings = readFileSync(new URL('../src/SettingsView.tsx', import.meta.url), 'utf8');
  assert.match(settings, /if \(!window.gittogether\)/); assert.match(settings, /startGitHubWebAuthorization\(name\)/);
  const config = readFileSync(new URL('../vite.config.mjs', import.meta.url), 'utf8'); assert.doesNotMatch(config, /github-oauth-dev|github-web-authorization/);
  const launch = readFileSync(new URL('../server/github-oauth-dev.ts', import.meta.url), 'utf8');
  assert.match(launch, /mkdtemp/); assert.match(launch, /delete environment.ELECTRON_RUN_AS_NODE/); assert.doesNotMatch(launch, /client_secret|loadEnv|dotenv|writeFile|--use-env-proxy/);
  const helper = readFileSync(new URL('../electron/github-oauth-dev.ts', import.meta.url), 'utf8');
  assert.match(helper, /server.listen\(4174, '127.0.0.1'/); assert.match(helper, /createLoopbackFetch/);
  assert.doesNotMatch(helper, /BrowserWindow|AccountService|encryptedStore|7890/);
  assert.match(helper, /app.getPath\('appData'\), 'GitTogether Authorization', 'github-oauth-v1.encrypted'/);
  assert.match(helper, /configuration.load\(\)/); assert.match(helper, /save: configuration.save/);
  assert.match(helper, /bind: async \(\) => previewConnector\(await readPreviewStatus\(localRequest\)/);
  const main = readFileSync(new URL('../electron/main.ts', import.meta.url), 'utf8'); assert.match(main, /new AccountService\(encryptedStore\([^\n]+systemFetch\)/);
});

test('persistent configuration publishes only after saving, rejects concurrent changes and never exposes storage errors', async () => {
  const f = fixture(); const saved = deferred<void>(); let writes = 0;
  const pending = f.flow.configureAndSave('fixture-replacement-secret', async secret => { assert.equal(secret, 'fixture-replacement-secret'); writes++; await saved.promise; });
  assert.equal(f.flow.configured, true);
  assert.throws(() => f.flow.start(''), /正在保存/);
  assert.throws(() => f.flow.configure(fixtureSecret), /正在保存/);
  await assert.rejects(f.flow.configureAndSave(fixtureSecret, async () => { writes++; }), /正在保存/);
  saved.resolve(); await pending; assert.equal(writes, 1);
  const first = f.flow.start(''); await f.flow.callback(callbackFor(first));
  assert.equal(new URLSearchParams(String(f.calls[0].init?.body)).get('client_secret'), 'fixture-replacement-secret');
  await assert.rejects(f.flow.configureAndSave('fixture-failed-secret', async () => { throw new Error('fixture-failed-secret is sensitive'); }), problem => problem instanceof Error && /保存失败/.test(problem.message) && !problem.message.includes('fixture-failed-secret'));
  const second = f.flow.start(''); await f.flow.callback(callbackFor(second));
  assert.equal(new URLSearchParams(String(f.calls[1].init?.body)).get('client_secret'), 'fixture-replacement-secret');
  const active = f.flow.start(''); let activeWrites = 0;
  await assert.rejects(f.flow.configureAndSave(fixtureSecret, async () => { activeWrites++; }), /结束当前授权/);
  assert.equal(activeWrites, 0); await f.flow.cancel(active.id);
});

test('configuration HTTP save is awaited, failure keeps the previous secret, and a fresh server restores saved configuration', async t => {
  let stored: string | null = null; let fail = false; let providerSecret = '';
  const create = () => createGitHubOAuthServer({
    connect: async () => fixtureCatalog, verify: async () => {},
    configuration: { secret: stored, save: async secret => { if (fail) throw new Error(`cannot save ${secret}`); stored = secret; } },
    request: async (_url, init) => { providerSecret = new URLSearchParams(String(init?.body)).get('client_secret')!; return Response.json(grant); },
  });
  const server = create(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const address = server.address(); assert.ok(address && typeof address === 'object'); const origin = `http://127.0.0.1:${address.port}`;
  const setup = await (await fetch(`${origin}/setup`)).text();
  assert.match(setup, /系统安全存储加密保存/); assert.match(setup, /重启自动恢复/);
  const key = setup.match(/X-GitTogether-Setup':"([\w-]+)"/)![1];
  const configure = (secret: string, source = origin) => fetch(`${origin}/api/config`, { method: 'POST', headers: { Origin: source, 'Content-Type': 'application/json', 'X-GitTogether-Setup': key }, body: JSON.stringify({ secret, rotated: true }) });
  assert.equal((await configure(fixtureSecret, 'https://foreign.test')).status, 403); assert.equal(stored, null);
  assert.equal((await configure('github_pat_fixture')).status, 400); assert.equal(stored, null);
  assert.equal((await configure(fixtureSecret)).status, 200); assert.equal(stored, fixtureSecret);
  fail = true; const rejected = await configure('fixture-never-saved'); assert.equal(rejected.status, 400);
  assert.doesNotMatch(await rejected.text(), /fixture-never-saved/); assert.equal(stored, fixtureSecret);
  server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  const restarted = create(); restarted.listen(0, '127.0.0.1'); await once(restarted, 'listening');
  t.after(() => { restarted.closeAllConnections(); restarted.close(); });
  const nextAddress = restarted.address(); assert.ok(nextAddress && typeof nextAddress === 'object'); const nextOrigin = `http://127.0.0.1:${nextAddress.port}`;
  const nextSetup = await (await fetch(`${nextOrigin}/setup`)).text(); assert.match(nextSetup, /已完成本机配置/); assert.doesNotMatch(nextSetup, /fixture-only/);
  const start = await fetch(`${nextOrigin}/api/start`, { method: 'POST', headers: { Origin: previewOrigin, 'Content-Type': 'application/json', 'X-GitTogether-Client': '1' }, body: '{}' });
  const { value: session } = await start.json(); assert.ok(isGitHubWebSession(session));
  assert.equal((await fetch(`${nextOrigin}/oauth/github/callback?${callbackFor(session)}`)).status, 200); assert.equal(providerSecret, fixtureSecret);
});

test('new HTTP authorizations bind the current main instance while earlier callbacks remain pinned across restart', async t => {
  let instanceId = 'fixture-before-restart'; let imports = 0; let restartDuringLookup = false;
  const local: typeof fetch = async (url, init) => {
    assert.equal(new Headers(init?.headers).get('X-GitTogether-Client'), '1');
    const method = String(url).split('/').at(-1)!;
    if (method === 'connect') imports++;
    return Response.json({ ok: true, value: method === 'status' ? { instanceId, version: 'fixture-version' } : { ...fixtureCatalog, instanceId } });
  };
  const remote: typeof fetch = async () => { if (restartDuringLookup) instanceId = 'fixture-restarted-during-lookup'; return Response.json({ login: 'Fixture' }); };
  const initial = previewConnector({ instanceId, version: 'fixture-version' }, remote, local);
  const server = createGitHubOAuthServer({
    ...initial, configuration: { secret: fixtureSecret, save: async () => {} }, request: async () => Response.json(grant),
    bind: async () => previewConnector({ instanceId, version: 'fixture-version' }, remote, local).connect,
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => { server.closeAllConnections(); server.close(); });
  const address = server.address(); assert.ok(address && typeof address === 'object'); const origin = `http://127.0.0.1:${address.port}`;
  const begin = async () => {
    const response = await fetch(`${origin}/api/start`, { method: 'POST', headers: { Origin: previewOrigin, 'Content-Type': 'application/json', 'X-GitTogether-Client': '1' }, body: '{}' });
    assert.equal(response.status, 200); const { value } = await response.json(); assert.ok(isGitHubWebSession(value)); return value;
  };
  const old = await begin(); instanceId = 'fixture-after-restart'; const current = await begin();
  const oldResponse = await fetch(`${origin}/oauth/github/callback?${callbackFor(old)}`); const oldResult = await oldResponse.text();
  assert.match(oldResult, /重新开始授权/); assert.doesNotMatch(oldResult, /重新启动本机网页授权服务|fixture-only|ghu_/); assert.equal(imports, 0);
  const currentResult = await (await fetch(`${origin}/oauth/github/callback?${callbackFor(current)}`)).text();
  assert.match(currentResult, /data-status.*complete/); assert.equal(imports, 1);
  const racing = await begin(); restartDuringLookup = true;
  const racingResult = await (await fetch(`${origin}/oauth/github/callback?${callbackFor(racing)}`)).text();
  assert.match(racingResult, /重新开始授权/); assert.equal(imports, 1);
});
