import type { Account, RemoteRepository } from './import-model';

export function isRepositoryFilePath(path: unknown): path is string {
  return typeof path === 'string' && path.length > 0 && path.length <= 4000 && !/[\0\\]/.test(path)
    && path.split('/').every(part => part !== '' && part !== '.' && part !== '..' && !/^\.git$/i.test(part));
}

// Use the account's verified host and the tree's immutable HEAD, not the
// provider's arbitrary html_url or the independently selected history node.
export function repositoryFileURL(account: Account, repository: RemoteRepository, commitId: string, path: string): string | null {
  if (!repository.available || repository.accountId !== account.id || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(commitId) || !isRepositoryFilePath(path)) return null;
  const identity = repository.fullName.split('/');
  if (identity.length !== 2 || identity.some(part => !part || part === '.' || part === '..' || /[\s\0\\]/.test(part))) return null;
  let host: URL;
  try { host = new URL(account.host); } catch { return null; }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(host.hostname);
  if (host.username || host.password || host.pathname !== '/' || host.search || host.hash || (host.protocol !== 'https:' && !(host.protocol === 'http:' && loopback))) return null;
  if (account.provider === 'github' && host.origin !== 'https://github.com') return null;
  const route = account.provider === 'github' ? 'blob' : 'src/commit';
  return `${host.origin}/${identity.map(encodeURIComponent).join('/')}/${route}/${commitId}/${path.split('/').map(encodeURIComponent).join('/')}`;
}
