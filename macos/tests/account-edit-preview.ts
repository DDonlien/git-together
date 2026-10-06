// Isolated UI QA: production app + real AccountService, fake provider and no user credentials or Git directories.
import { createServer } from 'node:http';
import { createInterface } from 'node:readline';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { AccountService, type SavedState } from '../server/account-service';
import { importMiddleware } from '../server/http-api';
import { isCatalog } from '../src/import-model';

let state: SavedState = { version: 2, accounts: [
  { account: { id: 'qa-gitea', name: 'Gitea 测试账号', login: 'fixture-gitea', provider: 'gitea', host: 'https://git.fixture.test', updatedAt: '' }, token: 'fixture-gitea-old' },
  { account: { id: 'qa-github', name: 'GitHub 测试账号', login: 'fixture-github', provider: 'github', host: 'https://github.com', updatedAt: '' }, token: 'fixture-github-old' },
], repositories: [
  { id: 'qa-gitea:1', accountId: 'qa-gitea', remoteId: 1, name: 'project', fullName: 'fixture-org/project', description: '隔离测试仓库', defaultBranch: 'main', private: false, available: true, url: 'https://git.fixture.test/fixture-org/project' },
  { id: 'qa-github:1', accountId: 'qa-github', remoteId: 1, name: 'project', fullName: 'fixture-org/project', description: '隔离测试仓库', defaultBranch: 'main', private: false, available: true, url: 'https://github.com/fixture-org/project' },
], links: [] };
let writes = 0; let requests = 0; let hold = false; let holdSave = false; let failRemove = false; let release: (() => void) | null = null;
const service = new AccountService({ kind: 'session', load: async () => structuredClone(state), save: async next => {
  if (holdSave) { holdSave = false; await new Promise<void>(done => { release = done; }); }
  if (failRemove && next.accounts.length < state.accounts.length) { failRemove = false; throw new Error('隔离测试：移除失败，请重试。'); }
  state = structuredClone(next); writes++;
} }, async (input, init) => {
  requests++; const url = new URL(String(input)); const token = new Headers(init?.headers).get('Authorization')?.split(' ')[1];
  if (url.pathname.endsWith('/user') && hold) { hold = false; await new Promise<void>(done => { release = done; }); }
  if (token === 'fixture-invalid') return new Response('fixture only', { status: 401 });
  if (url.pathname.endsWith('/user')) return Response.json({ login: token === 'fixture-other' ? 'other-user' : url.hostname === 'api.github.com' ? 'fixture-github' : 'fixture-gitea' });
  return Response.json(url.searchParams.get('page') === '1' ? [{ id: 1, name: 'project', full_name: 'fixture-org/project', default_branch: token === 'fixture-gitea-new' ? 'updated' : 'main', private: false, description: '隔离测试仓库' }] : []);
});
const middleware = importMiddleware(service);
const root = resolve('dist/client');
const server = createServer((request, response) => { void middleware(request, response, () => { void (async () => {
  const address = server.address(); const authority = typeof address === 'object' && address ? `127.0.0.1:${address.port}` : '';
  if (request.headers.host !== authority || request.headers.origin && request.headers.origin !== `http://${authority}`) { response.statusCode = 403; response.end(); return; }
  if (request.method !== 'GET') { response.statusCode = 405; response.end(); return; }
  const url = new URL(request.url || '/', `http://${authority}`);
  const path = resolve(root, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
  if (!path.startsWith(`${root}${sep}`)) { response.statusCode = 403; response.end(); return; }
  response.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' } as Record<string, string>)[extname(path)] || 'application/octet-stream');
  response.setHeader('Cache-Control', 'no-store'); response.end(await readFile(path));
})().catch(() => { response.statusCode = 404; response.end(); }); }); });
await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing isolated QA port');
console.log(JSON.stringify({ preview: `http://127.0.0.1:${address.port}`, fixtureOnly: true, productionUI: true }));
const terminal = createInterface({ input: process.stdin });
terminal.on('line', line => { void (async () => {
  if (line === 'hold') { hold = true; console.log('HOLD_READY'); }
  if (line === 'hold-save') { holdSave = true; console.log('HOLD_SAVE_READY'); }
  if (line === 'fail-remove') { failRemove = true; console.log('FAIL_REMOVE_READY'); }
  if (line === 'release') { release?.(); release = null; console.log('UPDATE_RELEASED'); }
  if (line === 'state') {
    const catalog = await service.handle('catalog', {}); if (!isCatalog(catalog)) throw new Error('Bad QA catalog');
    console.log(JSON.stringify({ fixtureOnly: true, writes, requests, revision: catalog.revision, accounts: catalog.accounts.map(account => ({ id: account.id, name: account.name, login: account.login })), repositories: catalog.repositories.map(repository => ({ id: repository.id, accountId: repository.accountId, branch: repository.defaultBranch })), links: catalog.links.length, giteaTokenRotated: state.accounts.find(item => item.account.id === 'qa-gitea')?.token === 'fixture-gitea-new' }));
  }
  if (line === 'quit') { release?.(); terminal.close(); server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); console.log('ISOLATED_QA_STOPPED_NO_USER_DATA_CHANGED'); }
})().catch(problem => console.error(problem instanceof Error ? problem.message : 'QA failed')); });
