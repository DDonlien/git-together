import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { isAbsolute, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isCatalog, isRecord, type Account, type ApiMethod, type Catalog, type LocalFile, type LocalSnapshot, type Provider, type RemoteRepository } from '../src/import-model';

const execute = promisify(execFile);
type SavedAccount = { account: Account; token: string };
export type SavedState = { version: 2; accounts: SavedAccount[]; repositories: RemoteRepository[]; links: Catalog['links'] };
export interface CredentialStore {
  kind: Catalog['credentialStorage'];
  load(): Promise<unknown>;
  save(state: SavedState): Promise<void>;
}
export const sessionStore = (): CredentialStore => ({ kind: 'session', load: async () => null, save: async () => {} });
const field = (input: Record<string, unknown>, key: string, max = 4000): string => {
  if (typeof input[key] !== 'string' || input[key].length > max || /[\0\r\n]/.test(input[key])) throw new Error(`无效的 ${key}。`);
  return input[key].trim();
};
export function normalizeHost(provider: Provider, input: string): string {
  if (provider === 'github') return 'https://github.com';
  let url: URL;
  try { url = new URL(input.includes('://') ? input : `https://${input}`); }
  catch { throw new Error('请输入有效的 Gitea 域名，例如 https://git.example.com。'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Gitea 必须使用 HTTPS 域名，不含用户信息、路径或查询参数；HTTP 仅限本机。');
  }
  return url.origin;
}
export function remoteIdentity(raw: string): string | null {
  // Accept HTTPS, ssh:// and SCP-style remotes without returning embedded credentials.
  const scp = /^(?:[^@/:]+@)?([^/:]+):(.+)$/.exec(raw);
  try {
    const url = new URL(raw.includes('://') ? raw : scp ? `ssh://${scp[1]}/${scp[2]}` : 'invalid:');
    if (!['https:', 'http:', 'ssh:', 'git:'].includes(url.protocol)) return null;
    return `${url.hostname.toLowerCase()}/${decodeURIComponent(url.pathname).replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '').toLowerCase()}`;
  } catch { return null; }
}

export class AccountService {
  private state: SavedState = { version: 2, accounts: [], repositories: [], links: [] };
  private ready: Promise<void>;
  private mutation: Promise<void> = Promise.resolve();
  private refreshes = new Map<string, Promise<Catalog>>();
  private revision = 0;
  private restoreError = '';
  constructor(private store: CredentialStore = sessionStore(), private request: typeof fetch = fetch) {
    this.ready = this.restore().catch(error => { this.restoreError = error instanceof Error ? error.message : '无法读取账号存储。'; });
  }
  private async restore() {
    const saved = await this.store.load();
    if (saved === null) return;
    if (!isRecord(saved) || saved.version !== 2 || !Array.isArray(saved.accounts) ||
      !saved.accounts.every(a => isRecord(a) && typeof a.token === 'string' && isRecord(a.account)) ||
      !isCatalog({ ...saved, revision: 0, accounts: saved.accounts.map(a => a.account), credentialStorage: this.store.kind })) {
      throw new Error('账号存储格式无效；未覆盖原始文件。');
    }
    this.state = saved as SavedState;
  }
  private catalog(): Catalog {
    return structuredClone({ revision: this.revision, accounts: this.state.accounts.map(a => a.account), repositories: this.state.repositories, links: this.state.links, credentialStorage: this.store.kind });
  }
  private async mutate(change: (next: SavedState) => void): Promise<Catalog> {
    const task = this.mutation.then(async () => {
      const next = structuredClone(this.state);
      change(next);
      await this.store.save(next);
      this.state = next;
      this.revision++;
    });
    this.mutation = task.catch(() => {}); // A failed write must not poison later independent operations.
    await task;
    return this.catalog();
  }
  private async getJSON(url: URL, provider: Provider, token: string): Promise<{ value: unknown; headers: Headers }> {
    let response: Response;
    try {
      response = await this.request(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000), headers: {
        Accept: provider === 'github' ? 'application/vnd.github+json' : 'application/json',
        Authorization: `${provider === 'github' ? 'Bearer' : 'token'} ${token}`,
        'User-Agent': 'GitTogether/0.2.0', ...(provider === 'github' ? { 'X-GitHub-Api-Version': '2022-11-28' } : {}),
      } });
    } catch { throw new Error('无法连接账号服务，请检查域名、网络、证书或稍后重试（不跟随登录重定向）。'); }
    if (response.status === 401) throw new Error('令牌无效或已过期，请在设置中重新连接账号。');
    if (response.status === 403 || response.status === 429) throw new Error('没有读取权限或已触发访问频率限制；请检查令牌权限后重试。');
    if (!response.ok) throw new Error(`账号服务返回 HTTP ${response.status}；请检查服务与令牌权限。`);
    if (Number(response.headers.get('content-length')) > 8_000_000) throw new Error('账号服务响应过大。');
    // Bound streamed responses as well as Content-Length. Never log the provider payload.
    const reader = response.body?.getReader();
    if (!reader) throw new Error('账号服务没有返回数据。');
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 8_000_000) { await reader.cancel(); throw new Error('账号服务响应过大。'); } chunks.push(part.value); }
      return { value: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown, headers: response.headers };
    } catch { throw new Error('账号服务返回了无效或过大的 JSON 数据。'); }
  }
  private apiBase(provider: Provider, host: string) { return provider === 'github' ? 'https://api.github.com' : `${host}/api/v1`; }
  private async repositories(account: Account, token: string): Promise<RemoteRepository[]> {
    const output = new Map<number, RemoteRepository>();
    const endpoint = `${this.apiBase(account.provider, account.host)}/user/repos`;
    // Page parameters are constructed locally; never forward credentials to a Link URL.
    for (let page = 1; page <= 10000; page++) {
      const url = new URL(endpoint); url.searchParams.set('page', String(page));
      url.searchParams.set(account.provider === 'github' ? 'per_page' : 'limit', '100');
      if (account.provider === 'github') { url.searchParams.set('visibility', 'all'); url.searchParams.set('affiliation', 'owner,collaborator,organization_member'); }
      const { value, headers } = await this.getJSON(url, account.provider, token);
      if (!Array.isArray(value)) throw new Error('仓库列表返回格式不正确。');
      for (const raw of value) {
        if (!isRecord(raw) || !Number.isSafeInteger(raw.id) || typeof raw.id !== 'number' || typeof raw.name !== 'string' || typeof raw.full_name !== 'string' || !/^[^/\s]+\/[^/\s]+$/.test(raw.full_name)) throw new Error('仓库列表中包含无效的记录。');
        output.set(raw.id, { id: `${account.id}:${raw.id}`, remoteId: raw.id, accountId: account.id, name: raw.name, fullName: raw.full_name,
          description: typeof raw.description === 'string' ? raw.description : '', defaultBranch: typeof raw.default_branch === 'string' ? raw.default_branch : '',
          private: raw.private === true, url: `${account.host}/${raw.full_name.split('/').map(encodeURIComponent).join('/')}`, available: true });
      }
      const link = headers.get('link');
      const total = Number(headers.get('x-total-count'));
      const more = link ? /rel="?next"?/.test(link) : total > 0 ? output.size < total : value.length > 0;
      if (!more || value.length === 0) return [...output.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
      if (page === 10000) throw new Error('仓库分页超出安全上限，未覆盖已有列表。');
    }
    return [];
  }
  private async connect(input: Record<string, unknown>) {
    const provider = input.provider;
    if (provider !== 'github' && provider !== 'gitea') throw new Error('不支持该账号服务。');
    const host = normalizeHost(provider, field(input, 'host', 512));
    const token = field(input, 'token', 4096); const name = field(input, 'name', 120);
    if (!token || /\s/.test(token)) throw new Error('请输入有效的访问令牌。');
    const { value: user } = await this.getJSON(new URL(`${this.apiBase(provider, host)}/user`), provider, token);
    if (!isRecord(user) || typeof user.login !== 'string' || !user.login || /[\s/]/.test(user.login)) throw new Error('无法识别账号身份。');
    if (this.state.accounts.some(a => a.account.provider === provider && a.account.host === host && a.account.login.toLowerCase() === String(user.login).toLowerCase())) throw new Error('这个账号已经添加。同一服务可以添加其他账号。');
    const account: Account = { id: randomUUID(), provider, host, login: user.login, name: name || (typeof user.name === 'string' && user.name ? user.name : user.login), updatedAt: '' };
    let repositories: RemoteRepository[] = [];
    try { repositories = await this.repositories(account, token); account.updatedAt = new Date().toISOString(); }
    catch (error) { account.error = error instanceof Error ? error.message : '读取仓库失败。'; }
    return this.mutate(next => {
      if (next.accounts.some(a => a.account.provider === provider && a.account.host === host && a.account.login.toLowerCase() === account.login.toLowerCase())) throw new Error('这个账号已经添加。同一服务可以添加其他账号。');
      next.accounts.push({ account, token }); next.repositories.push(...repositories);
    });
  }
  private refresh(accountId: string): Promise<Catalog> {
    const pending = this.refreshes.get(accountId); if (pending) return pending;
    const task = (async () => {
      const saved = this.state.accounts.find(a => a.account.id === accountId);
      if (!saved) throw new Error('账号不存在。');
      let repositories: RemoteRepository[];
      try { repositories = await this.repositories(saved.account, saved.token); }
      catch (error) { return this.mutate(next => { const current = next.accounts.find(a => a.account.id === accountId); if (current) current.account.error = error instanceof Error ? error.message : '读取仓库失败。'; }); }
      return this.mutate(next => {
        const current = next.accounts.find(a => a.account.id === accountId); if (!current) return;
        current.account.updatedAt = new Date().toISOString(); delete current.account.error;
        const linked = new Set(next.links.map(l => l.repositoryId));
        const found = new Set(repositories.map(r => r.id));
        const unavailable = next.repositories.filter(r => r.accountId === accountId && linked.has(r.id) && !found.has(r.id)).map(r => ({ ...r, available: false }));
        next.repositories = [...next.repositories.filter(r => r.accountId !== accountId), ...repositories, ...unavailable];
      });
    })().finally(() => { this.refreshes.delete(accountId); });
    this.refreshes.set(accountId, task); return task;
  }
  private async git(path: string, args: string[]): Promise<string> {
    try {
      const result = await execute('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', '-c', 'core.pager=cat', '-C', path, ...args], {
        timeout: 10000, maxBuffer: 2_000_000, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
      });
      return result.stdout;
    } catch { throw new Error('无法读取该 Git 目录，请检查路径、仓库状态与访问权限。'); }
  }
  private repository(id: string) {
    const repository = this.state.repositories.find(r => r.id === id);
    if (!repository) throw new Error('仓库不存在，请重新加载列表。');
    return repository;
  }
  private async validatePath(repository: RemoteRepository, input: string): Promise<string> {
    const expanded = input === '~' ? homedir() : input.startsWith('~/') ? resolve(homedir(), input.slice(2)) : input;
    if (!expanded || !isAbsolute(expanded)) throw new Error('请输入绝对目录，例如 /Users/你的名字/Projects/repo 或 ~/Projects/repo。');
    const path = (await this.git(resolve(expanded), ['rev-parse', '--show-toplevel'])).trim();
    // Accept a matching named remote, not just origin. Compare host + owner/name, never just the folder name.
    const names = (await this.git(path, ['remote'])).trim().split('\n').filter(Boolean);
    const expected = remoteIdentity(repository.url);
    const remotes = await Promise.all(names.map(name => this.git(path, ['remote', 'get-url', name])));
    if (!expected || !remotes.some(remote => remoteIdentity(remote.trim()) === expected)) throw new Error(`这个目录的远端不是 ${repository.fullName}，没有保存关联。`);
    return path;
  }
  private async linkedPath(id: string) {
    const repository = this.repository(id); const link = this.state.links.find(l => l.repositoryId === id);
    if (!link) throw new Error('请先在 Dashboard 关联本地目录。');
    return this.validatePath(repository, link.path);
  }
  private async snapshot(id: string): Promise<LocalSnapshot> {
    const path = await this.linkedPath(id);
    const [branch, status, history] = await Promise.all([
      this.git(path, ['symbolic-ref', '--short', '-q', 'HEAD']).catch(() => this.git(path, ['rev-parse', '--short', 'HEAD'])),
      this.git(path, ['status', '--porcelain=v1', '-z', '--untracked-files=all']),
      this.git(path, ['log', '-30', '--format=%H%x00%s%x00%an%x00%aI']).catch(async error => {
        // Unborn HEAD is valid; other log failures are not reported as an empty successful history.
        if ((await this.git(path, ['rev-parse', '--verify', '-q', 'HEAD']).catch(() => '')) === '') return '';
        throw error;
      }),
    ]);
    const parts = status.split('\0'); const files: LocalFile[] = [];
    for (let i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      const code = parts[i].slice(0, 2); files.push({ path: parts[i].slice(3), status: code.trim(), tracked: code !== '??' });
      if (/[RC]/.test(code)) i++; // -z rename records contain the original path next.
    }
    return { path, branch: branch.trim(), files, commits: history.trim().split('\n').filter(Boolean).map(line => { const [id, summary, author, time] = line.split('\0'); return { id, summary, author, time }; }) };
  }
  async handle(method: unknown, value: unknown): Promise<unknown> {
    await this.ready;
    if (this.restoreError) throw new Error(this.restoreError);
    if (!isRecord(value)) throw new Error('无效的请求。');
    switch (method as ApiMethod) {
      case 'catalog': return this.catalog();
      case 'connect': return this.connect(value);
      case 'refresh': return this.refresh(field(value, 'accountId', 100));
      case 'removeAccount': {
        const id = field(value, 'accountId', 100);
        return this.mutate(next => { const repoIds = new Set(next.repositories.filter(r => r.accountId === id).map(r => r.id)); next.accounts = next.accounts.filter(a => a.account.id !== id); next.repositories = next.repositories.filter(r => r.accountId !== id); next.links = next.links.filter(l => !repoIds.has(l.repositoryId)); });
      }
      case 'link': {
        const id = field(value, 'repositoryId', 160); const repository = this.repository(id);
        if (!repository.available) throw new Error('该账号目前无法访问这个仓库，请先重新加载。');
        const path = await this.validatePath(repository, field(value, 'path'));
        return this.mutate(next => { if (!next.repositories.some(r => r.id === id)) throw new Error('仓库已移除。'); next.links = [...next.links.filter(l => l.repositoryId !== id), { repositoryId: id, path }]; });
      }
      case 'unlink': { const id = field(value, 'repositoryId', 160); return this.mutate(next => { next.links = next.links.filter(l => l.repositoryId !== id); }); }
      case 'snapshot': return this.snapshot(field(value, 'repositoryId', 160));
      case 'diff': {
        const id = field(value, 'repositoryId', 160); const file = field(value, 'path'); const snapshot = await this.snapshot(id);
        const changed = snapshot.files.find(f => f.path === file);
        if (!changed) throw new Error('文件已不在更改列表，请刷新仓库。');
        if (!changed.tracked) return { text: '未跟踪文件尚无 Git Diff；本版本不会读取或上传其内容。' };
        const args = ['diff', '--no-ext-diff', '--no-textconv', '--', file];
        const [worktree, staged] = await Promise.all([this.git(snapshot.path, args), this.git(snapshot.path, ['diff', '--cached', '--no-ext-diff', '--no-textconv', '--', file])]);
        return { text: `${staged ? `# 已暂存\n${staged}` : ''}${worktree ? `# 工作目录\n${worktree}` : ''}` || '没有文本差异（可能为二进制文件或仅重命名）。' };
      }
      default: throw new Error('不支持该操作。');
    }
  }
}
