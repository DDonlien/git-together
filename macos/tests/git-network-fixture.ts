import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AccountService, type SavedState } from '../server/account-service';
import type { CommitGenerator } from '../server/commit-generator';

const execute = promisify(execFile);
// Real smart HTTP upload-pack/receive-pack and LFS, restricted to a disposable
// loopback repository. No real account, credential or user checkout is used.
export async function createGitNetworkFixture(commitGenerator: CommitGenerator = async () => ({ summary: 'Generated from changes', description: 'Isolated QA' })) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'gittogether-network-')));
  const repositories = join(root, 'repositories'), bare = join(repositories, 'qa', 'project.git'), writer = join(root, 'writer'), directory = join(root, 'local');
  await mkdir(join(repositories, 'qa'), { recursive: true }); await mkdir(writer);
  const git = async (path: string, args: string[]) => (await execute('git', ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', '-c', 'filter.lfs.clean=', '-c', 'filter.lfs.smudge=', '-c', 'filter.lfs.required=false', '-C', path, ...args], {
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', GIT_LFS_SKIP_SMUDGE: '1' }, maxBuffer: 8_000_000,
  })).stdout.trimEnd();
  await git(repositories, ['init', '--bare', bare]); await git(bare, ['config', 'http.receivepack', 'true']);
  await git(writer, ['init', '-b', 'main']); await git(writer, ['config', 'user.name', 'QA']); await git(writer, ['config', 'user.email', 'qa@example.test']);
  await writeFile(join(writer, 'README.md'), 'first\n'); await writeFile(join(writer, '.gitignore'), 'ignored.txt\n');
  await git(writer, ['add', '.']); await git(writer, ['commit', '-m', 'first']); await git(writer, ['remote', 'add', 'origin', bare]); await git(writer, ['push', 'origin', 'main']);
  await git(bare, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
  let fail = false, allowToken = 'isolated-qa-token';
  const objects = new Map<string, Buffer>();
  let host = '';
  const server = createServer((req, res) => { void (async () => {
    if (fail) { res.statusCode = 503; res.end('unavailable'); return; }
    const url = new URL(req.url || '/', host);
    const authorization = Buffer.from(`qa:${allowToken}`).toString('base64');
    if (req.headers.authorization !== `Basic ${authorization}`) { res.statusCode = 401; res.setHeader('WWW-Authenticate', 'Basic realm="isolated-git"'); res.end(); return; }
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk)); const body = Buffer.concat(chunks);
    if (url.pathname.endsWith('/info/lfs/objects/batch')) {
      const input = JSON.parse(body.toString()); res.setHeader('Content-Type', 'application/vnd.git-lfs+json');
      res.end(JSON.stringify({ transfer: 'basic', objects: input.objects.map((item: { oid: string; size: number }) => ({ ...item, actions: { download: { href: `${host}/lfs-object/${item.oid}`, header: { Authorization: `Basic ${authorization}` } } } })) })); return;
    }
    if (url.pathname.startsWith('/lfs-object/')) {
      const object = objects.get(url.pathname.slice('/lfs-object/'.length)); if (!object) { res.statusCode = 404; res.end(); return; }
      res.setHeader('Content-Type', 'application/octet-stream'); res.setHeader('Content-Length', object.length); res.end(object); return;
    }
    const child = spawn('git', ['http-backend'], { env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_PROJECT_ROOT: repositories, GIT_HTTP_EXPORT_ALL: '1',
      REQUEST_METHOD: req.method || 'GET', PATH_INFO: url.pathname, QUERY_STRING: url.search.slice(1), CONTENT_TYPE: req.headers['content-type'] || '', CONTENT_LENGTH: String(body.length), REMOTE_USER: 'qa' }, stdio: ['pipe', 'pipe', 'pipe'] });
    let headers = Buffer.alloc(0), sent = false;
    child.stdout.on('data', (chunk: Buffer) => {
      if (sent) { res.write(chunk); return; }
      headers = Buffer.concat([headers, chunk]); let boundary = headers.indexOf('\r\n\r\n'), length = 4;
      if (boundary < 0) { boundary = headers.indexOf('\n\n'); length = 2; } if (boundary < 0) return;
      for (const line of headers.subarray(0, boundary).toString().split(/\r?\n/)) { const colon = line.indexOf(':'); if (colon < 0) continue; const key = line.slice(0, colon), value = line.slice(colon + 1).trim(); if (key === 'Status') res.statusCode = Number(value.split(' ')[0]); else res.setHeader(key, value); }
      sent = true; res.write(headers.subarray(boundary + length));
    });
    child.stderr.resume(); child.on('close', () => res.end()); child.on('error', () => { res.statusCode = 500; res.end(); }); child.stdin.end(body);
  })().catch(() => { res.statusCode = 500; res.end(); }); });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done)); const address = server.address(); if (!address || typeof address === 'string') throw new Error('fixture');
  host = `http://127.0.0.1:${address.port}`;
  // The initial checkout uses the fixture-local source; its saved remote is
  // then the same HTTP identity the account service will authenticate.
  await git(root, ['clone', '--single-branch', '--branch', 'main', bare, directory]); await git(directory, ['remote', 'set-url', 'origin', `${host}/qa/project.git`]);
  await git(directory, ['config', 'user.name', 'QA']); await git(directory, ['config', 'user.email', 'qa@example.test']); await git(directory, ['config', 'commit.gpgsign', 'false']);
  const account = { id: 'qa', provider: 'gitea' as const, host, login: 'qa', name: 'Isolated QA', updatedAt: new Date().toISOString() };
  const repository = { id: 'qa:1', remoteId: 1, accountId: account.id, name: 'project', fullName: 'qa/project', description: '', defaultBranch: 'main', private: true, url: `${host}/qa/project`, available: true, permissions: { push: true } };
  let state: SavedState = { version: 2, accounts: [{ account, token: allowToken }], repositories: [repository], links: [{ repositoryId: repository.id, path: directory, worktrees: [{ branch: 'main', path: directory }] }] };
  const metadata = async (id: string) => {
    const [sha, message, name, date, parents, tree] = (await git(bare, ['show', '-s', '--format=%H%x00%B%x00%an%x00%aI%x00%P%x00%T', id])).split('\0');
    return { sha, commit: { message: message.trimEnd(), author: { name, date }, tree: { sha: tree } }, parents: parents.split(' ').filter(Boolean).map(sha => ({ sha })) };
  };
  const provider: typeof fetch = async (input, init) => {
    init?.signal?.throwIfAborted(); const url = new URL(String(input)), path = url.pathname.replace(/^\/api\/v1/, '');
    if (path.endsWith('/user')) return Response.json({ login: 'qa', name: 'Isolated QA' });
    if (path.endsWith('/user/repos')) return Response.json(url.searchParams.get('page') === '1' ? [{ id: 1, name: 'project', full_name: 'qa/project', default_branch: 'main', private: true, clone_url: `${host}/qa/project.git`, html_url: repository.url, permissions: { push: true } }] : []);
    const endpoint = path.slice('/repos/qa/project'.length);
    if (endpoint === '/branches') return Response.json(url.searchParams.get('page') === '1' ? (await git(bare, ['for-each-ref', '--format=%(refname:short)%00%(objectname)', 'refs/heads'])).split('\n').map(line => { const [name, id] = line.split('\0'); return { name, commit: { id } }; }) : []);
    if (endpoint === '/commits') return Response.json(await Promise.all((await git(bare, ['log', '--max-count=50', '--format=%H', url.searchParams.get('sha')!])).split('\n').map(metadata)));
    if (/^\/git\/trees\/[a-f0-9]{40}$/.test(endpoint)) {
      const tree = (await git(bare, ['ls-tree', '-r', '-z', endpoint.split('/').pop()!])).split('\0').filter(Boolean).map(line => { const tab = line.indexOf('\t'); const [mode, type, sha] = line.slice(0, tab).split(' '); return { path: line.slice(tab + 1), mode, type, sha }; });
      return Response.json({ tree, truncated: false, total_count: tree.length });
    }
    if (/^\/(?:git\/)?commits\/[a-f0-9]{40}$/.test(endpoint)) {
      const id = endpoint.split('/').pop()!, commit = await metadata(id);
      const fields = (await git(bare, commit.parents.length ? ['diff', '--name-status', '-z', '--no-renames', commit.parents[0].sha, id] : ['diff-tree', '--root', '--no-commit-id', '--name-status', '-r', '-z', id])).split('\0').filter(Boolean);
      const files = []; for (let i = 0; i < fields.length; i += 2) files.push({ filename: fields[i + 1], status: ({ A: 'added', M: 'modified', D: 'removed' } as Record<string, string>)[fields[i]] || fields[i] });
      return Response.json({ ...commit, files });
    }
    if (/^\/git\/commits\/[a-f0-9]{40}\.diff$/.test(endpoint)) {
      const id = endpoint.split('/').pop()!.slice(0, -5), commit = await metadata(id);
      return new Response(await git(bare, commit.parents.length ? ['diff', '--no-ext-diff', '--no-textconv', commit.parents[0].sha, id] : ['show', '--root', '--format=', '--no-ext-diff', '--no-textconv', id]));
    }
    return new Response('Unknown isolated provider endpoint', { status: 404 });
  };
  const service = new AccountService({ kind: 'session', load: async () => state, save: async next => { state = next; } }, provider, { downloadRoot: join(root, 'managed'), commitGenerator });
  return { root, bare, writer, directory, host, account, repository, service, git, objects,
    setFailure: (value: boolean) => { fail = value; }, setToken: (value: string) => { allowToken = value; },
    advance: async (text: string) => { await writeFile(join(writer, 'README.md'), text); await git(writer, ['add', '.']); await git(writer, ['commit', '-m', 'remote update']); await git(writer, ['push', 'origin', 'main']); return git(writer, ['rev-parse', 'HEAD']); },
    cleanup: async () => { server.closeAllConnections(); await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done())); await rm(root, { recursive: true, force: true }); },
  };
}
