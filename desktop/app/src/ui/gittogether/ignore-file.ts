import { lstat } from 'fs/promises'
import { join } from 'path'
import { Repository } from '../../models/repository'
import { AppFileStatusKind } from '../../models/status'
import { git } from '../../lib/git/core'
import { getStatus } from '../../lib/git/status'
import { appendIgnoreFile } from '../../lib/git/gitignore'

/** Ignore a reviewed change without removing its working copy or forcing away staged content. */
export async function ignoreChangedFile(
  repository: Repository,
  path: string
): Promise<boolean> {
  if (
    typeof path !== 'string' ||
    !path ||
    /[\r\n\0]/.test(path) ||
    path === '.gitignore'
  ) {
    throw new Error('此文件不能从提交清单中忽略。')
  }
  const status = await getStatus(repository)
  const file = status?.workingDirectory.files.find(file => file.path === path)
  if (
    !file ||
    file.status.kind === AppFileStatusKind.Deleted ||
    file.status.kind === AppFileStatusKind.Conflicted
  ) {
    throw new Error('文件状态已变化或存在冲突，请重新读取提交清单。')
  }
  const stat = await lstat(join(repository.path, path))
  if (!stat.isFile() && !stat.isSymbolicLink())
    throw new Error('只能忽略文件，不能忽略子模块或目录。')

  const indexed =
    (
      await git(
        ['--literal-pathspecs', 'ls-files', '-z', '--', path],
        repository.path,
        'ignoreFileStatus'
      )
    ).stdout.length > 0
  const remove = ['--literal-pathspecs', 'rm', '--cached', '--', path]
  if (indexed) {
    // The dry run rejects unique staged content before changing .gitignore.
    await git(
      ['--literal-pathspecs', 'rm', '--cached', '--dry-run', '--', path],
      repository.path,
      'checkIgnoreFile'
    )
  }
  // Root-anchoring keeps a single-file action from ignoring names in other directories.
  await appendIgnoreFile(
    repository,
    '/' +
      path
        .replace(/\\/g, '\\\\')
        .replace(/ +$/, spaces => spaces.replace(/ /g, '\\ '))
  )
  if (indexed) {
    try {
      await git(remove, repository.path, 'stopTrackingIgnoredFile')
    } catch (error) {
      throw new Error(
        `忽略规则已写入，但停止跟踪未完成；本地文件已保留。${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  }
  return indexed
}
