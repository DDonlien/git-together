import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { AccountService, normalizeHost, remoteIdentity, sessionStore, type CredentialStore, type SavedState } from '../server/account-service';
import { importMiddleware } from '../server/http-api';
import { isCatalog, type Catalog } from '../src/import-model';

const execute = promisify(execFile);
const repo = (id: number, name: string) => ({ id, name: name.split('/')[1], full_name: name, description: 'fixture only', private: true, default_branch: 'main' });
const connect = (provider: 'github' | 'gitea', token = 'fixture-a', host = 'https://git.example.test') => ({ provider, token, host, name: '' });
function fixture() {
  const requests: URL[] = []; let failRepos = false; let unavailable = false;
  const request: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); requests.push(url);
    const token = new Headers(init?.headers).get('Authorization') || '';
    if (token.endsWith('invalid')) return new Response('provider body must not leak', { status: 401 });
    if (url.pathname.endsWith('/user')) return Response.json({ login: token.endsWith('fixture-b') ? 'bob' : 'alice', name: token.endsWith('fixture-b') ? 'Work' : 'Personal' });
    if (failRepos) return new Response('private provider diagnostic', { status: 503 });
    const page = Number(url.searchParams.get('page'));
    if (url.hostname === 'api.github.com') return Response.json(page === 1 ? [repo(1, 'alice/project')] : page === 2 ? [repo(2, 'org/team'), repo(3, 'friend/shared')] : [], { headers: page === 1 ? { Link: '<https://evil.test/credentials>; rel="next"' } : {} });
    return Response.json(page === 1 && !unavailable ? [repo(1, 'alice/project')] : page === 2 ? [repo(2, 'org/team')] : []);
  };
  return { request, requests, setFailure: (value: boolean) => { failRepos = value; }, setUnavailable: (value: boolean) => { unavailable = value; } };
}
async function catalog(service: AccountService) { const result = await service.handle('catalog', {}); assert.ok(isCatalog(result)); return result; }

test('Gitea domains use normalized HTTPS origins, reject credentials, paths and insecure non-local hosts', () => {
  assert.equal(normalizeHost('gitea', 'Git.Example.com'), 'https://git.example.com');
  assert.equal(normalizeHost('gitea', 'http://127.0.0.1:49101'), 'http://127.0.0.1:49101');
  for (const host of ['http://example.com', 'https://user:secret@example.com', 'https://example.com/repo', 'https://example.com/?token=x', 'file:///etc']) assert.throws(() => normalizeHost('gitea', host));
  assert.equal(normalizeHost('github', 'https://evil.test'), 'https://github.com');
});
test('GitHub paginates personal, organization and collaborator repositories; ignores untrusted Link targets', async () => {
  const f = fixture(); const service = new AccountService(sessionStore(), f.request);
  await service.handle('connect', connect('github')); const result = await catalog(service);
  assert.equal(result.repositories.length, 3);
  assert.ok(f.requests.every(url => url.hostname === 'api.github.com'));
  assert.equal(f.requests[1].searchParams.get('affiliation'), 'owner,collaborator,organization_member');
  assert.ok(!JSON.stringify(result).includes('fixture-a')); assert.equal(result.credentialStorage, 'session');
});
test('Gitea smaller server page limits are not mistaken for the final page', async () => {
  const f = fixture(); const service = new AccountService(sessionStore(), f.request);
  await service.handle('connect', connect('gitea'));
  assert.equal((await catalog(service)).repositories.length, 2);
  assert.equal(f.requests.filter(url => url.pathname.endsWith('/user/repos')).length, 3);
});
test('same host supports multiple accounts, namespaces repository IDs and rejects duplicate identity', async () => {
  const f = fixture(); const service = new AccountService(sessionStore(), f.request);
  await Promise.all([service.handle('connect', connect('github')), service.handle('connect', connect('github', 'fixture-b'))]);
  const result = await catalog(service);
  assert.equal(result.accounts.length, 2); assert.equal(result.repositories.length, 6);
  assert.equal(new Set(result.repositories.map(repo => repo.id)).size, 6);
  await assert.rejects(service.handle('connect', connect('github')), /已经添加/);
  const first = result.accounts[0].id;
  await service.handle('removeAccount', { accountId: first });
  const after = await catalog(service); assert.equal(after.accounts.length, 1); assert.equal(after.repositories.length, 3);
  assert.ok(after.revision > result.revision);
});
test('authentication failure does not add an account or leak provider payload', async () => {
  const f = fixture(); const service = new AccountService(sessionStore(), f.request);
  await assert.rejects(service.handle('connect', connect('gitea', 'invalid')), /令牌无效/);
  assert.equal((await catalog(service)).accounts.length, 0);
});
test('repository failure preserves a verified account and supports isolated retries', async () => {
  const f = fixture(); const service = new AccountService(sessionStore(), f.request); f.setFailure(true);
  await service.handle('connect', connect('gitea')); let result = await catalog(service);
  assert.equal(result.accounts.length, 1); assert.equal(result.repositories.length, 0); assert.match(result.accounts[0].error!, /HTTP 503/);
  f.setFailure(false); await service.handle('refresh', { accountId: result.accounts[0].id }); result = await catalog(service);
  assert.equal(result.accounts[0].error, undefined); assert.equal(result.repositories.length, 2);
  f.setFailure(true); await service.handle('refresh', { accountId: result.accounts[0].id });
  assert.equal((await catalog(service)).repositories.length, 2);
});
test('failed credential persistence is atomic and does not poison later operations', async () => {
  const f = fixture(); let fail = true; let saved: SavedState | null = null;
  const store: CredentialStore = { kind: 'encrypted', load: async () => null, save: async state => { if (fail) throw new Error('Keychain unavailable'); saved = structuredClone(state); } };
  const service = new AccountService(store, f.request);
  await assert.rejects(service.handle('connect', connect('github')), /Keychain/);
  assert.equal((await catalog(service)).accounts.length, 0);
  fail = false; await service.handle('connect', connect('github')); assert.ok(saved);
  const restored = new AccountService({ ...store, load: async () => saved }, f.request);
  assert.equal((await catalog(restored)).accounts.length, 1);
  assert.ok(!JSON.stringify(await catalog(restored)).includes('fixture-a'));
});
test('corrupted saved state reports a failure without overwriting it', async () => {
  let writes = 0;
  const service = new AccountService({ kind: 'encrypted', load: async () => ({ version: 1 }), save: async () => { writes++; } });
  await assert.rejects(service.handle('catalog', {}), /存储格式无效/); assert.equal(writes, 0);
});
test('remote identities match HTTPS and SSH while not returning embedded credentials', () => {
  assert.equal(remoteIdentity('https://user:secret@GitHub.com/ALICE/project.git'), 'github.com/alice/project');
  assert.equal(remoteIdentity('git@github.com:alice/project.git'), 'github.com/alice/project');
  assert.equal(remoteIdentity('ssh://git@github.com:2222/alice/project.git'), 'github.com/alice/project');
  assert.equal(remoteIdentity('/Users/alice/project'), null);
});
test('local mapping verifies exact remote, handles spaces, reads real status/Diff and never changes Git state', async t => {
  const root = await mkdtemp(join(tmpdir(), 'gittogether-import-test-')); t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, 'checkout with spaces'); await mkdir(directory);
  const git = (args: string[]) => execute('git', ['-C', directory, ...args]);
  await git(['init', '-b', 'main']); await git(['config', 'user.email', 'fixture@example.test']); await git(['config', 'user.name', 'Fixture']);
  await git(['remote', 'add', 'origin', 'git@git.example.test:alice/project.git']);
  await writeFile(join(directory, 'test.txt'), 'before\n'); await git(['add', 'test.txt']); await git(['commit', '-m', 'Fixture initial']);
  await writeFile(join(directory, 'test.txt'), 'after\n'); await writeFile(join(directory, 'new file.txt'), 'untracked\n');
  const before = (await git(['status', '--porcelain'])).stdout; const head = (await git(['rev-parse', 'HEAD'])).stdout; const indexBefore = await readFile(join(directory, '.git', 'index'));
  const f = fixture(); const service = new AccountService(sessionStore(), f.request); await service.handle('connect', connect('gitea'));
  const initial = await catalog(service); const id = initial.repositories[0].id;
  await service.handle('link', { repositoryId: id, path: directory }); assert.equal((await catalog(service)).links[0].path, await realpath(directory));
  const snapshot = await service.handle('snapshot', { repositoryId: id }) as { files: { path: string }[]; branch: string };
  assert.equal(snapshot.branch, 'main'); assert.ok(snapshot.files.some(file => file.path === 'new file.txt'));
  const diff = await service.handle('diff', { repositoryId: id, path: 'test.txt' }) as { text: string };
  assert.match(diff.text, /\+after/); assert.match(diff.text, /-before/);
  await assert.rejects(service.handle('diff', { repositoryId: id, path: '../../secrets' }), /不在更改列表/);
  await assert.rejects(service.handle('link', { repositoryId: initial.repositories[1].id, path: directory }), /远端不是/);
  assert.equal((await catalog(service)).links.length, 1);
  f.setUnavailable(true); await service.handle('refresh', { accountId: initial.accounts[0].id });
  assert.equal((await catalog(service)).repositories.find(repo => repo.id === id)?.available, false); assert.equal((await catalog(service)).links.length, 1);
  await service.handle('unlink', { repositoryId: id }); assert.equal((await catalog(service)).links.length, 0);
  assert.equal((await git(['status', '--porcelain'])).stdout, before); assert.equal((await git(['rev-parse', 'HEAD'])).stdout, head); assert.deepEqual(await readFile(join(directory, '.git', 'index')), indexBefore);
  assert.equal(await readFile(join(directory, 'test.txt'), 'utf8'), 'after\n');
});
test('local API rejects foreign origins, missing custom header, GET and malformed JSON', async t => {
  const f = fixture(); const middleware = importMiddleware(new AccountService(sessionStore(), f.request));
  const server = createServer((req, res) => { void middleware(req, res, () => { res.statusCode = 404; res.end(); }); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address !== 'string'); const host = `http://127.0.0.1:${address.port}`;
  const endpoint = `${host}/api/import/catalog`; const headers = { 'Content-Type': 'application/json', 'X-GitTogether-Client': '1', Origin: host };
  assert.equal((await fetch(endpoint, { method: 'POST', headers, body: '{}' })).status, 200);
  assert.equal((await fetch(endpoint, { method: 'POST', headers: { ...headers, Origin: 'https://foreign.test' }, body: '{}' })).status, 403);
  assert.equal((await fetch(endpoint, { method: 'POST', body: '{}' })).status, 403);
  assert.equal((await fetch(endpoint, { headers })).status, 405);
  assert.equal((await fetch(endpoint, { method: 'POST', headers, body: '{broken' })).status, 400);
});
