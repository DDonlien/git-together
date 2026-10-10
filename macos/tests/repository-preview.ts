// Finite, loopback-only browser QA server with no production credentials.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { createRepositoryFixture } from './repository-fixture';
import { readRepositoryWorkspace, readRepositoryTaskDiff, readRepositoryCommit, readRepositoryCommitDiff } from '../server/repository-reader';
import { RemoteRepositoryReader } from '../server/remote-repository-reader';
import { createGitRemoteFixture } from './git-remote-fixture';
import { combineRepositoryWorkspaces } from '../src/repository-model';

const mixed = process.argv.includes('--mixed');
const remoteFixture = mixed || process.argv.includes('--remote') ? await createGitRemoteFixture('gitea', { treeChanges: process.argv.includes('--tree-changes'), denseChanges: process.argv.includes('--dense-changes'), longBranch: process.argv.includes('--long-branch') }) : null;
const fixture = remoteFixture || await createRepositoryFixture({ localAhead: process.argv.includes('--local-ahead'), treeChanges: process.argv.includes('--tree-changes'), denseChanges: process.argv.includes('--dense-changes') });
const remoteReader = remoteFixture ? new RemoteRepositoryReader('gitea', { fullName: 'qa/project', defaultBranch: 'main' }, remoteFixture.transport) : null;
const bundle = await build({ entryPoints: [resolve('tests/repository-preview-client.tsx')], bundle: true, write: false, outdir: 'qa-bundle', jsx: 'automatic', format: 'esm', target: 'es2022', loader: { '.woff2': 'dataurl', '.woff': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"' } });
const js = bundle.outputFiles.find(file => file.path.endsWith('.js'))!;
const css = bundle.outputFiles.find(file => file.path.endsWith('.css'))!;
const server = createServer((request, response) => { void (async () => {
  if (!request.headers.host?.startsWith('127.0.0.1:') || request.headers.origin && request.headers.origin !== `http://${request.headers.host}` || request.headers['sec-fetch-site'] === 'cross-site') { response.statusCode = 403; response.end(); return; }
  const url = new URL(request.url || '/', `http://${request.headers.host}`);
  response.setHeader('Cache-Control', 'no-store');
  if (url.pathname === '/entry.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(js.contents); return; }
  if (url.pathname === '/entry.css') { response.setHeader('Content-Type', 'text/css'); response.end(css.contents); return; }
  if (url.pathname === '/') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end('<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>GitTogether · 隔离 Git 测试</title><link rel="stylesheet" href="/entry.css"></head><body><div id="root"></div><script type="module" src="/entry.js"></script></body></html>'); return; }
  response.setHeader('Content-Type', 'application/json');
  if (url.pathname === '/fixture/workspace' && request.method === 'GET') {
    const local = !remoteReader || mixed ? await readRepositoryWorkspace(fixture.directory) : undefined;
    const workspace = remoteReader ? combineRepositoryWorkspaces(await remoteReader.workspace(), local) : local;
    response.end(JSON.stringify({ root: remoteReader && !mixed ? '' : fixture.directory, workspace })); return;
  }
  if (remoteReader && ['/fixture/commit', '/fixture/file'].includes(url.pathname) && request.method === 'POST' && request.headers['x-gittogether-qa'] === '1') {
    let body = ''; for await (const chunk of request) { body += String(chunk); if (body.length > 8192) throw new Error('QA request too large'); }
    const input: unknown = JSON.parse(body);
    if (!input || typeof input !== 'object' || !('commitId' in input) || typeof input.commitId !== 'string') throw new Error('QA input invalid');
    if (url.pathname === '/fixture/commit') response.end(JSON.stringify(await remoteReader.commit(input.commitId)));
    else { if (!('path' in input) || typeof input.path !== 'string') throw new Error('QA path invalid'); response.end(JSON.stringify(await remoteReader.file(input.commitId, input.path))); }
    return;
  }
  if (['/fixture/diff', '/fixture/local-commit'].includes(url.pathname) && request.method === 'POST' && request.headers['x-gittogether-qa'] === '1') {
    let body = ''; for await (const chunk of request) { body += String(chunk); if (body.length > 8192) throw new Error('QA request too large'); }
    const input: unknown = JSON.parse(body);
    if (!input || typeof input !== 'object' || !('taskId' in input) || typeof input.taskId !== 'string') throw new Error('QA input invalid');
    if (url.pathname === '/fixture/local-commit') {
      if (!('commitId' in input) || typeof input.commitId !== 'string') throw new Error('QA commit invalid');
      response.end(JSON.stringify(await readRepositoryCommit(fixture.directory, input.commitId))); return;
    }
    if (!('path' in input) || typeof input.path !== 'string') throw new Error('QA path invalid');
    const commitId = 'commitId' in input && typeof input.commitId === 'string' ? input.commitId : undefined;
    response.end(JSON.stringify({ text: commitId ? await readRepositoryCommitDiff(fixture.directory, commitId, input.path) : await readRepositoryTaskDiff(fixture.directory, input.taskId, input.path) })); return;
  }
  response.statusCode = 404; response.end(JSON.stringify({ error: 'Not found' }));
})().catch(problem => { response.statusCode = 400; response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ error: problem instanceof Error ? problem.message : 'QA failure' })); }); });
await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing QA port');
console.log(JSON.stringify({ preview: `http://127.0.0.1:${address.port}`, fixtureOnly: true, remoteApiAdapter: !!remoteReader }));
const terminal = createInterface({ input: process.stdin });
let finishing = false;
async function finish() {
  if (finishing) return; finishing = true;
  terminal.close(); await new Promise<void>(done => server.close(() => done()));
  const headAndIndexUnchanged = await fixture.unchanged();
  await fixture.cleanup();
  console.log(JSON.stringify({ headAndIndexUnchanged, cleanedTemporaryRepositories: true }));
}
terminal.on('line', line => { void (async () => {
  if (line === 'edit-main') { await writeFile(`${fixture.directory}/src/app.ts`, 'export const value = 11;\n'); console.log('QA_MAIN_EDITED'); }
  if (line === 'quit') await finish();
})().catch(problem => console.error(problem instanceof Error ? problem.message : 'QA failed')); });
process.on('SIGINT', () => { void finish(); }); process.on('SIGTERM', () => { void finish(); });
