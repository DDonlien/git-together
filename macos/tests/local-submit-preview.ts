// Actual App, HTTP and local Git. The sole provider is a synthetic transport;
// AI optionally uses the real installed Codex with only these fixture changes.
import { createServer } from 'node:http';
import { createInterface } from 'node:readline';
import { readFile, writeFile, chmod, rm } from 'node:fs/promises';
import { extname, resolve, sep, join } from 'node:path';
import { importMiddleware } from '../server/http-api';
import { LocalDiagnostics } from '../server/diagnostics';
import { diagnosticsMiddleware } from '../server/diagnostics-http';
import { createRemoteServiceFixture } from './remote-service-fixture';
import { readRepositoryWorkspace } from '../server/repository-reader';

const realAI = process.argv.includes('--real-ai');
const fixture = await createRemoteServiceFixture('gitea', { freezeHeads: true, commitGenerator: realAI ? undefined : async () => ({ summary: '更新主分支代码与本地文件', description: '调整应用数值并添加新文件。' }) });
await fixture.git(fixture.directory, ['remote', 'add', 'origin', 'https://git.fixture.test/qa/project.git']);
await fixture.git(fixture.directory, ['config', 'commit.gpgsign', 'false']);
await fixture.git(fixture.directory, ['config', 'core.hooksPath', join(fixture.root, 'hooks')]);
await fixture.git(fixture.directory, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
await fixture.service.handle('link', { repositoryId: fixture.repositoryId, path: fixture.root });
const initialHead = (await fixture.git(fixture.directory, ['rev-parse', 'HEAD'])).stdout;
const initialFeature = (await fixture.git(fixture.feature, ['rev-parse', 'HEAD'])).stdout;
const middleware = importMiddleware(fixture.service), root = resolve('dist/client');
const diagnostics = new LocalDiagnostics(join(fixture.root, 'logs'), 'test', { timer: false });
const diagnosticRoutes = diagnosticsMiddleware(diagnostics);
const server = createServer((req, res) => { void diagnosticRoutes(req, res, () => { void middleware(req, res, () => { void (async () => {
  const address = server.address(), authority = typeof address === 'object' && address ? `127.0.0.1:${address.port}` : '';
  if (req.headers.host !== authority || req.headers.origin && req.headers.origin !== `http://${authority}` || req.method !== 'GET') { res.statusCode = 403; res.end(); return; }
  const url = new URL(req.url || '/', `http://${authority}`), path = resolve(root, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
  if (!path.startsWith(`${root}${sep}`)) { res.statusCode = 403; res.end(); return; }
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' } as Record<string, string>)[extname(path)] || 'application/octet-stream'); res.end(await readFile(path));
})().catch(() => { res.statusCode = 404; res.end(); }); }); }); });
await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing QA port');
console.log(JSON.stringify({ preview: `http://127.0.0.1:${address.port}`, fixtureOnly: true, productionAppAndService: true, realCodex: realAI }));
const terminal = createInterface({ input: process.stdin });
let commands = Promise.resolve();
terminal.on('line', line => { commands = commands.then(async () => {
  if (line === 'fail-hook') { const path = join(fixture.root, 'hooks/pre-commit'); await writeFile(path, '#!/bin/sh\nexit 1\n'); await chmod(path, 0o700); console.log('QA_HOOK_FAILS'); }
  if (line === 'restore-hook') { await rm(join(fixture.root, 'hooks/pre-commit'), { force: true }); console.log('QA_HOOK_RESTORED'); }
  if (line === 'edit-main') { await writeFile(join(fixture.directory, 'src/app.ts'), 'export const value = 15;\n'); console.log('QA_MAIN_EDITED'); }
  if (line === 'state') {
    const workspace = await readRepositoryWorkspace(fixture.directory);
    console.log(JSON.stringify({ mainChanged: initialHead !== (await fixture.git(fixture.directory, ['rev-parse', 'HEAD'])).stdout, featureUnchanged: initialFeature === (await fixture.git(fixture.feature, ['rev-parse', 'HEAD'])).stdout,
      tasks: workspace.tasks.map(task => ({ branch: task.branch, files: task.files.length })), topSummary: workspace.commits[0].summary }));
  }
  if (line === 'quit') { terminal.close(); server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); diagnostics.close(); await fixture.cleanup(); console.log(JSON.stringify({ stopped: true, temporaryRepositoriesRemoved: true, userDataChanged: false })); }
}).catch(problem => console.error(problem instanceof Error ? problem.message : 'QA failed')); });
