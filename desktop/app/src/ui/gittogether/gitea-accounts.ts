import { createHash, randomUUID } from 'crypto'
import * as fs from 'fs/promises'
import * as Path from 'path'
import { getPath } from '../main-process-proxy'
import { TokenStore } from '../../lib/stores/token-store'
import { getUserAgent } from '../../lib/http'
import { getGenericUsername, setGenericUsername, setGenericPassword, getGenericPassword, deleteGenericCredential } from '../../lib/generic-git-auth'
import type { Account, ConnectInput, RemoteRepository } from '../../../../../macos/src/import-model'

interface Entry { account: Account; userId: number; repositories: RemoteRepository[] }
interface APIResponse { value: unknown; next: boolean; total: number }
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Ported from main's Gitea account contract. This adapter has no Git executor,
 * authentication helper or timer; credentials use the original Desktop stores. */
export function giteaHost(input: string): string {
  let url: URL
  try { url = new URL(input.includes('://') ? input : 'https://' + input) }
  catch { throw new Error('请输入有效的 Gitea 服务器地址。') }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Gitea 需要 HTTPS 服务器地址，不含路径或账号信息；HTTP 仅限本机。')
  return url.origin
}

async function getJSON(host: string, token: string, path: string): Promise<APIResponse> {
  const url = new URL(host + '/api/v1' + path)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    // Match upstream lib/http.ts: Chromium fetch uses Desktop's proxy and
    // certificate-error handling. Node https bypasses both of those paths.
    // Build pagination URLs locally and never send tokens through redirects.
    const response = await window.fetch(url.href, {
      method: 'GET',
      headers: { Authorization: 'token ' + token, Accept: 'application/json', 'User-Agent': getUserAgent() },
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'manual',
      signal: controller.signal,
    })
    if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) throw new Error('Gitea 服务器发生重定向，请直接填写最终的 HTTPS 服务器地址。')
    if (response.status !== 200) throw new Error(response.status === 401 || response.status === 403 ? 'Gitea 拒绝访问，请检查访问令牌及用户、仓库读取权限。' : 'Gitea 请求未完成（HTTP ' + response.status + '）。')
    if (!response.body) throw new Error('Gitea 返回了无效的 JSON。')
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > 16 * 1024 * 1024) throw new Error('Gitea 返回的数据过大。')
      chunks.push(value)
    }
    let value: unknown
    try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')) }
    catch { throw new Error('Gitea 返回了无效的 JSON。') }
    return { value, next: /rel="?next"?/.test(response.headers.get('link') || ''), total: Number(response.headers.get('x-total-count')) || 0 }
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Gitea 响应超时，请稍后重试。')
    if (error instanceof TypeError) throw new Error('无法安全连接 Gitea，请检查服务器证书、网络和系统代理后重试。')
    throw error
  } finally {
    clearTimeout(timeout)
    controller.abort()
  }
}

function repository(account: Account, raw: unknown): RemoteRepository {
  if (!record(raw) || !Number.isSafeInteger(raw.id) || typeof raw.id !== 'number' || raw.id < 1 || typeof raw.name !== 'string' || typeof raw.full_name !== 'string' || !/^[^/\s]+\/[^/\s]+$/.test(raw.full_name) || typeof raw.private !== 'boolean') throw new Error('Gitea 仓库列表返回格式不正确。')
  const parts = raw.full_name.split('/')
  if (parts.some(part => part === '.' || part === '..' || part.includes('\\') || /[\0-\x1f]/.test(part)) || raw.name !== parts[1]) throw new Error('Gitea 返回了无效的仓库名称。')
  return {
    id: account.id + ':' + raw.id, remoteId: raw.id, accountId: account.id,
    name: raw.name, fullName: raw.full_name, description: typeof raw.description === 'string' ? raw.description : '',
    defaultBranch: typeof raw.default_branch === 'string' ? raw.default_branch : '',
    private: raw.private, url: account.host + '/' + raw.full_name.split('/').map(encodeURIComponent).join('/'), available: true,
    ...(typeof raw.updated_at === 'string' && Number.isFinite(Date.parse(raw.updated_at)) ? { updatedAt: raw.updated_at } : {}),
    ...(typeof raw.fork === 'boolean' ? { fork: raw.fork } : {}),
    ...(record(raw.permissions) ? { permissions: Object.fromEntries(Object.entries(raw.permissions).filter(([key, value]) => ['admin', 'maintain', 'push', 'triage', 'pull'].includes(key) && typeof value === 'boolean')) } : {}),
  }
}

export class GiteaAccounts {
  private entries: Entry[] = []
  private ready: Promise<void> | undefined
  private file = ''
  private credentialKey = ''
  private mutation = Promise.resolve()
  private readonly listeners = new Set<() => void>()

  public onDidChange(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private initialize(): Promise<void> { return this.ready ?? (this.ready = this.load()) }
  private async load() {
    const root = await getPath('userData')
    this.file = Path.join(root, 'gitea-accounts.json')
    this.credentialKey = 'GitTogether Gitea directory ' + createHash('sha256').update(root).digest('hex')
    let text: string
    try { text = await fs.readFile(this.file, 'utf8') }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error }
    const saved: unknown = JSON.parse(text)
    if (!record(saved) || saved.version !== 1 || !Array.isArray(saved.entries)) throw new Error('保存的 Gitea 账号目录格式无效，原文件已保留。')
    for (const entry of saved.entries) {
      if (!record(entry) || !record(entry.account) || entry.account.provider !== 'gitea' || typeof entry.account.id !== 'string' || typeof entry.account.host !== 'string' || giteaHost(entry.account.host) !== entry.account.host || typeof entry.account.login !== 'string' || typeof entry.account.name !== 'string' || !Number.isSafeInteger(entry.userId) || !Array.isArray(entry.repositories)) throw new Error('保存的 Gitea 账号记录格式无效，原文件已保留。')
    }
    this.entries = saved.entries as unknown as Entry[]
  }
  private async save(entries: Entry[]) {
    const temporary = this.file + '.' + randomUUID() + '.tmp'
    await fs.writeFile(temporary, JSON.stringify({ version: 1, entries }), { mode: 0o600 })
    await fs.rename(temporary, this.file)
    this.entries = entries
    for (const listener of this.listeners) listener()
  }
  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    const result = this.mutation.then(action)
    // An individual rejection is returned to its caller, but must not poison
    // the queue and prevent a later retry or logout.
    this.mutation = result.then(() => undefined, () => undefined)
    return result
  }
  public async snapshot(): Promise<{ accounts: Account[]; repositories: RemoteRepository[] }> {
    await this.initialize()
    return { accounts: this.entries.map(e => ({ ...e.account })), repositories: this.entries.flatMap(e => e.repositories.map(r => ({ ...r }))) }
  }
  private async paged(account: Account, token: string, path: string): Promise<RemoteRepository[]> {
    const output = new Map<number, RemoteRepository>()
    let stalled = 0
    for (let page = 1; page <= 10_000; page++) {
      const response = await getJSON(account.host, token, path + (path.includes('?') ? '&' : '?') + 'limit=100&page=' + page)
      const rows = path.startsWith('/repos/search') ? record(response.value) && response.value.ok === true ? response.value.data : null : response.value
      if (!Array.isArray(rows)) throw new Error('Gitea 仓库分页返回格式不正确。')
      const previous = output.size
      for (const raw of rows) { const repo = repository(account, raw); output.set(repo.remoteId, repo) }
      if (!response.next && (response.total > 0 ? output.size >= response.total : rows.length === 0)) return [...output.values()]
      stalled = output.size > previous ? 0 : stalled + 1
      if (stalled >= 3) throw new Error('Gitea 分页未取得完整结果，保留上次仓库目录。')
    }
    throw new Error('Gitea 分页超出上限，保留上次仓库目录。')
  }
  private async directory(account: Account, userId: number, token: string): Promise<RemoteRepository[]> {
    const result = new Map<number, RemoteRepository>()
    for (const path of ['/user/repos', '/repos/search?uid=' + userId + '&mode=fork&exclusive=false', '/repos/search?uid=' + userId + '&mode=collaborative&exclusive=false']) {
      for (const repo of await this.paged(account, token, path)) result.set(repo.remoteId, repo)
    }
    return [...result.values()].sort((a, b) => a.fullName.localeCompare(b.fullName))
  }
  public connect(input: ConnectInput): Promise<void> {
    return this.enqueue(async () => {
      await this.initialize()
      const host = giteaHost(input.host.trim()), token = input.token.trim(), name = input.name.trim()
      if (!token || token.length > 4096 || /[\0\r\n]/.test(token) || name.length > 120 || /[\0\r\n]/.test(name)) throw new Error('请输入有效的访问令牌和账号名称。')
      const { value: user } = await getJSON(host, token, '/user')
      if (!record(user) || !Number.isSafeInteger(user.id) || typeof user.id !== 'number' || user.id < 1 || typeof user.login !== 'string' || !user.login || /[\0\r\n]/.test(user.login)) throw new Error('Gitea 身份验证返回格式不正确。')
      const id = 'gitea:' + host + ':' + user.id
      const previous = this.entries.find(e => e.account.id === id)
      const account: Account = { id, provider: 'gitea', host, login: user.login, name: name || previous?.account.name || (typeof user.full_name === 'string' && user.full_name ? user.full_name : user.login), updatedAt: new Date().toISOString() }
      let repositories = previous?.repositories || []
      try { repositories = await this.directory(account, user.id, token) }
      catch (error) { account.error = error instanceof Error ? error.message : String(error) }
      await TokenStore.setItem(this.credentialKey, id, token)
      const endpoint = new URL(host).href
      await setGenericPassword(endpoint, account.login, token)
      if (!getGenericUsername(endpoint)) setGenericUsername(endpoint, account.login)
      await this.save([...this.entries.filter(e => e.account.id !== id), { account, userId: user.id, repositories }])
    })
  }
  public refresh(id: string): Promise<void> {
    return this.enqueue(async () => {
      await this.initialize()
      const entry = this.entries.find(e => e.account.id === id)
      if (!entry) throw new Error('Gitea 账号已移除。')
      const account = { ...entry.account }
      let repositories = entry.repositories
      try {
        const token = await TokenStore.getItem(this.credentialKey, id)
        if (!token) throw new Error('Gitea 访问令牌不可用，请重新连接账号。')
        repositories = await this.directory(account, entry.userId, token)
        delete account.error
        account.updatedAt = new Date().toISOString()
      } catch (error) { account.error = error instanceof Error ? error.message : String(error) }
      await this.save(this.entries.map(e => e === entry ? { ...entry, account, repositories } : e))
    })
  }
  public remove(id: string): Promise<void> {
    return this.enqueue(async () => {
      await this.initialize()
      const entry = this.entries.find(e => e.account.id === id)
      if (!entry) return
      const token = await TokenStore.getItem(this.credentialKey, id)
      const endpoint = new URL(entry.account.host).href
      const currentUsername = getGenericUsername(endpoint)
      if (token && await getGenericPassword(endpoint, entry.account.login) === token) {
        await deleteGenericCredential(endpoint, entry.account.login)
        const nextUsername = currentUsername !== entry.account.login ? currentUsername : this.entries.find(e => e !== entry && e.account.host === entry.account.host)?.account.login
        if (nextUsername) setGenericUsername(endpoint, nextUsername)
      }
      await TokenStore.deleteItem(this.credentialKey, id)
      await this.save(this.entries.filter(e => e !== entry))
    })
  }
  public async cloneURL(repo: RemoteRepository): Promise<string> {
    await this.initialize()
    const entry = this.entries.find(e => e.account.id === repo.accountId)
    if (!entry) return repo.url
    const url = new URL(repo.url + '.git')
    url.username = entry.account.login
    return url.href
  }
}
export const giteaAccounts = new GiteaAccounts()
