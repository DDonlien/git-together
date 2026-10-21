import * as fs from 'fs/promises'
import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { createInterface } from 'readline'
import { randomUUID } from 'crypto'
import * as Path from 'path'
import { DesktopAdapter, fileStatus, safePath, checkedParents } from './adapter'
import { getPath } from '../main-process-proxy'
import { getStatus, git } from '../../lib/git'
import { shell } from '../../lib/app-shell'
import type { ApiInputs } from '../../../../../macos/src/import-model'
import { PresenceStorage } from './presence-storage'

type Input = Record<string, unknown>
type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void }
export class PresenceHost {
  private child: ChildProcessWithoutNullStreams | undefined
  private starting: Promise<void> | undefined
  private storage: PresenceStorage | undefined
  private readonly pending = new Map<string, Pending>()
  private readonly previews = new Map<string, { input: ApiInputs['submitCommit']; expires: number; action: string; scope: string }>()
  private readonly committed = new Map<string, { input: ApiInputs['submitCommit']; commitId: string }>()
  public constructor(private readonly desktop: DesktopAdapter) {}
  private async dataRoot() {
    const root = await getPath('userData')
    return __RELEASE_CHANNEL__ === 'development' ? Path.join(root, 'presence') : root
  }
  private async start() {
    if (this.child) return
    if (this.starting) return this.starting
    this.starting = (async () => {
      const root = await this.dataRoot()
      this.storage = new PresenceStorage(root)
      const executable = Path.join(__dirname, process.platform === 'win32' ? 'gittogether-presence.exe' : 'gittogether-presence')
      const child = spawn(executable, [root, await getPath('userData')], { stdio: 'pipe', windowsHide: true, env: { ...process.env, ...(process.env.GITTOGETHER_SMOKE === '1' ? { GITTOGETHER_PRESENCE_CONFIG_DIR: Path.join(root, 'isolated-editor-config') } : {}) } })
      this.child = child
      child.once('error', e => this.fail(e))
      child.once('exit', () => this.fail(new Error('Presence 连接已结束；请重新连接。')))
      child.stderr.on('data', bytes => log.error(`Presence: ${String(bytes).slice(0, 2000)}`))
      const lines = createInterface({ input: child.stdout })
      lines.on('line', line => {
        try {
          const message = JSON.parse(line)
          if (message.callbackId) { void this.callback(message); return }
          const pending = this.pending.get(message.id)
          if (!pending) return
          this.pending.delete(message.id)
          pending.resolve(message)
        } catch (e) { this.fail(new Error(`Presence 响应无效：${e instanceof Error ? e.message : String(e)}`)) }
      })
      window.addEventListener('beforeunload', () => child.kill(), { once: true })
    })()
    try { await this.starting } finally { this.starting = undefined }
  }
  private fail(error: Error) {
    const child = this.child; this.child = undefined
    child?.kill()
    for (const p of this.pending.values()) p.reject(error)
    this.pending.clear()
  }
  public async command(group: string, method: string, input: unknown) {
    await this.start()
    return new Promise((resolve, reject) => {
      const id = randomUUID()
      this.pending.set(id, { resolve, reject })
      this.child!.stdin.write(JSON.stringify({ id, group, method, input }) + '\n', e => { if (e) { this.pending.delete(id); reject(e) } })
    })
  }
  private async callback(message: { callbackId: string; method: string; input: Input }) {
    try {
      const input = message.input
      let value: unknown
      if (message.method === 'catalog') {
        const catalog = await this.desktop.catalog()
        value = { ...catalog, repositories: catalog.repositories.filter(r => ['http:', 'https:'].includes(new URL(r.url).protocol)) }
      }
      else if (message.method === 'tasks') {
        const workspace = await this.desktop.workspace(String(input.repositoryId))
        value = workspace.tasks
      } else if (message.method === 'unpublished') {
        const repo = this.desktop.repositories().find(r => r.path === input.path)
        if (!repo) throw new Error("尚未登记此工作目录。")
        const status = await getStatus(repo)
        if (!status?.branchAheadBehind) throw new Error("尚未确认未推送提交数量。")
        value = status.branchAheadBehind.ahead
      } else if (message.method === 'open') {
        const url = new URL(String(input.url))
        if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Presence 网页地址无效。')
        value = await shell.openExternal(url.toString())
      } else if (message.method === 'storageKey') {
        if (typeof input.legacy !== 'boolean' || typeof input.create !== 'boolean') throw new Error('Presence 安全存储请求无效。')
        value = await this.storage!.key(input.legacy, input.create)
      } else if (message.method === 'execute') value = await this.execute(input)
      else throw new Error("Presence 请求的操作不可用。")
      this.child?.stdin.write(JSON.stringify({ callbackId: message.callbackId, ok: true, value }) + '\n')
    } catch (e) { this.child?.stdin.write(JSON.stringify({ callbackId: message.callbackId, ok: false, error: e instanceof Error ? e.message : String(e) }) + '\n') }
  }
  private async execute(input: Input) {
    const job = input.job as Input
    const repositoryId = String(input.repositoryId), taskId = String(input.taskId)
    const repo = await this.desktop.repository(repositoryId, taskId)
    const status = await getStatus(repo)
    if (!status) throw new Error("无法读取此工作目录。")
    const scope = JSON.stringify([job.deviceId, job.workspaceId, job.organizationId, job.scopeVersion])
    if (job.kind === 'preview' || job.kind === 'generate') {
      const files = status.workingDirectory.files.map(fileStatus)
      const plan: ApiInputs['submitCommit'] = { repositoryId, taskId, expectedHead: status.currentTip || '', changeKey: await this.desktop.changeKey(repo, status.workingDirectory.files), operationId: String(job.id), summary: '', description: '' }
      const previewId = String(job.id), expires = Date.now() + 15 * 60_000
      this.previews.set(previewId, { input: plan, expires, action: String(job.action), scope })
      let summary = '', description = '', aiError = ''
      if (job.kind === 'generate') {
        try {
          const draft = await this.desktop.handle('generateCommitMessage', { ...plan, generationId: randomUUID() }) as { summary: string; description: string }
          summary = draft.summary; description = draft.description
        } catch (e) { aiError = e instanceof Error ? e.message : String(e) }
      }
      return { phase: 'prepared', previewId, expiresAt: expires, files, summary, description, aiError, head: plan.expectedHead, changeKey: plan.changeKey, operation: status.mergeHeadFound ? 'merge' : status.rebaseInternalState ? 'rebase' : 'none', running: false }
    }
    if (job.kind === 'retryPush') {
      const persisted = input.previousResult as { commitId?: string; pushed?: boolean } | undefined
      const previous = this.committed.get(String(job.previousId)) || (persisted?.commitId && !persisted.pushed ? { input: { repositoryId, taskId }, commitId: persisted.commitId } : undefined)
      if (job.action !== 'submit' || !previous || previous.input.repositoryId !== repositoryId || previous.input.taskId !== taskId) throw new Error('无法恢复此推送记录，请在目标设备查看本地提交后推送。')
      const result = await this.desktop.push({ repositoryId, taskId, expectedHead: previous.commitId, commitId: previous.commitId, operationId: String(job.id) })
      return { ...(result as object), phase: 'pushed' }
    }
    if (job.kind === 'restore') {
      const previous = input.previousResult as { backupId?: string } | undefined
      if (job.action !== 'discard' || !previous?.backupId) throw new Error('没有可恢复的丢弃备份。')
      return this.restore(previous.backupId, repositoryId, taskId)
    }
    const preview = this.previews.get(String(job.previewId))
    if (!preview || preview.expires < Date.now() || preview.input.repositoryId !== repositoryId || preview.input.taskId !== taskId || preview.action !== job.action || preview.scope !== scope) throw new Error('远端预览已过期，请重新准备。')
    await this.desktop.checked(preview.input)
    await this.ensureSaved(repo.path, status.workingDirectory.files.map(f => f.path))
    if (job.action === 'abort') {
      if (status.rebaseInternalState) await this.desktop.dispatcher.abortRebase(repo)
      else if (status.mergeHeadFound) await this.desktop.dispatcher.abortMerge(repo)
      else throw new Error("此目录没有可以由中止的 Merge 或 Rebase。")
      return { phase: 'aborted' }
    }
    if (job.action === 'discard') {
      const selected = status.workingDirectory.files.filter(f => !Array.isArray(job.paths) || job.paths.includes(f.path))
      if (!selected.length || Array.isArray(job.paths) && job.paths.some(p => !selected.some(f => f.path === p))) throw new Error('丢弃范围已变化。')
      const backupId = String(job.id)
      await this.backup(backupId, repositoryId, taskId, selected.map(f => f.path))
      await this.desktop.dispatcher.discardChanges(repo, selected, true)
      const after = await getStatus(repo)
      if (after?.workingDirectory.files.some(f => selected.some(s => s.path === f.path))) throw new Error("尚未完成丢弃，请查看目标端提示。")
            await this.finishBackup(backupId, repositoryId, taskId)
      return { phase: 'discarded', backupId, warning: "可回收文件已移入系统回收站，目标设备也保留了恢复备份。" }
    }
    if (job.action !== 'commit' && job.action !== 'submit') throw new Error('远端动作不在允许范围内。')
    const plan = { ...preview.input, summary: String(job.summary || ''), description: String(job.description || ''), operationId: String(job.id), ...(Array.isArray(job.paths) ? { paths: job.paths.map(String) } : {}) }
    if (!plan.summary.trim()) throw new Error('提交说明不能为空。')
    const result = await this.desktop.commit(plan) as { commitId: string; branch: string; taskId: string }
    this.committed.set(String(job.id), { input: plan, commitId: result.commitId })
    this.previews.delete(String(job.previewId))
    if (job.action === 'submit') {
      try { await this.desktop.push({ repositoryId, taskId, expectedHead: result.commitId, commitId: result.commitId, operationId: randomUUID() }); return { ...result, phase: 'pushed', pushed: true } }
      catch (e) { return { ...result, phase: 'committed', warning: e instanceof Error ? e.message : String(e) } }
    }
    return { ...result, phase: 'committed' }
  }
  private async ensureSaved(path: string, paths: string[]) {
    const result = await this.command('internal', 'ensureSaved', { path, paths }) as { ok: boolean; error?: string }
    if (!result.ok) throw new Error(result.error || '编辑器文件未保存。')
  }
  private async backupPath(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('备份标识无效。')
    return Path.join(await this.dataRoot(), 'remote-backups', id)
  }
  private async backup(id: string, repositoryId: string, taskId: string, paths: string[]) {
    const repo = await this.desktop.repository(repositoryId, taskId)
    const folder = await this.backupPath(id)
    await fs.mkdir(folder, { recursive: true, mode: 0o700 })
    const files = []
    for (const [i, path] of paths.entries()) {
      const target = safePath(repo.path, path)
      try {
        const stat = await fs.lstat(target)
        await checkedParents(repo.path, Path.dirname(target))
        if (stat.isSymbolicLink()) files.push({ path, link: await fs.readlink(target), mode: stat.mode })
        else if (stat.isFile()) { await fs.copyFile(target, Path.join(folder, String(i))); await fs.chmod(Path.join(folder, String(i)), 0o600); files.push({ path, file: String(i), mode: stat.mode }) }
        else throw new Error('远端丢弃不支持目录或子模块。')
      } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; files.push({ path, absent: true }) }
    }
    const index = (await git(['rev-parse', '--path-format=absolute', '--git-path', 'index'], repo.path, 'getIndexPath')).stdout.trim()
    await fs.copyFile(index, Path.join(folder, 'index')); await fs.chmod(Path.join(folder, 'index'), 0o600)
    const status = await getStatus(repo)
    await fs.writeFile(Path.join(folder, 'manifest.json'), JSON.stringify({ repositoryId, taskId, head: status?.currentTip, files }), { mode: 0o600 })
  }
  private async finishBackup(id: string, repositoryId: string, taskId: string) {
    const folder = await this.backupPath(id)
    const manifest = JSON.parse(await fs.readFile(Path.join(folder, 'manifest.json'), 'utf8'))
    const repo = await this.desktop.repository(repositoryId, taskId), status = await getStatus(repo)
    if (!status) throw new Error('无法确认丢弃后的工作目录。')
    manifest.afterKey = await this.desktop.changeKey(repo, status.workingDirectory.files)
    await fs.writeFile(Path.join(folder, 'manifest.json'), JSON.stringify(manifest), { mode: 0o600 })
  }
  private async restore(id: string, repositoryId: string, taskId: string) {
    const folder = await this.backupPath(id)
    const manifest = JSON.parse(await fs.readFile(Path.join(folder, 'manifest.json'), 'utf8')) as { repositoryId: string; taskId: string; head: string; afterKey: string; files: { path: string; link?: string; file?: string; mode?: number; absent?: boolean }[] }
    if (manifest.repositoryId !== repositoryId || manifest.taskId !== taskId || !manifest.afterKey) throw new Error('恢复备份不属于当前目标。')
    const repo = await this.desktop.checked({ repositoryId, taskId, expectedHead: manifest.head, changeKey: manifest.afterKey })
    await this.ensureSaved(repo.path, manifest.files.map(f => f.path))
    for (const file of manifest.files) {
      const target = safePath(repo.path, file.path)
      await fs.mkdir(Path.dirname(target), { recursive: true })
      await checkedParents(repo.path, Path.dirname(target))
      try { const stat = await fs.lstat(target); if (stat.isDirectory()) throw new Error('恢复目标是目录。'); await fs.unlink(target) } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e }
      if (file.absent) continue
      if (file.link !== undefined) await fs.symlink(file.link, target)
      else if (file.file !== undefined && /^[0-9]+$/.test(file.file)) { await fs.copyFile(Path.join(folder, file.file), target); await fs.chmod(target, file.mode || 0o600) }
      else throw new Error('恢复文件记录无效。')
    }
    const index = (await git(['rev-parse', '--path-format=absolute', '--git-path', 'index'], repo.path, 'getIndexPath')).stdout.trim()
    const lock = await fs.open(index + '.lock', 'wx', 0o600)
    try { await lock.writeFile(await fs.readFile(Path.join(folder, 'index'))); await lock.close(); await fs.rename(index + '.lock', index) }
    catch (e) { await lock.close(); await fs.unlink(index + '.lock'); throw e }
    await this.desktop.dispatcher.refreshRepository(repo)
    return { phase: 'restored', backupId: id }
  }

}
