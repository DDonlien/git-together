import type { LocalLink, RemoteRepository } from './import-model';
import type { RepositoryTask } from './repository-model';
import type { RemoteRepositoryState } from './remote-repository-model';
import type { LocalRepositoryState } from './use-workspace';
import { gitSignals } from './branch-links';
import { usesSystemAuthentication } from './repository-auth-model';
import type { CommitDraft } from './local-submit-model';

export type RepositoryActionMode = 'commit' | 'submit' | 'push' | 'pull' | 'latest' | 'clean';
export type RepositoryOperationState = 'preparing' | 'ready' | 'working' | 'failed' | 'completed';
export type RepositoryOperationControls = { visible?: boolean; onCollapse?: () => void; onStateChange?: (state: RepositoryOperationState) => void; onFinished?: () => void };
export const repositoryOperationScope = (repositoryId: string, branch?: string, taskId?: string) => JSON.stringify([repositoryId, branch || null, taskId || null]);
export type RepositoryActionTarget = { repositoryId: string; repositoryName: string; task: RepositoryTask; commitId?: string; draft?: CommitDraft };

export function repositoryActionTargets(repository: RemoteRepository, tasks: RepositoryTask[], mode: RepositoryActionMode, remote: RemoteRepositoryState, local?: LocalRepositoryState, link?: LocalLink): RepositoryActionTarget[] {
  const system = usesSystemAuthentication(link);
  if (!repository.available && !system) return [];
  return tasks.filter(task => {
    if (!task.path || task.remote || task.error) return false;
    if (['pull', 'latest', 'clean'].includes(mode)) return true;
    if (mode === 'push') {
      const count = gitSignals([task], remote, local, task.branch, repository.available, system).push.count;
      return (count || 0) > 0 || system && count === undefined && !!task.head;
    }
    return !!task.files.length && !!task.changeKey;
  }).map(task => ({ repositoryId: repository.id, repositoryName: repository.fullName, task }));
}
