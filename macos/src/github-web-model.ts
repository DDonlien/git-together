import { githubVerificationURL, isCatalog, isRecord, providers, type Catalog, type GitHubAuthorization, type Provider } from './import-model';

// Public identity of our development GitHub App, not a credential.
export const githubDevClientId = 'Iv23liKMFYSaYtpe3XnL';
export const githubOAuthOrigin = 'http://127.0.0.1:4174';
export const githubOAuthCallback = `${githubOAuthOrigin}/oauth/github/callback`;
export const githubOAuthSetup = `${githubOAuthOrigin}/setup`;
export const authorizationCallback = () => typeof window !== 'undefined' && !window.gittogether ? 'http://127.0.0.1:4176/oauth/github/callback' : githubOAuthCallback;
export type WebAuthorizationOptions = { provider: Provider; host: string; clientId?: string; clientSecret?: string };
export type GitHubWebSession = { id: string; authorizationURL: string; expiresAt: number; provider?: Provider; host?: string; clientId?: string; callbackUri?: string };
export type GitHubDeviceFallback = GitHubAuthorization & { flow: 'device' };
export type GitHubWebAuthorization = GitHubWebSession | GitHubDeviceFallback;
export function isGitHubDeviceFallback(value: unknown): value is GitHubDeviceFallback {
  return isRecord(value) && value.flow === 'device' && typeof value.id === 'string' && /^[\w-]{36}$/.test(value.id) &&
    typeof value.userCode === 'string' && /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(value.userCode) && value.verificationURL === githubVerificationURL &&
    typeof value.expiresAt === 'number' && Number.isSafeInteger(value.expiresAt) &&
    typeof value.interval === 'number' && Number.isInteger(value.interval) && value.interval >= 5 && value.interval <= 900;
}
export type GitHubWebProgress = { status: 'pending' } | { status: 'complete'; catalog: Catalog };
export type GitHubWebCancellation = { cancelled: true } | { cancelled: false; catalog: Catalog };

export function isGitHubAuthorizationURL(value: unknown, target?: Pick<GitHubWebSession, 'provider' | 'host' | 'clientId' | 'callbackUri'>): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    const kind = target?.provider ?? 'github';
    if (!providers.includes(kind) || kind === 'gitea') return false;
    const host = new URL(target?.host ?? 'https://github.com');
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(host.hostname);
    const pkce = kind === 'github' || kind === 'gitlab' || kind === 'github-enterprise' && host.hostname.endsWith('.ghe.com');
    const clientId = kind === 'github' ? githubDevClientId : target?.clientId;
    const callback = target?.callbackUri ?? githubOAuthCallback;
    if (![githubOAuthCallback, 'http://127.0.0.1:4176/oauth/github/callback'].includes(callback)) return false;
    return !!clientId && clientId.length <= 512 && !/\s/.test(clientId) &&
      !host.username && !host.password && host.pathname === '/' && !host.search && !host.hash && (host.protocol === 'https:' || host.protocol === 'http:' && loopback) &&
      (kind !== 'github' || host.origin === 'https://github.com') && url.origin === host.origin && url.pathname === (kind === 'github' || kind === 'github-enterprise' ? '/login/oauth/authorize' : '/oauth/authorize') &&
      !url.username && !url.password && !url.hash && url.searchParams.get('client_id') === clientId && url.searchParams.get('redirect_uri') === callback &&
      /^[\w-]{43}$/.test(url.searchParams.get('state') || '') &&
      (!pkce || url.searchParams.get('code_challenge_method') === 'S256' && /^[\w-]{43}$/.test(url.searchParams.get('code_challenge') || ''));
  } catch { return false; }
}
export function isGitHubWebSession(value: unknown): value is GitHubWebSession {
  return isRecord(value) && typeof value.id === 'string' && /^[\w-]{36}$/.test(value.id) &&
    typeof value.expiresAt === 'number' && Number.isSafeInteger(value.expiresAt) &&
    (value.provider === undefined || providers.some(provider => provider === value.provider)) &&
    (value.host === undefined || typeof value.host === 'string') && (value.clientId === undefined || typeof value.clientId === 'string') && (value.callbackUri === undefined || typeof value.callbackUri === 'string') &&
    isGitHubAuthorizationURL(value.authorizationURL, value as GitHubWebSession);
}
export function isGitHubWebProgress(value: unknown): value is GitHubWebProgress {
  return isRecord(value) && (value.status === 'pending' || value.status === 'complete' && isCatalog(value.catalog));
}
export function isGitHubWebCancellation(value: unknown): value is GitHubWebCancellation {
  return isRecord(value) && (value.cancelled === true || value.cancelled === false && isCatalog(value.catalog));
}
