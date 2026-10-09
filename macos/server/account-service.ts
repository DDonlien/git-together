import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { isAbsolute, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { isCatalog, isRecord, repositoryPermissionKeys, type Account, type Catalog, type LocalFile, type LocalSnapshot, type LocalWorktreeLink, type Provider, type RemoteRepository, type RepositoryPermissions } from '../src/import-model';
import { GitHubDeviceAuthorization } from './github-authorization';
import { RemoteRepositoryReader } from './remote-repository-reader';
import { repositoryFileURL } from '../src/repository-file-url';
import { readLocalGit, readRepositoryWorkspace, readRepositoryTaskDiff, readWorktrees, readFailure, repositoryTaskFile } from './repository-reader';
import { discoverLocalRepositories, discoverLocalWorktrees } from './local-discovery';
import { remoteIdentity } from './git-identity';
import { topologicalCommits, type RepositoryWorkspace } from '../src/repository-model';
import { openSystemFile, type FileOpener } from './system-file-open';
import pkg from '../package.json';

const execute = promisify(execFile);
class ProviderReadError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
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
export { remoteIdentity } from './git-identity';

export class AccountService {
  private instanceId = randomUUID();
  private githubAuthorization: GitHubDeviceAuthorization;
  private state: SavedState = { version: 2, accounts: [], repositories: [], links: [] };
  private ready: Promise<void>;
  private mutation: Promise<void> = Promise.resolve();
  private refreshes = new Map<string, Promise<Catalog>>();
  private remoteReaders = new Map<string, { reader: RemoteRepositoryReader; valid: () => boolean }>();
  private revision = 0;
  private restoreError = '';
  private openFile: FileOpener;
  constructor(private store: CredentialStore = sessionStore(), private request: typeof fetch = fetch, options: { githubClientId?: string; now?: () => number; openFile?: FileOpener } = {}) {
    this.openFile = options.openFile || openSystemFile;
    this.ready = this.restore().catch(error => { this.restoreError = error instanceof Error ? error.message : '无法读取账号存储。'; });
    this.githubAuthorization = new GitHubDeviceAuthorization(options.githubClientId ?? process.env.GITTOGETHER_GITHUB_CLIENT_ID ?? '', credential => this.connect({ provider: 'github', host: 'https://github.com', token: credential.token, name: credential.name }, credential), request, options.now);
  }
  private async restore() {
    const saved = await this.store.load();
    if (saved === null) return;
    if (!isRecord(saved) || saved.version !== 2 || !Array.isArray(saved.accounts) ||
      !saved.accounts.every(a => isRecord(a) && typeof a.token === 'string' && isRecord(a.account)) ||
      !isCatalog({ ...saved, instanceId: this.instanceId, revision: 0, accounts: saved.accounts.map(a => a.account), credentialStorage: this.store.kind })) {
      throw new Error('账号存储格式无效；未覆盖原始文件。');
    }
    this.state = saved as SavedState;
  }
  private catalog(): Catalog {
    return structuredClone({ instanceId: this.instanceId, revision: this.revision, accounts: this.state.accounts.map(a => a.account), repositories: this.state.repositories, links: this.state.links, credentialStorage: this.store.kind });
  }
  private async mutate(change: (next: SavedState) => void): Promise<Catalog> {
    const task = this.mutation.then(async () => {
      const next = structuredClone(this.state);
      change(next);
      await this.store.save(next);
      this.state = next;
      for (const [id, entry] of this.remoteReaders) if (!entry.valid()) this.remoteReaders.delete(id);
      this.revision++;
    });
    this.mutation = task.catch(() => {}); // A failed write must not poison later independent operations.
    await task;
    return this.catalog();
  }
  private async getJSON(url: URL, provider: Provider, token: string, signal?: AbortSignal, format: 'json' | 'text' | 'status' = 'json'): Promise<{ value: unknown; headers: Headers }> {
    signal?.throwIfAborted();
    let response: Response;
    try {
      response = await this.request(url, { method: 'GET', redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000), headers: {
        Accept: format === 'text' ? 'text/plain' : provider === 'github' ? 'application/vnd.github+json' : 'application/json',
        Authorization: `${provider === 'github' ? 'Bearer' : 'token'} ${token}`,
        'User-Agent': `GitTogether/${pkg.version}`, ...(provider === 'github' ? { 'X-GitHub-Api-Version': '2022-11-28' } : {}),
      } });
    } catch {
      signal?.throwIfAborted();
      throw new Error('无法连接账号服务，请检查域名、网络、证书或稍后重试（不跟随登录重定向）。');
    }
    if (response.status === 401) throw new ProviderReadError('令牌无效或已过期，请在设置中重新连接账号。', response.status);
    if (response.status === 403 || response.status === 429) throw new ProviderReadError('没有读取权限或已触发访问频率限制；请检查令牌权限后重试。', response.status);
    if (!response.ok) throw new ProviderReadError(`账号服务返回 HTTP ${response.status}；请检查服务与令牌权限。`, response.status);
    if (format === 'status') { await response.body?.cancel(); return { value: response.status, headers: response.headers }; }
    if (Number(response.headers.get('content-length')) > 8_000_000) throw new Error('账号服务响应过大。');
    // Bound streamed responses as well as Content-Length. Never log the provider payload.
    const reader = response.body?.getReader();
    if (!reader) throw new Error('账号服务没有返回数据。');
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 8_000_000) { await reader.cancel(); throw new Error('账号服务响应过大。'); } chunks.push(part.value); }
      signal?.throwIfAborted();
      const text = Buffer.concat(chunks).toString('utf8');
      return { value: format === 'text' ? text : JSON.parse(text) as unknown, headers: response.headers };
    } catch { signal?.throwIfAborted(); throw new Error(`账号服务返回了无效或过大的 ${format === 'text' ? '文本' : 'JSON'} 数据。`); }
  }
  private apiBase(provider: Provider, host: string) { return provider === 'github' ? 'https://api.github.com' : `${host}/api/v1`; }
  private repositoryRecord(account: Account, raw: unknown): RemoteRepository {
    if (!isRecord(raw) || !Number.isSafeInteger(raw.id) || typeof raw.id !== 'number' || typeof raw.name !== 'string' || typeof raw.full_name !== 'string' || !/^[^/\s]+\/[^/\s]+$/.test(raw.full_name)) throw new Error('仓库列表中包含无效的记录。');
    const permissions: RepositoryPermissions = {};
    if (isRecord(raw.permissions)) for (const key of repositoryPermissionKeys) if (typeof raw.permissions[key] === 'boolean') permissions[key] = raw.permissions[key];
    const ownerType = account.provider === 'github' && isRecord(raw.owner) ? raw.owner.type === 'Organization' ? 'organization' : raw.owner.type === 'User' ? 'user' : undefined : undefined;
    return { id: `${account.id}:${raw.id}`, remoteId: raw.id, accountId: account.id, name: raw.name, fullName: raw.full_name,
      description: typeof raw.description === 'string' ? raw.description : '', defaultBranch: typeof raw.default_branch === 'string' ? raw.default_branch : '',
      private: raw.private === true, url: `${account.host}/${raw.full_name.split('/').map(encodeURIComponent).join('/')}`, available: true,
      ...(typeof raw.updated_at === 'string' && Number.isFinite(Date.parse(raw.updated_at)) ? { updatedAt: raw.updated_at } : {}),
      ...(ownerType ? { ownerType } : {}), ...(typeof raw.fork === 'boolean' ? { fork: raw.fork } : {}), ...(Object.keys(permissions).length ? { permissions } : {}) };
  }
  private async repositoryList(account: Account, token: string, signal?: AbortSignal, affiliation = 'owner,collaborator,organization_member'): Promise<RemoteRepository[]> {
    return this.pagedRepositories(account, token, signal, '/user/repos', account.provider === 'github' ? { visibility: 'all', affiliation } : {});
  }
  private async pagedRepositories(account: Account, token: string, signal: AbortSignal | undefined, path: '/user/repos' | '/repos/search', query: Record<string, string>): Promise<RemoteRepository[]> {
    const output = new Map<number, RemoteRepository>();
    const endpoint = `${this.apiBase(account.provider, account.host)}${path}`;
    let stalledPages = 0;
    // Page parameters are constructed locally; never forward credentials to a Link URL.
    for (let page = 1; page <= 10000; page++) {
      signal?.throwIfAborted();
      const url = new URL(endpoint); url.searchParams.set('page', String(page));
      url.searchParams.set(account.provider === 'github' ? 'per_page' : 'limit', '100');
      for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
      const { value, headers } = await this.getJSON(url, account.provider, token, signal);
      const records = path === '/repos/search' && isRecord(value) && value.ok === true ? value.data : path === '/user/repos' ? value : undefined;
      if (!Array.isArray(records)) throw new Error('仓库列表返回格式不正确。');
      const previousSize = output.size;
      for (const raw of records) { const repo = this.repositoryRecord(account, raw); output.set(repo.remoteId, repo); }
      const link = headers.get('link');
      const total = Number(headers.get('x-total-count'));
      const more = link ? /rel="?next"?/.test(link) : total > 0 ? output.size < total : records.length > 0;
      if (!more) return [...output.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
      stalledPages = output.size > previousSize ? 0 : stalledPages + 1;
      // An empty page may be permission-filtered even though another page exists.
      // Follow only local page numbers, with a finite guard against broken totals.
      if (stalledPages >= 3) throw new Error('仓库分页连续未返回新记录但仍声明有后续记录；未用不完整数据覆盖已有列表。');
      if (page === 10000) throw new Error('仓库分页超出安全上限，未覆盖已有列表。');
    }
    return [];
  }
  private async hydrateForks(account: Account, token: string, repositories: RemoteRepository[], signal?: AbortSignal) {
    const missing = repositories.filter(repo => repo.fork === undefined); let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(4, missing.length) }, async () => {
      while (cursor < missing.length) {
        signal?.throwIfAborted();
        const repo = missing[cursor++];
        try {
          const path = repo.fullName.split('/').map(encodeURIComponent).join('/');
          const { value } = await this.getJSON(new URL(`${this.apiBase(account.provider, account.host)}/repos/${path}`), account.provider, token, signal);
          const details = this.repositoryRecord(account, value);
          if (details.remoteId !== repo.remoteId || details.fullName.toLowerCase() !== repo.fullName.toLowerCase() || details.fork === undefined) throw new Error('仓库详情没有返回匹配的来源分类。');
          repo.fork = details.fork;
          if (details.ownerType) repo.ownerType = details.ownerType;
          if (details.permissions) repo.permissions = details.permissions;
        } catch (error) { signal?.throwIfAborted(); repo.metadataError = [repo.metadataError, error instanceof Error ? `来源分类未能读取：${error.message}` : '来源分类未能读取。'].filter(Boolean).join(' '); }
      }
    }));
  }
  private async repositories(account: Account, token: string, signal?: AbortSignal, userId?: number): Promise<RemoteRepository[]> {
    const repositories = await this.repositoryList(account, token, signal);
    if (account.provider === 'github') {
      try {
        // Permissions do not identify collaboration. Ask the provider's explicit affiliation filter.
        const collaborationRepos = await this.repositoryList(account, token, signal, 'collaborator');
        const collaborators = new Set(collaborationRepos.map(repo => repo.remoteId));
        // Two paginated reads need not have identical snapshots. Do not drop a
        // confirmed collaborator (or its fork flag) absent from the base read.
        const combined = new Map(repositories.map(repo => [repo.remoteId, repo]));
        for (const repo of collaborationRepos) combined.set(repo.remoteId, { ...combined.get(repo.remoteId), ...repo });
        const result = [...combined.values()].map(repo => ({ ...repo, collaborator: collaborators.has(repo.remoteId) })).sort((a, b) => a.fullName.localeCompare(b.fullName));
        await this.hydrateForks(account, token, result, signal);
        return result;
      } catch (error) {
        signal?.throwIfAborted();
        const result = repositories.map(repo => ({ ...repo, metadataError: error instanceof Error ? `协作分类未能读取：${error.message}` : '协作分类未能读取。' }));
        await this.hydrateForks(account, token, result, signal);
        return result;
      }
    }
    const combined = new Map(repositories.map(repo => [repo.remoteId, repo]));
    const directoryErrors: string[] = [];
    try {
      if (!Number.isSafeInteger(userId) || !userId || userId < 1) {
        const { value } = await this.getJSON(new URL(`${account.host}/api/v1/user`), 'gitea', token, signal);
        if (!isRecord(value) || typeof value.login !== 'string' || value.login.toLowerCase() !== account.login.toLowerCase() || !Number.isSafeInteger(value.id) || typeof value.id !== 'number' || value.id < 1) throw new Error('无法确认补充目录的账号身份。');
        userId = value.id;
      }
      // Gitea's collaborative search also includes team access. Merge discoveries
      // into the catalog, but confirm direct Added below rather than guessing it.
      for (const mode of ['fork', 'collaborative']) {
        try {
          const extra = await this.pagedRepositories(account, token, signal, '/repos/search', { uid: String(userId), mode, exclusive: 'false' });
          for (const repo of extra) combined.set(repo.remoteId, { ...combined.get(repo.remoteId), ...repo });
        } catch (error) { signal?.throwIfAborted(); directoryErrors.push(error instanceof Error ? `${mode === 'fork' ? 'Fork' : '协作'}补充目录未能读取：${error.message}` : '补充目录未能读取。'); }
      }
    } catch (error) { signal?.throwIfAborted(); directoryErrors.push(error instanceof Error ? `补充目录未能读取：${error.message}` : '无法读取补充目录。'); }
    const result = [...combined.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
    // Without even a base snapshot, do not report a failed supplement as an
    // authoritative empty account; refresh must retain the previous directory.
    if (!result.length && directoryErrors.length) throw new Error(directoryErrors.join(' '));
    if (directoryErrors.length) for (const repo of result) repo.metadataError = directoryErrors.join(' ');
    await this.hydrateForks(account, token, result, signal);
    // Gitea's owner DTO has no organization flag. Confirm organizations and direct
    // collaborators using read-only endpoints, not names, admin rights or team access.
    // Four workers; each actual request has its own 15s timeout. Waiting in the
    // queue must not spend a later repository's entire request budget.
    const metadataSignal = signal;
    const owners = new Map<string, Promise<{ ownerType?: 'organization'; error?: string }>>();
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(4, result.length) }, async () => {
      while (cursor < result.length) {
        signal?.throwIfAborted();
        const repo = result[cursor++]; const owner = repo.fullName.split('/')[0];
        if (owner.toLowerCase() === account.login.toLowerCase()) { repo.ownerType = 'user'; repo.collaborator = false; continue; }
        let pending = owners.get(owner.toLowerCase());
        if (!pending) {
          pending = (async () => {
            try {
              const { value } = await this.getJSON(new URL(`${account.host}/api/v1/orgs/${encodeURIComponent(owner)}`), 'gitea', token, metadataSignal);
              if (!isRecord(value) || typeof value.username !== 'string' || value.username.toLowerCase() !== owner.toLowerCase()) throw new Error('组织信息返回格式不正确。');
              return { ownerType: 'organization' as const };
            } catch (error) { signal?.throwIfAborted(); return { error: error instanceof Error ? `归属分类未能读取：${error.message}` : '归属分类未能读取。' }; }
          })(); owners.set(owner.toLowerCase(), pending);
        }
        const organization = await pending;
        if (organization.ownerType) repo.ownerType = organization.ownerType;
        if (organization.error) repo.metadataError = [repo.metadataError, organization.error].filter(Boolean).join(' ');
        try {
          const path = repo.fullName.split('/').map(encodeURIComponent).join('/');
          const { value } = await this.getJSON(new URL(`${account.host}/api/v1/repos/${path}/collaborators/${encodeURIComponent(account.login)}`), 'gitea', token, metadataSignal, 'status');
          if (value !== 204) throw new Error('协作信息返回格式不正确。');
          repo.collaborator = true;
        } catch (error) {
          signal?.throwIfAborted();
          // A hidden/unsupported endpoint can also return 404, so do not fabricate a negative.
          repo.metadataError = [repo.metadataError, error instanceof ProviderReadError && error.status === 404 ? '协作关系未确认。' : error instanceof Error ? `协作分类未能读取：${error.message}` : '协作分类未能读取。'].filter(Boolean).join(' ');
        }
      }
    }));
    return result;
  }
  async connectGitHubWebAuthorization(credential: { token: string; name: string; expiresAt?: string }) {
    return this.connect({ provider: 'github', host: 'https://github.com', token: credential.token, name: credential.name }, {
      expiresAt: credential.expiresAt, signal: new AbortController().signal, commit: () => {},
    });
  }
  private async connect(input: Record<string, unknown>, authorization?: { expiresAt?: string; signal: AbortSignal; commit: () => void }) {
    const provider = input.provider;
    if (provider !== 'github' && provider !== 'gitea') throw new Error('不支持该账号服务。');
    const host = normalizeHost(provider, field(input, 'host', 512));
    const token = field(input, 'token', 4096); const name = field(input, 'name', 120);
    if (!token || /\s/.test(token)) throw new Error('请输入有效的访问令牌。');
    let user: unknown;
    try { ({ value: user } = await this.getJSON(new URL(`${this.apiBase(provider, host)}/user`), provider, token, authorization?.signal)); }
    catch (problem) { if (authorization?.signal.aborted) throw new Error('授权已取消或过期。'); throw problem; }
    if (!isRecord(user) || typeof user.login !== 'string' || !user.login || /[\s/]/.test(user.login)) throw new Error('无法识别账号身份。');
    const existing = this.state.accounts.find(a => a.account.provider === provider && a.account.host === host && a.account.login.toLowerCase() === String(user.login).toLowerCase());
    if (existing && !authorization) throw new Error('这个账号已经添加。同一服务可以添加其他账号。');
    const account: Account = { id: existing?.account.id || randomUUID(), provider, host, login: user.login, name: name || existing?.account.name || (typeof user.name === 'string' && user.name ? user.name : user.login), updatedAt: '', ...(authorization?.expiresAt ? { authorizationExpiresAt: authorization.expiresAt } : {}) };
    let repositories: RemoteRepository[] = [];
    try { repositories = await this.repositories(account, token, authorization?.signal, typeof user.id === 'number' ? user.id : undefined); account.updatedAt = new Date().toISOString(); }
    catch (error) { account.error = error instanceof Error ? error.message : '读取仓库失败。'; }
    return this.mutate(next => {
      const duplicate = next.accounts.find(a => a.account.provider === provider && a.account.host === host && a.account.login.toLowerCase() === account.login.toLowerCase());
      if (duplicate && (!authorization || duplicate.account.id !== existing?.account.id)) throw new Error('这个账号已经添加。同一服务可以添加其他账号。');
      authorization?.commit();
      if (!duplicate) { next.accounts.push({ account, token }); next.repositories.push(...repositories); return; }
      duplicate.account = account; duplicate.token = token;
      if (account.error) return; // Keep the previous repository list on a failed reload.
      const linked = new Set(next.links.map(link => link.repositoryId));
      const found = new Set(repositories.map(repository => repository.id));
      const unavailable = next.repositories.filter(repository => repository.accountId === account.id && linked.has(repository.id) && !found.has(repository.id)).map(repository => ({ ...repository, available: false }));
      next.repositories = [...next.repositories.filter(repository => repository.accountId !== account.id), ...repositories, ...unavailable];
    });
  }
  private async updateAccount(input: Record<string, unknown>): Promise<Catalog> {
    if (Object.keys(input).some(key => !['accountId', 'name', 'token'].includes(key))) throw new Error('编辑只能修改账号名称和访问令牌。');
    const accountId = field(input, 'accountId', 100);
    const name = field(input, 'name', 120);
    const token = input.token === undefined ? '' : field(input, 'token', 4096);
    if (!name) throw new Error('请输入账号名称。');
    if (/\s/.test(token)) throw new Error('请输入有效的访问令牌。');
    const saved = this.state.accounts.find(a => a.account.id === accountId);
    if (!saved) throw new Error('账号不存在，请重新加载列表。');
    let repositories: RemoteRepository[] | undefined;
    if (token) {
      const { account } = saved;
      const { value: user } = await this.getJSON(new URL(`${this.apiBase(account.provider, account.host)}/user`), account.provider, token);
      if (!isRecord(user) || typeof user.login !== 'string' || !user.login || /[\s/]/.test(user.login)) throw new Error('无法识别账号身份。');
      if (user.login.toLowerCase() !== account.login.toLowerCase()) throw new Error('新令牌不属于这个账号。请使用该账号的令牌，或添加另一个账号。');
      repositories = await this.repositories(account, token);
    }
    return this.mutate(next => {
      const current = next.accounts.find(a => a.account.id === accountId);
      if (!current) throw new Error('账号已移除，没有保存更改。');
      if (current.token !== saved.token) throw new Error('账号凭据已更新，请重新打开编辑。');
      current.account.name = name;
      if (!token || !repositories) return; // A rename does not contact the provider or replace credentials.
      current.token = token; current.account.updatedAt = new Date().toISOString();
      delete current.account.error; delete current.account.authorizationExpiresAt;
      const linked = new Set(next.links.map(link => link.repositoryId));
      const found = new Set(repositories.map(repository => repository.id));
      const unavailable = next.repositories.filter(repository => repository.accountId === accountId && linked.has(repository.id) && !found.has(repository.id)).map(repository => ({ ...repository, available: false }));
      next.repositories = [...next.repositories.filter(repository => repository.accountId !== accountId), ...repositories, ...unavailable];
    });
  }
  private refresh(accountId: string): Promise<Catalog> {
    const pending = this.refreshes.get(accountId); if (pending) return pending;
    const task = (async () => {
      const saved = this.state.accounts.find(a => a.account.id === accountId);
      if (!saved) throw new Error('账号不存在。');
      let repositories: RemoteRepository[];
      try { repositories = await this.repositories(saved.account, saved.token); }
      catch (error) { return this.mutate(next => { const current = next.accounts.find(a => a.account.id === accountId); if (current && current.token === saved.token) current.account.error = error instanceof Error ? error.message : '读取仓库失败。'; }); }
      return this.mutate(next => {
        const current = next.accounts.find(a => a.account.id === accountId); if (!current || current.token !== saved.token) return;
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
  private remoteReader(id: string) {
    const repository = this.repository(id);
    if (!repository.available) throw new Error('该账号目前无法访问这个仓库，请在设置中检查账号权限。');
    const saved = this.state.accounts.find(item => item.account.id === repository.accountId);
    if (!saved) throw new Error('访问账号已移除。');
    const valid = () => {
      const current = this.state.accounts.find(item => item.account.id === saved.account.id);
      const currentRepository = this.state.repositories.find(item => item.id === id);
      return current?.token === saved.token && current.account.provider === saved.account.provider && current.account.host === saved.account.host &&
        !!currentRepository?.available && currentRepository.accountId === repository.accountId && currentRepository.fullName === repository.fullName && currentRepository.defaultBranch === repository.defaultBranch;
    };
    let entry = this.remoteReaders.get(id);
    if (!entry?.valid()) {
      const base = this.apiBase(saved.account.provider, saved.account.host);
      entry = { valid, reader: new RemoteRepositoryReader(saved.account.provider, repository, async (path, format, signal) => {
        signal?.throwIfAborted();
        if (!valid()) throw new Error('访问账号或仓库已更新，已取消旧的远端读取。');
        // The reader builds repository-relative paths; callers cannot provide a host, token or Link URL.
        if (!path.startsWith('/repos/') || path.includes('://') || path.includes('#')) throw new Error('无效的远端读取路径。');
        const result = await this.getJSON(new URL(base + path), saved.account.provider, saved.token, signal, format);
        if (!valid()) throw new Error('访问账号或仓库已更新，已取消旧的远端读取。');
        return result;
      }) };
      this.remoteReaders.set(id, entry);
      if (this.remoteReaders.size > 16) this.remoteReaders.delete(this.remoteReaders.keys().next().value!);
    }
    return entry;
  }
  private async remoteRead(method: 'remoteWorkspace' | 'remoteCommit' | 'remoteFile', input: Record<string, unknown>, signal?: AbortSignal) {
    const allowed = method === 'remoteWorkspace' ? ['repositoryId'] : method === 'remoteCommit' ? ['repositoryId', 'commitId'] : ['repositoryId', 'commitId', 'path'];
    if (Object.keys(input).some(key => !allowed.includes(key))) throw new Error('远端读取仅接受仓库、提交和文件身份。');
    const entry = this.remoteReader(field(input, 'repositoryId', 160));
    signal?.throwIfAborted();
    let result: unknown;
    if (method === 'remoteWorkspace') result = await entry.reader.workspace(signal);
    else {
      const commitId = field(input, 'commitId', 64);
      if (method === 'remoteCommit') result = await entry.reader.commit(commitId, signal);
      else {
        // Git file paths are literal; trimming them would change which file is read.
        if (typeof input.path !== 'string') throw new Error('无效的文件路径。');
        result = await entry.reader.file(commitId, input.path, signal);
      }
    }
    signal?.throwIfAborted();
    if (!entry.valid()) throw new Error('访问账号或仓库已更新，已取消旧的远端读取。');
    return result;
  }
  private async validatePath(repository: RemoteRepository, input: string): Promise<string> {
    const expanded = input === '~' ? homedir() : input.startsWith('~/') ? resolve(homedir(), input.slice(2)) : input;
    if (!expanded || !isAbsolute(expanded)) throw new Error('请输入绝对目录，例如 /Users/你的名字/Projects/repo 或 ~/Projects/repo。');
    const path = await realpath((await this.git(resolve(expanded), ['rev-parse', '--show-toplevel'])).trim());
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
    return this.validatePath(repository, link.worktrees?.[0]?.path || link.path);
  }
  private async localWorkspace(id: string, signal?: AbortSignal): Promise<RepositoryWorkspace> {
    const repository = this.repository(id);
    const link = this.state.links.find(l => l.repositoryId === id);
    if (!link) throw new Error('请先关联本地目录。');
    const roots = link.worktrees || [{ path: link.path, branch: '' }];
    const tasks: RepositoryWorkspace['tasks'] = [];
    const commits = new Map<string, RepositoryWorkspace['commits'][number]>();
    for (const item of roots) {
      signal?.throwIfAborted();
      try {
        const root = await this.validatePath(repository, item.path);
        const workspace = await readRepositoryWorkspace(root, new Set([root]));
        tasks.push(...workspace.tasks);
        for (const commit of workspace.commits) {
          const previous = commits.get(commit.id);
          commits.set(commit.id, previous ? { ...previous, refs: [...new Set([...previous.refs, ...commit.refs])] } : commit);
        }
      } catch (problem) {
        tasks.push({ id: `worktree:${item.branch}:${item.path}`, path: item.path, branch: item.branch || '未读取分支', head: '', files: [], tree: [], error: `${readFailure(problem)} 工作目录不可用或远端已变化，未修改文件；请重新关联。` });
      }
    }
    signal?.throwIfAborted();
    if (this.state.links.find(l => l.repositoryId === id) !== link) throw new Error('仓库关联已更新，请重试。');
    return { source: 'local', tasks, commits: topologicalCommits([...commits.values()]), complete: tasks.every(task => !task.error) };
  }
  private async taskRoot(id: string, taskId: string): Promise<string> {
    const repository = this.repository(id); const link = this.state.links.find(l => l.repositoryId === id);
    if (!link) throw new Error('请先关联本地目录。');
    const item = (link.worktrees || [{ path: link.path, branch: '' }]).find(item => taskId.endsWith(`:${item.path}`));
    if (item) {
      const root = await this.validatePath(repository, item.path);
      const task = (await readWorktrees(root)).find(task => task.path === root && `worktree:${task.branch}:${task.path}` === taskId);
      if (task) return root;
    }
    throw new Error('这个任务不属于已关联工作目录。');
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
  async handle(method: unknown, value: unknown, signal?: AbortSignal): Promise<unknown> {
    if (!isRecord(value)) throw new Error('无效的请求。');
    if (method === 'status') return { instanceId: this.instanceId, version: pkg.version, githubWebAuth: this.githubAuthorization.configured };
    await this.ready;
    if (this.restoreError) throw new Error(this.restoreError);
    switch (method) {
      case 'catalog': return this.catalog();
      case 'connect': return this.connect(value);
      case 'updateAccount': return this.updateAccount(value);
      case 'githubAuthStart': return this.githubAuthorization.start(field(value, 'name', 120));
      case 'githubAuthPoll': return this.githubAuthorization.poll(field(value, 'sessionId', 100));
      case 'githubAuthCancel': return this.githubAuthorization.cancel(field(value, 'sessionId', 100));
      case 'refresh': return this.refresh(field(value, 'accountId', 100));
      case 'removeAccount': {
        const id = field(value, 'accountId', 100);
        return this.mutate(next => { const repoIds = new Set(next.repositories.filter(r => r.accountId === id).map(r => r.id)); next.accounts = next.accounts.filter(a => a.account.id !== id); next.repositories = next.repositories.filter(r => r.accountId !== id); next.links = next.links.filter(l => !repoIds.has(l.repositoryId)); });
      }
      case 'matchAccountRepositories': {
        const accountId = field(value, 'accountId', 100);
        const saved = this.state.accounts.find(item => item.account.id === accountId);
        if (!saved) throw new Error('账号不存在，请重新加载列表。');
        const repositories = this.state.repositories.filter(repository => repository.accountId === accountId && repository.available);
        if (!repositories.length) return { catalog: this.catalog(), matchedRepositoryIds: [] };
        const previousLinks = new Map(repositories.map(repository => [repository.id, this.state.links.find(link => link.repositoryId === repository.id)]));
        const discovered = await discoverLocalRepositories(field(value, 'path'), repositories.map(({ id, url }) => ({ id, url })), undefined, signal);
        const matched = repositories.filter(repository => discovered.worktrees.get(repository.id)!.length > 0);
        const matchedRepositoryIds = matched.map(repository => repository.id);
        if (!matched.length) return { catalog: this.catalog(), matchedRepositoryIds };
        const legacy = new Map<string, LocalWorktreeLink[]>();
        for (const repository of matched) {
          if (previousLinks.get(repository.id) && !previousLinks.get(repository.id)!.worktrees) {
            legacy.set(repository.id, (await this.localWorkspace(repository.id, signal)).tasks.map(task => ({ branch: task.branch, path: task.path! })));
          }
        }
        const catalog = await this.mutate(next => {
          signal?.throwIfAborted();
          const currentAccount = next.accounts.find(item => item.account.id === accountId);
          if (!currentAccount || currentAccount.token !== saved.token) throw new Error('账号已更新或移除，请重新加载后再匹配。');
          for (const repository of matched) {
            const currentRepository = next.repositories.find(item => item.id === repository.id);
            if (!currentRepository?.available || currentRepository.accountId !== accountId || currentRepository.fullName !== repository.fullName || currentRepository.url !== repository.url) throw new Error('仓库列表已更新，请重新加载后再匹配。');
            const previous = previousLinks.get(repository.id);
            const current = next.links.find(link => link.repositoryId === repository.id);
            if (JSON.stringify(current) !== JSON.stringify(previous)) throw new Error('仓库关联已更新，请重新加载后再匹配。');
            const worktrees = discovered.worktrees.get(repository.id)!;
            const retained = (previous?.worktrees || legacy.get(repository.id) || []).filter(item => !worktrees.some(found => found.path === item.path));
            const allWorktrees = [...retained, ...worktrees];
            if (allWorktrees.length > 64) throw new Error('关联工作目录超过64个，尚未保存。');
            next.links = [...next.links.filter(link => link.repositoryId !== repository.id), { repositoryId: repository.id, path: discovered.path, worktrees: allWorktrees }];
          }
        });
        return { catalog, matchedRepositoryIds };
      }
      case 'link': {
        const id = field(value, 'repositoryId', 160); const repository = this.repository(id);
        if (!repository.available) throw new Error('该账号目前无法访问这个仓库，请先重新加载。');
        const branch = value.branch === undefined ? undefined : field(value, 'branch', 1024);
        const previousLink = this.state.links.find(l => l.repositoryId === id);
        const legacy = previousLink && !previousLink.worktrees ? (await this.localWorkspace(id)).tasks.map(task => ({ branch: task.branch, path: task.path! })) : [];
        const discovered = await discoverLocalWorktrees(field(value, 'path'), repository.url, branch, signal);
        return this.mutate(next => {
          signal?.throwIfAborted();
          const current = next.repositories.find(r => r.id === id);
          if (!current?.available || current.fullName !== repository.fullName) throw new Error('仓库访问已变化。');
          const previous = next.links.find(l => l.repositoryId === id);
          if (JSON.stringify(previous) !== JSON.stringify(previousLink)) throw new Error('仓库关联已更新，请重试。');
          const retained = (previous?.worktrees || legacy).filter(w => !discovered.worktrees.some(found => found.path === w.path) && (branch === undefined || w.branch !== branch));
          const worktrees = [...retained, ...discovered.worktrees];
          if (worktrees.length > 64) throw new Error('关联工作目录超过64个，尚未保存。');
          next.links = [...next.links.filter(l => l.repositoryId !== id), { repositoryId: id, path: branch === undefined ? discovered.path : previous?.path || discovered.path, worktrees }];
        });
      }
      case 'unlink': { const id = field(value, 'repositoryId', 160); const branch = value.branch === undefined ? undefined : field(value, 'branch', 1024);
        const previous = this.state.links.find(link => link.repositoryId === id);
        const actual = branch !== undefined && previous ? (await this.localWorkspace(id, signal)).tasks : [];
        return this.mutate(next => {
        signal?.throwIfAborted();
        if (JSON.stringify(next.links.find(link => link.repositoryId === id)) !== JSON.stringify(previous)) throw new Error('仓库关联已更新，请重试。');
        if (branch === undefined) next.links = next.links.filter(l => l.repositoryId !== id);
        else next.links = next.links.flatMap(link => {
          if (link.repositoryId !== id) return [link];
          const worktrees = actual.filter(task => task.branch !== branch).map(task => ({ branch: task.branch, path: task.path! }));
          return worktrees.length ? [{ ...link, worktrees }] : [];
        });
      }); }
      case 'snapshot': return this.snapshot(field(value, 'repositoryId', 160));
      case 'localWorkspace': return this.localWorkspace(field(value, 'repositoryId', 160), signal);
      case 'remoteWorkspace': case 'remoteCommit': case 'remoteFile': return this.remoteRead(method, value, signal);
      case 'openFile': {
        const source = value.source;
        if (source !== 'remote' && source !== 'local') throw new Error('无效的文件来源。');
        const allowed = ['repositoryId', 'source', 'path', source === 'remote' ? 'commitId' : 'taskId'];
        if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error('打开文件仅接受仓库、任务或提交、字面文件路径。');
        const id = field(value, 'repositoryId', 160); const repository = this.repository(id);
        if (!repository.available) throw new Error('该账号目前无法访问这个仓库。');
        const account = this.state.accounts.find(item => item.account.id === repository.accountId)?.account;
        if (!account) throw new Error('访问账号已移除。');
        if (typeof value.path !== 'string') throw new Error('无效的仓库文件路径。');
        let target: string;
        if (source === 'remote') {
          const url = repositoryFileURL(account, repository, field(value, 'commitId', 64), value.path);
          if (!url) throw new Error('无效的远端文件身份。');
          target = url;
        } else {
          const link = this.state.links.find(item => item.repositoryId === id);
          const root = await this.taskRoot(id, field(value, 'taskId'));
          target = await repositoryTaskFile(root, field(value, 'taskId'), value.path);
          if (this.state.links.find(item => item.repositoryId === id) !== link || !this.state.accounts.some(item => item.account.id === account.id) || !this.repository(id).available || this.repository(id).fullName !== repository.fullName) throw new Error('仓库关联或访问账号已更新，请重试。');
        }
        signal?.throwIfAborted();
        await this.openFile({ source, value: target });
        return { opened: true };
      }
      case 'diff': {
        const id = field(value, 'repositoryId', 160); const file = field(value, 'path');
        if (value.taskId !== undefined) {
          const taskId = field(value, 'taskId'); const root = await this.taskRoot(id, taskId);
          return { text: await readRepositoryTaskDiff(root, taskId, file) };
        }
        const snapshot = await this.snapshot(id);
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
