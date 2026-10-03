export type Provider = 'github' | 'gitea';
export type Account = {
  id: string; provider: Provider; host: string; login: string; name: string;
  updatedAt: string; error?: string;
};
export type RemoteRepository = {
  id: string; remoteId: number; accountId: string; name: string; fullName: string;
  description: string; defaultBranch: string; private: boolean; url: string;
  available: boolean;
};
export type LocalLink = { repositoryId: string; path: string };
export type Catalog = {
  revision: number;
  accounts: Account[]; repositories: RemoteRepository[]; links: LocalLink[];
  credentialStorage: 'session' | 'encrypted';
};
export type ConnectInput = { provider: Provider; host: string; token: string; name: string };
export type LocalFile = { path: string; status: string; tracked: boolean };
export type LocalSnapshot = {
  path: string; branch: string; files: LocalFile[];
  commits: { id: string; summary: string; author: string; time: string }[];
};
export type ApiInputs = {
  catalog: Record<string, never>;
  connect: ConnectInput;
  refresh: { accountId: string };
  removeAccount: { accountId: string };
  link: { repositoryId: string; path: string };
  unlink: { repositoryId: string };
  snapshot: { repositoryId: string };
  diff: { repositoryId: string; path: string };
};
export type ApiOutputs = {
  catalog: Catalog; connect: Catalog; refresh: Catalog; removeAccount: Catalog;
  link: Catalog; unlink: Catalog; snapshot: LocalSnapshot; diff: { text: string };
};
export type ApiMethod = keyof ApiInputs;
export const emptyCatalog: Catalog = { revision: 0, accounts: [], repositories: [], links: [], credentialStorage: 'session' };
export const providerName = (provider: Provider) => provider === 'github' ? 'GitHub' : 'Gitea';
export const accountLabel = (account: Account) => `${account.name} · ${account.login}@${new URL(account.host).host}`;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function isCatalog(value: unknown): value is Catalog {
  return isRecord(value) && typeof value.revision === 'number' && Number.isSafeInteger(value.revision) && ['session', 'encrypted'].includes(String(value.credentialStorage)) &&
    Array.isArray(value.accounts) && value.accounts.every(a => isRecord(a) &&
      ['id', 'host', 'login', 'name', 'updatedAt'].every(k => typeof a[k] === 'string') &&
      ['github', 'gitea'].includes(String(a.provider))) &&
    Array.isArray(value.repositories) && value.repositories.every(r => isRecord(r) &&
      ['id', 'accountId', 'name', 'fullName', 'description', 'defaultBranch', 'url'].every(k => typeof r[k] === 'string') &&
      typeof r.remoteId === 'number' && typeof r.private === 'boolean' && typeof r.available === 'boolean') &&
    Array.isArray(value.links) && value.links.every(l => isRecord(l) && typeof l.repositoryId === 'string' && typeof l.path === 'string');
}
