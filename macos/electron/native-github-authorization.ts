import { randomBytes } from 'node:crypto';
import { githubDevClientId, githubOAuthOrigin, isGitHubWebSession, type GitHubWebSession, type GitHubWebProgress, type GitHubWebCancellation } from '../src/github-web-model';
import { isCatalog, isRecord, type Catalog } from '../src/import-model';

type Credential = { token: string; name: string; expiresAt?: string };
type NativeSession = { public: GitHubWebSession; key: string; catalog?: Catalog; acknowledged: boolean; pending?: Promise<GitHubWebProgress> };

export class NativeGitHubAuthorization {
  private sessions = new Map<string, NativeSession>();
  constructor(private connect: (credential: Credential) => Promise<Catalog>, private request: typeof fetch, private ensureHelper: () => Promise<void>) {}
  private async api(method: string, input: unknown) {
    let response: Response;
    try {
      response = await this.request(`${githubOAuthOrigin}/api/native/${method}`, { method: 'POST', redirect: 'error',
        headers: { 'Content-Type': 'application/json', 'X-GitTogether-Client': '1' }, body: JSON.stringify(input), signal: AbortSignal.timeout(10000) });
    } catch { throw new Error('无法连接 GitHub 网页授权服务，请重新打开 GitTogether 后重试。'); }
    let body: unknown;
    try {
      const reader = response.body?.getReader(); if (!reader) throw new Error();
      const chunks: Uint8Array[] = []; let bytes = 0;
      while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.length; if (bytes > 32768) { await reader.cancel(); throw new Error(); } chunks.push(part.value); }
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch { throw new Error('授权服务需要更新，请重新打开新版 GitTogether。'); }
    if (!response.ok || !isRecord(body) || body.ok !== true) throw new Error(isRecord(body) && typeof body.error === 'string' ? body.error : 'GitHub 网页授权失败，请重新开始。');
    return body.value;
  }
  private session(id: string) {
    const entry = this.sessions.get(id);
    if (!entry) throw new Error('桌面授权会话已失效，请重新开始。');
    return entry;
  }
  async start(name: string) {
    await this.ensureHelper();
    const status = await this.api('status', {});
    if (!isRecord(status) || status.nativeAuthorization !== true || status.clientId !== githubDevClientId) throw new Error('授权服务的应用身份不匹配，请更新 GitTogether。');
    if (!status.configured) throw new Error('GitHub 网页授权配置未能恢复，请在本机开发配置页检查已保存的应用配置。');
    for (const [id, entry] of this.sessions) if (entry.public.expiresAt <= Date.now() && !entry.pending) this.sessions.delete(id);
    const key = randomBytes(32).toString('hex');
    const session = await this.api('start', { name, key });
    if (!isGitHubWebSession(session)) throw new Error('GitHub 授权网址无效，没有打开其他网站。');
    this.sessions.set(session.id, { public: session, key, acknowledged: false });
    return session;
  }
  authorizationURL(id: string) { return this.session(id).public.authorizationURL; }
  private async acknowledge(entry: NativeSession) {
    if (!entry.acknowledged) {
      const result = await this.api('complete', { sessionId: entry.public.id, key: entry.key, success: true });
      if (!isRecord(result) || result.completed !== true) throw new Error('账号已保存，授权网页尚未确认完成，请返回设置检查账号。');
      entry.acknowledged = true;
    }
    return { status: 'complete', catalog: entry.catalog! } as const;
  }
  async poll(id: string): Promise<GitHubWebProgress> {
    const entry = this.session(id);
    if (entry.pending) return entry.pending;
    const pending = (async (): Promise<GitHubWebProgress> => {
      if (entry.catalog) return this.acknowledge(entry);
      const result = await this.api('poll', { sessionId: id, key: entry.key });
      if (!isRecord(result)) throw new Error('桌面授权状态无效。');
      if (result.status === 'pending') return { status: 'pending' };
      const grant = result.credential;
      if (result.status !== 'credential' || !isRecord(grant) || typeof grant.token !== 'string' || !grant.token || grant.token.length > 4096 || /\s/.test(grant.token) ||
        typeof grant.name !== 'string' || grant.name.length > 120 || (grant.expiresAt !== undefined && (typeof grant.expiresAt !== 'string' || !Number.isFinite(Date.parse(grant.expiresAt))))) throw new Error('GitHub 授权凭据无效。');
      try {
        entry.catalog = await this.connect({ token: grant.token, name: grant.name, expiresAt: grant.expiresAt as string | undefined });
        if (!isCatalog(entry.catalog)) throw new Error('桌面账号保存结果无效。');
      } catch (problem) {
        await this.api('complete', { sessionId: id, key: entry.key, success: false });
        throw problem;
      } finally { grant.token = ''; }
      return this.acknowledge(entry);
    })();
    entry.pending = pending;
    try { return await pending; } finally { entry.pending = undefined; }
  }
  async cancel(id: string): Promise<GitHubWebCancellation> {
    const entry = this.session(id);
    if (entry.pending) { try { await entry.pending; } catch { /* Resolve cancellation against the helper after a failed import. */ } }
    const result = await this.api('cancel', { sessionId: id, key: entry.key });
    if (!isRecord(result) || typeof result.cancelled !== 'boolean') throw new Error('桌面授权取消状态无效。');
    if (result.cancelled) { this.sessions.delete(id); return { cancelled: true }; }
    if (!entry.catalog) throw new Error('账号保存结果尚未确认，请返回设置检查。');
    return { cancelled: false, catalog: entry.catalog };
  }
  get busy() { return [...this.sessions.values()].some(entry => !entry.catalog); }
  close() {
    for (const id of this.sessions.keys()) void this.cancel(id).catch(() => console.warn('桌面授权取消未确认；待会话过期后失效。'));
  }
}
