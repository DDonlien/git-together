import { timingSafeEqual } from 'node:crypto';
import { emptyCatalog } from '../src/import-model';
import { GitHubWebAuthorization, type WebCredential } from './github-web-authorization';

type NativeSession = {
  key: string; expiresAt: number; credential?: WebCredential; taken: boolean; completed: boolean;
  resolve?: () => void; reject?: (problem: Error) => void;
};

// Only Electron main receives the grant. Browser requests cannot enter this
// channel, and each session has a separate capability kept out of the renderer.
export class GitHubNativeBroker {
  private sessions = new Map<string, NativeSession>();
  constructor(private flow: GitHubWebAuthorization, private now: () => number = Date.now) {}
  owns(id: unknown) { return typeof id === 'string' && this.sessions.has(id); }
  private session(input: Record<string, unknown>) {
    const entry = typeof input.sessionId === 'string' ? this.sessions.get(input.sessionId) : undefined;
    if (!entry || typeof input.key !== 'string' || !/^[a-f0-9]{64}$/.test(input.key) ||
      !timingSafeEqual(Buffer.from(entry.key), Buffer.from(input.key))) throw new Error('桌面授权会话无法验证，请重新开始。');
    if (entry.expiresAt <= this.now()) throw new Error('桌面授权已过期，请重新开始。');
    return entry;
  }
  start(input: Record<string, unknown>) {
    if (typeof input.key !== 'string' || !/^[a-f0-9]{64}$/.test(input.key) || typeof input.name !== 'string' || input.name.length > 120) throw new Error('桌面授权请求无效。');
    for (const [id, entry] of this.sessions) if (entry.expiresAt <= this.now()) this.sessions.delete(id);
    const entry: NativeSession = { key: input.key, expiresAt: 0, taken: false, completed: false };
    const session = this.flow.start(input.name, async credential => {
      entry.credential = credential;
      try {
        await new Promise<void>((resolve, reject) => {
          entry.resolve = resolve; entry.reject = reject;
          const abort = () => reject(new Error('桌面授权已取消或过期。'));
          credential.signal.addEventListener('abort', abort, { once: true });
          entry.resolve = () => { credential.signal.removeEventListener('abort', abort); resolve(); };
          entry.reject = problem => { credential.signal.removeEventListener('abort', abort); reject(problem); };
          if (credential.signal.aborted) abort();
        });
        return { ...emptyCatalog, instanceId: 'native-authorization', credentialStorage: 'encrypted' };
      } finally { entry.credential = undefined; entry.resolve = undefined; entry.reject = undefined; }
    });
    entry.expiresAt = session.expiresAt; this.sessions.set(session.id, entry);
    return session;
  }
  poll(input: Record<string, unknown>) {
    const entry = this.session(input); const progress = this.flow.poll(String(input.sessionId));
    if (progress.status === 'complete') return { status: 'complete' };
    if (!entry.credential) return { status: 'pending' };
    if (!entry.taken) { entry.credential.commit(); entry.taken = true; }
    const { token, name, expiresAt } = entry.credential;
    return { status: 'credential', credential: { token, name, expiresAt } };
  }
  complete(input: Record<string, unknown>) {
    const entry = this.session(input);
    if (entry.completed) return { completed: true };
    if (!entry.taken || !entry.resolve || typeof input.success !== 'boolean') throw new Error('桌面账号保存状态无效。');
    if (input.success) { entry.completed = true; entry.resolve(); }
    else entry.reject!(new Error('GitTogether 未能保存账号，请返回应用重试。'));
    return { completed: input.success };
  }
  async cancel(input: Record<string, unknown>) {
    this.session(input);
    const result = await this.flow.cancel(String(input.sessionId));
    if (result.cancelled) this.sessions.delete(String(input.sessionId));
    return { cancelled: result.cancelled };
  }
  close() {
    for (const entry of this.sessions.values()) entry.reject?.(new Error('授权服务已关闭，请重新开始。'));
    this.sessions.clear();
  }
}
