import { randomUUID } from 'node:crypto';
import { githubVerificationURL, isRecord, type Catalog, type GitHubAuthorization, type GitHubAuthorizationCancellation, type GitHubAuthorizationProgress } from '../src/import-model';
import pkg from '../package.json';

type AuthorizedCredential = { token: string; name: string; expiresAt?: string; signal: AbortSignal; commit: () => void };
type Session = {
  public: GitHubAuthorization; deviceCode: string; name: string;
  controller: AbortController; signal: AbortSignal; nextPoll: number; committing: boolean;
  pending?: Promise<GitHubAuthorizationProgress>; catalog?: Catalog; failure?: string;
};
const providerErrors: Record<string, string> = {
  access_denied: '你在 GitHub 取消了授权，可以重新开始。',
  expired_token: '授权码已过期，请重新授权。',
  token_expired: '授权码已过期，请重新授权。',
  device_flow_disabled: 'GitTogether 的 GitHub 应用尚未启用设备授权。请在应用设置中启用。',
  incorrect_client_credentials: 'GitTogether 的 GitHub Client ID 无效，请检查应用配置。',
  incorrect_device_code: '授权码已失效，请重新授权。',
  bad_verification_code: '授权码已失效，请重新授权。',
  unverified_user_email: '请先在 GitHub 验证邮箱，再重新授权。',
};

export class GitHubDeviceAuthorization {
  private sessions = new Map<string, Session>();
  private starting = 0;
  readonly configured: boolean;
  constructor(
    private clientId: string,
    private connect: (credential: AuthorizedCredential) => Promise<Catalog>,
    private request: typeof fetch = fetch,
    private now: () => number = Date.now,
  ) {
    this.configured = /^[a-zA-Z0-9_.-]{5,120}$/.test(clientId) && !/^(github_pat_|gh[pousr]_)/.test(clientId);
  }
  private prune() {
    for (const [id, session] of this.sessions) {
      if (!session.committing && (session.signal.aborted || session.public.expiresAt <= this.now())) {
        session.controller.abort(); this.sessions.delete(id);
      }
    }
  }
  private active(session: Session) {
    if (session.failure) throw new Error(session.failure);
    if (session.controller.signal.aborted) throw new Error('授权已取消。');
    if (session.signal.aborted || session.public.expiresAt <= this.now()) throw new Error('授权码已过期，请重新授权。');
  }
  private async post(path: '/login/device/code' | '/login/oauth/access_token', fields: Record<string, string>, signal?: AbortSignal): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await this.request(`https://github.com${path}`, {
        method: 'POST', redirect: 'error', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': `GitTogether/${pkg.version}` },
        body: new URLSearchParams(fields), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
      });
    } catch {
      if (signal?.aborted) throw new Error('授权已取消或过期。');
      throw new Error('无法连接 GitHub 授权服务，请检查网络后重试。');
    }
    if (!response.ok) throw new Error(`GitHub 授权服务返回 HTTP ${response.status}，请稍后重试。`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error('GitHub 授权服务没有返回数据。');
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const part = await reader.read(); if (part.done) break;
        size += part.value.length; if (size > 32_768) { await reader.cancel(); throw new Error(); }
        chunks.push(part.value);
      }
      const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!isRecord(body)) throw new Error();
      return body;
    } catch { throw new Error('GitHub 授权服务返回格式无效，请重试。'); }
  }
  async start(name: string): Promise<GitHubAuthorization> {
    if (!this.configured) throw new Error('网页授权尚未配置：需要 GitTogether 自有 GitHub App 的 Client ID，并启用设备授权。');
    this.prune();
    if (this.sessions.size + this.starting >= 8) throw new Error('已有授权正在等待，请取消或稍后重试。');
    this.starting++;
    try {
      // No repo scope, client secret or third-party application identity is requested.
      const body = await this.post('/login/device/code', { client_id: this.clientId });
      if (typeof body.error === 'string') throw new Error(providerErrors[body.error] || 'GitHub 无法开始授权，请检查应用配置。');
      if (typeof body.device_code !== 'string' || !body.device_code || body.device_code.length > 512 || /\s/.test(body.device_code) ||
        typeof body.user_code !== 'string' || !/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(body.user_code) || body.verification_uri !== githubVerificationURL ||
        typeof body.expires_in !== 'number' || !Number.isSafeInteger(body.expires_in) || body.expires_in < 1 || body.expires_in > 3600 ||
        typeof body.interval !== 'number' || !Number.isSafeInteger(body.interval) || body.interval < 1 || body.interval > 900) throw new Error('GitHub 授权信息无效，没有打开其他网站。');
      const interval = Math.max(5, body.interval);
      const result: GitHubAuthorization = { id: randomUUID(), userCode: body.user_code, verificationURL: githubVerificationURL, expiresAt: this.now() + body.expires_in * 1000, interval };
      const controller = new AbortController();
      this.sessions.set(result.id, { public: result, deviceCode: body.device_code, name, controller, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(body.expires_in * 1000)]), nextPoll: this.now() + interval * 1000, committing: false });
      return { ...result };
    } finally { this.starting--; }
  }
  async poll(id: string): Promise<GitHubAuthorizationProgress> {
    const session = this.sessions.get(id);
    if (!session) throw new Error('授权会话已失效，请重新开始。');
    if (session.catalog) return { status: 'complete', catalog: session.catalog };
    this.active(session);
    if (session.pending) return session.pending;
    if (this.now() < session.nextPoll) return { status: 'pending', retryAfter: Math.max(1, Math.ceil((session.nextPoll - this.now()) / 1000)) };
    session.nextPoll = this.now() + session.public.interval * 1000;
    const pending = (async (): Promise<GitHubAuthorizationProgress> => {
      const body = await this.post('/login/oauth/access_token', { client_id: this.clientId, device_code: session.deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }, session.signal);
      this.active(session);
      if (body.error === 'authorization_pending' || body.error === 'slow_down') {
        if (body.error === 'slow_down') session.public.interval = Math.max(session.public.interval + 5, typeof body.interval === 'number' && Number.isSafeInteger(body.interval) && body.interval <= 900 ? body.interval : 0);
        session.nextPoll = this.now() + session.public.interval * 1000;
        return { status: 'pending', retryAfter: session.public.interval };
      }
      if (typeof body.error === 'string') { session.failure = providerErrors[body.error] || 'GitHub 授权失败，请重新开始。'; session.deviceCode = ''; throw new Error(session.failure); }
      if (typeof body.access_token !== 'string' || !body.access_token || body.access_token.length > 4096 || /\s/.test(body.access_token) || body.token_type !== 'bearer') throw new Error('GitHub 授权凭据格式无效。');
      if (body.expires_in !== undefined && (typeof body.expires_in !== 'number' || !Number.isSafeInteger(body.expires_in) || body.expires_in <= 0 || body.expires_in > 31_536_000)) throw new Error('GitHub 授权有效期无效。');
      const expiresAt = typeof body.expires_in === 'number' ? new Date(this.now() + body.expires_in * 1000).toISOString() : undefined;
      session.catalog = await this.connect({ token: body.access_token, name: session.name, expiresAt, signal: session.signal, commit: () => { this.active(session); session.committing = true; } });
      session.deviceCode = '';
      return { status: 'complete', catalog: session.catalog };
    })();
    session.pending = pending;
    try { return await pending; }
    finally { session.pending = undefined; session.committing = false; }
  }
  async cancel(id: string): Promise<GitHubAuthorizationCancellation> {
    const session = this.sessions.get(id);
    if (!session) return { cancelled: true };
    if (session.committing && session.pending) await session.pending.catch(() => {});
    if (session.catalog) return { cancelled: false, catalog: session.catalog };
    session.controller.abort(); session.deviceCode = '';
    this.sessions.delete(id);
    return { cancelled: true };
  }
}
