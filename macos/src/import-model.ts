import type { RemoteCommitDetails, RemoteFileContent, RemoteRepositoryWorkspace } from './remote-repository-model';
import type { RepositoryWorkspace } from './repository-model';
import type { LocalCommitDetails } from './local-commit-model';

export type Provider = 'github' | 'gitea';
export const repositoryPermissionKeys = ['admin', 'maintain', 'push', 'triage', 'pull'] as const;
export type RepositoryPermissions = Partial<Record<typeof repositoryPermissionKeys[number], boolean>>;
export type Account = {
  id: string; provider: Provider; host: string; login: string; name: string;
  updatedAt: string; error?: string; authorizationExpiresAt?: string;
};
export type RemoteRepository = {
  id: string; remoteId: number; accountId: string; name: string; fullName: string;
  description: string; defaultBranch: string; private: boolean; url: string;
  available: boolean; updatedAt?: string;
  ownerType?: 'user' | 'organization'; fork?: boolean; collaborator?: boolean;
  permissions?: RepositoryPermissions; metadataError?: string;
};
export type LocalWorktreeLink = { branch: string; path: string };
export type LocalLink = { repositoryId: string; path: string; worktrees?: LocalWorktreeLink[] };
export type Catalog = {
  instanceId: string;
  revision: number;
  accounts: Account[]; repositories: RemoteRepository[]; links: LocalLink[];
  credentialStorage: 'session' | 'encrypted';
};
export type ConnectInput = { provider: Provider; host: string; token: string; name: string };
export type UpdateAccountInput = { accountId: string; name: string; token?: string };
export type ServiceInfo = { instanceId: string; version: string; githubWebAuth: boolean };
export const githubVerificationURL = 'https://github.com/login/device';
export type GitHubAuthorization = {
  id: string; userCode: string; verificationURL: typeof githubVerificationURL;
  expiresAt: number; interval: number;
};
export type GitHubAuthorizationProgress = { status: 'pending'; retryAfter: number } | { status: 'complete'; catalog: Catalog };
export type GitHubAuthorizationCancellation = { cancelled: true } | { cancelled: false; catalog: Catalog };
export type LocalFile = { path: string; status: string; tracked: boolean };
export type LocalSnapshot = {
  path: string; branch: string; files: LocalFile[];
  commits: { id: string; summary: string; author: string; time: string }[];
};
export type ApiInputs = {
  status: Record<string, never>;
  catalog: Record<string, never>;
  connect: ConnectInput;
  updateAccount: UpdateAccountInput;
  githubAuthStart: { name: string };
  githubAuthPoll: { sessionId: string };
  githubAuthCancel: { sessionId: string };
  refresh: { accountId: string };
  removeAccount: { accountId: string };
  link: { repositoryId: string; path: string; branch?: string };
  downloadBranch: { repositoryId: string; branch: string; parentPath: string; folderName: string };
  matchAccountRepositories: { accountId: string; path: string };
  unlink: { repositoryId: string; branch?: string };
  snapshot: { repositoryId: string };
  localWorkspace: { repositoryId: string };
  localCommit: { repositoryId: string; taskId: string; commitId: string };
  diff: { repositoryId: string; path: string; taskId?: string; commitId?: string };
  remoteWorkspace: { repositoryId: string };
  remoteCommit: { repositoryId: string; commitId: string };
  remoteFile: { repositoryId: string; commitId: string; path: string };
  openFile: { repositoryId: string; path: string } & ({ source: 'remote'; commitId: string } | { source: 'local'; taskId: string });
};
export type ApiOutputs = {
  status: ServiceInfo;
  catalog: Catalog; connect: Catalog; updateAccount: Catalog; refresh: Catalog; removeAccount: Catalog;
  githubAuthStart: GitHubAuthorization;
  githubAuthPoll: GitHubAuthorizationProgress;
  githubAuthCancel: GitHubAuthorizationCancellation;
  link: Catalog; downloadBranch: Catalog; matchAccountRepositories: { catalog: Catalog; matchedRepositoryIds: string[] }; unlink: Catalog; snapshot: LocalSnapshot; diff: { text: string };
  localWorkspace: RepositoryWorkspace;
  localCommit: LocalCommitDetails;
  remoteWorkspace: RemoteRepositoryWorkspace; remoteCommit: RemoteCommitDetails; remoteFile: RemoteFileContent;
  openFile: { opened: true };
};
export type ApiMethod = keyof ApiInputs;
export const emptyCatalog: Catalog = { instanceId: '', revision: 0, accounts: [], repositories: [], links: [], credentialStorage: 'session' };
export const providerName = (provider: Provider) => provider === 'github' ? 'GitHub' : 'Gitea';
export const accountLabel = (account: Account) => `${account.name} · ${account.login}@${new URL(account.host).host}`;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function isCatalog(value: unknown): value is Catalog {
  return isRecord(value) && typeof value.instanceId === 'string' && typeof value.revision === 'number' && Number.isSafeInteger(value.revision) && ['session', 'encrypted'].includes(String(value.credentialStorage)) &&
    Array.isArray(value.accounts) && value.accounts.every(a => isRecord(a) &&
      ['id', 'host', 'login', 'name', 'updatedAt'].every(k => typeof a[k] === 'string') &&
      ['github', 'gitea'].includes(String(a.provider))) &&
    Array.isArray(value.repositories) && value.repositories.every(r => isRecord(r) &&
      ['id', 'accountId', 'name', 'fullName', 'description', 'defaultBranch', 'url'].every(k => typeof r[k] === 'string') &&
      typeof r.remoteId === 'number' && typeof r.private === 'boolean' && typeof r.available === 'boolean' &&
      (r.updatedAt === undefined || typeof r.updatedAt === 'string' && Number.isFinite(Date.parse(r.updatedAt))) &&
      (r.ownerType === undefined || r.ownerType === 'user' || r.ownerType === 'organization') &&
      (r.fork === undefined || typeof r.fork === 'boolean') && (r.collaborator === undefined || typeof r.collaborator === 'boolean') &&
      (r.metadataError === undefined || typeof r.metadataError === 'string') &&
      (r.permissions === undefined || (isRecord(r.permissions) && Object.entries(r.permissions).every(([key, flag]) => repositoryPermissionKeys.some(allowed => allowed === key) && typeof flag === 'boolean')))) &&
    Array.isArray(value.links) && value.links.every(l => isRecord(l) && typeof l.repositoryId === 'string' && typeof l.path === 'string' &&
      (l.worktrees === undefined || Array.isArray(l.worktrees) && l.worktrees.length <= 64 && l.worktrees.every(w => isRecord(w) && typeof w.branch === 'string' && typeof w.path === 'string')));
}

// A new service session can legitimately start at revision zero. Old in-flight
// responses must not replace a catalog from the currently verified session.
export function latestCatalog(current: Catalog, next: Catalog, instanceId: string): Catalog {
  if (next.instanceId !== instanceId) return current;
  return current.instanceId !== instanceId || next.revision >= current.revision ? next : current;
}
