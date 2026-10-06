import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { realpath } from 'node:fs/promises';
import type { LocalFile } from '../src/import-model';
import type { RepositoryCommit, RepositoryTask, RepositoryWorkspace } from '../src/repository-model';

const execute = promisify(execFile);
function readFailure(problem: unknown): string {
  const code = problem && typeof problem === 'object' && 'code' in problem ? String(problem.code) : 'unknown';
  return code === 'ETIMEDOUT' ? 'Git 读取超时；正在等待下次检查。' : `Git 读取失败（${code}）；其他任务仍可查看。`;
}
async function git(path: string, args: string[]): Promise<string> {
  const { stdout } = await execute('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', '-c', 'core.pager=cat', '-C', path, ...args], {
    timeout: 10000, maxBuffer: 8_000_000, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
  });
  return stdout;
}

export function parseChangedFiles(porcelain: string): LocalFile[] {
  const entries = porcelain.split('\0');
  const files: LocalFile[] = [];
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    if (!entry) continue;
    const code = entry.slice(0, 2);
    files.push({ path: entry.slice(3), status: code.trim() || 'M', tracked: code !== '??' });
    if (code.includes('R') || code.includes('C')) index++;
  }
  return files;
}

type Worktree = { path: string; branch: string; head: string; bare: boolean; prunable: boolean };
export function parseWorktrees(porcelain: string): Worktree[] {
  return porcelain.split('\0\0').filter(Boolean).map(record => {
    const fields = record.split('\0');
    const value = (key: string) => fields.find(field => field.startsWith(`${key} `))?.slice(key.length + 1) || '';
    const branch = value('branch').replace(/^refs\/heads\//, '');
    return { path: value('worktree'), head: value('HEAD'), branch: branch || 'Detached HEAD', bare: fields.includes('bare'), prunable: fields.some(field => field === 'prunable' || field.startsWith('prunable ')) };
  });
}

async function sameRepository(root: string, worktree: string): Promise<void> {
  const [rootCommon, worktreeCommon] = await Promise.all([git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']), git(worktree, ['rev-parse', '--path-format=absolute', '--git-common-dir'])]);
  if (await realpath(rootCommon.trim()) !== await realpath(worktreeCommon.trim())) throw new Error('工作目录不属于已关联仓库。');
}

// Only the account service may supply the validated, remote-matched root.
// Worktree paths and commit hashes come from that repository, not the renderer.
export async function readRepositoryWorkspace(root: string): Promise<RepositoryWorkspace> {
  const [worktreeOutput, refOutput] = await Promise.all([
    git(root, ['worktree', 'list', '--porcelain', '-z']),
    git(root, ['for-each-ref', '--format=%(refname)%00%(objectname)', '--sort=refname', 'refs/heads', 'refs/remotes']),
  ]);
  const worktrees = parseWorktrees(worktreeOutput).filter(worktree => !worktree.bare);
  const refs = refOutput.trim().split('\n').filter(Boolean).map(line => { const [name, head] = line.split('\0'); return { name, head }; });
  const readTree = async (head: string) => (await git(root, ['ls-tree', '-r', '--name-only', '-z', head, '--'])).split('\0').filter(Boolean);
  const tasks: RepositoryTask[] = [];
  for (const worktree of worktrees) {
    const task: RepositoryTask = { id: `worktree:${worktree.branch}:${worktree.path}`, branch: worktree.branch, head: worktree.head, path: worktree.path, files: [], tree: [], error: '' };
    if (worktree.prunable) { task.error = '工作目录已不存在，未删除任何 Git 记录。'; tasks.push(task); continue; }
    try {
      await sameRepository(root, worktree.path);
      const [status, tree] = await Promise.all([git(worktree.path, ['status', '--porcelain=v1', '-z', '--untracked-files=all']), git(worktree.path, ['ls-files', '--cached', '--others', '--exclude-standard', '-z'])]);
      task.files = parseChangedFiles(status);
      task.tree = [...new Set(tree.split('\0').filter(Boolean))];
    } catch (problem) { task.error = readFailure(problem); }
    tasks.push(task);
  }
  const checkedBranches = new Set(worktrees.map(worktree => worktree.branch));
  for (const ref of refs.filter(ref => ref.name.startsWith('refs/heads/'))) {
    const branch = ref.name.slice('refs/heads/'.length);
    if (checkedBranches.has(branch)) continue;
    const task: RepositoryTask = { id: `branch:${ref.name}`, branch, head: ref.head, path: null, files: [], tree: [], error: '' };
    try { task.tree = await readTree(ref.head); }
    catch (problem) { task.error = readFailure(problem); }
    tasks.push(task);
  }
  const heads = [...new Set(worktrees.map(worktree => worktree.head).filter(head => /^[0-9a-f]{40,64}$/.test(head) && !/^0+$/.test(head)))];
  const commits: RepositoryCommit[] = [];
  if (refs.length || heads.length) {
    // 200 visible commits keeps graph/IPC bounded; older parents remain edges
    // at the boundary rather than fabricated roots. No remote fetch is run.
    const history = await git(root, ['log', '--all', ...heads, '--topo-order', '-200', '--format=%H%x00%P%x00%s%x00%an%x00%aI%x00', '--']);
    for (const line of history.trim().split('\n').filter(Boolean)) {
      const [id, parents, summary, author, time] = line.split('\0');
      commits.push({ id, parents: parents.split(' ').filter(Boolean), summary, author, time, refs: refs.filter(ref => ref.head === id).map(ref => ref.name.replace(/^refs\/(heads|remotes)\//, '')) });
    }
  }
  return { tasks, commits, complete: true };
}

export async function readRepositoryTaskDiff(root: string, taskId: string, path: string): Promise<string> {
  const task = parseWorktrees(await git(root, ['worktree', 'list', '--porcelain', '-z'])).find(task => `worktree:${task.branch}:${task.path}` === taskId);
  if (!task || task.bare || task.prunable) throw new Error('这个任务没有可读取的工作目录。');
  await sameRepository(root, task.path);
  const files = parseChangedFiles(await git(task.path, ['status', '--porcelain=v1', '-z', '--untracked-files=all']));
  const file = files.find(file => file.path === path);
  if (!file) throw new Error('文件不在这个任务的更改列表中。');
  if (!file.tracked) return '未跟踪文件尚无 Git Diff；本版本不会读取或上传其内容。';
  const literalPath = `:(literal)${path}`;
  const [working, staged] = await Promise.all([
    git(task.path, ['diff', '--no-ext-diff', '--no-textconv', '--', literalPath]),
    git(task.path, ['diff', '--cached', '--no-ext-diff', '--no-textconv', '--', literalPath]),
  ]);
  return [staged && `# 已暂存\n${staged}`, working && `# 工作目录\n${working}`].filter(Boolean).join('\n') || '没有文本差异（可能是二进制文件、权限或重命名）。';
}
