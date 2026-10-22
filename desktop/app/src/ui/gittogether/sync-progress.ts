import type { Progress } from '../../models/progress'
import type { RepositorySyncProgress } from '../../../../../macos/src/repository-sync-model'

/** Native overall fractions contain estimated phase weights. Only expose an
 * actual Git percentage from its description, with that phase's own title.
 */
export function nativeSyncProgress(progress: Progress | null): { title: string; description: string; value: number | null } {
  if (!progress) return { title: '等待 Git 响应', description: '正在连接远端或等待 Git 返回执行进度。', value: null }
  const description = progress.description || ''
  const source = `${progress.title || ''} ${description}`
  const title = /refresh/i.test(source) ? '刷新仓库状态'
    : /filtering content|\blfs\b/i.test(source) ? '下载大文件'
    : /updating files|checking out/i.test(source) ? '更新工作目录文件'
    : /resolving deltas/i.test(source) ? '整理提交对象'
    : /receiving objects/i.test(source) ? '接收提交对象'
    : /counting objects|enumerating objects/i.test(source) ? '读取远端对象'
    : /compressing objects/i.test(source) ? '准备传输对象'
    : progress.kind === 'fetch' ? '获取远端更新' : '拉取并整合更新'
  const percent = /(?:^|\s)(\d{1,3})%/.exec(description)
  return { title, description, value: percent && Number(percent[1]) <= 100 ? Number(percent[1]) / 100 : null }
}

export class SyncProgressReporter {
  private progress: RepositorySyncProgress
  public constructor(input: Pick<RepositorySyncProgress, 'repositoryId' | 'taskId' | 'operationId'>, private readonly emit: (progress: RepositorySyncProgress) => void, private readonly now = Date.now) {
    this.progress = { ...input, state: 'running', title: '核验操作预览', description: '正在检查工作目录及跟踪分支是否与预览一致。', value: null, startedAt: now(), updatedAt: now() }
    this.emit(this.progress)
  }
  public update(title: string, description = '', value: number | null = null) {
    if (this.progress.title === title && this.progress.description === description && this.progress.value === value) return
    this.progress = { ...this.progress, title, description, value, updatedAt: this.now() }
    this.emit(this.progress)
  }
  public native(progress: Progress | null) { const next = nativeSyncProgress(progress); this.update(next.title, next.description, next.value) }
  public finish(state: 'completed' | 'failed', description = '') {
    this.progress = { ...this.progress, state, title: state === 'completed' ? '操作已完成' : '操作未完成', description, value: state === 'completed' ? 1 : null, updatedAt: this.now() }
    this.emit(this.progress)
  }
}
