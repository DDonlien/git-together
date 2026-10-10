import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as pause } from 'node:timers/promises';
import { nativeOAuthHelper } from '../electron/native-oauth-helper';
import { NativeGitHubAuthorization } from '../electron/native-github-authorization';
import { githubOAuthOrigin } from '../src/github-web-model';
import { emptyCatalog } from '../src/import-model';

const secret = 'fixture-main-app-client-secret';
async function portFor() {
  const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const address = reservation.address(); assert.ok(address && typeof address === 'object');
  const port = address.port;
  await new Promise<void>((resolve, reject) => reservation.close(problem => problem ? reject(problem) : resolve()));
  return port;
}
const remote: typeof fetch = async () => Response.json({ access_token: 'ghu_fixture_main_only', token_type: 'bearer' });
const offline: typeof fetch = async () => { throw new Error('Preview deliberately offline'); };

test('two native browser authorizations share startup configuration without another storage read or legacy process', async t => {
  const port = await portFor(); let reads = 0; let migrations = 0; let imports = 0;
  const helper = nativeOAuthHelper({ port, configuration: { load: async () => { reads++; return secret; }, save: async () => { assert.fail('Unexpected configuration save'); } },
    restoreLegacy: async () => { migrations++; return secret; }, request: remote, localRequest: offline });
  t.after(() => helper.close()); await helper.prepare(); assert.equal(reads, 1);
  const origin = `http://127.0.0.1:${port}`;
  const client = new NativeGitHubAuthorization(async credential => {
    assert.equal(credential.token, 'ghu_fixture_main_only'); imports++; return emptyCatalog;
  }, (url, input) => fetch(String(url).replace(githubOAuthOrigin, origin), input), helper.ensure);
  for (let i = 0; i < 2; i++) {
    const session = await client.start('Native');
    assert.equal(new URL(client.authorizationURL(session.id)).origin, 'https://github.com');
    assert.doesNotMatch(JSON.stringify(session), /fixture-main-app-client-secret|ghu_fixture|credential/);
    const state = new URL(session.authorizationURL).searchParams.get('state');
    assert.equal((await fetch(`${origin}/oauth/github/callback?state=${state}&code=fixture-code`)).status, 200);
    let complete = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = await client.poll(session.id);
      assert.doesNotMatch(JSON.stringify(result), /fixture-main-app-client-secret|ghu_fixture/);
      if (result.status === 'complete') { complete = true; break; }
      await pause(5);
    }
    assert.equal(complete, true);
  }
  assert.equal(reads, 1); assert.equal(migrations, 0); assert.equal(imports, 2);
});

test('concurrent preparation and login wait for one migration and successful encrypted persistence', async t => {
  const port = await portFor(); const actions: string[] = []; let finish!: () => void;
  const saved = new Promise<void>(resolve => { finish = resolve; });
  const helper = nativeOAuthHelper({ port, configuration: {
    load: async () => { actions.push('read'); return null; },
    save: async value => { assert.equal(value, secret); actions.push('save'); await saved; actions.push('saved'); },
  }, restoreLegacy: async () => { actions.push('legacy'); return secret; }, request: remote, localRequest: offline });
  t.after(() => helper.close());
  let ready = false;
  const preparation = helper.prepare(); const second = helper.prepare();
  const starting = helper.ensure().then(() => { ready = true; });
  await pause(20); assert.equal(ready, false); assert.deepEqual(actions, ['read', 'legacy', 'save']);
  finish(); await Promise.all([preparation, second, starting]);
  assert.deepEqual(actions, ['read', 'legacy', 'save', 'saved']);
  const response = await fetch(`http://127.0.0.1:${port}/api/native/status`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-GitTogether-Client': '1' }, body: '{}' });
  assert.equal((await response.json()).value.configured, true);
});

test('corrupt native configuration never falls back to legacy or overwrites either store', async t => {
  const port = await portFor(); let reads = 0; let migrated = 0; let writes = 0;
  const helper = nativeOAuthHelper({ port, configuration: { load: async () => { reads++; throw new Error('Stored configuration cannot decrypt'); }, save: async () => { writes++; } },
    restoreLegacy: async () => { migrated++; return secret; }, request: remote, localRequest: offline });
  t.after(() => helper.close());
  await assert.rejects(helper.prepare(), /cannot decrypt/);
  await assert.rejects(helper.ensure(), /cannot decrypt/);
  assert.equal(reads, 1); assert.equal(migrated, 0); assert.equal(writes, 0);
});

test('a failed migration save cannot enable a login or repeat keychain recovery', async t => {
  const port = await portFor(); let migrated = 0; let writes = 0;
  const helper = nativeOAuthHelper({ port, configuration: { load: async () => null, save: async () => { writes++; throw new Error('Encryption unavailable'); } },
    restoreLegacy: async () => { migrated++; return secret; }, request: remote, localRequest: offline });
  t.after(() => helper.close());
  await assert.rejects(helper.prepare(), /Encryption unavailable/);
  await assert.rejects(helper.ensure(), /Encryption unavailable/);
  assert.equal(migrated, 1); assert.equal(writes, 1);
});

test('missing configuration stays unconfigured and native sign-in gives a recoverable setup error', async t => {
  const port = await portFor();
  const helper = nativeOAuthHelper({ port, configuration: { load: async () => null, save: async () => assert.fail('Nothing to save') },
    restoreLegacy: async () => null, request: remote, localRequest: offline });
  t.after(() => helper.close()); await helper.prepare();
  const origin = `http://127.0.0.1:${port}`;
  const client = new NativeGitHubAuthorization(async () => emptyCatalog, (url, init) => fetch(String(url).replace(githubOAuthOrigin, origin), init), helper.ensure);
  await assert.rejects(client.start(''), /配置未能恢复/);
});

test('quitting during preparation cannot start a callback server afterward', async t => {
  const port = await portFor(); let finish!: (value: string) => void;
  const pending = new Promise<string>(resolve => { finish = resolve; });
  const helper = nativeOAuthHelper({ port, configuration: { load: () => pending, save: async () => {} },
    restoreLegacy: async () => assert.fail('Already configured'), request: remote, localRequest: offline });
  const starting = helper.ensure(); await pause(20); helper.close(); finish(secret);
  await assert.rejects(starting, /正在退出/); await assert.rejects(helper.ensure(), /正在退出/);
});

test('an existing external listener is reused and never closed by the desktop helper', async t => {
  const server = createServer(socket => socket.end()); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => server.close()); const address = server.address(); assert.ok(address && typeof address === 'object');
  const helper = nativeOAuthHelper({ port: address.port, configuration: { load: async () => assert.fail('External helper is already ready'), save: async () => {} },
    restoreLegacy: async () => assert.fail('No migration for external listener'), request: remote, localRequest: offline });
  await helper.ensure(); helper.close(); assert.equal(server.listening, true);
});
