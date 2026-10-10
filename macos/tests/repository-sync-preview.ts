import { createServer } from 'node:http';
import { createInterface } from 'node:readline';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { extname, resolve, sep, join } from 'node:path';
import { importMiddleware } from '../server/http-api';
import { diagnosticsMiddleware } from '../server/diagnostics-http';
import { LocalDiagnostics } from '../server/diagnostics';
import { createGitNetworkFixture } from './git-network-fixture';
import { generateWithCodex } from '../server/commit-generator';

const realAI = process.argv.includes('--real-ai');
const fixture = await createGitNetworkFixture(realAI ? generateWithCodex : undefined);
const feature = join(fixture.root, 'feature'); await fixture.git(fixture.directory, ['worktree', 'add', '-b', 'feature', feature]); await fixture.git(fixture.directory, ['push', fixture.bare, 'feature']);
await fixture.service.handle('link', { repositoryId: fixture.repository.id, path: feature, branch: 'feature' });
await writeFile(join(fixture.directory, 'README.md'), 'main working changes\n'); await writeFile(join(feature, 'feature.txt'), 'feature working changes\n');
const middleware = importMiddleware(fixture.service), root = resolve('dist/client');
const diagnostics = new LocalDiagnostics(join(fixture.root, 'logs'), 'test', { timer: false }); const routes = diagnosticsMiddleware(diagnostics);
const server = createServer((req, res) => { void routes(req, res, () => { void middleware(req, res, () => { void (async () => {
  const address = server.address(), authority = typeof address === 'object' && address ? `127.0.0.1:${address.port}` : '';
  if (req.headers.host !== authority || req.headers.origin && req.headers.origin !== `http://${authority}`) { res.statusCode = 403; res.end(); return; }
  const url = new URL(req.url || '/', `http://${authority}`);
  if (url.pathname === '/qa/advance' && req.method === 'POST') { await fixture.advance('remote runtime update\n'); res.end('{}'); return; }
  if (url.pathname === '/qa/dirty' && req.method === 'POST') { await writeFile(join(fixture.directory, 'extra.tmp'), 'temporary change'); res.end('{}'); return; }
  if (req.method !== 'GET') { res.statusCode = 405; res.end(); return; }
  const path = resolve(root, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
  if (!path.startsWith(`${root}${sep}`)) { res.statusCode = 403; res.end(); return; }
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' } as Record<string, string>)[extname(path)] || 'application/octet-stream'); res.end(await readFile(path));
})().catch(() => { res.statusCode = 404; res.end(); }); }); }); });
await new Promise<void>(done => server.listen(0, '127.0.0.1', done)); const address = server.address(); if (!address || typeof address === 'string') throw new Error('QA port unavailable');
console.log(JSON.stringify({ preview: `http://127.0.0.1:${address.port}`, fixtureOnly: true, realGitAndLFS: true, realAI }));
const terminal = createInterface({ input: process.stdin });
let stopped = false;
async function stop() { if (stopped) return; stopped = true; terminal.close(); server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); diagnostics.close(); await fixture.cleanup(); console.log(JSON.stringify({ removed: true, realUserRepositoriesChanged: false })); }
process.once('SIGINT', () => { void stop(); }); process.once('SIGTERM', () => { void stop(); });
terminal.on('line', line => { void (async () => {
  if (line === 'state') console.log(JSON.stringify({ local: await fixture.git(fixture.directory, ['status', '--porcelain']), main: await fixture.git(fixture.directory, ['log', '-1', '--format=%s']), feature: await fixture.git(feature, ['status', '--porcelain']), remote: await fixture.git(fixture.bare, ['log', '-1', '--format=%s', 'main']) }));
  if (line === 'quit') await stop();
})().catch(p => console.error(p instanceof Error ? p.message : 'QA failure')); });
