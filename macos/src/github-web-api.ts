import { isRecord } from './import-model';
import { githubOAuthOrigin, isGitHubAuthorizationURL, isGitHubWebSession, isGitHubWebProgress, isGitHubWebCancellation, type GitHubWebSession, type GitHubWebProgress, type GitHubWebCancellation } from './github-web-model';
import { authorizationDelay } from './github-auth-flow';

async function webAPI(method: 'start' | 'poll' | 'cancel', input: unknown, signal?: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${githubOAuthOrigin}/api/${method}`, { method: 'POST', redirect: 'error', credentials: 'omit',
      headers: { 'Content-Type': 'application/json', 'X-GitTogether-Client': '1' }, body: JSON.stringify(input),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(method === 'cancel' ? 190000 : 15000) });
  } catch {
    if (signal?.aborted) throw signal.reason;
    throw new Error('无法连接本机网页授权服务，请检查开发环境后重试。');
  }
  let envelope: unknown;
  try { envelope = await response.json(); } catch { throw new Error('网页授权服务返回格式无效。'); }
  if (!response.ok || !isRecord(envelope) || envelope.ok !== true) throw new Error(isRecord(envelope) && typeof envelope.error === 'string' ? envelope.error : '网页授权失败，请重新开始。');
  return envelope.value;
}
export async function startGitHubWebAuthorization(name: string): Promise<GitHubWebSession> {
  const result = await webAPI('start', { name });
  if (!isGitHubWebSession(result)) throw new Error('网页授权信息无效，没有打开其他网站。');
  return result;
}
export async function pollGitHubWebAuthorization(sessionId: string, signal: AbortSignal): Promise<GitHubWebProgress> {
  const result = await webAPI('poll', { sessionId }, signal);
  if (!isGitHubWebProgress(result)) throw new Error('网页授权状态返回格式无效。');
  return result;
}
export async function cancelGitHubWebAuthorization(sessionId: string): Promise<GitHubWebCancellation> {
  const result = await webAPI('cancel', { sessionId });
  if (!isGitHubWebCancellation(result)) throw new Error('网页授权取消结果返回格式无效。');
  return result;
}
// Reserve within the click, before awaiting the API, to retain popup activation.
export function reserveGitHubWebWindow(): Window | null {
  try { const popup = window.open('about:blank', '_blank', 'popup,width=760,height=820'); if (popup) popup.opener = null; return popup; }
  catch { return null; }
}
export function navigateGitHubWebWindow(popup: Window | null, authorizationURL: string): boolean {
  if (!isGitHubAuthorizationURL(authorizationURL)) throw new Error('授权网址无效，没有打开其他网站。');
  if (!popup) return false;
  try { popup.location.replace(authorizationURL); return true; } catch { return false; }
}
export function reopenGitHubWebWindow(authorizationURL: string): boolean {
  if (!isGitHubAuthorizationURL(authorizationURL)) throw new Error('授权网址无效，没有打开其他网站。');
  return navigateGitHubWebWindow(reserveGitHubWebWindow(), authorizationURL);
}
export async function waitForGitHubWebAuthorization(session: GitHubWebSession, signal: AbortSignal, options: {
  poll?: typeof pollGitHubWebAuthorization; now?: () => number; sleep?: typeof authorizationDelay;
} = {}) {
  const now = options.now || Date.now; const sleep = options.sleep || authorizationDelay; const poll = options.poll || pollGitHubWebAuthorization;
  while (true) {
    signal.throwIfAborted();
    if (now() >= session.expiresAt) throw new Error('授权已过期，请重新开始。');
    const result = await poll(session.id, signal); signal.throwIfAborted();
    if (result.status === 'complete') return result.catalog;
    await sleep(Math.min(2000, session.expiresAt - now()), signal);
  }
}
