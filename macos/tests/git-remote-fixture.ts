// A provider-shape adapter over our own real temporary Git fixture. This is not
// loaded by production and does not use user accounts or associated directories.
import type { Provider } from '../src/import-model';
import { attachDiffPatches, type RemoteTransport } from '../server/remote-repository-reader';
import { createRepositoryFixture } from './repository-fixture';

export async function createGitRemoteFixture(provider: Provider, options: { treeChanges?: boolean; denseChanges?: boolean; longBranch?: boolean; historyBody?: string } = {}) {
  const fixture = await createRepositoryFixture(options);
  const calls: string[] = [];
  const git = async (...args: string[]) => (await fixture.git(fixture.directory, ['--no-optional-locks', ...args])).stdout;
  const metadata = async (id: string) => {
    const [hash, message, author, date, parents, tree] = (await git('show', '-s', '--format=%H%x00%B%x00%an%x00%aI%x00%P%x00%T', id)).trimEnd().split('\0');
    return { sha: hash, commit: { message: message.trimEnd(), author: { name: author, date }, tree: { sha: tree } }, parents: parents.split(' ').filter(Boolean).map(sha => ({ sha })) };
  };
  const rawDiff = async (id: string) => {
    const commit = await metadata(id);
    return commit.parents.length ? git('diff', '--no-ext-diff', '--no-textconv', commit.parents[0].sha, id) : git('show', '--root', '--format=', '--no-ext-diff', '--no-textconv', id);
  };
  const transport: RemoteTransport = async (path, format, signal) => {
    signal?.throwIfAborted(); calls.push(path);
    if (!path.startsWith('/repos/qa/project/')) throw new Error('Fixture requested another repository');
    const url = new URL(path, 'https://fixture.example.test');
    const endpoint = url.pathname.slice('/repos/qa/project'.length);
    let value: unknown;
    if (endpoint === '/branches') {
      value = (await git('for-each-ref', '--format=%(refname:short)%00%(objectname)', 'refs/heads')).trim().split('\n').map(line => {
        const [name, id] = line.split('\0'); return { name, commit: provider === 'github' ? { sha: id } : { id } };
      });
    } else if (endpoint === '/commits') {
      const head = url.searchParams.get('sha')!;
      const ids = (await git('log', '--max-count=50', '--format=%H', head)).trim().split('\n');
      value = await Promise.all(ids.map(metadata));
    } else if (/^\/git\/trees\/[a-f0-9]{40}$/.test(endpoint)) {
      const id = endpoint.split('/').pop()!;
      const tree = (await git('ls-tree', '-r', '-z', id)).split('\0').filter(Boolean).map(line => {
        const [info, path] = line.split('\t'); const [mode, type, sha] = info.split(' '); return { path, mode, type, sha };
      });
      value = { tree, truncated: false, total_count: tree.length };
    } else if (/^\/git\/blobs\/[a-f0-9]{40}$/.test(endpoint)) {
      const text = await git('cat-file', 'blob', endpoint.split('/').pop()!); const bytes = Buffer.from(text);
      value = { encoding: 'base64', content: bytes.toString('base64'), size: bytes.length };
    } else if (/^\/git\/commits\/[a-f0-9]{40}\.diff$/.test(endpoint) && format === 'text') {
      value = await rawDiff(endpoint.split('/').pop()!.slice(0, -5));
    } else if (/^\/(?:git\/)?commits\/[a-f0-9]{40}$/.test(endpoint)) {
      const id = endpoint.split('/').pop()!; const commit = await metadata(id);
      if (provider === 'github' && endpoint.startsWith('/git/')) value = { ...commit, tree: commit.commit.tree };
      else {
        const changed = commit.parents.length ? await git('diff', '--name-status', '-z', commit.parents[0].sha, id) : await git('diff-tree', '--root', '--no-commit-id', '--name-status', '-r', '-z', id);
        const parts = changed.split('\0').filter(Boolean); const files = [];
        for (let index = 0; index < parts.length; index += 2) files.push({ filename: parts[index + 1], status: ({ A: 'added', M: 'modified', D: 'removed' } as Record<string, string>)[parts[index]] || parts[index] });
        const patches = provider === 'github' ? attachDiffPatches(await rawDiff(id), files.map(file => ({ path: file.filename, status: file.status, patch: null }))) : [];
        value = { ...commit, files: files.map((file, index) => ({ ...file, ...(patches[index]?.patch ? { patch: patches[index].patch!.slice(patches[index].patch!.indexOf('@@')) } : {}) })) };
      }
    } else throw new Error(`Unknown fixture endpoint: ${endpoint}`);
    signal?.throwIfAborted(); return { value, headers: new Headers() };
  };
  return { ...fixture, transport, calls };
}
