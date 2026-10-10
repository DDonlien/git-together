import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, realpath, rm, rmdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import type { Account, RemoteRepository } from '../src/import-model';
import { isDownloadFolderName } from '../src/branch-download-model';
import { remoteIdentity } from './git-identity';
import { readWorktrees } from './repository-reader';

// The helper handles only this account's origin. Tokens travel in the child
// environment, never in Git arguments, saved remote URLs, config or logs.
export const credentialHelper = '!f() { test "$1" = get || exit 0; protocol=; host=; while IFS="=" read -r key value; do case "$key" in protocol) protocol="$value";; host) host="$value";; esac; done; if test "$protocol://$host" = "$GITTOGETHER_DOWNLOAD_ORIGIN"; then printf "username=%s\\npassword=%s\\n" "$GITTOGETHER_DOWNLOAD_USER" "$GITTOGETHER_DOWNLOAD_TOKEN"; fi; }; f';
const downloadTimeout = 30 * 60_000; // Large asset checkouts get up to 30 minutes, not the read API's 3-minute limit.

type DownloadInput = {
  repository: RemoteRepository; account: Account; token: string; branch: string;
  parentPath: string; folderName: string; storageRoot: string;
  signal?: AbortSignal; validate: () => void;
};

function gitFailure(problem: unknown, command?: string): Error {
  const error = problem && typeof problem === 'object' ? problem as Record<string, unknown> : {};
  const stderr = typeof error.stderr === 'string' ? error.stderr : '';
  // Classify known failures without returning raw Git output: it can include
  // a provider response, an LFS URL or a credential helper's private context.
  const message = error.name === 'AbortError' ? '下载已取消。' : error.code === 'ENOENT' ? '没有找到Git，请先安装Git。' : error.killed ? '下载超时，请检查网络后重试。' :
    /Authentication failed|could not read Username|HTTP (401|403)|access denied/i.test(stderr) ? '远端拒绝下载，请在设置中检查账号的仓库访问权限。' :
    /certificate|SSL/i.test(stderr) ? '下载时证书验证失败，请检查服务器证书。' :
    /Couldn't find remote ref|could not find remote ref/i.test(stderr) ? '远端分支已不存在，请刷新分支列表。' :
    /not a git command.*|git: 'lfs' is not a git command/i.test(stderr) ? '此分支包含LFS文件，请先安装Git LFS后重试下载。' :
    /No space left on device/i.test(stderr) ? '磁盘空间不足，下载没有完成。' : command === 'check-ref-format' && error.code === 1 ? '分支名称无效，请刷新分支列表。' :
    '下载未完成，请检查网络、Git和本地目录权限后重试。';
  return new Error(message);
}

async function absent(path: string) {
  try { await lstat(path); }
  catch (problem) { if (problem && typeof problem === 'object' && 'code' in problem && problem.code === 'ENOENT') return; throw problem; }
  throw new Error('目标文件夹已存在，请选择其他名称，或关联已有工作目录。');
}

export async function downloadBranchWorktree(input: DownloadInput): Promise<string> {
  const { repository, account, token, branch, signal } = input;
  signal?.throwIfAborted(); input.validate();
  if (!isDownloadFolderName(input.folderName)) throw new Error('请输入有效的文件夹名称，不含路径分隔符或特殊字符。');
  const expanded = input.parentPath === '~' ? homedir() : input.parentPath.startsWith('~/') ? resolve(homedir(), input.parentPath.slice(2)) : input.parentPath;
  if (!isAbsolute(expanded)) throw new Error('请选择绝对的本地存放目录。');
  const parent = await realpath(expanded);
  if (!(await lstat(parent)).isDirectory()) throw new Error('存放位置必须是文件夹。');
  const target = join(parent, input.folderName);
  await absent(target);
  const parts = repository.fullName.split('/');
  if (parts.length !== 2 || parts.some(part => !part || part === '.' || part === '..')) throw new Error('仓库身份无效，请刷新列表。');
  const url = new URL(`${account.host}/${parts.map(encodeURIComponent).join('/')}.git`);
  if (url.username || url.password || remoteIdentity(url.href) !== remoteIdentity(repository.url)) throw new Error('仓库远端与账号不匹配，请刷新列表。');
  const env = { ...process.env, LC_ALL: 'C', GIT_TERMINAL_PROMPT: '0', GIT_LFS_SKIP_SMUDGE: '1', GIT_ASKPASS: '', SSH_ASKPASS: '',
    GITTOGETHER_DOWNLOAD_ORIGIN: url.origin, GITTOGETHER_DOWNLOAD_USER: account.login, GITTOGETHER_DOWNLOAD_TOKEN: token };
  // A surrounding checkout must not redirect writes out of the managed store.
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) delete (env as NodeJS.ProcessEnv)[key];
  async function git(path: string, args: string[], stdin?: string, cancellation: AbortSignal | null = signal ?? null, cleanup = false): Promise<string> {
    cancellation?.throwIfAborted();
    return new Promise<string>((accept, reject) => {
      if (!cleanup) input.validate();
      const child = spawn('git', ['-c', 'credential.helper=', '-c', `credential.helper=${credentialHelper}`, '-c', 'http.followRedirects=false', '-c', 'core.hooksPath=/dev/null', '-C', path, ...args],
        { env, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
      const output: Buffer[] = []; const errors: Buffer[] = [];
      let size = 0; let errorSize = 0; let failure: Error | undefined;
      let forceTimer: ReturnType<typeof setTimeout> | undefined;
      const kill = (signal: NodeJS.Signals) => {
        if (!child.pid) return;
        try { if (process.platform === 'win32') child.kill(signal); else process.kill(-child.pid, signal); }
        catch (problem) { if (!(problem && typeof problem === 'object' && 'code' in problem && problem.code === 'ESRCH')) child.kill(signal); }
      };
      const terminate = () => { kill('SIGTERM'); if (!forceTimer) forceTimer = setTimeout(() => kill('SIGKILL'), 2000); };
      const abort = () => { failure = new Error('下载已取消。'); terminate(); };
      cancellation?.addEventListener('abort', abort, { once: true });
      const timeout = setTimeout(() => { failure = new Error('下载超时，请检查网络后重试。'); terminate(); }, downloadTimeout);
      child.stdout.on('data', (data: Buffer) => { size += data.length; if (size <= 16_000_000) output.push(data); else { failure = new Error('下载文件检查超过可读取范围，没有保存关联。'); terminate(); } });
      child.stderr.on('data', (data: Buffer) => { errorSize += data.length; if (errorSize <= 1_000_000) errors.push(data); });
      child.on('error', problem => { failure = gitFailure(problem); });
      child.on('close', code => {
        clearTimeout(timeout); if (forceTimer) clearTimeout(forceTimer); cancellation?.removeEventListener('abort', abort);
        if (failure) reject(failure);
        else if (code !== 0) reject(gitFailure({ code, stderr: Buffer.concat(errors).toString('utf8') }, args[0]));
        else accept(Buffer.concat(output).toString('utf8'));
      });
      child.stdin.on('error', () => { failure = new Error('Git文件检查没有完成，未保存关联。'); terminate(); });
      // Attribute queries are the only command that consumes stdin.
      child.stdin.end(stdin);
      if (cancellation?.aborted) abort();
    });
  }
  if (branch.startsWith('-') || (await git(parent, ['check-ref-format', '--branch', branch])).trim() !== branch) throw new Error('分支名称无效，请刷新分支列表。');
  await mkdir(input.storageRoot, { recursive: true, mode: 0o700 });
  const storageRoot = await realpath(input.storageRoot);
  const key = createHash('sha256').update(`${account.id}\0${repository.id}\0${url.href}`).digest('hex');
  const store = join(storageRoot, `${key}.git`);
  let createdStore = false;
  try { await mkdir(store, { mode: 0o700 }); createdStore = true; }
  catch (problem) { if (!(problem && typeof problem === 'object' && 'code' in problem && problem.code === 'EEXIST')) throw problem; }
  if (createdStore) {
    try { await git(storageRoot, ['init', '--bare', store]); await git(store, ['remote', 'add', 'origin', url.href]); }
    catch (problem) { await rm(store, { recursive: true }); throw problem; }
  }
  if ((await lstat(store)).isSymbolicLink() || (await git(store, ['rev-parse', '--is-bare-repository'])).trim() !== 'true' ||
    remoteIdentity((await git(store, ['remote', 'get-url', 'origin'])).trim()) !== remoteIdentity(url.href)) throw new Error('下载对象库不匹配，未修改已有仓库。');
  const existing = (await readWorktrees(store)).find(worktree => !worktree.bare && worktree.branch === branch);
  if (existing) throw new Error(`该分支已有下载目录：${existing.path}。请通过「关联工作目录」关联它。`);
  await git(store, ['fetch', '--no-tags', '--depth=1', 'origin', `+refs/heads/${branch}:refs/remotes/origin/${branch}`]);
  const head = (await git(store, ['rev-parse', `refs/remotes/origin/${branch}`])).trim();
  const refs = (await git(store, ['for-each-ref', '--format=%(refname)%00%(objectname)', `refs/heads/${branch}`])).trim().split('\n');
  const priorHead = refs.map(ref => ref.split('\0')).find(([ref]) => ref === `refs/heads/${branch}`)?.[1];
  if (priorHead && priorHead !== head) throw new Error('该分支已有不同的本地提交，未覆盖它；请关联已有工作目录。');
  const temporary = await mkdtemp(join(parent, '.gittogether-download-'));
  const staging = join(temporary, 'worktree');
  let published = false;
  let createdBranch = false;
  try {
    await git(store, ['worktree', 'add', '--detach', staging, head]);
    const files = await git(staging, ['ls-files', '-z']);
    const attributes = (await git(staging, ['check-attr', '-z', '--stdin', 'filter'], files)).split('\0');
    if (attributes.some((value, index) => index % 3 === 2 && value === 'lfs')) {
      await git(staging, ['lfs', 'version']);
      await git(staging, ['lfs', 'install', '--local', '--skip-repo']);
      await git(staging, ['lfs', 'pull', '-I', '', '-X', '', 'origin']);
    }
    signal?.throwIfAborted(); input.validate();
    await git(staging, priorHead ? ['checkout', branch] : ['checkout', '-b', branch, '--track', `refs/remotes/origin/${branch}`]);
    createdBranch = !priorHead;
    await absent(target);
    await git(store, ['worktree', 'move', staging, target]);
    published = true;
    return await realpath(target);
  } catch (problem) {
    // Published folders may already be edited by the user. Only the private,
    // not-yet-published staging checkout may be removed on failure.
    if (!published) {
      try {
        const registered = (await readWorktrees(store)).some(worktree => worktree.path === staging);
        if (registered) await git(store, ['worktree', 'remove', '--force', staging], undefined, null, true);
        if (createdBranch && !(await readWorktrees(store)).some(worktree => worktree.branch === branch)) {
          // Delete only our unpublished ref at the exact commit we created;
          // never reset a prior branch or a ref another writer has advanced.
          await git(store, ['update-ref', '-d', `refs/heads/${branch}`, head], undefined, null, true);
        }
        await rm(temporary, { recursive: true });
      } catch { throw new Error(`${problem instanceof Error ? problem.message : '下载未完成。'} 临时工作目录清理失败，已保留：${temporary}`); }
    }
    throw problem;
  } finally {
    // The empty staging container is task-owned; never remove the final path.
    if (published) {
      try { await rmdir(temporary); }
      catch { throw new Error(`下载文件已保留：${target}，但临时目录清理失败，没有保存关联。请通过「关联工作目录」关联下载目录。`); }
    }
  }
}
