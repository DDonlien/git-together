import { access, copyFile, lstat, mkdtemp, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { commitMessage, type LocalSubmitInput, type LocalSubmitResult } from '../src/local-submit-model';
import { readRepositoryWorkspace, readWorktrees } from './repository-reader';
import { runGitProcess } from './git-process';
import { traceOperation, gitDetails } from './diagnostics';

export async function currentCommitTask(root: string, input: Pick<LocalSubmitInput, 'taskId' | 'expectedHead' | 'changeKey'>) {
  const workspace = await readRepositoryWorkspace(root, new Set([root]));
  const task = workspace.tasks.find(task => task.id === input.taskId && task.path === root);
  if (!task || task.error) throw new Error('当前工作目录不可用，请刷新后重试。');
  if (task.branch === 'Detached HEAD') throw new Error('当前目录处于游离 HEAD，请先在 Git 中选择分支。');
  if (task.head !== input.expectedHead || task.changeKey !== input.changeKey) throw new Error('分支、提交或文件更改已变化，请检查最新更改后重试。');
  if (!task.files.length) throw new Error('没有可提交的更改。');
  if (task.files.some(file => /U|AA|DD/.test(file.status))) throw new Error('请先解决合并冲突，再提交。');
  for (const name of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply']) {
    const path = (await runGitProcess(root, ['rev-parse', '--path-format=absolute', '--git-path', name])).trim();
    if (await access(path).then(() => true, problem => { if (problem.code === 'ENOENT') return false; throw problem; })) throw new Error('请先完成正在进行的合并、变基或拣选，再提交。');
  }
  return task;
}

function submitFailure(problem: unknown): Error {
  const value = problem && typeof problem === 'object' ? problem as Record<string, unknown> : {};
  const stderr = typeof value.stderr === 'string' ? value.stderr : '';
  const message = /Author identity unknown|unable to auto-detect email|empty ident/i.test(stderr) ? 'Git 未配置提交者姓名或邮箱，请配置 user.name 和 user.email 后重试。' :
    /gpg failed|failed to sign|signing failed|ssh.*sign/i.test(stderr) ? 'Git 提交签名失败，请检查本机签名配置后重试。' :
    /nothing to commit|no changes added/i.test(stderr) ? '没有可提交的更改，请刷新文件列表。' :
    /index.lock|cannot lock ref/i.test(stderr) || value.code === 'EEXIST' ? '另一个 Git 操作正在使用这个工作目录，请等待完成后重试。' :
    /No space left on device/i.test(stderr) || value.code === 'ENOSPC' ? '磁盘空间不足，提交未完成。' :
    value.code === 'ENOENT' ? '没有找到 Git 或工作目录已不存在。' :
    value instanceof Error && /超时|取消|已变化|不可用|冲突|没有可提交|游离|请先完成|正在进行/.test(value.message) ? value.message :
    'Git 未完成提交，请检查本机提交钩子、签名和文件权限后重试。';
  return new Error(message);
}

// Stage in a private index while holding the real index's conventional lock.
// Failed hooks/signing leave the original staging byte-for-byte unchanged.
// Successful commits publish the resulting index atomically; no checkout,
// reset, push, or automatic retry is involved.
export async function submitLocalCommit(root: string, input: LocalSubmitInput, validate: () => void, signal?: AbortSignal): Promise<LocalSubmitResult> {
  signal?.throwIfAborted(); validate();
  const task = await currentCommitTask(root, input);
  const index = (await runGitProcess(root, ['rev-parse', '--path-format=absolute', '--git-path', 'index'], { signal })).trim();
  const lockPath = `${index}.lock`;
  const lock = await open(lockPath, 'wx', 0o600).catch(problem => { throw submitFailure(problem); });
  let temporary: string | undefined, published = false;
  try {
    temporary = await mkdtemp(join(dirname(index), 'gittogether-commit-'));
    const privateIndex = join(temporary, 'index');
    try { if (!(await lstat(index)).isFile()) throw new Error('Git index 无效。'); await copyFile(index, privateIndex); }
    catch (problem) { if (!(problem && typeof problem === 'object' && 'code' in problem && problem.code === 'ENOENT')) throw problem; }
    const env = { GIT_INDEX_FILE: privateIndex };
    signal?.throwIfAborted(); validate();
    await runGitProcess(root, ['add', '--all', '--', '.'], { env, signal });
    // An edit during staging requires another review, not a silent extra file.
    await currentCommitTask(root, input); signal?.throwIfAborted(); validate();
    const message = commitMessage(input);
    let failure: unknown;
    try {
      // Once commit starts, a browser disconnect must not kill a commit halfway
      // through. Its own bounded process lifetime still applies.
      await traceOperation('git-write', gitDetails(root, ['commit']), () => runGitProcess(root, ['commit', '--cleanup=verbatim', '--file=-'], { env, stdin: message }));
    } catch (problem) { failure = problem; }
    const after = (await readWorktrees(root)).find(worktree => worktree.path === root);
    if (!after || after.head === task.head) throw failure || new Error('Git 没有创建新提交。');
    const [parent, tree] = await Promise.all([
      runGitProcess(root, ['show', '-s', '--format=%P', after.head]), runGitProcess(root, ['write-tree'], { env }),
    ]);
    const actualTree = (await runGitProcess(root, ['show', '-s', '--format=%T', after.head])).trim();
    const expectedParent = /^0+$/.test(task.head) ? '' : task.head;
    if (after.branch !== task.branch || parent.trim() !== expectedParent || actualTree !== tree.trim()) {
      throw new Error('提交期间分支或提交内容已变化，请检查实际 Git 历史和暂存状态。');
    }
    const result: LocalSubmitResult = { taskId: task.id, commitId: after.head, branch: after.branch };
    if (failure) result.warning = '提交已创建，但 Git 后续反馈未完成；请检查本机提交钩子。';
    try { await lock.writeFile(await readFile(privateIndex)); await lock.sync(); await lock.close(); await rename(lockPath, index); published = true; }
    catch { result.warning = '提交已创建，但更新暂存状态失败；请检查 Git index 后再进行下一次提交。'; }
    return result;
  } catch (problem) { throw submitFailure(problem); }
  finally { await lock.close().catch(() => {}); if (!published) await rm(lockPath, { force: true }); if (temporary) await rm(temporary, { recursive: true, force: true }); }
}
