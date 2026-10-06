import { isCatalog, isRecord, type Catalog } from './import-model';

// Public identity of our development GitHub App, not a credential.
export const githubDevClientId = 'Iv23liKMFYSaYtpe3XnL';
export const githubOAuthOrigin = 'http://127.0.0.1:4174';
export const githubOAuthCallback = `${githubOAuthOrigin}/oauth/github/callback`;
export const githubOAuthSetup = `${githubOAuthOrigin}/setup`;
export type GitHubWebSession = { id: string; authorizationURL: string; expiresAt: number };
export type GitHubWebProgress = { status: 'pending' } | { status: 'complete'; catalog: Catalog };
export type GitHubWebCancellation = { cancelled: true } | { cancelled: false; catalog: Catalog };

export function isGitHubAuthorizationURL(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.origin === 'https://github.com' && url.pathname === '/login/oauth/authorize' &&
      !url.username && !url.password && !url.hash && url.searchParams.get('client_id') === githubDevClientId &&
      url.searchParams.get('redirect_uri') === githubOAuthCallback && url.searchParams.get('code_challenge_method') === 'S256' &&
      /^[\w-]{43}$/.test(url.searchParams.get('state') || '') && /^[\w-]{43}$/.test(url.searchParams.get('code_challenge') || '');
  } catch { return false; }
}
export function isGitHubWebSession(value: unknown): value is GitHubWebSession {
  return isRecord(value) && typeof value.id === 'string' && /^[\w-]{36}$/.test(value.id) &&
    typeof value.expiresAt === 'number' && Number.isSafeInteger(value.expiresAt) && isGitHubAuthorizationURL(value.authorizationURL);
}
export function isGitHubWebProgress(value: unknown): value is GitHubWebProgress {
  return isRecord(value) && (value.status === 'pending' || value.status === 'complete' && isCatalog(value.catalog));
}
export function isGitHubWebCancellation(value: unknown): value is GitHubWebCancellation {
  return isRecord(value) && (value.cancelled === true || value.cancelled === false && isCatalog(value.catalog));
}
