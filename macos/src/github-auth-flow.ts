import { githubVerificationURL, type Catalog, type GitHubAuthorization, type GitHubAuthorizationProgress } from './import-model';

export async function openGitHubAuthorization(): Promise<boolean> {
  if (window.gittogether) {
    try { await window.gittogether.openGithubAuthorization(); return true; } catch { return false; }
  }
  // Called directly from a user gesture, before any network awaits. The only
  // navigation target is the official verification page, never API-provided URLs.
  try {
    const popup = window.open(githubVerificationURL, '_blank', 'popup,width=760,height=820');
    if (!popup) return false;
    popup.opener = null;
    return true;
  } catch { return false; }
}

export function authorizationDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const cancelled = () => { clearTimeout(timer); signal.removeEventListener('abort', cancelled); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', cancelled); resolve(); }, milliseconds);
    signal.addEventListener('abort', cancelled, { once: true });
  });
}

export async function waitForGitHubAuthorization(
  session: GitHubAuthorization,
  poll: (sessionId: string, signal: AbortSignal) => Promise<GitHubAuthorizationProgress>,
  signal: AbortSignal,
  options: { now?: () => number; sleep?: typeof authorizationDelay } = {},
): Promise<Catalog> {
  const now = options.now || Date.now; const sleep = options.sleep || authorizationDelay;
  let interval = session.interval;
  while (true) {
    signal.throwIfAborted();
    if (now() >= session.expiresAt) throw new Error('授权码已过期，请重新授权。');
    await sleep(Math.min(interval * 1000, session.expiresAt - now()), signal);
    signal.throwIfAborted();
    if (now() >= session.expiresAt) throw new Error('授权码已过期，请重新授权。');
    const progress = await poll(session.id, signal);
    signal.throwIfAborted();
    if (progress.status === 'complete') return progress.catalog;
    interval = progress.retryAfter;
  }
}
