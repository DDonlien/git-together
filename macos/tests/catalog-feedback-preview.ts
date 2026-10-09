// Isolated production UI + real AccountService/HTTP chain. No user credentials,
// user directories, authorization helper, or real Git operations.
import { createServer } from 'node:http';
import { createInterface } from 'node:readline';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { AccountService, sessionStore } from '../server/account-service';
import { importMiddleware } from '../server/http-api';
import { isCatalog } from '../src/import-model';

let denied = false; let reads = 0; let writes = 0;
const raw = (id: number, fullName: string, fork?: boolean) => ({ id, full_name: fullName, name: fullName.split('/')[1], description: '隔离验证 · 合成仓库，不是你的账号数据', private: id === 3, default_branch: 'main', ...(fork === undefined ? {} : { fork }) });
const service = new AccountService(sessionStore(), async (url, init) => {
  if (init?.method !== 'GET') { writes++; throw new Error('Fixture refuses Git writes'); }
  reads++;
  const endpoint = new URL(String(url)); const page = Number(endpoint.searchParams.get('page'));
  if (endpoint.pathname === '/api/v1/user') return Response.json({ id: 42, login: 'fixture' });
  if (endpoint.pathname === '/api/v1/user/repos') return Response.json(page === 1 ? [raw(1, 'fixture/original', false), raw(4, 'hidden/unconfirmed')] : [], { headers: { 'X-Total-Count': '2' } });
  if (endpoint.pathname === '/api/v1/repos/search') {
    if (denied) return new Response(null, { status: 403 });
    if (endpoint.searchParams.get('mode') === 'fork') return Response.json({ ok: true, data: page === 1 ? [raw(2, 'fixture/fork', true)] : page === 3 ? [raw(3, 'studio/added-fork', true)] : [] }, { headers: page < 3 ? { Link: '<https://ignored.fixture.test/next>; rel="next"' } : {} });
    return Response.json({ ok: true, data: page === 1 ? [raw(3, 'studio/added-fork', true), raw(5, 'studio/team', false)] : [] });
  }
  if (endpoint.pathname === '/api/v1/orgs/studio') return Response.json({ username: 'studio' });
  if (endpoint.pathname === '/api/v1/repos/studio/added-fork/collaborators/fixture') return new Response(null, { status: 204 });
  return new Response(null, { status: 404 });
});
await service.handle('connect', { provider: 'gitea', host: 'https://git.fixture.test', name: '隔离 Gitea 验证', token: 'fixture-only-not-a-credential' });
const middleware = importMiddleware(service); const root = resolve(process.env.GITTOGETHER_QA_CLIENT || 'dist/client');
const server = createServer((request, response) => { void middleware(request, response, () => { void (async () => {
  const address = server.address(); const authority = typeof address === 'object' && address ? `127.0.0.1:${address.port}` : '';
  if (request.headers.host !== authority || (request.headers.origin && request.headers.origin !== `http://${authority}`)) { response.statusCode = 403; response.end(); return; }
  if (request.method !== 'GET') { response.statusCode = 405; response.end(); return; }
  const url = new URL(request.url || '/', `http://${authority}`); const path = resolve(root, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
  if (!path.startsWith(`${root}${sep}`)) { response.statusCode = 403; response.end(); return; }
  response.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' } as Record<string, string>)[extname(path)] || 'application/octet-stream');
  response.setHeader('Cache-Control', 'no-store'); response.end(await readFile(path));
})().catch(() => { response.statusCode = 404; response.end(); }); }); });
await new Promise<void>(done => server.listen(0, '127.0.0.1', done)); const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing QA port');
console.log(JSON.stringify({ preview: `http://127.0.0.1:${address.port}`, fixtureOnly: true, productionUI: true }));
const terminal = createInterface({ input: process.stdin });
terminal.on('line', line => { void (async () => {
  if (line === 'deny' || line === 'recover') { denied = line === 'deny'; const before = await service.handle('catalog', {}); if (!isCatalog(before)) throw new Error('Invalid catalog'); await service.handle('refresh', { accountId: before.accounts[0].id }); }
  if (line === 'state' || line === 'deny' || line === 'recover') { const result = await service.handle('catalog', {}); if (!isCatalog(result)) throw new Error('Invalid catalog'); console.log(JSON.stringify({ fixtureOnly: true, reads, writes, revision: result.revision, repositories: result.repositories.map(repo => ({ name: repo.name, fork: repo.fork, added: repo.collaborator, error: !!repo.metadataError })) })); }
  if (line === 'quit') { terminal.close(); server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); console.log('ISOLATED_QA_STOPPED'); }
})().catch(error => console.error(error instanceof Error ? error.message : 'QA failed')); });
