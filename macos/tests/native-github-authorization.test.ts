import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { setTimeout as pause } from 'node:timers/promises';
import { createGitHubOAuthServer, previewOrigin } from '../server/github-oauth-dev-server';
import { AccountService, type SavedState } from '../server/account-service';
import { NativeGitHubAuthorization } from '../electron/native-github-authorization';
import { emptyCatalog, type Catalog } from '../src/import-model';
import { githubOAuthOrigin, type GitHubWebSession } from '../src/github-web-model';

const token = 'ghu_fixture_native_only';
const initial: SavedState = {
  version: 2, accounts: [{ account: { id: 'kept-account', provider: 'gitea', host: 'https://gitea.fixture', login: 'old', name: 'Existing', updatedAt: '' }, token: 'fixture-existing-token' }],
  repositories: [{ id: 'kept-repository', accountId: 'kept-account', remoteId: 1, name: 'kept', fullName: 'old/kept', description: '', defaultBranch: 'main', private: true, available: true, url: 'https://gitea.fixture/old/kept' }],
  links: [{ repositoryId: 'kept-repository', path: '/fixture/existing-path', worktrees: [{ branch: 'main', path: '/fixture/existing-path' }] }],
};
async function fixture(t: TestContext) {
  let saved = structuredClone(initial); let writes = 0; let previewImports = 0;
  const accountService = new AccountService({ kind: 'encrypted', load: async () => saved, save: async state => { saved = structuredClone(state); writes++; } },
    async input => Response.json(new URL(String(input)).pathname === '/user' ? { login: 'native-user', name: 'Native', id: 2 } : []));
  const server = createGitHubOAuthServer({ configuration: { secret: 'fixture-client-secret', save: async () => {} },
    verify: async () => { throw new Error('Preview is deliberately offline'); },
    connect: async () => { previewImports++; return emptyCatalog; },
    request: async () => Response.json({ access_token: token, token_type: 'bearer', expires_in: 28800 }),
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  const request: typeof fetch = async (url, init) => fetch(String(url).replace(githubOAuthOrigin, origin), init);
  const client = new NativeGitHubAuthorization(credential => accountService.connectGitHubWebAuthorization(credential), request, async () => {});
  const callback = async (session: GitHubWebSession) => {
    const state = new URL(session.authorizationURL).searchParams.get('state');
    return fetch(`${origin}/oauth/github/callback?state=${state}&code=fixture-native-code`);
  };
  const post = (path: string, body: unknown, source?: string) => fetch(`${origin}/api/${path}`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-GitTogether-Client': '1', ...(source ? { Origin: source } : {}) }, body: JSON.stringify(body) });
  return { client, callback, post, saved: () => saved, writes: () => writes, previewImports: () => previewImports };
}

test('native browser callback saves into desktop accounts while preserving Gitea, mappings and expiry', async t => {
  const f = await fixture(t); const session = await f.client.start('GitHub');
  assert.doesNotMatch(JSON.stringify(session), /fixture-client-secret|ghu_|key|credential/);
  assert.equal(f.client.authorizationURL(session.id), session.authorizationURL);
  assert.equal((await f.callback(session)).status, 200);
  let result: Awaited<ReturnType<typeof f.client.poll>> = { status: 'pending' };
  for (let attempt = 0; attempt < 100 && result.status === 'pending'; attempt++) { result = await f.client.poll(session.id); if (result.status === 'pending') await pause(5); }
  assert.equal(result.status, 'complete');
  assert.doesNotMatch(JSON.stringify(result), /ghu_|fixture-existing-token|fixture-client-secret/);
  assert.equal(f.writes(), 1); assert.equal(f.previewImports(), 0);
  assert.deepEqual(f.saved().accounts[0], initial.accounts[0]); assert.deepEqual(f.saved().links, initial.links);
  assert.equal(f.saved().accounts.length, 2); assert.ok(f.saved().accounts[1].account.authorizationExpiresAt);
  const again = await Promise.all([f.client.poll(session.id), f.client.poll(session.id)]);
  assert.equal(again[0].status, 'complete'); assert.equal(f.writes(), 1);
  const cancelled = await f.client.cancel(session.id); assert.equal(cancelled.cancelled, false); assert.equal(f.client.busy, false);
});

test('native grants reject browser origins, wrong capabilities and browser polling of native sessions', async t => {
  const f = await fixture(t); const session = await f.client.start('');
  assert.equal((await f.post('native/status', {}, previewOrigin)).status, 403);
  assert.equal((await f.post('native/poll', { sessionId: session.id, key: 'a'.repeat(64) })).status, 400);
  const browser = await f.post('poll', { sessionId: session.id }, previewOrigin);
  assert.equal(browser.status, 400); assert.doesNotMatch(await browser.text(), /ghu_|fixture-client-secret/);
  assert.throws(() => f.client.authorizationURL('https://foreign.test'), /失效/);
  assert.deepEqual(await f.client.cancel(session.id), { cancelled: true });
  assert.equal((await f.callback(session)).status, 400); assert.equal(f.writes(), 0); assert.equal(f.client.busy, false);
});

test('simultaneous native polls import once and reauthorization retains the account identity and local mappings', async t => {
  const f = await fixture(t); const first = await f.client.start('GitHub'); await f.callback(first);
  let complete: Catalog | undefined;
  for (let attempt = 0; attempt < 100 && !complete; attempt++) {
    const [a, b] = await Promise.all([f.client.poll(first.id), f.client.poll(first.id)]);
    if (a.status === 'complete') { assert.equal(b.status, 'complete'); complete = a.catalog; } else await pause(5);
  }
  assert.ok(complete); const accountId = complete.accounts.find(account => account.provider === 'github')!.id;
  const second = await f.client.start(''); await f.callback(second);
  for (let attempt = 0; attempt < 100; attempt++) { const result = await f.client.poll(second.id); if (result.status === 'complete') break; await pause(5); }
  assert.equal(f.writes(), 2); assert.equal(f.saved().accounts.length, 2);
  assert.equal(f.saved().accounts[1].account.id, accountId); assert.deepEqual(f.saved().links, initial.links);
});
