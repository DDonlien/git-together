import { createHash, randomUUID } from 'crypto'
import * as fs from 'fs/promises'
import * as Path from 'path'
import { pathToFileURL } from 'url'
import { AppStore } from '../../lib/stores'
import { RepositoryStateCache } from '../../lib/stores/repository-state-cache'
import { CopilotStore } from '../../lib/stores/copilot-store'
import { findDefaultRemote } from '../../lib/stores/helpers/find-default-remote'
import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { Account } from '../../models/account'
import { BranchType } from '../../models/branch'
import { Commit } from '../../models/commit'
import { AppFileStatusKind, WorkingDirectoryFileChange } from '../../models/status'
import { TipState } from '../../models/tip'
import { FetchType } from '../../models/fetch'
import { addWorktree } from '../../lib/git/worktree'
import { Branch } from '../../models/branch'
import { DiffType, IDiff } from '../../models/diff'
import { getBlobContents } from '../../lib/git/show'
import { getCommitDiff, getWorkingDirectoryDiff } from '../../lib/git/diff'
import { git, getStatus, getBranches, getCommits, getCommit, getChangedFiles, getRemotes, getRepositoryType, listWorktrees } from '../../lib/git'
import type { IRemote } from '../../models/remote'
import { shell } from '../../lib/app-shell'
import { getHTMLURL } from '../../lib/api'
import { getUserAgent } from '../../lib/http'
import type { ApiInputs, ApiMethod, Catalog, LocalFile, RemoteRepository } from '../../../../../macos/src/import-model'
import type { RepositoryCommit, RepositoryWorkspace, RepositoryTask } from '../../../../../macos/src/repository-model'
import type { RemoteCommitDetails } from '../../../../../macos/src/remote-repository-model'
import { CustomActions } from './custom-actions'
import { giteaAccounts } from './gitea-accounts'
import { discoverRepositories, repositoryIdentity, repositoryURL } from './repository-discovery'
import { CommitMessageGenerator } from './commit-message-generator'
import { PlatformFetchGate } from './platform-fetch'
import { isCheckoutWorktree } from './worktree'

export const instanceId = randomUUID()
import { version as productVersion } from '../../../../../package.json'
export { productVersion }
const accountId = (a: Account) => `${a.endpoint}:${a.id}`
const taskId = (branch: string, path: string) => `worktree:${branch}:${path}`
export const fileStatus = (file: { status: { kind: AppFileStatusKind; oldPath?: string }; path: string }): LocalFile => ({
  path: file.path,
  status: ({ New: 'A', Modified: 'M', Deleted: 'D', Copied: 'C', Renamed: 'R', Conflicted: 'U', Untracked: '??' })[file.status.kind],
  tracked: file.status.kind !== AppFileStatusKind.Untracked,
  ...(file.status.oldPath ? { previousPath: file.status.oldPath } : {}),
})
export const commitDTO = (c: Commit, refs: string[] = []) => ({ id: c.sha, summary: c.summary, author: c.author.name, time: c.author.date.toISOString(), parents: [...c.parentSHAs], refs })

function providerCommit(value: unknown): RepositoryCommit {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('远端提交记录格式无效。')
  const raw = value as Record<string, unknown>
  const commit = raw.commit && typeof raw.commit === 'object' && !Array.isArray(raw.commit) ? raw.commit as Record<string, unknown> : null
  const author = commit?.author && typeof commit.author === 'object' && !Array.isArray(commit.author) ? commit.author as Record<string, unknown> : null
  const parents = raw.parents
  const id = typeof raw.sha === 'string' ? raw.sha.toLowerCase() : ''
  const message = typeof commit?.message === 'string' ? commit.message : null
  const name = typeof author?.name === 'string' ? author.name : ''
  const time = typeof author?.date === 'string' ? author.date : ''
  if (!/^[a-f0-9]{40,64}$/.test(id) || message === null || !name || !Number.isFinite(Date.parse(time)) || !Array.isArray(parents)) throw new Error('远端提交记录字段无效。')
  const parentIds = parents.map(parent => {
    if (!parent || typeof parent !== 'object' || Array.isArray(parent) || typeof (parent as Record<string, unknown>).sha !== 'string' || !/^[a-f0-9]{40,64}$/i.test((parent as Record<string, unknown>).sha as string)) throw new Error('远端父提交记录无效。')
    return ((parent as Record<string, unknown>).sha as string).toLowerCase()
  })
  return { id, summary: message.split(/\r?\n/, 1)[0], author: name, time, parents: parentIds, refs: [] }
}

function providerCommits(value: unknown): RepositoryCommit[] {
  if (!Array.isArray(value)) throw new Error('远端提交历史返回格式无效。')
  return value.map(providerCommit)
}

async function githubJSON(url: URL, token: string): Promise<{ value: unknown; headers: Headers }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await window.fetch(url.href, {
      method: 'GET', headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': getUserAgent() },
      credentials: 'omit', cache: 'no-store', redirect: 'manual', signal: controller.signal,
    })
    if (response.type === 'opaqueredirect' || response.status >= 300 && response.status < 400) throw new Error('GitHub API 发生重定向，已停止读取远端内容。')
    if (response.status !== 200) throw new Error(`GitHub 远端内容读取失败（HTTP ${response.status}）；请检查账号仓库权限或稍后重试。`)
    if (!response.body) throw new Error('GitHub API 返回了空响应。')
    const reader = response.body.getReader(), chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > 16 * 1024 * 1024) throw new Error('GitHub API 响应过大。')
      chunks.push(value)
    }
    let value: unknown
    try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')) }
    catch { throw new Error('GitHub API 返回了无效 JSON。') }
    return { value, headers: response.headers }
  } catch (error) {
    if (controller.signal.aborted) throw new Error('GitHub API 响应超时，请稍后重试。')
    if (error instanceof TypeError) throw new Error('无法连接 GitHub API，请检查网络和系统代理。')
    throw error
  } finally { clearTimeout(timeout); controller.abort() }
}

/** Presentation translation only. Standard writes always enter Desktop's Dispatcher. */
export class DesktopAdapter {
  private revision = 0
  private epoch = 0
  private local = new Map<string, Repository[]>()
  private readonly remoteURLs = new Map<string, { remote: IRemote | null; urls: string[] }>()
  private readonly workspaceCache = new Map<string, { states: unknown[]; value: RepositoryWorkspace }>()
  private readonly remoteCache = new Map<string, { state: unknown; epoch: number; value: Awaited<ReturnType<DesktopAdapter['readRemoteWorkspace']>> }>()
  private readonly reads = new Map<string, Promise<RepositoryWorkspace>>()
  private readonly results = new Map<string, { fingerprint: string; result: Promise<unknown> }>()
  private readonly platformFetch = new PlatformFetchGate()
  public readonly actions: CustomActions
  public readonly commitMessages: CommitMessageGenerator
  public readonly gitea = giteaAccounts
  public constructor(public readonly store: AppStore, public readonly dispatcher: Dispatcher, public readonly cache: RepositoryStateCache, copilot: CopilotStore) {
    this.actions = new CustomActions(this)
    this.commitMessages = new CommitMessageGenerator(this, copilot)
    store.onDidUpdate(() => { this.revision++ })
    this.gitea.onDidChange(() => { this.revision++; this.epoch++; this.workspaceCache.clear(); this.remoteCache.clear() })
  }
  public repositories(): Repository[] { return this.store.getState().repositories.filter((r): r is Repository => r instanceof Repository) }
  public async catalog(): Promise<Catalog> {
    const state = this.store.getState()
    const accounts: Catalog['accounts'] = state.accounts.map(a => ({ id: accountId(a), provider: a.endpoint === 'https://api.github.com' ? 'github' : 'github-enterprise', host: getHTMLURL(a.endpoint), login: a.login, name: a.name || a.login, updatedAt: new Date().toISOString(), ...(a.avatarURL ? { avatarUrl: a.avatarURL } : {}) }))
    const repositories = new Map<string, RemoteRepository>()
    const gitea = await this.gitea.snapshot()
    accounts.push(...gitea.accounts)
    for (const repo of gitea.repositories) repositories.set(repo.id, repo)
    const local = new Map<string, Repository[]>()
    for (const [account, value] of state.apiRepositories) {
      for (const r of value.repositories) {
        const id = `${accountId(account)}:${r.owner.login}/${r.name}`
        repositories.set(id, { id, accountId: accountId(account), remoteId: 0, name: r.name, fullName: `${r.owner.login}/${r.name}`, description: '', defaultBranch: r.default_branch || 'main', private: r.private, url: r.html_url, available: true, fork: r.fork, ownerType: r.owner.type === 'Organization' ? 'organization' : 'user', updatedAt: r.pushed_at })
      }
    }
    for (const repo of this.repositories()) {
      const gh = repo.gitHubRepository
      const saved = this.cache.get(repo)
      let known = this.remoteURLs.get(repo.path)
      if (!known || known.remote !== saved.remote) {
        const readable = !repo.missing && (await getRepositoryType(repo.path)).kind === 'regular'
        const remotes = readable ? await getRemotes(repo) : []
        const primary = findDefaultRemote(remotes)
        known = { remote: saved.remote, urls: readable ? (primary ? [primary, ...remotes.filter(remote => remote !== primary)] : []).map(remote => remote.url) : known?.urls || [] }
        this.remoteURLs.set(repo.path, known)
      }
      const remote = gh?.htmlURL || saved.remote?.url || known.urls[0]
      let url = remote && repositoryURL(remote) || pathToFileURL(repo.path).href
      const account = gh ? state.accounts.find(a => a.endpoint === gh.endpoint) : undefined
      let aid = account ? accountId(account) : 'local'
      const fullName = gh ? `${gh.owner.login}/${gh.name}` : new URL(url).protocol === 'file:' ? repo.name : new URL(url).pathname.slice(1)
      let id = `${aid}:${fullName}`
      const identities = [url, ...known.urls].map(repositoryIdentity).filter(identity => identity !== null)
      const allCandidates = [...repositories.values()].filter(r => {
        const identity = repositoryIdentity(r.url)
        return identity !== null && identities.includes(identity) && (r.accountId === aid || !account && r.accountId.startsWith('gitea:'))
      })
      const primaryCandidates = allCandidates.filter(repo => repositoryIdentity(repo.url) === repositoryIdentity(url))
      const candidates = primaryCandidates.length ? primaryCandidates : allCandidates
      const remoteLogin = remote && /^https?:\/\//.test(remote) ? new URL(remote).username : ''
      const match = candidates.find(r => !remoteLogin || encodeURIComponent(accounts.find(a => a.id === r.accountId)?.login || '') === remoteLogin) || candidates[0]
      if (match) { id = match.id; url = match.url; aid = match.accountId }
      if (!accounts.some(a => a.id === aid)) accounts.push({ id: aid, provider: 'local', host: 'file:///', login: '', name: '本地仓库', updatedAt: new Date().toISOString() })
      repositories.set(id, { ...match, id, accountId: aid, remoteId: match?.remoteId || repo.id, name: match?.name || repo.name, fullName: match?.fullName || fullName, description: match?.description || '', defaultBranch: saved.branchesState.defaultBranch?.name || match?.defaultBranch || 'main', private: match?.private ?? gh?.isPrivate ?? false, url, available: !repo.missing })
      local.set(id, [...(local.get(id) || []), repo])
    }
    this.local = local
    return { instanceId, revision: this.revision, accounts, repositories: [...repositories.values()], links: [...local].map(([repositoryId, repos]) => ({ repositoryId, path: repos[0].path, worktrees: repos.map(r => ({ path: r.path, branch: this.branch(r) })) })), credentialStorage: 'encrypted' }
  }
  private async addDiscoveredRepositories(found: Map<string, string[]>): Promise<void> {
    if (!found.size) return
    const combined = new Map<string, Set<string>>()
    for (const [path, ids] of found) {
      for (const id of ids) {
        const paths = combined.get(id) || new Set(this.local.get(id)?.map(repo => repo.path))
        paths.add(path); combined.set(id, paths)
        if (paths.size > 64) throw new Error('此仓库的已关联及新匹配工作目录超过64个，请缩小范围；原关联未改变。')
      }
    }
    const existing = new Set(this.repositories().map(repo => repo.id))
    try {
      const repos = await this.dispatcher.addRepositories([...found.keys()])
      if (repos.length !== found.size) throw new Error('部分匹配目录已变化，未完成添加；请重新匹配。')
      for (const repo of repos) await this.dispatcher.refreshRepository(repo)
      if (!this.store.getState().selectedState) await this.dispatcher.selectRepository(repos[0])
      this.epoch++; this.workspaceCache.clear(); this.remoteCache.clear()
    } catch (error) {
      for (const repo of this.repositories()) {
        if (found.has(repo.path) && !existing.has(repo.id)) await this.dispatcher.removeRepository(repo, false)
      }
      throw error
    }
  }
  public branch(repo: Repository): string {
    const tip = this.cache.get(repo).branchesState.tip
    return tip.kind === TipState.Valid ? tip.branch.name : tip.kind === TipState.Unborn ? tip.ref : 'Detached HEAD'
  }
  public async repository(id: string, tid?: string): Promise<Repository> {
    await this.catalog()
    const repos = this.local.get(id) || []
    const repo = tid ? repos.find(r => taskId(this.branch(r), r.path) === tid || tid.endsWith(`:${r.path}`)) : repos[0]
    if (!repo) throw new Error('请先添加或下载此仓库的本地工作目录。')
    return repo
  }
  public async remote(id: string): Promise<RemoteRepository> {
    const repo = (await this.catalog()).repositories.find(r => r.id === id)
    if (!repo) throw new Error("仓库不在当前 目录中。")
    return repo
  }
  private async providerHistoryPage(repositoryId: string, head: string, page: number): Promise<{ commits: RepositoryCommit[]; hasMore: boolean }> {
    const repository = await this.remote(repositoryId)
    const accountInfo = (await this.catalog()).accounts.find(account => account.id === repository.accountId)
    if (accountInfo?.provider === 'gitea') {
      const result = await this.gitea.graphHistoryPage(repositoryId, head, page)
      return { commits: providerCommits(result.value), hasMore: result.hasMore }
    }
    if (accountInfo?.provider !== 'github' && accountInfo?.provider !== 'github-enterprise') {
      const repo = await this.repository(repositoryId)
      const local = await getCommits(repo, head, 100, (page - 1) * 100)
      return { commits: local.map(commit => commitDTO(commit)), hasMore: local.length === 100 }
    }
    const account = this.store.getState().accounts.find(item => accountId(item) === repository.accountId)
    if (!account?.token) throw new Error('GitHub 账号令牌不可用，请重新连接账号。')
    if (!/^[a-f0-9]{40,64}$/i.test(head) || !Number.isSafeInteger(page) || page < 1) throw new Error('远端提交分页参数无效。')
    const parts = repository.fullName.split('/')
    if (parts.length !== 2 || parts.some(part => !part || part === '.' || part === '..')) throw new Error('GitHub 仓库身份无效。')
    const apiRoot = account.endpoint.endsWith('/') ? account.endpoint : account.endpoint + '/'
    const url = new URL(`repos/${parts.map(encodeURIComponent).join('/')}/commits`, apiRoot)
    url.searchParams.set('sha', head)
    url.searchParams.set('per_page', '100')
    url.searchParams.set('page', String(page))
    url.searchParams.set('stat', 'false')
    const result = await githubJSON(url, account.token)
    const commits = providerCommits(result.value)
    return { commits, hasMore: /rel="?next"?/i.test(result.headers.get('link') || '') || commits.length >= 100 }
  }
  private async providerCommitDetails(repositoryId: string, commitId: string): Promise<RemoteCommitDetails> {
    if (!/^[a-f0-9]{40,64}$/i.test(commitId)) throw new Error('远端提交编号无效。')
    const repository = await this.remote(repositoryId)
    const accountInfo = (await this.catalog()).accounts.find(account => account.id === repository.accountId)
    let value: unknown
    if (accountInfo?.provider === 'gitea') value = await this.gitea.graphCommit(repositoryId, commitId)
    else {
      if (accountInfo?.provider !== 'github' && accountInfo?.provider !== 'github-enterprise') throw new Error('此平台的远端历史提交不在本地对象库中，当前无法读取提交详情。')
      const account = this.store.getState().accounts.find(item => accountId(item) === repository.accountId)
      if (!account?.token) throw new Error('GitHub 账号令牌不可用，请重新连接账号。')
      const parts = repository.fullName.split('/')
      if (parts.length !== 2 || parts.some(part => !part || part === '.' || part === '..')) throw new Error('GitHub 仓库身份无效。')
      const apiRoot = account.endpoint.endsWith('/') ? account.endpoint : account.endpoint + '/'
      const url = new URL(`repos/${parts.map(encodeURIComponent).join('/')}/commits/${commitId.toLowerCase()}`, apiRoot)
      url.searchParams.set('per_page', '100'); url.searchParams.set('page', '1'); url.searchParams.set('stat', 'false')
      value = (await githubJSON(url, account.token)).value
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('远端提交详情返回格式无效。')
    const raw = value as Record<string, unknown>
    const commit = providerCommit(raw)
    if (commit.id !== commitId.toLowerCase()) throw new Error('远端提交详情与所选编号不一致。')
    const rows = Array.isArray(raw.files) ? raw.files : []
    const files = rows.map(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('远端提交文件记录无效。')
      const file = item as Record<string, unknown>
      if (typeof file.filename !== 'string' || typeof file.status !== 'string') throw new Error('远端提交文件记录无效。')
      return { path: file.filename, status: file.status, ...(typeof file.previous_filename === 'string' ? { previousPath: file.previous_filename } : {}), patch: typeof file.patch === 'string' ? file.patch : null }
    })
    const diff = files.map(file => file.patch === null ? `# ${file.path}: 平台未返回文本补丁` : `--- a/${file.previousPath || file.path}\n+++ b/${file.path}\n${file.patch}`).join('\n')
    const commitData = raw.commit && typeof raw.commit === 'object' && !Array.isArray(raw.commit) ? raw.commit as Record<string, unknown> : null
    const treeData = commitData?.tree && typeof commitData.tree === 'object' && !Array.isArray(commitData.tree) ? commitData.tree as Record<string, unknown> : null
    const treeId = typeof treeData?.sha === 'string' ? treeData.sha : ''
    let tree = { paths: [] as string[], complete: false }, warning = ''
    try { if (treeId) tree = await this.providerTree(repositoryId, treeId) }
    catch (error) { warning = error instanceof Error ? `提交文件树读取失败：${error.message}` : '提交文件树读取失败。' }
    if (!tree.complete && !warning) warning = '所选提交的完整文件树暂未读取，右侧保留当前远端分支文件树。'
    return { commit, files, diff, tree: tree.paths, treeComplete: tree.complete, warnings: warning ? [warning] : [] }
  }
  private async providerTree(repositoryId: string, treeId: string): Promise<{ paths: string[]; complete: boolean }> {
    if (!/^[a-f0-9]{40,64}$/i.test(treeId)) return { paths: [], complete: false }
    const repository = await this.remote(repositoryId)
    const accountInfo = (await this.catalog()).accounts.find(account => account.id === repository.accountId)
    const paths = new Set<string>()
    let complete = true
    const add = (value: unknown) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('远端文件树条目无效。')
      const item = value as Record<string, unknown>
      if (item.type !== 'blob' && item.type !== 'commit') return
      if (typeof item.path !== 'string' || !item.path || item.path.startsWith('/') || item.path.includes('\\') || item.path.split('/').some(part => !part || part === '.' || part === '..' || /[\0-\x1f]/.test(part))) throw new Error('远端文件树路径无效。')
      if (paths.has(item.path)) return
      if (paths.size >= 20_000) { complete = false; return }
      paths.add(item.path)
    }
    if (accountInfo?.provider === 'gitea') {
      for (let page = 1; page <= 200; page++) {
        const result = await this.gitea.graphTreePage(repositoryId, treeId, page)
        const body = result.value as Record<string, unknown>
        for (const item of body.tree as unknown[]) add(item)
        if (body.truncated === true) complete = false
        if (!result.hasMore || !complete) break
        if (page === 200) complete = false
      }
    } else {
      const account = this.store.getState().accounts.find(item => accountId(item) === repository.accountId)
      if (!account?.token) throw new Error('GitHub 账号令牌不可用，请重新连接账号。')
      const parts = repository.fullName.split('/')
      if (parts.length !== 2 || parts.some(part => !part || part === '.' || part === '..')) throw new Error('GitHub 仓库身份无效。')
      const apiRoot = account.endpoint.endsWith('/') ? account.endpoint : account.endpoint + '/'
      const url = new URL(`repos/${parts.map(encodeURIComponent).join('/')}/git/trees/${treeId.toLowerCase()}`, apiRoot)
      url.searchParams.set('recursive', '1')
      const response = await githubJSON(url, account.token)
      if (!response.value || typeof response.value !== 'object' || Array.isArray(response.value) || !Array.isArray((response.value as Record<string, unknown>).tree)) throw new Error('GitHub 文件树返回格式无效。')
      const body = response.value as Record<string, unknown>
      for (const item of body.tree as unknown[]) add(item)
      complete = body.truncated !== true && complete
    }
    return { paths: [...paths], complete }
  }
  public async checked(input: { repositoryId: string; taskId: string; expectedHead: string; changeKey?: string }): Promise<Repository> {
    const repo = await this.repository(input.repositoryId, input.taskId)
    await this.dispatcher.refreshRepository(repo)
    const status = await getStatus(repo)
    if (status && input.taskId !== taskId(status.currentBranch || 'Detached HEAD', repo.path)) throw new Error('工作目录已切换分支，请重新预览。')
    if (!status || (status.currentTip || '') !== input.expectedHead) throw new Error('工作目录的 HEAD 已变化，请重新预览。')
    if (input.changeKey && (await this.changeKey(repo, status.workingDirectory.files)) !== input.changeKey) throw new Error('工作目录的内容已变化，请重新预览。')
    return repo
  }
  public async changeKey(repo: Repository, files: ReadonlyArray<WorkingDirectoryFileChange>): Promise<string> {
    const hash = createHash('sha256')
    const status = await getStatus(repo)
    hash.update(status?.currentTip || '')
    hash.update((await git(['rev-parse', '--is-shallow-repository'], repo.path, 'isShallow')).stdout)
    const index = await git(['ls-files', '--stage', '-z'], repo.path, 'getTrackedFiles')
    hash.update(index.stdout)
    for (const f of files) {
      hash.update(JSON.stringify(fileStatus(f)))
      const path = safePath(repo.path, f.path)
      try {
        const s = await fs.lstat(path)
        if (s.isSymbolicLink()) hash.update(await fs.readlink(path))
        else if (s.isFile()) hash.update(await fs.readFile(path))
        else hash.update(`${s.mode}:${s.mtimeMs}`)
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; hash.update('missing') }
    }
    return hash.digest('hex')
  }
  public async workspace(id: string): Promise<RepositoryWorkspace> {
    const existing = this.reads.get(id)
    if (existing) return existing
    await this.catalog()
    const repos = this.local.get(id) || []
    const states = [this.epoch, ...repos.flatMap(r => [this.cache.get(r), this.store.getState().localRepositoryStateLookup.get(r.id)])]
    const cached = this.workspaceCache.get(id)
    if (cached && states.length === cached.states.length && states.every((s, i) => s === cached.states[i])) return cached.value
    const reading = this.readWorkspace(id)
    this.reads.set(id, reading)
    try { const value = await reading; this.workspaceCache.set(id, { states, value }); return value } finally { this.reads.delete(id) }
  }
  private async readWorkspace(id: string): Promise<RepositoryWorkspace> {
    const first = await this.repository(id)
    const worktrees = await listWorktrees(first)
    const tasks: RepositoryTask[] = []
    const commits = new Map<string, ReturnType<typeof commitDTO>>()
    for (const w of worktrees.filter(isCheckoutWorktree)) {
      // Desktop registers and maintains each worktree using the upstream store.
      let repo = this.repositories().find(r => r.path === w.path)
      if (!repo) repo = (await this.dispatcher.addRepositories([w.path]))[0]
      if (!repo) throw new Error("无法打开此工作目录。")
      if (this.cache.get(repo).branchesState.tip.kind === TipState.Unknown) await this.dispatcher.refreshRepository(repo)
      const status = await getStatus(repo)
      if (!status || !status.exists) throw new Error("无法读取工作目录状态。")
      const branch = status.currentBranch || 'Detached HEAD'
      const history = status.currentTip ? await getCommits(repo, 'HEAD', 100) : []
      const branches = await getBranches(repo)
      for (const c of history) commits.set(c.sha, commitDTO(c, branches.filter(b => b.tip.sha === c.sha).map(b => b.name)))
      const tree = await git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'], repo.path, 'getTrackedFiles')
      tasks.push({ id: taskId(branch, repo.path), branch, head: status.currentTip || '', path: repo.path, files: status.workingDirectory.files.map(fileStatus), tree: [...new Set(tree.stdout.split('\0').filter(Boolean))], error: '', treeComplete: true, changeKey: await this.changeKey(repo, status.workingDirectory.files), tracking: { upstream: status.currentUpstreamBranch ?? null, ahead: status.branchAheadBehind?.ahead ?? null, behind: status.branchAheadBehind?.behind ?? null } })
    }
    return { tasks, commits: [...commits.values()], complete: true, source: 'local' }
  }
  public async remoteWorkspace(id: string) {
    const catalog = await this.catalog()
    if (!this.local.has(id)) {
      const remote = catalog.repositories.find(r => r.id === id)
      if (!remote) throw new Error('仓库已经不在账号目录中。')
      return { tasks: [{ id: `remote:${remote.defaultBranch}`, branch: remote.defaultBranch, head: '', path: null, files: [], tree: [], error: "下载后显示实际分支和历史。", remote: true, treeComplete: false, historyHasMore: false }], commits: [], complete: false, source: 'remote' as const, checkedAt: 0, warnings: ['尚未下载：这里只显示账号目录中已知的默认分支。'] }
    }
    const repo = await this.repository(id)
    const state = this.cache.get(repo).branchesState.allBranches
    const previous = this.remoteCache.get(id)
    if (previous?.state === state && previous.epoch === this.epoch) return previous.value
    const value = await this.readRemoteWorkspace(id)
    this.remoteCache.set(id, { state, epoch: this.epoch, value })
    return value
  }
  private async readRemoteWorkspace(id: string) {
    const repo = await this.repository(id)
    const branches = await getBranches(repo, 'refs/remotes')
    const remoteBranches = branches.filter(branch => branch.type === BranchType.Remote)
    const histories = new Map<string, { commits: RepositoryCommit[]; hasMore: boolean; error: string }>()
    const heads = [...new Set(remoteBranches.map(branch => branch.tip.sha).filter(Boolean))]
    let cursor = 0
    await Promise.all(Array.from({ length: Math.min(4, heads.length) }, async () => {
      while (cursor < heads.length) {
        const head = heads[cursor++]
        try {
          const page = await this.providerHistoryPage(id, head, 1)
          if (!page.commits.length || page.commits[0].id !== head.toLowerCase()) throw new Error('远端分支没有返回与本地追踪 HEAD 一致的提交。')
          histories.set(head, { ...page, error: '' })
        } catch (error) {
          histories.set(head, { commits: [], hasMore: false, error: error instanceof Error ? error.message : '读取远端提交历史失败。' })
        }
      }
    }))
    const refsByHead = new Map<string, string[]>()
    for (const branch of remoteBranches) {
      const refs = refsByHead.get(branch.tip.sha) || []
      refs.push(`refs/remotes/${branch.remoteName}/${branch.nameWithoutRemote}`)
      refsByHead.set(branch.tip.sha, refs)
    }
    const commits = new Map<string, RepositoryCommit>()
    for (const history of histories.values()) for (const commit of history.commits) {
      const refs = refsByHead.get(commit.id) || []
      const previous = commits.get(commit.id)
      commits.set(commit.id, previous ? { ...previous, refs: [...new Set([...previous.refs, ...refs])] } : { ...commit, refs })
    }
    const tasks = await Promise.all(remoteBranches.map(async branch => {
      const history = histories.get(branch.tip.sha)
      let tree: string[] = [], treeComplete = true, error = history?.error || ''
      try {
        const result = await git(['ls-tree', '-r', '--name-only', '-z', branch.tip.sha], repo.path, 'getTree')
        tree = result.stdout.split('\0').filter(Boolean)
      } catch (problem) {
        treeComplete = false
        const treeError = problem instanceof Error ? problem.message : '读取远端文件树失败。'
        error = error ? `${error} 文件树读取失败：${treeError}` : `文件树读取失败：${treeError}`
      }
      return { id: `remote:${branch.name}`, branch: branch.nameWithoutRemote, head: branch.tip.sha, path: null, files: [], tree, error, remote: true, treeComplete, historyHasMore: history?.hasMore || false }
    }))
    const warnings = tasks.filter(task => task.error).map(task => `${task.branch}：${task.error}`)
    return { tasks, commits: [...commits.values()], complete: tasks.every(task => !task.error), source: 'remote' as const, checkedAt: Date.now(), warnings }
  }
  private async waitForNativeOperation(repo: Repository): Promise<void> {
    const busy = () => this.store.getState().currentPopup !== null || this.cache.get(repo).isPushPullFetchInProgress || this.cache.get(repo).isCommitting
    if (!busy()) return
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { subscription.dispose(); reject(new Error("请在对话框中完成或取消此操作。")) }, 30 * 60_000)
      const subscription = this.store.onDidUpdate(() => {
        if (!busy()) { clearTimeout(timer); subscription.dispose(); resolve() }
      })
    })
  }
  public async once(id: string, input: unknown, run: () => Promise<unknown>) {
    const fingerprint = JSON.stringify(input)
    const previous = this.results.get(id)
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new Error('操作编号已用于另一份请求。')
      return previous.result
    }
    const result = run()
    const invalidate = () => { this.epoch++; this.workspaceCache.clear(); this.remoteCache.clear() }
    void result.then(invalidate, invalidate)
    this.results.set(id, { fingerprint, result })
    void result.catch(() => { if (this.results.get(id)?.result === result) this.results.delete(id) })
    return result
  }
  public async commit(input: ApiInputs['submitCommit']) {
    return this.once(input.operationId, input, async () => {
      const repo = await this.checked(input)
      await this.dispatcher.selectRepository(repo)
      const files = this.cache.get(repo).changesState.workingDirectory.files
      if (input.paths?.some(p => !files.some(f => f.path === p))) throw new Error('所选文件已经变化。')
      for (const f of files) this.dispatcher.changeFileIncluded(repo, f, !input.paths || input.paths.includes(f.path))
      const ok = await this.dispatcher.commitIncludedChanges(repo, { summary: input.summary, description: input.description })
      if (!ok && this.store.getState().currentPopup) await this.waitForNativeOperation(repo)
      if (!ok && (await getStatus(repo))?.currentTip === input.expectedHead) throw new Error("提交未完成，请查看错误详情。")
      const status = await getStatus(repo)
      if (!status?.currentTip || status.currentTip === input.expectedHead) throw new Error('未观察到新的本地提交。')
      return { taskId: input.taskId, commitId: status.currentTip, branch: status.currentBranch || 'Detached HEAD' }
    })
  }
  public async push(input: ApiInputs['pushCommit']) {
    return this.once(input.operationId, input, async () => {
      const repo = await this.checked(input)
      if (input.commitId !== input.expectedHead) throw new Error('只能推送当前分支的 HEAD。')
      await this.dispatcher.selectRepository(repo)
      await this.dispatcher.push(repo)
      await this.waitForNativeOperation(repo)
      const status = await getStatus(repo)
      const { aheadBehind, isPushPullFetchInProgress } = this.cache.get(repo)
      if (!status?.currentUpstreamBranch || !aheadBehind || aheadBehind.ahead !== 0 || isPushPullFetchInProgress) throw new Error("尚未确认推送完成，请查看弹窗中的提示。本地提交已保留。")
      return { taskId: input.taskId, commitId: input.commitId, branch: status.currentBranch || 'Detached HEAD', pushed: true }
    })
  }
  public async handle<M extends ApiMethod>(method: M, input: ApiInputs[M]): Promise<unknown> {
    // The UI sends a finite protocol. It cannot supply a command, token helper, or executable.
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('请求格式无效。')
    const v = input as Record<string, unknown>
    for (const key of ['commitId', 'expectedHead', 'head']) {
      const value = v[key]
      if (value !== undefined && (typeof value !== 'string' || value !== '' && !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value))) throw new Error('Git 对象标识无效。')
    }
    const id = String(v.repositoryId || '')
    const tid = typeof v.taskId === 'string' ? v.taskId : undefined
    switch (method) {
      case 'status': return { instanceId, version: productVersion, githubWebAuth: false }
      case 'catalog': return this.catalog()
      case 'refresh': {
        if (String(v.accountId).startsWith('gitea:')) { await this.gitea.refresh(String(v.accountId)); return this.catalog() }
        const a = this.store.getState().accounts.find(a => accountId(a) === v.accountId)
        if (a) await this.dispatcher.refreshApiRepositories(a)
        return this.catalog()
      }
      case 'connect': {
        const c = input as ApiInputs['connect']
        if (c.provider === 'gitea') { await this.gitea.connect(c); return this.catalog() }
        if (c.provider !== 'github' && c.provider !== 'github-enterprise') throw new Error("可连接 GitHub 和 GitHub Enterprise 账号；其他平台请添加已有的本地 Git 仓库。")
        if (c.provider === 'github') await this.dispatcher.showDotComSignInDialog()
        else await this.dispatcher.showEnterpriseSignInDialog(c.host || undefined)
        return this.catalog()
      }
      case 'removeAccount': {
        if (String(v.accountId).startsWith('gitea:')) { await this.gitea.remove(String(v.accountId)); return this.catalog() }
        const account = this.store.getState().accounts.find(a => accountId(a) === v.accountId)
        if (account) await this.dispatcher.removeAccount(account)
        return this.catalog()
      }
      case 'openAccountAccessSettings': {
        const gitea = (await this.gitea.snapshot()).accounts.find(a => a.id === v.accountId)
        if (gitea) { await shell.openExternal(gitea.host + '/user/settings/applications'); return { opened: true } }
        const a = this.store.getState().accounts.find(a => accountId(a) === v.accountId)
        if (!a) throw new Error('此项为本地仓库分组。')
        await shell.openExternal(`${getHTMLURL(a.endpoint)}/settings/applications`)
        return { opened: true }
      }
      case 'accountRepositoryAccess': throw new Error("请通过账号的授权管理修改访问权限。")
      case 'setRepositoryAuthentication': throw new Error("此版本会自动选择仓库的现有凭据。")
      case 'updateAccount': throw new Error("请退出账号后重新登录。")
      case 'link': {
        const path = String(v.path || '')
        if (id) {
          const found = await discoverRepositories(path, [await this.remote(id)], typeof v.branch === 'string' ? v.branch : undefined)
          if (!found.size) throw new Error('所选文件夹及子文件夹中未找到此远端仓库的匹配工作目录，原关联未改变。')
          await this.addDiscoveredRepositories(found)
          return this.catalog()
        }
        const [repo] = await this.dispatcher.addRepositories([path])
        if (!repo) throw new Error("无法添加此目录。")
        await this.dispatcher.selectRepository(repo)
        await this.dispatcher.refreshRepository(repo)
        return this.catalog()
      }
      case 'unlink': {
        await this.catalog()
        const repo = typeof v.branch === 'string' ? this.local.get(id)?.find(r => this.branch(r) === v.branch) : await this.repository(id)
        if (!repo) throw new Error('该分支尚未关联本地目录。')
        await this.dispatcher.removeRepository(repo, false)
        return this.catalog()
      }
      case 'downloadBranch': {
        const r = await this.remote(id)
        const folder = String(v.folderName || '')
        if (!folder || Path.basename(folder) !== folder || folder === '.' || folder === '..') throw new Error('文件夹名称无效。')
        const parent = String(v.parentPath || '')
        if (!Path.isAbsolute(parent) || !(await fs.stat(parent)).isDirectory()) throw new Error('请选择有效的绝对目录。')
        const target = Path.join(parent, r.name, folder)
        const relative = Path.relative(Path.resolve(parent), target)
        if (!relative || relative === '..' || relative.startsWith('..' + Path.sep) || Path.isAbsolute(relative)) throw new Error('仓库名称会使下载位置离开所选目录，未开始下载。')
        try { await fs.lstat(target); throw new Error('下载目标已经存在。') } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e }
        const clone = await this.dispatcher.clone(await this.gitea.cloneURL(r), target, { branch: String(v.branch), defaultBranch: r.defaultBranch })
        if (!clone) throw new Error("未完成下载，未保存关联。")
        return this.catalog()
      }
      case 'matchAccountRepositories': {
        const before = await this.catalog()
        if (!before.accounts.some(account => account.id === v.accountId)) throw new Error('账号已不在当前目录中，请刷新后重试。')
        const targets = before.repositories.filter(repo => repo.accountId === v.accountId && repo.available)
        const found = targets.length ? await discoverRepositories(String(v.path || ''), targets) : new Map<string, string[]>()
        await this.addDiscoveredRepositories(found)
        const catalog = await this.catalog()
        const matched = new Set([...found.values()].flat())
        return { catalog, matchedRepositoryIds: catalog.links.filter(link => matched.has(link.repositoryId)).map(link => link.repositoryId) }
      }
      case 'snapshot': {
        const ws = await this.workspace(id); const task = ws.tasks[0]
        return { path: task.path, branch: task.branch, files: task.files, commits: ws.commits }
      }
      case 'localWorkspace': return this.workspace(id)
      case 'remoteWorkspace': return this.remoteWorkspace(id)
      case 'fetchRepository': {
        await this.catalog()
        const repos = this.local.get(id) || []
        const errors: string[] = []
        let retryAt = 0
        for (const repo of repos) {
          // GitHub retains its upstream scheduler. Gitea has no upstream
          // BackgroundFetcher; adapt the existing tiered freshness request.
          if (repo.gitHubRepository || this.actions.isApplying(repo.path)) continue
          try {
            await this.dispatcher.refreshRepository(repo)
            if (!this.cache.get(repo).remote) continue
            const common = await fs.realpath(Path.resolve(repo.path, (await git(['rev-parse', '--git-common-dir'], repo.path, 'getGitDirectory')).stdout.trim()))
            const outcome = await this.platformFetch.run(common, repo, {
              lastFetched: () => this.cache.get(repo).lastFetched?.valueOf() || 0,
              busy: () => this.repositories().some(other => {
                const directory = other.resolvedGitDir
                const shared = directory === common || directory.startsWith(common + Path.sep)
                const state = this.cache.get(other)
                return shared && (state.isPushPullFetchInProgress || state.isCommitting || this.actions.isApplying(other.path))
              }),
              fetch: async () => {
                await this.dispatcher.fetch(repo, FetchType.BackgroundTask)
                this.epoch++; this.workspaceCache.clear(); this.remoteCache.clear()
              },
            })
            if (outcome.error) errors.push(`${repo.path}：${outcome.error}`)
            retryAt = Math.max(retryAt, outcome.retryAt || 0)
          } catch (problem) { errors.push(`${repo.path}：${problem instanceof Error ? problem.message : '自动 Fetch 失败。'}`) }
        }
        return { branches: repos.reduce((sum, repo) => sum + this.cache.get(repo).branchesState.allBranches.length, 0), checkedAt: Math.min(...repos.map(repo => this.cache.get(repo).lastFetched?.valueOf() || 0), ...(repos.length ? [] : [0])), ...(errors.length ? { errors, retryAt } : {}) }
      }
      case 'localCommit':
      case 'remoteCommit': {
        const repo = await this.repository(id, tid)
        const c = await getCommit(repo, String(v.commitId))
        if (!c && method === 'remoteCommit') return this.providerCommitDetails(id, String(v.commitId))
        if (!c) throw new Error('提交不在已下载的历史中。')
        const changed = await getChangedFiles(repo, c.sha)
        const files = changed.files.map(fileStatus)
        if (method === 'localCommit') return { commit: { ...commitDTO(c), description: c.body }, files }
        const diffs = await Promise.all(changed.files.map(file => getCommitDiff(repo, file, c.sha)))
        const tree = await git(['ls-tree', '-r', '--name-only', '-z', c.sha], repo.path, 'getTree')
        return { commit: commitDTO(c), files: files.map(f => ({ ...f, patch: null })), diff: diffs.map(diffText).join('\n'), tree: tree.stdout.split('\0').filter(Boolean), treeComplete: true, warnings: [] }
      }
      case 'remoteHistory': {
        const page = Number(v.page)
        const result = await this.providerHistoryPage(id, String(v.head), page)
        return { head: String(v.head), page, commits: result.commits, hasMore: result.hasMore }
      }
      case 'remoteFile': {
        const repo = await this.repository(id)
        safePath(repo.path, String(v.path))
        const result = await getBlobContents(repo, String(v.commitId), String(v.path))
        return { text: result.includes(0) ? '' : result.toString('utf8'), binary: result.includes(0), size: result.length }
      }
      case 'diff': {
        const repo = await this.repository(id, tid)
        const path = String(v.path); safePath(repo.path, path)
        if (v.commitId) {
          const changes = await getChangedFiles(repo, String(v.commitId))
          const file = changes.files.find(f => f.path === path)
          if (!file) throw new Error('所选提交中没有此文件的更改。')
          return { text: diffText(await getCommitDiff(repo, file, String(v.commitId))) }
        }
        const status = await getStatus(repo)
        const file = status?.workingDirectory.files.find(f => f.path === path)
        if (!file) return { text: '' }
        return { text: diffText(await getWorkingDirectoryDiff(repo, file)) }
      }
      case 'submitCommit': return this.commit(input as ApiInputs['submitCommit'])
      case 'pushCommit': return this.push(input as ApiInputs['pushCommit'])
      case 'generateCommitMessage': return this.commitMessages.generate(input as ApiInputs['generateCommitMessage'])
      case 'cancelCommitGeneration': return this.commitMessages.cancel(input as ApiInputs['cancelCommitGeneration'])
      case 'graphSources': {
        const repo = await this.repository(id, tid)
        const branches = await getBranches(repo)
        return { sources: branches.map(b => ({ name: b.name, kind: b.type === BranchType.Remote ? 'remote' : 'local', taskId: b.name, head: b.tip.sha })), limited: false }
      }
      case 'graphPreview': {
        const repo = await this.checked(input as ApiInputs['graphPreview'])
        const sha = String(v.commitId)
        const changed = await getChangedFiles(repo, sha)
        const patch = await git(['diff', '--no-ext-diff', String(v.expectedHead), sha, '--'], repo.path, 'getCommitDiff')
        return { head: v.expectedHead, commitId: sha, files: changed.files.map(fileStatus), patch: patch.stdout, localChanges: this.cache.get(repo).changesState.workingDirectory.files.map(fileStatus) }
      }
      case 'executeGraph':
      case 'createGraphWorktree': return this.once(String(v.operationId), input, async () => {
        const value = input as ApiInputs['executeGraph']
        const repo = await this.checked(value)
        await this.dispatcher.selectRepository(repo)
        const commit = await getCommit(repo, value.commitId)
        if (!commit) throw new Error('所选提交不在本地历史中。')
        const state = this.cache.get(repo)
        const branch = state.branchesState.allBranches.find(b => b.tip.sha === commit.sha) || new Branch(commit.sha, null, { sha: commit.sha }, BranchType.Local, commit.sha)
        if (value.action === 'branch') await this.dispatcher.createBranch(repo, value.name || '', commit.sha)
        else if (value.action === 'tag') await this.dispatcher.createTag(repo, value.name || '', commit.sha)
        else if (value.action === 'revert') await this.dispatcher.revertCommit(repo, commit)
        else if (value.action === 'reset') await this.dispatcher.resetToCommit(repo, commit, true)
        else if (value.action === 'merge') await this.dispatcher.mergeBranch(repo, branch, null)
        else if (value.action === 'rebase') await this.dispatcher.showRebaseDialog(repo, branch)
        else if (value.action === 'cherry-pick') {
          const tip = state.branchesState.tip
          if (tip.kind !== TipState.Valid) throw new Error('当前分支不可执行 Cherry-pick。')
          await this.dispatcher.cherryPick(repo, tip.branch, [commit], null)
        } else if (value.action === 'abort') {
          const status = await getStatus(repo)
          if (status?.rebaseInternalState) await this.dispatcher.abortRebase(repo)
          else if (status?.mergeHeadFound) await this.dispatcher.abortMerge(repo)
          else throw new Error('没有可中止的 Merge 或 Rebase。')
        } else if (value.action === 'worktree') {
          const name = value.folderName || ''
          if (!name || Path.basename(name) !== name || name === '..') throw new Error('目录名称无效。')
          if (!value.parentPath || !Path.isAbsolute(value.parentPath) || !(await fs.stat(value.parentPath)).isDirectory()) throw new Error('请选择有效的绝对目录。')
          const path = Path.join(value.parentPath, name)
          await addWorktree(repo, path, { createBranch: value.name, commitish: commit.sha })
          await this.dispatcher.addRepositories([path])
          return { taskId: value.taskId, head: commit.sha, branch: value.name || '', unchanged: false, worktreePath: path, catalog: await this.catalog() }
        } else throw new Error("此操作不可用。")
        await this.waitForNativeOperation(repo)
        await this.dispatcher.refreshRepository(repo)
        const after = await getStatus(repo)
        if (after?.currentTip === value.expectedHead && value.commitId !== value.expectedHead && ['reset', 'revert', 'rebase', 'cherry-pick'].includes(value.action)) throw new Error("尚未改变此分支；操作可能已取消，请查看当前状态。")
        if (!after?.currentTip || after.doConflictedFilesExist) throw new Error("尚未完成此操作，请查看冲突处理或确认对话框。")
        return { taskId: value.taskId, head: after.currentTip, branch: after.currentBranch || 'Detached HEAD', unchanged: after.currentTip === value.expectedHead }
      })
      case 'prepareSync': return this.actions.prepare(input as ApiInputs['prepareSync'])
      case 'applySync': return this.actions.apply(input as ApiInputs['applySync'])
      case 'discardSync': return this.actions.discard(String(v.planId))
      case 'openRepository':
      case 'openCommit': {
        const r = await this.remote(id)
        if (new URL(r.url).protocol === 'file:') { shell.showFolderContents((await this.repository(id)).path); return { opened: true } }
        await shell.openExternal(method === 'openCommit' ? `${r.url}/commit/${String(v.commitId)}` : r.url)
        return { opened: true }
      }
      case 'openDirectory': { shell.showFolderContents((await this.repository(id, tid)).path); return { opened: true } }
      case 'openLocalDirectory': { const path = await fs.realpath(String(v.path)); if (!(await fs.stat(path)).isDirectory()) throw new Error('目录不可用。'); shell.showFolderContents(path); return { opened: true } }
      case 'openFile': {
        const repo = await this.repository(id, tid)
        const path = safePath(repo.path, String(v.path))
        if (v.source === 'remote') await shell.openExternal(`${(await this.remote(id)).url}/blob/${String(v.commitId)}/${String(v.path).split('/').map(encodeURIComponent).join('/')}`)
        else { await checkedParents(repo.path, path); const error = await shell.openPath(path); if (error) throw new Error(error) }
        return { opened: true }
      }
      case 'localDirectory': {
        const repo = await this.repository(id, tid); const path = safePath(repo.path, String(v.path || ''), true)
        await checkedParents(repo.path, path)
        const entries = await fs.readdir(path, { withFileTypes: true })
        return { path: String(v.path || ''), entries: await Promise.all(entries.filter(e => e.name !== '.git').map(async e => { const full = Path.join(path, e.name); const s = await fs.lstat(full); return { name: e.name, path: Path.relative(repo.path, full).split(Path.sep).join('/'), directory: s.isDirectory(), link: s.isSymbolicLink(), ignored: false, hidden: e.name.startsWith('.'), size: s.size, modified: s.mtimeMs } })) }
      }
      default: throw new Error(`GitHub Desktop 原版未提供此操作：${method}。`)
    }
  }
}
export function safePath(root: string, path: string, allowEmpty = false): string {
  if ((!path && !allowEmpty) || Path.isAbsolute(path) || path.includes('\0') || path.split(/[\\/]/).some(p => p === '..' || p.toLowerCase() === '.git')) throw new Error('仓库文件路径无效。')
  const result = Path.resolve(root, path)
  if (result !== root && !result.startsWith(root + Path.sep)) throw new Error('文件超出仓库范围。')
  return result
}
export async function checkedParents(root: string, target: string) {
  const realRoot = await fs.realpath(root)
  const realTarget = await fs.realpath(target)
  if (realTarget !== realRoot && !realTarget.startsWith(realRoot + Path.sep)) throw new Error('文件链接指向仓库外部。')
}
function diffText(diff: IDiff): string {
  if (diff.kind === DiffType.Text) return diff.text
  if (diff.kind === DiffType.Binary || diff.kind === DiffType.Image) return 'Binary files differ\n'
  return "无法显示此差异，请使用查看。\n"
}
