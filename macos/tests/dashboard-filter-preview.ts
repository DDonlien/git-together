// Isolated production App / AccountService QA. Synthetic identities and paths;
// no user tokens, directories, authorization helper or Git writes.
import { createServer } from 'node:http';
import { createInterface } from 'node:readline';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { AccountService, type SavedState } from '../server/account-service';
import { importMiddleware } from '../server/http-api';
import type { RemoteRepository } from '../src/import-model';

const repository = (id: number, accountId: string, fullName: string, ownerType: 'organization' | 'user' | undefined, fork: boolean | undefined, collaborator: boolean | undefined): RemoteRepository => ({ id: `${accountId}:${id}`, accountId, remoteId: id, name: fullName.split('/')[1], fullName, description: '隔离筛选验证，不是你的仓库', defaultBranch: 'main', private: false, available: true, url: `https://github.com/${fullName}`, ownerType, fork, collaborator, permissions: { push: collaborator === true, pull: true } });
let state: SavedState = { version: 2, accounts: ['alice', 'bob'].map(login => ({ account: { id: login, name: 'Team', login, provider: 'github', host: 'https://github.com', updatedAt: '2026-10-07T12:00:00Z' }, token: `fixture-only-${login}` })), repositories: [
  repository(1, 'alice', 'studio/source', 'organization', false, false),
  repository(2, 'alice', 'studio/fork', 'organization', true, false),
  repository(3, 'alice', 'studio/shared-fork', 'organization', true, true),
  repository(4, 'alice', 'alice/personal', 'user', false, false),
  repository(5, 'alice', 'hidden/unknown', undefined, undefined, undefined),
  repository(1, 'bob', 'studio/bob-source', 'organization', false, false),
  repository(2, 'bob', 'bob/bob-personal', 'user', false, true),
], links: [{ repositoryId: 'alice:1', path: '/gittogether-isolated-qa/nonexistent/source' }, { repositoryId: 'bob:2', path: '/gittogether-isolated-qa/nonexistent/bob-personal' }] };
const service = new AccountService({ kind: 'session', load: async () => structuredClone(state), save: async next => { state = structuredClone(next); } }, async (url, init) => {
  const endpoint = new URL(String(url)); const login = new Headers(init?.headers).get('Authorization')?.endsWith('bob') ? 'bob' : 'alice';
  if (endpoint.pathname === '/user') return Response.json({ login });
  const selected = state.repositories.filter(repo => repo.accountId === login && (endpoint.searchParams.get('affiliation') !== 'collaborator' || repo.collaborator === true));
  return Response.json(endpoint.searchParams.get('page') === '1' ? selected.map(repo => ({ id: repo.remoteId, name: repo.name, full_name: repo.fullName, description: repo.description, default_branch: repo.defaultBranch, fork: repo.fork, owner: repo.ownerType ? { login: repo.fullName.split('/')[0], type: repo.ownerType === 'organization' ? 'Organization' : 'User' } : undefined, permissions: repo.permissions })) : []);
});
const middleware = importMiddleware(service); const root = resolve('dist/client');
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
  if (line === 'refresh') { await service.handle('refresh', { accountId: 'alice' }); console.log('QA_CATALOG_REFRESHED'); }
  if (line === 'add-org') { state.repositories.push(repository(6, 'alice', 'new-studio/new-source', 'organization', false, false)); await service.handle('refresh', { accountId: 'alice' }); console.log('QA_ORGANIZATION_ADDED'); }
  if (line === 'state') { const catalog = await service.handle('catalog', {}) as { revision: number; repositories: unknown[] }; console.log(JSON.stringify({ fixtureOnly: true, revision: catalog.revision, repositories: catalog.repositories.length })); }
  if (line === 'quit') { terminal.close(); server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); console.log('ISOLATED_QA_STOPPED'); }
})().catch(error => console.error(error instanceof Error ? error.message : 'QA failed')); });
