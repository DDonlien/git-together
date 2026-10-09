import { providerName, type Account, type RemoteRepository } from './import-model';

// null follows the complete catalog, including newly discovered options. An
// explicit set (even empty) preserves a deliberate subset across refreshes.
export type FilterSelection = ReadonlySet<string> | null;
export interface MultiFilterOption { value: string; label: string; detail?: string }
export interface MultiFilterGroup { id: string; label: string; detail?: string; options: MultiFilterOption[] }
export const repositorySources: MultiFilterOption[] = [{ value: 'remote', label: '远端' }, { value: 'local', label: '本地' }];
export const repositoryTypes: MultiFilterOption[] = [{ value: 'original', label: 'Original' }, { value: 'fork', label: 'Fork' }, { value: 'added', label: 'Added' }];
export const repositoryVisibilities: MultiFilterOption[] = [{ value: 'public', label: '公开' }, { value: 'private', label: '私有' }];

export function accountOptions(accounts: Account[]): MultiFilterOption[] {
  return accounts.map(account => ({ value: account.id, label: account.name, detail: `${providerName(account.provider)} · ${account.login}@${new URL(account.host).host}` }));
}

export function isSelected(selection: FilterSelection, value: string) { return selection === null || selection.has(value); }
export function isUnrestricted(selection: FilterSelection, options: MultiFilterOption[]) {
  return selection === null || (selection.size > 0 && options.length > 0 && options.every(option => selection.has(option.value)));
}
export function toggleFilter(selection: FilterSelection, value: string, options: MultiFilterOption[]): FilterSelection {
  const next = new Set(options.filter(option => isSelected(selection, option.value)).map(option => option.value));
  if (next.has(value)) next.delete(value); else next.add(value);
  return options.length && options.every(option => next.has(option.value)) ? null : next;
}
export function organizationKey(repo: RemoteRepository) {
  return JSON.stringify([repo.accountId, repo.ownerType === 'organization' ? 'organization' : repo.ownerType === 'user' ? 'personal' : 'unknown', repo.ownerType === 'organization' ? repo.fullName.split('/')[0].toLowerCase() : '']);
}
export function organizationGroups(accounts: Account[], repositories: RemoteRepository[]): MultiFilterGroup[] {
  return accounts.map(account => {
    const options = new Map<string, MultiFilterOption>();
    for (const repo of repositories) if (repo.accountId === account.id) {
      const value = organizationKey(repo);
      options.set(value, { value, label: repo.ownerType === 'organization' ? repo.fullName.split('/')[0] : repo.ownerType === 'user' ? '个人仓库' : '未识别归属' });
    }
    return { id: account.id, label: account.name, detail: `${providerName(account.provider)} · ${account.login}@${new URL(account.host).host}`, options: [...options.values()].sort((a, b) => a.label.localeCompare(b.label)) };
  });
}
export function matchesRepositoryFilters(repo: RemoteRepository, linked: boolean, selections: { organization: FilterSelection; source: FilterSelection; type: FilterSelection; visibility?: FilterSelection }, organizations: MultiFilterOption[]) {
  if (!isUnrestricted(selections.organization, organizations) && !isSelected(selections.organization, organizationKey(repo))) return false;
  if (!isSelected(selections.source, linked ? 'local' : 'remote')) return false;
  if (!isSelected(selections.visibility ?? null, repo.private ? 'private' : 'public')) return false;
  return matchesRepositoryType(repo, selections.type);
}
export function matchesRepositoryType(repo: RemoteRepository, type: FilterSelection) {
  if (isUnrestricted(type, repositoryTypes)) return true;
  return (repo.fork === false && isSelected(type, 'original')) ||
    (repo.fork === true && isSelected(type, 'fork')) ||
    (repo.collaborator === true && isSelected(type, 'added'));
}
export function repositoryTypeCoverage(repositories: RemoteRepository[], type: FilterSelection) {
  if (isUnrestricted(type, repositoryTypes) || type?.size === 0) return { unknown: 0, errors: [] as string[] };
  const unknown = repositories.filter(repo => !matchesRepositoryType(repo, type) && (
    (repo.fork === undefined && (isSelected(type, 'original') || isSelected(type, 'fork'))) ||
    (repo.collaborator === undefined && isSelected(type, 'added'))
  ));
  // A failed supplementary directory may hide a repository entirely, even when
  // every visible record already has its own classification.
  const directoryErrors = repositories.filter(repo => repo.metadataError?.includes('补充目录'));
  return { unknown: unknown.length, errors: [...new Set([...unknown, ...directoryErrors].flatMap(repo => repo.metadataError ? [repo.metadataError] : []))] };
}
export function repositoryClassification(repo: RemoteRepository): string {
  const source = repo.fork === true ? 'Fork' : repo.fork === false ? 'Original' : '来源未确认';
  const permission = repo.permissions;
  const access = permission?.admin ? 'Admin' : permission?.maintain ? 'Maintain' : permission?.push ? 'Write' : permission?.triage ? 'Triage' : permission?.pull ? 'Read' : '权限未确认';
  return `${source}${repo.collaborator === true ? ' · Added' : ''} · ${access}${repo.metadataError ? ` · ${repo.metadataError}` : ''}`;
}
