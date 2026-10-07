import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { developmentOptions, ensureAuthorizationHelper, readAuthorizationStatus } from '../scripts/dev';
import { githubDevClientId, githubOAuthOrigin } from '../src/github-web-model';
import { previewOrigin } from '../server/github-oauth-dev-server';
import pkg from '../package.json';

const state = { configured: true, version: pkg.version, clientId: githubDevClientId };
const ready: typeof fetch = async () => Response.json({ ok: true, value: state });
const refused: typeof fetch = async () => { throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } }); };
function processFixture() {
  const child = Object.assign(new EventEmitter(), { exitCode: null as number | null, signalCode: null as string | null, kills: [] as string[], kill(signal: string) { this.kills.push(signal); return true; } });
  return { fixture: child, child: child as unknown as ChildProcess };
}

test('default development entry and supported legacy flags keep the registered loopback origin and strict port', () => {
  for (const args of [[], ['--port', '4173', '--strictPort'], ['--host=127.0.0.1', '--port=4173']]) {
    assert.deepEqual(developmentOptions(args), { mode: 'development', server: { host: '127.0.0.1', port: 4173, strictPort: true } });
  }
  for (const args of [['--port', '5173'], ['--host', '0.0.0.0'], ['--host', 'localhost'], ['--unknown']]) assert.throws(() => developmentOptions(args));
  assert.equal(pkg.scripts.dev, 'tsx scripts/dev.ts');
});

test('readiness requests only the protected fixed status endpoint and returns public identity, never credentials', async () => {
  let calls = 0;
  const request: typeof fetch = async (url, init) => {
    calls++; assert.equal(String(url), `${githubOAuthOrigin}/api/status`); assert.equal(init?.method, 'POST');
    assert.equal(init?.body, '{}'); assert.equal(init?.redirect, 'error'); assert.equal(init?.credentials, 'omit'); assert.ok(init?.signal);
    assert.deepEqual(init?.headers, { Origin: previewOrigin, 'Content-Type': 'application/json', 'X-GitTogether-Client': '1' });
    return Response.json({ ok: true, value: { ...state, secret: 'fixture-must-not-leave-service' } });
  };
  assert.deepEqual(await readAuthorizationStatus(request), state); assert.equal(calls, 1);
});

test('healthy existing helper is reused without starting or taking ownership, including explicit unconfigured state', async () => {
  for (const configured of [true, false]) {
    const result = await ensureAuthorizationHelper(() => { throw new Error('must not spawn'); }, { request: async () => Response.json({ ok: true, value: { ...state, configured } }) });
    assert.equal(result.child, null); assert.equal(result.status.configured, configured);
  }
});

test('only a genuinely refused connection is treated as missing; invalid, stale and unresponsive services are not overwritten', async () => {
  assert.equal(await readAuthorizationStatus(refused), null);
  const failures: typeof fetch[] = [async () => { throw new Error('timeout or proxy failure'); }, async () => new Response('not our service'),
    async () => Response.json({ ok: true, value: { configured: true } }), async () => Response.json({ ok: true, value: { ...state, version: 'old' } }),
    async () => Response.json({ ok: true, value: { ...state, clientId: 'foreign-app' } }), async () => Response.json({ ok: false, error: 'fixture-secret' }, { status: 403 })];
  for (const request of failures) await assert.rejects(ensureAuthorizationHelper(() => { throw new Error('must not spawn'); }, { request }), error => error instanceof Error && !error.message.includes('fixture-secret'));
});

test('cold startup waits for the helper, then preserves ownership for coordinated shutdown', async () => {
  const { fixture, child } = processFixture(); let calls = 0; let starts = 0; let waits = 0;
  const request: typeof fetch = async (url, init) => ++calls < 4 ? refused(url, init) : ready(url, init);
  const result = await ensureAuthorizationHelper(() => { starts++; return child; }, { request, wait: async () => { waits++; } });
  assert.equal(starts, 1); assert.equal(waits, 2); assert.equal(result.child, child); assert.deepEqual(result.status, state); assert.deepEqual(fixture.kills, []);
});

test('startup failure and bounded timeout terminate only the newly owned helper', async () => {
  for (const failure of ['exit', 'error', 'timeout']) {
    const { fixture, child } = processFixture(); let waits = 0;
    await assert.rejects(ensureAuthorizationHelper(() => {
      if (failure === 'exit') fixture.exitCode = 1;
      return child;
    }, { request: refused, wait: async () => { waits++; if (failure === 'error') fixture.emit('error', new Error('fixture failure')); } }));
    assert.deepEqual(fixture.kills, ['SIGTERM']); assert.ok(waits <= 75);
  }
});

test('a raced-in foreign helper cannot be accepted and startup cleanup retains the unknown port owner', async () => {
  const { fixture, child } = processFixture(); let calls = 0;
  await assert.rejects(ensureAuthorizationHelper(() => child, { request: async (url, init) => ++calls === 1 ? refused(url, init) : Response.json({ ok: true, value: { ...state, clientId: 'foreign' } }) }));
  assert.deepEqual(fixture.kills, ['SIGTERM']);
});

test('entry retains owned-process shutdown, failure reporting and never creates login grants or plaintext configuration', () => {
  const source = readFileSync(new URL('../scripts/dev.ts', import.meta.url), 'utf8');
  assert.match(source, /helper = spawn/); assert.match(source, /process\.once\('SIGINT'/); assert.match(source, /process\.once\('SIGTERM'/);
  assert.match(source, /server\?\.close\(\)/); assert.match(source, /if \(stopping\) return/); assert.match(source, /授权助手已退出，开发环境不再就绪/);
  assert.doesNotMatch(source, /\/api\/(?:start|config)|access_token|client_secret|writeFile|launchctl|SIGKILL/);
});
