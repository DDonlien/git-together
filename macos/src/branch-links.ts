import type { LocalLink } from './import-model';
import type { RepositoryTask } from './repository-model';
import type { RemoteRepositoryState } from './remote-repository-model';
import type { LocalRepositoryState } from './use-workspace';

// Current HEAD owns the directory after a real read, not the saved branch label.
export function linkedTasks(link?: LocalLink, local?: LocalRepositoryState): RepositoryTask[] {
  if (!link) return [];
  const paths = new Set((link.worktrees || [{ path: link.path }]).map(item => item.path));
  if (local?.workspace && local.path === link.path) return local.workspace.tasks.filter(task => task.path && paths.has(task.path));
  return (link.worktrees || [{ path: link.path, branch: '未读取分支' }]).map(item => ({ ...item, id: `worktree:${item.branch}:${item.path}`, head: '', tree: [], files: [], error: '正在验证工作目录…' }));
}

export function associationStatus(link: LocalLink | undefined, local: LocalRepositoryState | undefined, remote: RemoteRepositoryState) {
  if (!link) return { label: '尚未关联', detail: '选择仓库目录或父目录，自动匹配其内的工作目录。' };
  const tasks = linkedTasks(link, local);
  const expected = new Set([...(remote.workspace?.tasks.map(task => task.branch) || []), ...tasks.map(task => task.branch)]);
  const linked = new Set(tasks.filter(task => !task.error).map(task => task.branch));
  const completeBranches = !!remote.workspace && !remote.error && !remote.workspace.warnings.some(warning => warning.startsWith('分支超过'));
  const complete = completeBranches && expected.size > 0 && [...expected].every(branch => linked.has(branch)) && tasks.every(task => !task.error) && !local?.error;
  return { label: complete ? '完全关联' : '部分关联', detail: `${linked.size}/${expected.size || '?'} 个分支已验证；${completeBranches ? '' : '远端分支范围尚未完整读取；'}${local?.error || tasks.filter(task => task.error).map(task => task.error).join('；') || link.path}` };
}

export type ActionSignal = { tone: 'off' | 'good' | 'warning' | 'error'; detail: string; count?: number };
export type GitSignals = Record<'commit' | 'fetch' | 'pull' | 'push' | 'latest' | 'reconcile' | 'clear', ActionSignal>;

function contains(commits: Map<string, string[]>, head: string, ancestor: string): boolean {
  const pending = [head]; const visited = new Set<string>();
  while (pending.length) { const id = pending.pop()!; if (id === ancestor) return true; if (visited.has(id)) continue; visited.add(id); pending.push(...(commits.get(id) || [])); }
  return false;
}

export function gitSignals(local: RepositoryTask[], remote: RemoteRepositoryState, localState?: LocalRepositoryState, branch?: string, available = true): GitSignals {
  const tasks = branch ? local.filter(task => task.branch === branch) : local;
  const error = !available ? '访问账号目前无权读取此仓库。' : localState?.error || (localState?.workspace ? tasks.find(task => task.error)?.error : '') || remote.error;
  const baseline: ActionSignal = { tone: error ? 'error' : 'off', detail: error || (tasks.length ? '正在读取本地及远端信息。' : '尚未关联该分支的本地工作目录。'), ...(error ? { count: 1 } : {}) };
  const result: GitSignals = { commit: { ...baseline }, fetch: { ...baseline }, pull: { ...baseline }, push: { ...baseline }, latest: { ...baseline }, reconcile: { ...baseline }, clear: { ...baseline } };
  if (!tasks.length || error) return result;
  result.fetch = { tone: 'off', detail: remote.workspace ? `远端最近读取：${new Date(remote.workspace.checkedAt).toLocaleString()}。Fetch 会更新本地远端跟踪引用。` : '远端内容尚未读取；Fetch 会更新本地远端跟踪引用。' };
  // HEAD ancestry describes Pull/Push, not storage reclamation or file-content
  // reconciliation. Those actions need their own measured plans before counts.
  result.latest = { tone: 'off', detail: '本地历史与缓存的可清理范围尚未确认。' };
  result.reconcile = { tone: 'off', detail: '本地与远端的文件内容尚未完整比较，变更数量未确认。' };
  result.clear = { tone: 'off', detail: '本地与远端的文件内容尚未完整比较，变更数量未确认。' };
  const changes = tasks.reduce((sum, task) => sum + task.files.length, 0);
  result.commit = { tone: changes ? 'warning' : 'off', ...(changes ? { count: changes } : {}), detail: changes ? `工作目录中有 ${changes} 项未提交更改（含未跟踪文件）。` : '已关联工作目录没有未提交更改。' };
  const commits = new Map([...(remote.workspace?.commits || []), ...(localState?.workspace?.commits || [])].map(commit => [commit.id, commit.parents]));
  const comparisons = tasks.map(task => {
    const target = remote.workspace?.tasks.find(remoteTask => remoteTask.branch === task.branch);
    if (!target || !target.head || target.error || !task.head) return { pull: 'off' as const, push: 'off' as const, text: `${task.branch}：本地或远端 HEAD 尚未确认。` };
    if (task.head === target.head) return { pull: 'good' as const, push: 'off' as const, text: `${task.branch}：本地与远端一致（${task.head.slice(0, 8)}）。` };
    if (contains(commits, task.head, target.head)) return { pull: 'good' as const, push: 'warning' as const, text: `${task.branch}：本地包含远端最新提交，另有尚未推送的提交。` };
    if (contains(commits, target.head, task.head)) return { pull: 'warning' as const, push: 'off' as const, text: `${task.branch}：本地落后于已读取的远端 HEAD。` };
    return { pull: 'warning' as const, push: 'warning' as const, text: `${task.branch}：本地 ${task.head.slice(0, 8)} 与远端 ${target.head.slice(0, 8)} 不同；在已读取范围内无法确认领先、落后或分叉。` };
  });
  const detail = [...new Set(comparisons.map(item => item.text))].slice(0, 4).join(' ');
  const pullCount = comparisons.filter(item => item.pull === 'warning').length;
  const pullTone = pullCount ? 'warning' : comparisons.every(item => item.pull === 'good') ? 'good' : 'off';
  result.pull = { tone: pullTone, ...(pullTone === 'good' || pullCount ? { count: pullCount } : {}), detail };
  const pushCount = comparisons.filter(item => item.push === 'warning').length;
  result.push = { tone: pushCount ? 'warning' : 'off', ...(pushCount ? { count: pushCount } : {}), detail };
  return result;
}
