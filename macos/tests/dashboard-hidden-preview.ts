// Production-App Hide/Restore fixture with an isolated real Git repository.
// No user account, preference origin or Git checkout is used by this preview.
import { createServer } from 'node:http';
import { createInterface } from 'node:readline';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { importMiddleware } from '../server/http-api';
import { isCatalog } from '../src/import-model';
import { createRemoteServiceFixture } from './remote-service-fixture';

const fixture = await createRemoteServiceFixture('gitea');
const catalog = await fixture.service.handle('catalog', {});
if (!isCatalog(catalog)) throw new Error('Invalid fixture catalog');
await fixture.git(fixture.directory, ['remote', 'add', 'origin', catalog.repositories[0].url]);
await fixture.service.handle('link', { repositoryId: fixture.repositoryId, path: fixture.directory, branch: 'main' });
const middleware = importMiddleware(fixture.service);
const root = resolve('dist/client');
const server = createServer((request, response) => {
  void middleware(request, response, () => {
    void (async () => {
      const path = resolve(root, `.${decodeURIComponent(request.url === '/' ? '/index.html' : request.url || '/')}`);
      if (!path.startsWith(`${root}${sep}`)) { response.statusCode = 403; response.end(); return; }
      response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' } as Record<string, string>)[extname(path)] || 'application/octet-stream');
      response.end(await readFile(path));
    })().catch(() => { response.statusCode = 404; response.end(); });
  });
});
await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Missing preview address');
console.log(JSON.stringify({ url: `http://127.0.0.1:${address.port}`, fixtureOnly: true, productionUI: true }));
const terminal = createInterface({ input: process.stdin });
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  terminal.close(); server.closeAllConnections();
  await new Promise<void>(done => server.close(() => done()));
  await fixture.cleanup(); console.log('ISOLATED_QA_STOPPED');
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void stop().catch(error => { console.error(error); process.exitCode = 1; }); });
terminal.on('line', line => { void (async () => {
  if (line !== 'state' && line !== 'quit') return;
  const current = await fixture.service.handle('catalog', {});
  if (!isCatalog(current)) throw new Error('Invalid fixture catalog');
  console.log(JSON.stringify({ fixtureOnly: true, accounts: current.accounts.length, repositories: current.repositories.length, links: current.links.length, gitUnchanged: await fixture.unchanged() }));
  if (line === 'quit') await stop();
})().catch(error => { console.error(error instanceof Error ? error.message : 'QA failed'); process.exitCode = 1; }); });
