// Production-built App + real AccountService/HTTP/client DTO + real temporary
// Git. Synthetic provider only; never a substitute for live account acceptance.
import { createServer } from 'node:http';
import { createInterface } from 'node:readline';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { importMiddleware } from '../server/http-api';
import { createRemoteServiceFixture } from './remote-service-fixture';
import { LocalDiagnostics } from '../server/diagnostics';
import { diagnosticsMiddleware } from '../server/diagnostics-http';

const fileOpen = process.argv.includes('--file-open');
const worktreeQA = process.argv.includes('--worktrees');
const localHistoryQA = process.argv.includes('--local-history');
const fixture = await createRemoteServiceFixture('gitea', { treeChanges: fileOpen || localHistoryQA, historyBody: localHistoryQA ? '真实临时 Git 提交正文\n  保留缩进 <escaped>\n\n历史内容与当前工作目录分开。' : '' });
if (worktreeQA || localHistoryQA) {
  await fixture.git(fixture.directory, ['remote', 'add', 'origin', 'https://git.fixture.test/qa/project.git']);
  await fixture.service.handle('link', { repositoryId: fixture.repositoryId, path: localHistoryQA ? fixture.root : fixture.directory, ...(localHistoryQA ? {} : { branch: 'main' }) });
}
if (fileOpen) {
  await writeFile(resolve(fixture.directory, 'GitTogether-open-proof.txt'), 'GitTogether file-open verification\n\nThis is an isolated temporary test file, not a user repository.\n');
  await fixture.git(fixture.directory, ['remote', 'add', 'origin', 'https://git.fixture.test/qa/project.git']);
  await fixture.service.handle('link', { repositoryId: fixture.repositoryId, path: fixture.directory });
}
const middleware = importMiddleware(fixture.service); const root = resolve('dist/client');
const diagnostics = new LocalDiagnostics(resolve(fixture.root, 'logs'), 'test');
const diagnosticRoutes = diagnosticsMiddleware(diagnostics);
const server = createServer((request, response) => { diagnosticRoutes(request, response, () => { void middleware(request, response, () => { void (async () => {
  const address = server.address(); const authority = typeof address === 'object' && address ? `127.0.0.1:${address.port}` : '';
  if (request.headers.host !== authority || request.headers.origin && request.headers.origin !== `http://${authority}`) { response.statusCode = 403; response.end(); return; }
  if (request.method !== 'GET') { response.statusCode = 405; response.end(); return; }
  const url = new URL(request.url || '/', `http://${authority}`);
  const path = resolve(root, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
  if (!path.startsWith(`${root}${sep}`)) { response.statusCode = 403; response.end(); return; }
  response.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' } as Record<string, string>)[extname(path)] || 'application/octet-stream');
  response.setHeader('Cache-Control', 'no-store'); response.end(await readFile(path));
})().catch(() => { response.statusCode = 404; response.end(); }); }); }); });
await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing isolated QA port');
console.log(JSON.stringify({ preview: `http://127.0.0.1:${address.port}`, fixtureOnly: true, productionAppAndService: true, localLinks: fileOpen || worktreeQA || localHistoryQA ? 1 : 0, ...(fileOpen ? { testFile: resolve(fixture.directory, 'GitTogether-open-proof.txt') } : {}) }));
const terminal = createInterface({ input: process.stdin });
terminal.on('line', line => { void (async () => {
  if (line === 'state') console.log(JSON.stringify({ fixtureOnly: true, providerRequests: fixture.requests.length, branchesRequests: fixture.calls.filter(path => path.includes('/branches?')).length, repositoryReads: fixture.calls.length, gitUnchanged: await fixture.unchanged() }));
  if (worktreeQA && line === 'associate-parent') { await fixture.service.handle('link', { repositoryId: fixture.repositoryId, path: fixture.root }); console.log('QA_PARENT_ASSOCIATED'); }
  if (worktreeQA && line === 'associate-all') { await fixture.git(fixture.directory, ['worktree', 'add', resolve(fixture.root, 'review'), 'task/review']); await fixture.service.handle('link', { repositoryId: fixture.repositoryId, path: fixture.root }); console.log('QA_ALL_ASSOCIATED'); }
  if (worktreeQA && line === 'local-behind') { const clone = resolve(fixture.root, 'behind'); await fixture.git(fixture.directory, ['clone', '--branch', 'task/review', fixture.directory, clone]); await fixture.git(clone, ['branch', '-m', 'main']); await fixture.git(clone, ['remote', 'set-url', 'origin', 'https://git.fixture.test/qa/project.git']); await fixture.service.handle('link', { repositoryId: fixture.repositoryId, path: clone, branch: 'main' }); console.log('QA_LOCAL_MAIN_BEHIND'); }
  if (worktreeQA && line === 'unlink-search') { await fixture.service.handle('unlink', { repositoryId: fixture.repositoryId, branch: 'task/search' }); console.log('QA_SEARCH_UNLINKED'); }
  if (line === 'quit') { terminal.close(); server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); const unchanged = await fixture.unchanged(); diagnostics.close(); await fixture.cleanup(); console.log(JSON.stringify({ stopped: true, fixtureRemoved: true, gitUnchanged: unchanged, userDataChanged: false })); }
})().catch(problem => console.error(problem instanceof Error ? problem.message : 'QA failed')); });
