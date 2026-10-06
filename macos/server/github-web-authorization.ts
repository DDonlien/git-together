import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { isRecord, type Catalog } from '../src/import-model';
import { githubDevClientId, githubOAuthCallback, type GitHubWebSession, type GitHubWebProgress, type GitHubWebCancellation } from '../src/github-web-model';

export type WebCredential = { token: string; name: string; expiresAt?: string; signal: AbortSignal; commit: () => void };
export type WebConnector = (credential: WebCredential) => Promise<Catalog>;
type Session = {
  public: GitHubWebSession; state: string; verifier: string; secret: string; name: string;
  connect: WebConnector;
  controller: AbortController; used: boolean; committing: boolean;
  pending?: Promise<void>; catalog?: Catalog; failure?: string;
};
const lifetimeMs = 10 * 60_000;

export function validateGitHubClientSecret(secret: string): void {
  if (!/^[a-zA-Z0-9_.-]{10,512}$/.test(secret) || /^(github_pat_|gh[pousr]_)/.test(secret)) throw new Error('请输入应用的客户端密钥，不是账号访问令牌。');
}

/** Server-only OAuth code exchange. Neither secrets nor tokens are public DTOs. */
export class GitHubWebAuthorization {
  private secret = '';
  private configuring = false;
  private sessions = new Map<string, Session>();
  constructor(private connect: WebConnector, private request: typeof fetch = fetch, private now: () => number = Date.now) {}
  get configured() { return !!this.secret; }
  configure(secret: string) {
    this.checkConfiguration(secret);
    this.secret = secret;
  }
  async configureAndSave(secret: string, save: (secret: string) => Promise<void>): Promise<void> {
    this.checkConfiguration(secret);
    this.configuring = true;
    try { await save(secret); this.secret = secret; }
    catch { throw new Error('网页授权配置保存失败；未启用新密钥，也未明文保存。请检查系统钥匙串和文件权限后重试。'); }
    finally { this.configuring = false; }
  }
  private checkConfiguration(secret: string) {
    validateGitHubClientSecret(secret);
    if (this.configuring) throw new Error('正在保存网页授权配置，请稍后重试。');
    this.prune();
    if ([...this.sessions.values()].some(session => !session.catalog && !session.failure)) throw new Error('请先结束当前授权，再更新开发配置。');
  }
  private prune() {
    for (const [id, session] of this.sessions) if (!session.committing && session.public.expiresAt <= this.now()) {
      session.controller.abort(); session.secret = ''; session.verifier = ''; this.sessions.delete(id);
    }
  }
  private active(session: Session) {
    if (session.failure) throw new Error(session.failure);
    if (session.controller.signal.aborted) throw new Error('授权已取消。');
    if (session.public.expiresAt <= this.now()) throw new Error('授权已过期，请重新开始。');
  }
  start(name: string, connect: WebConnector = this.connect): GitHubWebSession {
    if (this.configuring) throw new Error('正在保存网页授权配置，请稍后重试。');
    if (!this.configured) throw new Error('GitHub 网页登录尚未完成开发配置。');
    if (typeof name !== 'string' || name.length > 120 || /[\0\r\n]/.test(name)) throw new Error('账号名称无效。');
    this.prune();
    if (this.sessions.size >= 8) throw new Error('已有授权正在等待，请先取消或稍后重试。');
    const state = randomBytes(32).toString('base64url'); const verifier = randomBytes(32).toString('base64url');
    const authorization = new URL('https://github.com/login/oauth/authorize');
    authorization.search = new URLSearchParams({ client_id: githubDevClientId, redirect_uri: githubOAuthCallback, state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', prompt: 'select_account' }).toString();
    const result = { id: randomUUID(), authorizationURL: authorization.href, expiresAt: this.now() + lifetimeMs };
    this.sessions.set(result.id, { public: result, state, verifier, secret: this.secret, name: name.trim(), connect, controller: new AbortController(), used: false, committing: false });
    return { ...result };
  }
  poll(id: string): GitHubWebProgress {
    const session = this.sessions.get(id);
    if (!session) throw new Error('授权会话已失效，请重新开始。');
    if (session.catalog) return { status: 'complete', catalog: structuredClone(session.catalog) };
    this.active(session);
    return { status: 'pending' };
  }
  async cancel(id: string): Promise<GitHubWebCancellation> {
    const session = this.sessions.get(id);
    if (!session) return { cancelled: true };
    // Once a connector begins saving, cancellation must report the actual result.
    if (session.committing && session.pending) await session.pending;
    if (session.catalog) return { cancelled: false, catalog: structuredClone(session.catalog) };
    session.controller.abort(); session.secret = ''; session.verifier = ''; this.sessions.delete(id);
    return { cancelled: true };
  }
  async callback(parameters: URLSearchParams, accepted?: () => void): Promise<void> {
    const state = parameters.get('state');
    if (!state || parameters.getAll('state').length !== 1) throw new Error('授权回调无法验证，请从 GitTogether 重新开始。');
    const session = [...this.sessions.values()].find(item => item.state === state);
    if (!session) throw new Error('授权回调已失效，请从 GitTogether 重新开始。');
    this.active(session);
    if (session.used) throw new Error('此授权回调已处理，请返回 GitTogether。');
    session.used = true;
    if (parameters.has('error')) {
      session.failure = parameters.get('error') === 'access_denied' ? '你在 GitHub 取消了授权，可以重新开始。' : 'GitHub 未能完成授权，请重新开始。';
      session.secret = ''; session.verifier = ''; throw new Error(session.failure);
    }
    const code = parameters.get('code');
    if (!code || parameters.getAll('code').length !== 1 || !/^[\w.-]{1,512}$/.test(code)) {
      session.failure = '授权回调格式无效，请重新开始。'; session.secret = ''; session.verifier = ''; throw new Error(session.failure);
    }
    accepted?.();
    const pending = this.exchange(session, code);
    session.pending = pending;
    try { await pending; }
    catch (problem) { session.failure = problem instanceof Error ? problem.message : '网页授权失败，请重新开始。'; throw new Error(session.failure); }
    finally { session.secret = ''; session.verifier = ''; session.pending = undefined; session.committing = false; }
  }
  private async exchange(session: Session, code: string) {
    let response: Response;
    try {
      response = await this.request('https://github.com/login/oauth/access_token', { method: 'POST', redirect: 'error',
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'GitTogether-development' },
        body: new URLSearchParams({ client_id: githubDevClientId, client_secret: session.secret, code, redirect_uri: githubOAuthCallback, code_verifier: session.verifier }),
        signal: AbortSignal.any([session.controller.signal, AbortSignal.timeout(15000)]) });
    } catch { this.active(session); throw new Error('无法连接 GitHub 授权服务，请重新开始。'); }
    this.active(session);
    if (!response.ok) throw new Error(`GitHub 授权服务返回 HTTP ${response.status}，请重新开始。`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error('GitHub 授权响应无效，请重新开始。');
    let body: unknown; const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 32768) { await reader.cancel(); throw new Error(); } chunks.push(part.value); }
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch { this.active(session); throw new Error('GitHub 授权响应无效，请重新开始。'); }
    this.active(session);
    if (!isRecord(body)) throw new Error('GitHub 授权响应无效，请重新开始。');
    if (body.error) throw new Error(body.error === 'incorrect_client_credentials' ? '应用客户端密钥无效，请更新本机开发配置。' : 'GitHub 未能交换授权码，请重新开始。');
    if (typeof body.access_token !== 'string' || !body.access_token || body.access_token.length > 4096 || /\s/.test(body.access_token) || body.token_type !== 'bearer') throw new Error('GitHub 授权凭据格式无效。');
    if (body.expires_in !== undefined && (typeof body.expires_in !== 'number' || !Number.isSafeInteger(body.expires_in) || body.expires_in <= 0 || body.expires_in > 31_536_000)) throw new Error('GitHub 授权有效期无效。');
    const expiresAt = typeof body.expires_in === 'number' ? new Date(this.now() + body.expires_in * 1000).toISOString() : undefined;
    session.catalog = await session.connect({ token: body.access_token, name: session.name, expiresAt, signal: session.controller.signal,
      commit: () => { this.active(session); session.committing = true; } });
    // Refresh tokens are deliberately not retained without an approved renewal/store design.
  }
}
