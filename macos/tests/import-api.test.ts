import test from 'node:test';
import assert from 'node:assert/strict';
import { connectAfterServiceCheck, importAPI, LocalServiceError, verifyServiceVersion } from '../src/import-api';
import { emptyCatalog, githubVerificationURL } from '../src/import-model';

test('local connection failure, timeout, static hosting and server error are distinct and never replay a token', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new TypeError('network'); });
  await assert.rejects(importAPI('catalog', {}), problem => problem instanceof LocalServiceError && problem.code === 'connection');
  assert.equal(calls, 1);
  const timeout = new AbortController(); timeout.abort(new DOMException('timeout', 'TimeoutError'));
  t.mock.method(AbortSignal, 'timeout', () => timeout.signal);
  await assert.rejects(importAPI('status', {}), problem => problem instanceof LocalServiceError && problem.code === 'timeout');
  t.mock.method(globalThis, 'fetch', async () => { const response = Response.json({}); t.mock.method(response, 'json', async () => { throw timeout.signal.reason; }); return response; });
  await assert.rejects(importAPI('status', {}), problem => problem instanceof LocalServiceError && problem.code === 'timeout');
  t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>static page</html>', { status: 404 }));
  await assert.rejects(importAPI('catalog', {}), problem => problem instanceof LocalServiceError && problem.code === 'unsupported');
  t.mock.method(globalThis, 'fetch', async () => new Response('upstream internals', { status: 503 }));
  await assert.rejects(importAPI('catalog', {}), problem => problem instanceof LocalServiceError && problem.code === 'server' && !problem.message.includes('internals'));
});

test('failed preflight and version mismatch do not submit credentials; healthy retry submits once', async t => {
  const requests: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    requests.push(url); assert.equal(new Headers(init.headers).get('X-GitTogether-Client'), '1');
    return Response.json({ ok: true, value: { ...emptyCatalog, instanceId: 'fixture' } });
  });
  const input = { provider: 'github' as const, host: 'https://github.com', name: '', token: 'fixture-token' };
  await assert.rejects(connectAfterServiceCheck(input, async () => { throw new LocalServiceError('connection', 'offline'); })); assert.equal(requests.length, 0);
  await assert.rejects(connectAfterServiceCheck(input, async () => verifyServiceVersion('0.2.2', '0.3.0')), /版本不一致/); assert.equal(requests.length, 0);
  await connectAfterServiceCheck(input, async () => verifyServiceVersion('0.3.0', '0.3.0')); assert.deepEqual(requests, ['/api/import/connect']);
});

test('provider errors stay separate from local outages and explicit cancellation is not misreported', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ ok: false, error: '令牌无效或已过期。' }, { status: 400 }));
  await assert.rejects(importAPI('connect', { provider: 'github', host: 'https://github.com', name: '', token: 'fixture-invalid' }), problem => problem instanceof Error && !(problem instanceof LocalServiceError) && /令牌/.test(problem.message));
  const cancellation = new AbortController(); cancellation.abort(new DOMException('cancelled', 'AbortError'));
  t.mock.method(globalThis, 'fetch', async () => { throw cancellation.signal.reason; });
  await assert.rejects(importAPI('githubAuthPoll', { sessionId: 'fixture' }, cancellation.signal), problem => problem === cancellation.signal.reason);
});

test('authorization DTOs reject arbitrary verification URLs, invalid intervals and malformed completed catalogs', async t => {
  let value: unknown = { id: 'fixture', userCode: 'ABCD-EFGH', verificationURL: 'https://foreign.test', expiresAt: Date.now() + 900000, interval: 5 };
  t.mock.method(globalThis, 'fetch', async () => Response.json({ ok: true, value }));
  await assert.rejects(importAPI('githubAuthStart', { name: '' }), /格式无效/);
  value = { id: 'fixture', userCode: 'ABCD-EFGH', verificationURL: githubVerificationURL, expiresAt: Date.now() + 900000, interval: 5 };
  assert.equal((await importAPI('githubAuthStart', { name: '' })).verificationURL, githubVerificationURL);
  value = { status: 'pending', retryAfter: 0 }; await assert.rejects(importAPI('githubAuthPoll', { sessionId: 'fixture' }), /格式无效/);
  value = { status: 'complete', catalog: {} }; await assert.rejects(importAPI('githubAuthPoll', { sessionId: 'fixture' }), /格式无效/);
  value = { cancelled: false, catalog: {} }; await assert.rejects(importAPI('githubAuthCancel', { sessionId: 'fixture' }), /结果无效/);
  value = { cancelled: true }; assert.deepEqual(await importAPI('githubAuthCancel', { sessionId: 'fixture' }), value);
});

test('remote read DTOs reject malformed workspace, commit and blob envelopes', async t => {
  let value: unknown = { source: 'remote', checkedAt: 1, complete: true, commits: [], tasks: [], warnings: [] };
  t.mock.method(globalThis, 'fetch', async () => Response.json({ ok: true, value }));
  const repositoryId = 'fixture';
  assert.equal((await importAPI('remoteWorkspace', { repositoryId })).source, 'remote');
  value = { source: 'remote', checkedAt: 1, complete: true, commits: [], tasks: [{ path: '/local/secret' }], warnings: [] };
  await assert.rejects(importAPI('remoteWorkspace', { repositoryId }), /工作台返回格式无效/);
  value = { commit: { id: 'invalid', summary: 'bad', author: 'bad', time: 'bad' }, files: [], diff: '', tree: [], treeComplete: true, warnings: [] };
  await assert.rejects(importAPI('remoteCommit', { repositoryId, commitId: 'a'.repeat(40) }), /提交返回格式无效/);
  value = { text: 'content', binary: false, size: -1 };
  await assert.rejects(importAPI('remoteFile', { repositoryId, commitId: 'a'.repeat(40), path: 'file.txt' }), /文件返回格式无效/);
  value = { text: 'content', binary: false, size: 7 };
  assert.equal((await importAPI('remoteFile', { repositoryId, commitId: 'a'.repeat(40), path: 'file.txt' })).text, 'content');
});
