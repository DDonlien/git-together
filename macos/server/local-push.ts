import type { Account, RemoteRepository } from '../src/import-model';
import type { LocalPushInput, LocalPushResult } from '../src/local-submit-model';
import { credentialHelper } from './branch-download';
import { runGitProcess } from './git-process';
import { remoteIdentity } from './git-identity';
import { readWorktrees } from './repository-reader';
import { gitDetails, traceOperation } from './diagnostics';

export async function pushLocalCommit(root: string, input: LocalPushInput, repository: RemoteRepository, account: Account, token: string, validate: () => void, signal?: AbortSignal): Promise<LocalPushResult> {
  signal?.throwIfAborted(); validate();
  const current = async () => {
    const task = (await readWorktrees(root)).find(task => task.path === root && `worktree:${task.branch}:${task.path}` === input.taskId);
    if (!task || task.branch === 'Detached HEAD' || task.head !== input.expectedHead) throw new Error('分支或本地提交已变化，请查看最新状态后重试。');
    return task;
  };
  const task = await current();
  await runGitProcess(root, ['check-ref-format', `refs/heads/${task.branch}`], { signal });
  try { await runGitProcess(root, ['merge-base', '--is-ancestor', input.commitId, task.head], { signal }); }
  catch (problem) {
    if (problem && typeof problem === 'object' && 'code' in problem && problem.code === 1) throw new Error('所选提交不属于当前工作目录的分支历史，未推送。');
    throw problem;
  }
  const parts = repository.fullName.split('/');
  if (parts.length !== 2 || parts.some(part => !part || part === '.' || part === '..')) throw new Error('仓库身份无效，请刷新列表。');
  const url = new URL(`${account.host}/${parts.map(encodeURIComponent).join('/')}.git`);
  if (url.username || url.password || remoteIdentity(url.href) !== remoteIdentity(repository.url)) throw new Error('推送仓库与访问账号不匹配。');
  // Reuse the origin-bound download helper. Tokens never enter arguments,
  // saved remote URLs, renderer state or logs; user hooks/LFS remain enabled.
  const env = { GIT_ASKPASS: '', SSH_ASKPASS: '', GITTOGETHER_DOWNLOAD_ORIGIN: url.origin, GITTOGETHER_DOWNLOAD_USER: account.login, GITTOGETHER_DOWNLOAD_TOKEN: token };
  const options = ['-c', 'credential.helper=', '-c', `credential.helper=${credentialHelper}`, '-c', 'http.followRedirects=false'];
  const ref = `refs/heads/${task.branch}`;
  const remoteHead = (output: string) => {
    const rows = output.trim().split('\n').filter(Boolean).map(line => line.split('\t')).filter(([, name]) => name === ref);
    if (!rows.length) return undefined;
    if (rows.length !== 1 || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(rows[0][0])) throw new Error('远端引用读取异常，无法确认本次推送；本地提交已保留。');
    return rows[0][0];
  };
  try {
    const remote = await runGitProcess(root, [...options, 'ls-remote', '--', url.href, ref], { env, signal });
    if (remoteHead(remote) === input.commitId) return { taskId: input.taskId, commitId: input.commitId, branch: task.branch, pushed: true };
    signal?.throwIfAborted(); validate(); await current();
    // An explicit SHA/ref pair cannot push later commits, other branches or
    // follow-tags. Ordinary fast-forward rules protect concurrent remote work.
    await traceOperation('git-write', gitDetails(root, ['push']), () => runGitProcess(root, [...options, 'push', '--porcelain', '--no-follow-tags', '--recurse-submodules=no', '--', url.href, `${input.commitId}:${ref}`], { env }));
    const result = await runGitProcess(root, [...options, 'ls-remote', '--', url.href, ref], { env });
    if (remoteHead(result) !== input.commitId) throw new Error('远端状态已变化，无法确认本次推送；本地提交已保留，请刷新后检查。');
    return { taskId: input.taskId, commitId: input.commitId, branch: task.branch, pushed: true };
  } catch (problem) {
    const error = problem && typeof problem === 'object' ? problem as Record<string, unknown> : {};
    const stderr = [error.stderr, error.stdout].filter(value => typeof value === 'string').join('\n');
    const message = /non-fast-forward|fetch first|rejected.*stale/i.test(stderr) ? '远端已有新提交，请先处理分支差异后重试 Push。本地提交已保留。' :
      /Authentication failed|could not read Username|HTTP (401|403)|access denied|permission denied/i.test(stderr) ? '远端拒绝推送，请检查账号写入权限和分支保护。本地提交已保留。' :
      /certificate|SSL/i.test(stderr) ? '推送时证书验证失败，请检查服务器证书。本地提交已保留。' :
      problem instanceof Error && /已变化|取消|超时|无法确认/.test(problem.message) ? problem.message : 'Push 未确认完成，请检查网络、Git LFS、推送钩子和分支权限。本地提交已保留。';
    throw new Error(message);
  }
}
