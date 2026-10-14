import { hiddenEntryKey } from './branch-links';
import type { RepositoryTask } from './repository-model';

export type BranchBehaviorPreferences = {
  unworkedBranchBehavior?: 'default' | 'hide';
  hiddenEntries?: string[];
  shownBranches?: string[];
};

export function branchHiddenEntries(repositoryId: string, preferences: BranchBehaviorPreferences, remoteTasks: readonly RepositoryTask[] = [], localTasks: readonly RepositoryTask[] = []): Set<string> {
  const hidden = new Set(preferences.hiddenEntries || []);
  if (preferences.unworkedBranchBehavior !== 'hide') return hidden;
  const shown = new Set(preferences.shownBranches || []);
  for (const task of remoteTasks) {
    const key = hiddenEntryKey(repositoryId, task.branch);
    // An unpublished local HEAD or a dirty directory is evidence the remote
    // account query cannot classify; keep it visible until it can be confirmed.
    const localUnknown = localTasks.some(local => local.branch === task.branch && (!!local.error || local.head !== task.head || local.files.length > 0));
    // Creating a repository also counts as work on its sole branch. Missing
    // creation evidence cannot establish that this branch was never worked on.
    const creationUnknown = remoteTasks.length === 1 && task.hasAccountCreation === undefined;
    if (task.hasAccountCommits === false && task.hasAccountPush !== true && task.hasAccountCreation !== true && !creationUnknown && !task.error && !task.participationError && !localUnknown && !shown.has(key)) hidden.add(key);
  }
  return hidden;
}

export function toggleBranchVisibility(preferences: BranchBehaviorPreferences, key: string, hidden: boolean): Pick<BranchBehaviorPreferences, 'hiddenEntries' | 'shownBranches'> {
  const entries = new Set(preferences.hiddenEntries || []), shown = new Set(preferences.shownBranches || []);
  if (hidden) { entries.delete(key); shown.add(key); }
  else { entries.add(key); shown.delete(key); }
  return { hiddenEntries: [...entries], shownBranches: [...shown] };
}
