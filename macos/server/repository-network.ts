import type { Account, RemoteRepository } from '../src/import-model';
import { credentialHelper } from './branch-download';
import { remoteIdentity } from './git-identity';
import { runGitProcess } from './git-process';

export type RepositoryNetwork = ReturnType<typeof repositoryNetwork>;
export async function hydrateRepositoryLFS(root: string, network: RepositoryNetwork, head: string, signal?: AbortSignal) {
  const files = (await runGitProcess(root, ['ls-files', '-z'])).split('\0').filter(Boolean);
  const attributes = (await runGitProcess(root, ['check-attr', '-z', '--stdin', 'filter'], { stdin: files.join('\0') + '\0' })).split('\0');
  if (!attributes.some((v, i) => i % 3 === 2 && v === 'lfs')) return;
  await network.git(root, ['lfs', 'version'], signal);
  await network.git(root, ['lfs', 'fetch', '-I', '', '-X', '', network.url, head], signal);
  await network.git(root, ['lfs', 'checkout'], signal);
  await network.git(root, ['lfs', 'fsck', '--objects', head], signal);
}
// Only the saved account and catalog select the origin. A renderer cannot pass
// a remote, executable, credential helper or environment variable.
export function repositoryNetwork(repository: RemoteRepository, account: Account, token: string) {
  const parts = repository.fullName.split('/');
  if (parts.length !== 2 || parts.some(p => !p || p === '.' || p === '..')) throw new Error('仓库身份无效，请刷新列表。');
  const url = new URL(`${account.host}/${parts.map(encodeURIComponent).join('/')}.git`);
  if (url.username || url.password || remoteIdentity(url.href) !== remoteIdentity(repository.url)) throw new Error('仓库远端与访问账号不匹配。');
  const env = { GITTOGETHER_DOWNLOAD_ORIGIN: url.origin, GITTOGETHER_DOWNLOAD_USER: account.login, GITTOGETHER_DOWNLOAD_TOKEN: token,
    GIT_ASKPASS: '', SSH_ASKPASS: '', GIT_LFS_SKIP_SMUDGE: '1', LC_ALL: 'C' };
  const options = ['-c', 'credential.helper=', '-c', `credential.helper=${credentialHelper}`, '-c', 'http.followRedirects=false', '-c', 'core.hooksPath=/dev/null'];
  return { url: url.href, git: (root: string, args: string[], signal?: AbortSignal, timeoutMs = 30 * 60_000) =>
    runGitProcess(root, [...options, ...args], { env, signal, timeoutMs }) };
}
export function networkFailure(problem: unknown): Error {
  if (problem instanceof Error && !('stderr' in problem)) return problem;
  const p = problem as { stderr?: string; name?: string; killed?: boolean; code?: string };
  const s = p?.stderr || '';
  return new Error(p?.name === 'AbortError' ? '操作已取消。' : p?.killed ? '远端操作超时，请检查网络后重试。' :
    /Authentication failed|could not read Username|HTTP (401|403)|access denied/i.test(s) ? '远端拒绝访问，请在设置中检查账号权限。' :
    /certificate|SSL/i.test(s) ? '服务器证书验证失败，请检查服务器证书。' :
    /couldn't find remote ref|could not find remote ref/i.test(s) ? '远端分支已不存在，请刷新分支列表。' :
    /No space left on device/i.test(s) ? '磁盘空间不足，操作没有完成。' :
    /not a git command.*|git: 'lfs' is not a git command/i.test(s) ? '此分支使用 Git LFS，请先安装 Git LFS。' : 'Git 操作未完成，请检查网络和目录权限后重试。');
}
export async function fetchRepositoryBranches(root: string, branches: string[], network: RepositoryNetwork, validate: () => void, signal?: AbortSignal) {
  validate(); signal?.throwIfAborted();
  const names = (await runGitProcess(root, ['remote'])).trim().split('\n').filter(Boolean);
  let remote = '';
  for (const name of names) {
    const url = (await runGitProcess(root, ['remote', 'get-url', name])).trim();
    if (remoteIdentity(url) === remoteIdentity(network.url)) { remote = name; break; }
  }
  if (!remote) throw new Error('工作目录的远端已经变化，请重新关联。');
  const refs: string[] = [];
  for (const branch of [...new Set(branches)]) {
    if (branch.startsWith('-') || (await runGitProcess(root, ['check-ref-format', '--branch', branch])).trim() !== branch) throw new Error('分支名称无效，请刷新列表。');
    const ref = `refs/remotes/${remote}/${branch}`;
    await runGitProcess(root, ['check-ref-format', ref]); refs.push(`+refs/heads/${branch}:${ref}`);
  }
  validate();
  if (refs.length) await network.git(root, ['fetch', '--atomic', '--no-tags', '--no-auto-gc', '--no-write-fetch-head', '--recurse-submodules=no', network.url, ...refs], signal, 120_000);
  validate(); signal?.throwIfAborted();
  return Promise.all(branches.map(async branch => ({ branch, head: (await runGitProcess(root, ['rev-parse', '--verify', `refs/remotes/${remote}/${branch}^{commit}`])).trim() })));
}
