import test from 'node:test';
import assert from 'node:assert/strict';
import { AccountService, sessionStore } from '../server/account-service';
import { isCatalog } from '../src/import-model';
import { matchesRepositoryType, repositoryTypeCoverage } from '../src/dashboard-filters';

const input = (provider: 'github' | 'gitea') => ({ provider, host: 'https://git.fixture.test', token: 'fixture-not-a-credential', name: 'Fixture' });
const raw = (id: number, name: string, fork?: boolean) => ({ id, full_name: name, name: name.split('/')[1], ...(fork === undefined ? {} : { fork }), owner: { type: 'User' }, default_branch: 'main', private: false });
async function catalog(service: AccountService) { const result = await service.handle('catalog', {}); assert.ok(isCatalog(result)); return result; }

test('GitHub follows locally constructed pages beyond an empty intermediate page', async () => {
  const calls: URL[] = [];
  const service = new AccountService(sessionStore(), async url => {
    const endpoint = new URL(String(url)); calls.push(endpoint);
    if (endpoint.pathname === '/user') return Response.json({ login: 'alice' });
    if (endpoint.searchParams.get('affiliation') === 'collaborator') return Response.json([]);
    const page = Number(endpoint.searchParams.get('page'));
    return Response.json(page === 1 ? [raw(1, 'alice/original', false)] : page === 3 ? [raw(2, 'alice/fork', true)] : [], { headers: page < 3 ? { Link: '<https://evil.test/credential-trap>; rel="next"' } : {} });
  });
  await service.handle('connect', input('github'));
  const result = await catalog(service);
  assert.equal(result.repositories.length, 2); assert.equal(result.repositories.find(repo => repo.remoteId === 2)?.fork, true);
  assert.ok(calls.every(url => url.host === 'api.github.com'));
  assert.deepEqual(calls.filter(url => url.pathname === '/user/repos' && url.searchParams.get('affiliation') !== 'collaborator').map(url => url.searchParams.get('page')), ['1', '2', '3', '4']);
});

test('broken continuation with three empty pages is bounded and not reported as a complete empty directory', async () => {
  let pages = 0;
  const service = new AccountService(sessionStore(), async url => {
    const endpoint = new URL(String(url));
    if (endpoint.pathname === '/user') return Response.json({ login: 'alice' });
    pages++; return Response.json([], { headers: { 'X-Total-Count': '9' } });
  });
  await service.handle('connect', input('github')); const result = await catalog(service);
  assert.equal(pages, 3); assert.equal(result.repositories.length, 0); assert.match(result.accounts[0].error!, /连续未返回新记录/);
});

test('a missing Fork flag is hydrated from the matched repository detail, not guessed', async () => {
  const service = new AccountService(sessionStore(), async url => {
    const endpoint = new URL(String(url));
    if (endpoint.pathname === '/user') return Response.json({ login: 'alice' });
    if (endpoint.pathname === '/repos/alice/fork') return Response.json(raw(1, 'alice/fork', true));
    return Response.json(endpoint.searchParams.get('page') === '1' && endpoint.searchParams.get('affiliation') !== 'collaborator' ? [raw(1, 'alice/fork')] : []);
  });
  await service.handle('connect', input('github')); const result = await catalog(service);
  assert.equal(result.repositories[0].fork, true); assert.equal(result.repositories[0].metadataError, undefined);
  assert.ok(matchesRepositoryType(result.repositories[0], new Set(['fork'])));
});

test('a sparse collaboration snapshot does not erase a confirmed Fork from the base catalog', async () => {
  const service = new AccountService(sessionStore(), async url => {
    const endpoint = new URL(String(url));
    if (endpoint.pathname === '/user') return Response.json({ login: 'alice' });
    if (endpoint.pathname.startsWith('/repos/')) throw new Error('Confirmed metadata must not need hydration');
    return Response.json(endpoint.searchParams.get('page') === '1' ? [raw(1, 'studio/fork', endpoint.searchParams.get('affiliation') === 'collaborator' ? undefined : true)] : []);
  });
  await service.handle('connect', input('github')); const result = await catalog(service);
  assert.equal(result.repositories[0].fork, true); assert.equal(result.repositories[0].collaborator, true); assert.equal(result.repositories[0].metadataError, undefined);
});

test('repeated duplicate pages with inconsistent totals cannot cause ten thousand extra requests', async () => {
  let pages = 0;
  const service = new AccountService(sessionStore(), async url => {
    const endpoint = new URL(String(url));
    if (endpoint.pathname === '/user') return Response.json({ login: 'alice' });
    pages++; return Response.json([raw(1, 'alice/own', false)], { headers: { 'X-Total-Count': '99' } });
  });
  await service.handle('connect', input('github')); const result = await catalog(service);
  assert.equal(pages, 4); assert.match(result.accounts[0].error!, /连续未返回新记录/);
});

test('a wrong repository detail cannot turn an unknown record into a Fork', async () => {
  const service = new AccountService(sessionStore(), async url => {
    const endpoint = new URL(String(url));
    if (endpoint.pathname === '/user') return Response.json({ login: 'alice' });
    if (endpoint.pathname === '/repos/alice/unknown') return Response.json(raw(999, 'other/fork', true));
    return Response.json(endpoint.searchParams.get('page') === '1' && endpoint.searchParams.get('affiliation') !== 'collaborator' ? [raw(1, 'alice/unknown')] : []);
  });
  await service.handle('connect', input('github')); const result = await catalog(service);
  assert.equal(result.repositories[0].fork, undefined); assert.match(result.repositories[0].metadataError!, /来源分类未能读取/);
  assert.deepEqual(repositoryTypeCoverage(result.repositories, new Set(['fork'])).unknown, 1);
  assert.ok(!matchesRepositoryType(result.repositories[0], new Set(['original'])));
});

test('Gitea merges paged Fork and collaboration discoveries while keeping direct Added separate from team access', async () => {
  const calls: URL[] = [];
  const service = new AccountService(sessionStore(), async url => {
    const endpoint = new URL(String(url)); calls.push(endpoint);
    if (endpoint.pathname === '/api/v1/user') return Response.json({ id: 7, login: 'alice' });
    if (endpoint.pathname === '/api/v1/user/repos') return Response.json(endpoint.searchParams.get('page') === '1' ? [raw(1, 'alice/original', false)] : []);
    if (endpoint.pathname === '/api/v1/repos/search') {
      assert.equal(endpoint.searchParams.get('uid'), '7'); assert.equal(endpoint.searchParams.get('exclusive'), 'false');
      const page = Number(endpoint.searchParams.get('page'));
      const fork = endpoint.searchParams.get('mode') === 'fork';
      return Response.json({ ok: true, data: fork ? page === 1 ? [raw(2, 'alice/fork', true)] : page === 3 ? [raw(3, 'studio/added-fork', true)] : [] : page === 1 ? [raw(3, 'studio/added-fork', true), raw(4, 'studio/team', false)] : [] }, { headers: fork && page < 3 ? { Link: '<https://evil.test/page>; rel="next"' } : {} });
    }
    if (endpoint.pathname === '/api/v1/orgs/studio') return Response.json({ username: 'studio' });
    if (endpoint.pathname === '/api/v1/repos/studio/added-fork/collaborators/alice') return new Response(null, { status: 204 });
    return new Response('PRIVATE_PROVIDER_BODY', { status: 404 });
  });
  await service.handle('connect', input('gitea')); const result = await catalog(service);
  assert.equal(result.repositories.length, 4); assert.equal(new Set(result.repositories.map(repo => repo.remoteId)).size, 4);
  assert.deepEqual(result.repositories.filter(repo => matchesRepositoryType(repo, new Set(['fork']))).map(repo => repo.remoteId).sort(), [2, 3]);
  assert.deepEqual(result.repositories.filter(repo => matchesRepositoryType(repo, new Set(['added']))).map(repo => repo.remoteId), [3]);
  assert.equal(result.repositories.find(repo => repo.remoteId === 4)?.collaborator, undefined);
  assert.ok(calls.every(url => url.host === 'git.fixture.test')); assert.ok(!JSON.stringify(result).includes(input('gitea').token)); assert.ok(!JSON.stringify(result).includes('PRIVATE_PROVIDER_BODY'));
});

test('Gitea extra catalogs are still queried when the base snapshot is empty', async () => {
  const service = new AccountService(sessionStore(), async url => {
    const endpoint = new URL(String(url));
    if (endpoint.pathname === '/api/v1/user') return Response.json({ id: 7, login: 'alice' });
    if (endpoint.pathname.endsWith('/user/repos')) return Response.json([]);
    if (endpoint.pathname.endsWith('/repos/search')) return Response.json({ ok: true, data: endpoint.searchParams.get('page') === '1' && endpoint.searchParams.get('mode') === 'fork' ? [raw(1, 'alice/fork', true)] : [] });
    return new Response(null, { status: 404 });
  });
  await service.handle('connect', input('gitea')); const result = await catalog(service);
  assert.equal(result.repositories.length, 1); assert.equal(result.repositories[0].fork, true); assert.equal(result.accounts[0].error, undefined);
});

test('Gitea queued classification requests each receive their own timeout signal', async () => {
  const signals: AbortSignal[] = [];
  const service = new AccountService(sessionStore(), async (url, init) => {
    const endpoint = new URL(String(url));
    if (endpoint.pathname.endsWith('/user')) return Response.json({ id: 7, login: 'alice' });
    if (endpoint.pathname.endsWith('/user/repos')) return Response.json(endpoint.searchParams.get('page') === '1' ? Array.from({ length: 12 }, (_, i) => raw(i + 1, `studio/repo-${i}`, false)) : []);
    if (endpoint.pathname.endsWith('/repos/search')) return Response.json({ ok: true, data: [] });
    assert.ok(init?.signal); signals.push(init.signal);
    if (endpoint.pathname === '/api/v1/orgs/studio') return Response.json({ username: 'studio' });
    return new Response(null, { status: 204 });
  });
  await service.handle('connect', input('gitea')); const result = await catalog(service);
  assert.equal(result.repositories.filter(repo => repo.collaborator === true).length, 12);
  assert.equal(signals.length, 13); assert.equal(new Set(signals).size, signals.length);
});

test('supplement failure is visible even when base records have known Fork flags', async () => {
  const service = new AccountService(sessionStore(), async url => {
    const endpoint = new URL(String(url));
    if (endpoint.pathname.endsWith('/user')) return Response.json({ id: 7, login: 'alice' });
    if (endpoint.pathname.endsWith('/user/repos')) return Response.json(endpoint.searchParams.get('page') === '1' ? [raw(1, 'alice/own', false)] : []);
    return new Response('PRIVATE_PROVIDER_BODY', { status: 403 });
  });
  await service.handle('connect', input('gitea')); const result = await catalog(service);
  assert.equal(result.repositories.length, 1); assert.equal(result.accounts[0].error, undefined);
  const coverage = repositoryTypeCoverage(result.repositories, new Set(['fork']));
  assert.equal(coverage.unknown, 0); assert.ok(coverage.errors.some(error => /补充目录未能读取/.test(error)));
  assert.equal(repositoryTypeCoverage(result.repositories, null).errors.length, 0);
  assert.equal(repositoryTypeCoverage(result.repositories, new Set()).errors.length, 0);
  assert.ok(!JSON.stringify(result).includes('PRIVATE_PROVIDER_BODY'));
});

test('failed empty Gitea refresh preserves the last successful account directory', async () => {
  let failing = false;
  const service = new AccountService(sessionStore(), async url => {
    const endpoint = new URL(String(url));
    if (endpoint.pathname.endsWith('/user')) return Response.json({ id: 7, login: 'alice' });
    if (endpoint.pathname.endsWith('/user/repos')) return Response.json(!failing && endpoint.searchParams.get('page') === '1' ? [raw(1, 'alice/own', false)] : []);
    return failing ? new Response(null, { status: 403 }) : Response.json({ ok: true, data: [] });
  });
  await service.handle('connect', input('gitea')); const before = await catalog(service);
  failing = true; await service.handle('refresh', { accountId: before.accounts[0].id }); const after = await catalog(service);
  assert.deepEqual(after.repositories, before.repositories); assert.match(after.accounts[0].error!, /补充目录未能读取/);
});

test('classification coverage counts only uncertain excluded rows, not known matches or deliberate empty selections', () => {
  const account = { id: 'a', provider: 'github' as const, host: 'https://github.com', login: 'alice', name: 'Alice', updatedAt: '' };
  const records = [raw(1, 'alice/known', true), raw(2, 'alice/unknown')].map(value => ({ id: `a:${value.id}`, remoteId: value.id, accountId: account.id, fullName: value.full_name, name: value.name, fork: value.fork, url: '', private: false, defaultBranch: '', description: '', available: true, collaborator: undefined }));
  assert.equal(repositoryTypeCoverage(records, new Set(['fork'])).unknown, 1);
  assert.equal(repositoryTypeCoverage(records, new Set(['added'])).unknown, 2);
  assert.equal(repositoryTypeCoverage(records, new Set(['fork', 'added'])).unknown, 1);
  assert.equal(repositoryTypeCoverage(records, null).unknown, 0);
  assert.equal(repositoryTypeCoverage(records, new Set()).unknown, 0);
});
