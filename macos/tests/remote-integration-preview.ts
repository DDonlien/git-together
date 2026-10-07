// Production-built App + real AccountService/HTTP/client DTO + real temporary
// Git. Synthetic provider only; never a substitute for live account acceptance.
import { createServer } from 'node:http';
import { createInterface } from 'node:readline';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { importMiddleware } from '../server/http-api';
import { createRemoteServiceFixture } from './remote-service-fixture';

const fileOpen = process.argv.includes('--file-open');
const fixture = await createRemoteServiceFixture('gitea', { treeChanges: fileOpen });
if (fileOpen) {
  await writeFile(resolve(fixture.directory, 'GitTogether-open-proof.txt'), 'GitTogether file-open verification\n\nThis is an isolated temporary test file, not a user repository.\n');
  await fixture.git(fixture.directory, ['remote', 'add', 'origin', 'https://git.fixture.test/qa/project.git']);
  await fixture.service.handle('link', { repositoryId: fixture.repositoryId, path: fixture.directory });
}
const middleware = importMiddleware(fixture.service); const root = resolve('dist/client');
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
console.log(JSON.stringify({ preview: `http://127.0.0.1:${address.port}`, fixtureOnly: true, productionAppAndService: true, localLinks: fileOpen ? 1 : 0, ...(fileOpen ? { testFile: resolve(fixture.directory, 'GitTogether-open-proof.txt') } : {}) }));
const terminal = createInterface({ input: process.stdin });
terminal.on('line', line => { void (async () => {
  if (line === 'state') console.log(JSON.stringify({ fixtureOnly: true, providerRequests: fixture.requests.length, branchesRequests: fixture.calls.filter(path => path.includes('/branches?')).length, repositoryReads: fixture.calls.length, gitUnchanged: await fixture.unchanged() }));
  if (line === 'quit') { terminal.close(); server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); const unchanged = await fixture.unchanged(); await fixture.cleanup(); console.log(JSON.stringify({ stopped: true, fixtureRemoved: true, gitUnchanged: unchanged, userDataChanged: false })); }
})().catch(problem => console.error(problem instanceof Error ? problem.message : 'QA failed')); });
