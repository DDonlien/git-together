// Loopback-only provider fixture for browser QA; never imported by the app.
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const execute = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), 'gittogether-browser-qa-'));
const port = 49101;
const paths = [join(root, 'local project'), join(root, 'wrong repository')];
for (let i = 0; i < paths.length; i++) {
  await mkdir(paths[i]);
  const git = (args: string[]) => execute('git', ['-C', paths[i], ...args]);
  await git(['init', '-b', 'main']); await git(['config', 'user.name', 'QA Fixture']); await git(['config', 'user.email', 'qa@example.test']);
  await git(['remote', 'add', 'origin', `http://127.0.0.1:${port}/${i === 0 ? 'alice/project' : 'bob/other'}.git`]);
  await writeFile(join(paths[i], 'README.md'), '# Before\n'); await git(['add', 'README.md']); await git(['commit', '-m', 'QA fixture initial']);
  await writeFile(join(paths[i], 'README.md'), '# After\nA real local diff.\n');
  await writeFile(join(paths[i], 'new note.txt'), 'Untracked fixture\n');
}
const failed = new Set<string>();
const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
  if (req.method === 'POST' && url.pathname.startsWith('/fixture/fail/')) { failed.add(url.pathname.split('/').at(-1)!); res.end('{}'); return; }
  const login = req.headers.authorization === 'token qa-b' ? 'bob' : req.headers.authorization === 'token qa-a' ? 'alice' : '';
  if (!login) { res.statusCode = 401; res.end('{}'); return; }
  if (url.pathname === '/api/v1/user') { res.end(JSON.stringify({ login, name: login === 'alice' ? 'QA 个人' : 'QA 工作' })); return; }
  if (url.pathname === '/api/v1/user/repos') {
    if (failed.delete(login)) { res.statusCode = 503; res.end('{}'); return; }
    const page = Number(url.searchParams.get('page'));
    const name = page === 1 ? `${login}/${login === 'alice' ? 'project' : 'other'}` : page === 2 ? 'team/shared' : null;
    res.end(JSON.stringify(name ? [{ id: page, name: name.split('/')[1], full_name: name, description: '仅供 QA 的临时仓库', private: page === 1, default_branch: 'main' }] : [])); return;
  }
  res.statusCode = 404; res.end('{}');
});
await new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve));
console.log(JSON.stringify({ port, root, localPath: paths[0], wrongPath: paths[1] }));
async function cleanup() { await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); process.exit(0); }
process.on('SIGTERM', () => void cleanup()); process.on('SIGINT', () => void cleanup());
