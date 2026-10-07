import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { AccountService, sessionStore } from '../server/account-service';
import { importMiddleware } from '../server/http-api';
import { isCatalog, type Catalog } from '../src/import-model';

const raw = (id: number, fullName: string, fork: boolean, ownerType = 'User') => ({ id, name: fullName.split('/')[1], full_name: fullName, fork, owner: { login: fullName.split('/')[0], type: ownerType }, permissions: { admin: false, maintain: false, push: true, triage: false, pull: true, unrelated: 'ignored' }, default_branch: 'main' });
const input = (provider: 'github' | 'gitea') => ({ provider, host: 'https://git.fixture.test', name: 'Fixture', token: 'fixture-only-not-a-credential' });
async function getCatalog(service: AccountService) { const result = await service.handle('catalog', {}); assert.ok(isCatalog(result)); return result; }

test('GitHub transmits true owner/fork/permissions and paged collaborator affiliation with account-bound IDs', async () => {
  const calls: URL[] = [];
  const request: typeof fetch = async url => {
    const endpoint = new URL(String(url)); calls.push(endpoint);
    if (endpoint.pathname === '/user') return Response.json({ login: 'alice' });
    const page = endpoint.searchParams.get('page');
    if (endpoint.searchParams.get('affiliation') === 'collaborator') return Response.json(page === '1' ? [raw(3, 'studio/shared-fork', true, 'Organization')] : [], { headers: page === '1' ? { Link: '<https://evil.test/next>; rel="next"' } : {} });
    return Response.json(page === '1' ? [raw(1, 'alice/source', false), raw(2, 'studio/team', false, 'Organization'), raw(3, 'studio/shared-fork', true, 'Organization')] : []);
  };
  const service = new AccountService(sessionStore(), request); await service.handle('connect', input('github'));
  const catalog = await getCatalog(service); const [source, shared, team] = catalog.repositories;
  assert.equal(source.ownerType, 'user'); assert.equal(source.fork, false); assert.equal(source.collaborator, false);
  assert.equal(shared.ownerType, 'organization'); assert.equal(shared.fork, true); assert.equal(shared.collaborator, true);
  assert.equal(team.ownerType, 'organization'); assert.equal(team.collaborator, false);
  assert.deepEqual(shared.permissions, { admin: false, maintain: false, push: true, triage: false, pull: true });
  assert.equal(shared.id, `${catalog.accounts[0].id}:3`); assert.ok(calls.every(url => url.host === 'api.github.com'));
  assert.equal(calls.filter(url => url.searchParams.get('affiliation') === 'collaborator').length, 2);
  assert.ok(!JSON.stringify(catalog).includes(input('github').token));
});
test('GitHub optional affiliation failure keeps the base directory and honest unknown metadata with a safe error', async () => {
  const service = new AccountService(sessionStore(), async url => {
    const endpoint = new URL(String(url)); if (endpoint.pathname === '/user') return Response.json({ login: 'alice' });
    if (endpoint.searchParams.get('affiliation') === 'collaborator') return new Response('PRIVATE_PROVIDER_BODY', { status: 403 });
    return Response.json(endpoint.searchParams.get('page') === '1' ? [raw(1, 'alice/source', false)] : []);
  });
  await service.handle('connect', input('github')); const catalog = await getCatalog(service);
  assert.equal(catalog.repositories.length, 1); assert.equal(catalog.repositories[0].fork, false); assert.equal(catalog.repositories[0].collaborator, undefined);
  assert.match(catalog.repositories[0].metadataError!, /协作分类未能读取/); assert.ok(!JSON.stringify(catalog).includes('PRIVATE_PROVIDER_BODY')); assert.equal(catalog.accounts[0].error, undefined);
});
test('missing provider fork/owner flags remain unknown rather than becoming guessed Original or organization', async () => {
  const service = new AccountService(sessionStore(), async url => {
    const endpoint = new URL(String(url)); if (endpoint.pathname === '/user') return Response.json({ login: 'alice' });
    return Response.json(endpoint.searchParams.get('page') === '1' && endpoint.searchParams.get('affiliation') !== 'collaborator' ? [{ id: 1, name: 'source', full_name: 'someone/source', permissions: { admin: true } }] : []);
  });
  await service.handle('connect', input('github')); const { repositories } = await getCatalog(service);
  assert.equal(repositories[0].fork, undefined); assert.equal(repositories[0].ownerType, undefined); assert.equal(repositories[0].collaborator, false);
});
test('Gitea confirms organizations and Added using dedicated endpoints, shares owner lookup and never infers membership from permissions', async () => {
  const calls: URL[] = [];
  const service = new AccountService(sessionStore(), async url => {
    const endpoint = new URL(String(url)); calls.push(endpoint);
    if (endpoint.pathname.endsWith('/user')) return Response.json({ login: 'alice' });
    if (endpoint.pathname.endsWith('/user/repos')) return Response.json(endpoint.searchParams.get('page') === '1' ? [raw(1, 'alice/own', false), raw(2, 'studio/team', false), raw(3, 'studio/shared', true)] : []);
    if (endpoint.pathname === '/api/v1/orgs/studio') return Response.json({ id: 9, username: 'studio' });
    if (endpoint.pathname.includes('/studio/shared/collaborators/')) return new Response(null, { status: 204 });
    return new Response('private hidden diagnostic', { status: 404 });
  });
  await service.handle('connect', input('gitea')); const catalog = await getCatalog(service);
  assert.equal(catalog.repositories[0].ownerType, 'user'); assert.equal(catalog.repositories[0].collaborator, false);
  assert.equal(catalog.repositories[1].ownerType, 'organization'); assert.equal(catalog.repositories[1].collaborator, true); assert.equal(catalog.repositories[1].fork, true);
  assert.equal(catalog.repositories[2].ownerType, 'organization'); assert.equal(catalog.repositories[2].collaborator, undefined);
  assert.equal(calls.filter(url => url.pathname === '/api/v1/orgs/studio').length, 1); assert.ok(calls.every(url => url.host === 'git.fixture.test'));
  assert.ok(calls.every(url => !url.pathname.includes('/alice/own/collaborators/'))); assert.ok(!JSON.stringify(catalog).includes('private hidden diagnostic'));
});
test('Gitea hidden organization and unavailable collaborator endpoints do not break catalog or invent classifications', async () => {
  const service = new AccountService(sessionStore(), async url => {
    const endpoint = new URL(String(url)); if (endpoint.pathname.endsWith('/user')) return Response.json({ login: 'alice' });
    if (endpoint.pathname.endsWith('/user/repos')) return Response.json(endpoint.searchParams.get('page') === '1' ? [raw(1, 'other/shared', false)] : []);
    return new Response('PRIVATE_PROVIDER_BODY', { status: 403 });
  });
  await service.handle('connect', input('gitea')); const catalog = await getCatalog(service);
  assert.equal(catalog.repositories.length, 1); assert.equal(catalog.repositories[0].ownerType, undefined); assert.equal(catalog.repositories[0].collaborator, undefined);
  assert.match(catalog.repositories[0].metadataError!, /归属分类未能读取/); assert.ok(!JSON.stringify(catalog).includes('PRIVATE_PROVIDER_BODY')); assert.equal(catalog.accounts[0].error, undefined);
});
test('a refreshed GitHub affiliation replaces previous metadata without disturbing same-host identities or local links', async () => {
  let added = true;
  const service = new AccountService(sessionStore(), async (url, init) => {
    const endpoint = new URL(String(url)); const token = new Headers(init?.headers).get('Authorization')!;
    if (endpoint.pathname === '/user') return Response.json({ login: token.endsWith('second') ? 'bob' : 'alice' });
    return Response.json(endpoint.searchParams.get('page') === '1' && (endpoint.searchParams.get('affiliation') !== 'collaborator' || added) ? [raw(1, 'studio/shared', true, 'Organization')] : []);
  });
  await service.handle('connect', input('github')); await service.handle('connect', { ...input('github'), token: 'fixture-second' });
  const before = await getCatalog(service); added = false; await service.handle('refresh', { accountId: before.accounts[0].id }); const after = await getCatalog(service);
  assert.equal(after.repositories.find(repo => repo.accountId === before.accounts[0].id)!.collaborator, false);
  assert.equal(after.repositories.find(repo => repo.accountId === before.accounts[1].id)!.collaborator, true);
  assert.deepEqual(after.links, before.links); assert.deepEqual(after.accounts.map(a => a.id), before.accounts.map(a => a.id));
});
test('production protected HTTP catalog chain returns classification DTO but no credentials', async t => {
  const service = new AccountService(sessionStore(), async url => {
    const endpoint = new URL(String(url)); if (endpoint.pathname === '/user') return Response.json({ login: 'alice' });
    return Response.json(endpoint.searchParams.get('page') === '1' ? [raw(1, 'studio/shared', true, 'Organization')] : []);
  });
  const middleware = importMiddleware(service); const server = createServer((request, response) => { void middleware(request, response, () => { response.statusCode = 404; response.end(); }); });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done)); t.after(() => new Promise<void>(done => server.close(() => done())));
  const address = server.address(); assert.ok(address && typeof address !== 'string'); const origin = `http://127.0.0.1:${address.port}`;
  const headers = { Origin: origin, 'Content-Type': 'application/json', 'X-GitTogether-Client': '1' };
  const connect = await fetch(`${origin}/api/import/connect`, { method: 'POST', headers, body: JSON.stringify(input('github')) }); assert.equal(connect.status, 200);
  const response = await fetch(`${origin}/api/import/catalog`, { method: 'POST', headers, body: '{}' });
  const body = await response.json() as { ok: boolean; value: Catalog }; assert.ok(body.ok && isCatalog(body.value));
  assert.equal(body.value.repositories[0].collaborator, true); assert.equal(body.value.repositories[0].ownerType, 'organization');
  assert.ok(!JSON.stringify(body).includes(input('github').token));
});
