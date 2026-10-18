import { randomUUID, createHash } from 'crypto'
import * as fs from 'fs/promises'
import * as Path from 'path'
import { Repository } from '../../models/repository'
import { FetchType } from '../../models/fetch'
import { git, getStatus, listWorktrees, getBranches, renameBranch } from '../../lib/git'
import { envForRemoteOperation } from '../../lib/git/environment'
import { shell } from '../../lib/app-shell'
import type { ApiInputs } from '../../../../../macos/src/import-model'
import type { RepositorySyncPlan, RepositorySyncResult } from '../../../../../macos/src/repository-sync-model'
import { DesktopAdapter, safePath } from './adapter'

type Plan = { public: RepositorySyncPlan; key: string; upstream: string; remoteURL: string; remoteName: string; remoteBranch: string; diskKey: string; expires: number }
/** The only Git semantics added by GitTogether. Uses Desktop's Git/trampoline. */
export class CustomActions {
  private readonly plans = new Map<string, Plan>()
  public constructor(private readonly desktop: DesktopAdapter) {}
  public discard(id: string) { return { discarded: this.plans.delete(id) } }
  public async prepare(input: ApiInputs['prepareSync']): Promise<RepositorySyncPlan> {
    const repo = await this.desktop.repository(input.repositoryId, input.taskId)
    await this.desktop.dispatcher.selectRepository(repo)
    if (input.mode !== 'pull') await this.desktop.dispatcher.fetch(repo, FetchType.UserInitiatedTask)
    const status = await getStatus(repo)
    if (!status?.currentTip || !status.currentBranch || !status.currentUpstreamBranch) throw new Error('需要已检出并跟踪远端的分支。')
    const remote = this.desktop.cache.get(repo).remote
    if (!remote) throw new Error("尚未解析此分支的远端。")
    if (!status.currentUpstreamBranch.startsWith(remote.name + '/')) throw new Error("当前远端与分支跟踪配置不一致，请先在确认连接。")
    const remoteBranch = status.currentUpstreamBranch.slice(remote.name.length + 1)
    const remoteHead = (await git(['rev-parse', '--verify', status.currentUpstreamBranch], repo.path, 'resolveRef')).stdout.trim()
    const tree = (await git(['ls-tree', '-r', '--name-only', '-z', remoteHead], repo.path, 'getTree')).stdout.split('\0').filter(Boolean)
    const local = await diskFiles(repo.path)
    const remotePaths = new Set(tree)
    const localPaths = new Set(local)
    const changed = (await git(['diff', '--no-ext-diff', '--name-only', '-z', remoteHead, '--'], repo.path, 'getDiff')).stdout.split('\0').filter(Boolean)
    const files: RepositorySyncPlan['files'] = [...new Set([...changed, ...status.workingDirectory.files.map(f => f.path), ...local.filter(p => !remotePaths.has(p)), ...tree.filter(p => !localPaths.has(p))])].map(path => ({ path, action: !remotePaths.has(path) ? 'delete' : !localPaths.has(path) ? 'add' : 'restore' }))
    const unpublished = await git(['rev-list', '--count', `${status.currentUpstreamBranch}..HEAD`], repo.path, 'getAheadBehind')
    const refs = (await git(['for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/tags'], repo.path, 'getBranches')).stdout.trim().split('\n').filter(Boolean)
    const protectedHistory = Number(unpublished.stdout.trim()) > 0 || (await listWorktrees(repo)).length > 1 || refs.some(r => r !== `refs/heads/${status.currentBranch}`)
    if (input.mode === 'latest' && protectedHistory) throw new Error('Get Latest 不能回收此目录：存在未推送提交、其他本地分支/标签或共享 worktree。请先处理这些需要保留的历史。')
    const historyCommits = Number((await git(['rev-list', '--count', 'HEAD'], repo.path, 'getCommits')).stdout.trim())
    const plan: RepositorySyncPlan = { id: randomUUID(), ...input, path: repo.path, branch: status.currentBranch, head: status.currentTip, remoteHead, files, historyCommits: Math.max(0, historyCommits - 1), protectedHistory, note: input.mode === 'latest' ? '下载深度为 1 的当前远端分支，验证完成后替换此目录并实际回收旧历史；覆盖清单中的本地内容。' : input.mode === 'clean' ? '以远端快照恢复工作目录；本地多余文件移入系统回收站，保留 HEAD 和暂存区。' : "通过  Pull 更新此分支。" }
    this.plans.set(plan.id, { public: plan, key: await this.desktop.changeKey(repo, status.workingDirectory.files), upstream: status.currentUpstreamBranch, remoteURL: remote.url, remoteName: remote.name, remoteBranch, diskKey: await diskKey(repo.path), expires: Date.now() + 15 * 60_000 })
    return plan
  }
  public async apply(input: ApiInputs['applySync']): Promise<RepositorySyncResult> {
    return this.desktop.once(input.operationId, input, async () => {
      const saved = this.plans.get(input.planId)
      if (!saved || saved.expires < Date.now() || saved.public.repositoryId !== input.repositoryId || saved.public.taskId !== input.taskId) throw new Error('预览已过期，请重新打开操作。')
      const plan = saved.public
      const repo = await this.desktop.checked({ ...input, expectedHead: plan.head, changeKey: saved.key })
      if ((await git(['rev-parse', '--verify', saved.upstream], repo.path, 'resolveRef')).stdout.trim() !== plan.remoteHead || this.desktop.cache.get(repo).remote?.url !== saved.remoteURL) throw new Error('远端目标已变化，请重新预览。')
      if (await diskKey(repo.path) !== saved.diskKey) throw new Error('预览后本地文件已经变化，请重新预览。')
      if (this.desktop.cache.get(repo).isPushPullFetchInProgress || this.desktop.cache.get(repo).isCommitting) throw new Error("正在执行其他操作，请等待完成。")
      const env = await envForRemoteOperation(saved.remoteURL)
      let reclaimedBytes = 0
      if (plan.mode === 'pull') {
        await this.desktop.dispatcher.selectRepository(repo)
        await this.desktop.dispatcher.pull(repo)
        const after = await getStatus(repo)
        if (!after?.currentTip || (after.branchAheadBehind?.behind ?? 1) > 0) throw new Error("未确认 Pull 完成；请查看冲突或错误提示。")
      } else if (plan.mode === 'clean') {
        const stage = await fs.mkdtemp(Path.join(Path.dirname(repo.path), '.gittogether-clear-'))
        try {
          const index = Path.join(stage, 'index')
          const tree = Path.join(stage, 'tree'); await fs.mkdir(tree)
          await git(['read-tree', plan.remoteHead], repo.path, 'readTree', { env: { ...env, GIT_INDEX_FILE: index } })
          await git(['--work-tree', tree, 'checkout-index', '--all', '--force'], repo.path, 'checkoutIndex', { env: { ...env, GIT_INDEX_FILE: index } })
          await this.desktop.checked({ ...input, expectedHead: plan.head, changeKey: saved.key })
          // Validate every ancestor before copying. A working-tree symlink must
          // never redirect a checkout into another repository or user directory.
          for (const file of plan.files) await noLinkedParents(repo.path, file.path)
          for (const file of plan.files.filter(f => f.action === 'delete')) {
            const path = safePath(repo.path, file.path)
            try { await fs.lstat(path); await shell.moveItemToTrash(path) } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e }
          }
          for (const file of plan.files.filter(f => f.action !== 'delete')) {
            const from = safePath(tree, file.path); const to = safePath(repo.path, file.path)
            await fs.mkdir(Path.dirname(to), { recursive: true })
            const s = await fs.lstat(from)
            try { const old = await fs.lstat(to); if (old.isDirectory()) throw new Error(`目标是目录，无法恢复 ${file.path}。`); await fs.unlink(to) } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e }
            if (s.isSymbolicLink()) await fs.symlink(await fs.readlink(from), to)
            else { await fs.copyFile(from, to); await fs.chmod(to, s.mode) }
          }
        } finally { await fs.rm(stage, { recursive: true, force: true }) }
      } else {
        const stage = await fs.mkdtemp(Path.join(Path.dirname(repo.path), '.gittogether-latest-'))
        const clone = Path.join(stage, 'snapshot')
        const original = Path.join(stage, 'original')
        let installed = false
        try {
          await git(['clone', '--depth=1', '--single-branch', '--no-tags', '--origin', saved.remoteName, '--branch', saved.remoteBranch, '--', saved.remoteURL, clone], Path.dirname(repo.path), 'clone', { env })
          const replacement = new Repository(clone, repo.id, repo.gitHubRepository, false)
          if (saved.remoteBranch !== plan.branch) await renameBranch(replacement, (await getBranches(replacement, 'refs/heads'))[0], plan.branch)
          await git(['lfs', 'pull'], clone, 'hydrateLFS', { env })
          const after = await getStatus(replacement)
          if (after?.currentTip !== plan.remoteHead || after.currentBranch !== plan.branch || after.workingDirectory.files.length || (await git(['rev-parse', '--is-shallow-repository'], clone, 'isShallow')).stdout.trim() !== 'true' || Number((await git(['rev-list', '--count', 'HEAD'], clone, 'getCommits')).stdout.trim()) !== 1) throw new Error('下载快照与预览不一致；原目录已保留。')
          await git(['fsck', '--no-reflogs'], clone, 'checkRepository')
          await this.desktop.checked({ ...input, expectedHead: plan.head, changeKey: saved.key })
          if (await diskKey(repo.path) !== saved.diskKey) throw new Error('下载期间本地文件已经变化；原目录已保留。')
          const bytesBefore = await directoryBytes(Path.join(repo.path, '.git'))
          // Only independent repositories reach this branch. Retain repository
          // settings while replacing the object database with the verified clone.
          await fs.copyFile(Path.join(repo.path, '.git', 'config'), Path.join(clone, '.git', 'config'))
          for (const relative of ['hooks', 'info/exclude', 'info/attributes']) {
            const source = Path.join(repo.path, '.git', relative)
            try { await fs.lstat(source); await fs.cp(source, Path.join(clone, '.git', relative), { recursive: true }) } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e }
          }
          await fs.rename(repo.path, original)
          try { await fs.rename(clone, repo.path) } catch (e) { await fs.rename(original, repo.path); throw e }
          installed = true
          const verified = await getStatus(repo)
          if (verified?.currentTip !== plan.remoteHead) {
            await fs.rename(repo.path, clone); await fs.rename(original, repo.path); installed = false
            throw new Error('替换校验失败，已恢复原目录。')
          }
          const bytesAfter = await directoryBytes(Path.join(repo.path, '.git'))
          await fs.rm(original, { recursive: true })
          reclaimedBytes = Math.max(0, bytesBefore - bytesAfter)
        } finally {
          // A failed removal keeps the original available at the staging path.
          const originalPresent = await fs.lstat(original).then(() => true, e => { if (e.code !== 'ENOENT') throw e; return false })
          if (!originalPresent) await fs.rm(stage, { recursive: true, force: true })
          else if (!installed) throw new Error(`原始目录保留在 ${original}，请检查后恢复。`)
        }
      }
      this.plans.delete(plan.id)
      await this.desktop.dispatcher.refreshRepository(repo)
      const final = await getStatus(repo)
      return { taskId: input.taskId, mode: plan.mode, head: final?.currentTip || plan.head, files: plan.files.length, reclaimedBytes, protectedHistory: plan.protectedHistory }
    }) as Promise<RepositorySyncResult>
  }
}
async function diskFiles(root: string, path = ''): Promise<string[]> {
  const entries = await fs.readdir(Path.join(root, path), { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    if (entry.name.toLowerCase() === '.git') continue
    const relative = path ? `${path}/${entry.name}` : entry.name
    if (entry.isDirectory() && !entry.isSymbolicLink()) files.push(...await diskFiles(root, relative))
    else files.push(relative)
  }
  return files
}
async function noLinkedParents(root: string, path: string) {
  let parent = root
  for (const part of path.split('/').slice(0, -1)) {
    parent = Path.join(parent, part)
    try { const s = await fs.lstat(parent); if (s.isSymbolicLink() || !s.isDirectory()) throw new Error('文件父路径是链接或非目录，请先处理后重试。') } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e }
  }
}
async function directoryBytes(path: string): Promise<number> {
  const s = await fs.lstat(path)
  if (!s.isDirectory() || s.isSymbolicLink()) return s.blocks * 512
  const sizes = await Promise.all((await fs.readdir(path)).map(name => directoryBytes(Path.join(path, name))))
  return s.blocks * 512 + sizes.reduce((a, b) => a + b, 0)
}

async function diskKey(root: string): Promise<string> {
  const hash = createHash('sha256')
  for (const path of (await diskFiles(root)).sort()) {
    const file = Path.join(root, path), s = await fs.lstat(file)
    hash.update(JSON.stringify([path, s.size, s.mtimeMs, s.ctimeMs, s.mode, s.ino]))
    if (s.isSymbolicLink()) hash.update(await fs.readlink(file))
  }
  return hash.digest('hex')
}
