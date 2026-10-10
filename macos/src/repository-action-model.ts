import type { RemoteRepository } from './import-model';
import type { RepositoryTask } from './repository-model';
import type { RemoteRepositoryState } from './remote-repository-model';
import type { LocalRepositoryState } from './use-workspace';
import { gitSignals } from './branch-links';

export type RepositoryActionMode = 'commit' | 'submit' | 'push' | 'pull' | 'latest' | 'clean';
export type RepositoryActionTarget = { repositoryId: string; repositoryName: string; task: RepositoryTask; commitId?: string };

export function repositoryActionTargets(repository: RemoteRepository, tasks: RepositoryTask[], mode: RepositoryActionMode, remote: RemoteRepositoryState, local?: LocalRepositoryState): RepositoryActionTarget[] {
  if (!repository.available) return [];
  return tasks.filter(task => task.path && !task.remote && !task.error && (['pull', 'latest', 'clean'].includes(mode) ? true : mode === 'push'
    ? (gitSignals([task], remote, local, task.branch, repository.available).push.count || 0) > 0
    : !!task.files.length && !!task.changeKey)).map(task => ({ repositoryId: repository.id, repositoryName: repository.fullName, task }));
}
