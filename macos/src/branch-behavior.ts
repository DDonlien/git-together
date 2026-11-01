import { hiddenEntryKey } from './branch-links';
import type { RepositoryTask } from './repository-model';

export type BranchBehaviorPreferences = {
  unworkedBranchBehavior?: 'default' | 'hide';
  hiddenEntries?: string[];
  shownBranches?: string[];
};

export function branchHiddenEntries(repositoryId: string, preferences: BranchBehaviorPreferences, remoteTasks: readonly RepositoryTask[] = [], localTasks: readonly RepositoryTask[] = []): Set<string> {
  return new Set(preferences.hiddenEntries || []);
}

export function toggleBranchVisibility(preferences: BranchBehaviorPreferences, key: string, hidden: boolean): Pick<BranchBehaviorPreferences, 'hiddenEntries' | 'shownBranches'> {
  const entries = new Set(preferences.hiddenEntries || []), shown = new Set(preferences.shownBranches || []);
  if (hidden) { entries.delete(key); shown.add(key); }
  else { entries.add(key); shown.delete(key); }
  return { hiddenEntries: [...entries], shownBranches: [...shown] };
}
