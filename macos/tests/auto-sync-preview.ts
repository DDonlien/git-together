// Isolated browser QA only. No fixtures or control routes enter the app build.
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline';
import { AccountService, sessionStore } from '../server/account-service';
import { importMiddleware } from '../server/http-api';
import { isCatalog } from '../src/import-model';

const execute = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), 'gittogether-auto-sync-qa-'));
const directory = join(root, 'checkout'); await mkdir(directory);
const git = (args: string[]) => execute('git', ['-C', directory, ...args]);
await git(['init', '-b', 'main']); await git(['config', 'user.name', 'QA']); await git(['config', 'user.email', 'qa@example.test']);
await git(['remote', 'add', 'origin', 'git@git.example.test:qa/project.git']);
await writeFile(join(directory, 'app.ts'), 'export const value = 0;\n'); await git(['add', 'app.ts']); await git(['commit', '-m', 'QA initial']);
await writeFile(join(directory, 'app.ts'), 'export const value = 1;\n');
const initialHead = (await git(['rev-parse', 'HEAD'])).stdout;
const initialIndex = await readFile(join(directory, '.git/index'));
let includeNewRemote = false; let unavailable = false; let remoteRequests = 0;
const request: typeof fetch = async input => {
  const url = new URL(String(input));
  if (url.pathname.endsWith('/user')) return Response.json({ login: 'qa', name: 'QA Account' });
  remoteRequests++;
  if (unavailable) return new Response('', { status: 503 });
  return Response.json(Number(url.searchParams.get('page')) === 1 ? [
    { id: 1, name: 'project', full_name: 'qa/project', description: 'Isolated browser QA', private: true, default_branch: 'main' },
    ...(includeNewRemote ? [{ id: 2, name: 'new-remote', full_name: 'qa/new-remote', description: '', private: false, default_branch: 'main' }] : []),
  ] : []);
};
const service = new AccountService(sessionStore(), request);
const initial: unknown = await service.handle('connect', { provider: 'gitea', host: 'https://git.example.test', name: 'QA Account', token: 'fixture-only' });
if (!isCatalog(initial)) throw new Error('Invalid QA catalog');
await service.handle('link', { repositoryId: initial.repositories[0].id, path: directory });
const middleware = importMiddleware(service);
const client = resolve('dist/client');
const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => { void middleware(req, res, () => { void (async () => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const path = resolve(client, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
  if (!path.startsWith(`${client}/`)) { res.statusCode = 403; res.end(); return; }
  try { const body = await readFile(path); res.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream'); res.end(body); }
  catch { res.statusCode = 404; res.end(); }
})().catch(() => { res.statusCode = 500; res.end(); }); }); });
await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing QA port');
console.log(JSON.stringify({ preview: `http://127.0.0.1:${address.port}`, directory, fixtureOnly: true }));
const terminal = createInterface({ input: process.stdin });
let finishing = false;
async function finish() {
  if (finishing) return; finishing = true;
  terminal.close(); await new Promise<void>(done => server.close(() => done()));
  const headUnchanged = (await git(['rev-parse', 'HEAD'])).stdout === initialHead;
  const indexUnchanged = (await readFile(join(directory, '.git/index'))).equals(initialIndex);
  console.log(JSON.stringify({ headUnchanged, indexUnchanged, remoteRequests, cleanedFixture: root }));
  await rm(root, { recursive: true, force: true });
}
terminal.on('line', line => { void (async () => {
  if (line === 'edit') { await writeFile(join(directory, 'app.ts'), 'export const value = 2;\n'); console.log('QA_EDITED'); }
  if (line === 'add-file') { await writeFile(join(directory, 'new.ts'), 'export const newFile = true;\n'); console.log('QA_FILE_ADDED'); }
  if (line === 'clean') { await writeFile(join(directory, 'app.ts'), 'export const value = 0;\n'); await rm(join(directory, 'new.ts'), { force: true }); console.log('QA_WORKTREE_CLEAN'); }
  if (line === 'remote-add') { includeNewRemote = true; console.log('QA_REMOTE_ADDED'); }
  if (line === 'fail') { unavailable = true; console.log('QA_REMOTE_UNAVAILABLE'); }
  if (line === 'recover') { unavailable = false; console.log('QA_REMOTE_RECOVERED'); }
  if (line === 'state') { const catalog = await service.handle('catalog', {}); console.log(JSON.stringify({ catalog, remoteRequests })); }
  if (line === 'quit') await finish();
})().catch(problem => console.error(problem instanceof Error ? problem.message : 'QA failed')); });
process.on('SIGINT', () => { void finish(); });
process.on('SIGTERM', () => { void finish(); });
