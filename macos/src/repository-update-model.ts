import type { GitSignals } from './branch-links';
import type { RepositoryActionTarget } from './repository-action-model';

export type RepositoryUpdateDecision = {
  action: 'fetch' | 'pull' | 'push';
  targets: RepositoryActionTarget[];
  detail: string;
};

export function repositoryUpdateScope(scope: string, action: 'pull' | 'push', targets: readonly RepositoryActionTarget[]): string {
  return JSON.stringify(['update', scope, action, targets.map(({ task }) => [task.id, task.path, task.head, task.tracking?.upstream, task.tracking?.ahead, task.tracking?.behind])]);
}

// Only Git's own upstream counts authorize a write. In aggregate rows, keep
// every selected action on the exact worktrees for which that action applies.
export function repositoryUpdateDecision(targets: readonly RepositoryActionTarget[], signals: GitSignals): RepositoryUpdateDecision {
  const eligible = targets.filter(({ task }) => !!task.path && !task.remote && !task.error && /^[a-f0-9]{40,64}$/.test(task.head));
  if ([signals.fetch, signals.pull, signals.push].some(signal => signal.status === 'error')) {
    return { action: 'fetch', targets: [], detail: '状态读取失败，先重新获取远端状态。' };
  }
  const known = eligible.filter(({ task }) => task.tracking?.upstream && task.tracking.ahead !== null && task.tracking.behind !== null);
  const behind = known.filter(({ task }) => task.tracking!.behind! > 0);
  if (behind.length) return { action: 'pull', targets: behind, detail: `Pull ${behind.length} 个落后远端的工作目录；其他工作目录不参与此操作。` };
  if (known.length !== targets.length) return { action: 'fetch', targets: [], detail: '部分工作目录的跟踪状态未知，先获取远端状态。' };
  const ahead = known.filter(({ task }) => task.tracking!.ahead! > 0);
  if (ahead.length) return { action: 'push', targets: ahead, detail: `Push ${ahead.length} 个领先远端的工作目录。` };
  return { action: 'fetch', targets: [], detail: eligible.length ? '当前没有待同步提交，获取远端更新。' : '获取远端更新。' };
}
