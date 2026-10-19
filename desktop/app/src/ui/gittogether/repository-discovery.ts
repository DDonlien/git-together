import * as fs from 'fs/promises'
import * as Path from 'path'
import { pathToFileURL } from 'url'
import { Repository } from '../../models/repository'
import { getRemotes, getRepositoryType, listWorktrees } from '../../lib/git'
import type { RemoteRepository } from '../../../../../macos/src/import-model'

/** Transport ports and credentials do not identify a repository in the UI. */
export function repositoryIdentity(remote: string): string | null {
  const url = repositoryURL(remote)
  if (!url) return null
  const parsed = new URL(url)
  if (parsed.protocol === 'file:') return url
  let path: string
  try { path = decodeURIComponent(parsed.pathname) }
  catch (error) { if (error instanceof URIError) return null; throw error }
  return `${parsed.hostname}/${path.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '')}`.toLowerCase()
}

/** A display URL only; Git always keeps the actual remote and its credentials. */
export function repositoryURL(remote: string): string | null {
  if (Path.isAbsolute(remote)) return pathToFileURL(remote).href
  const scp = !remote.includes('://') && remote.match(/^(?:[^@]+@)?([^:/]+):(.+)$/)
  let url: URL
  try { url = new URL(scp ? `ssh://${scp[1]}/${scp[2]}` : remote) }
  catch { return null }
  if (url.protocol === 'file:') return url.href
  if (!['http:', 'https:', 'ssh:', 'git:'].includes(url.protocol)) return null
  // URL.protocol cannot switch between non-special SSH and special HTTPS URLs.
  if (url.protocol === 'ssh:' || url.protocol === 'git:') url = new URL(`https://${url.hostname}${url.pathname}`)
  url.username = ''; url.password = ''; url.search = ''; url.hash = ''
  url.pathname = url.pathname.replace(/\/+$/, '').replace(/\.git$/i, '')
  return url.href.replace(/\/$/, '')
}

/** Discover first, then let Desktop register the completed set of matches. */
export async function discoverRepositories(rootPath: string, targets: ReadonlyArray<RemoteRepository>, branch?: string): Promise<Map<string, string[]>> {
  if (!Path.isAbsolute(rootPath) || !(await fs.lstat(rootPath)).isDirectory()) throw new Error('请选择可读取的本地父文件夹。')
  const root = await fs.realpath(rootPath)
  const targetIdentities = targets.map(repo => ({ id: repo.id, identity: repositoryIdentity(repo.url) }))
  const found = new Map<string, string[]>()
  const counts = new Map<string, number>()
  const inspected = new Set<string>()
  const pending = [{ path: root, depth: 0 }]
  let expanded = 0

  const inspect = async (path: string): Promise<string[]> => {
    const type = await getRepositoryType(path)
    if (type.kind === 'unsafe') throw new Error('Git 无法验证此工作目录的所有权；尚未添加匹配结果。')
    if (type.kind !== 'regular' || Path.relative(path, type.topLevelWorkingDirectory) !== '') return []
    const identities = (await getRemotes(new Repository(path, -1, null, false))).map(remote => repositoryIdentity(remote.url))
    return targetIdentities.filter(repo => repo.identity !== null && identities.includes(repo.identity)).map(repo => repo.id)
  }
  const record = (path: string, ids: string[]) => {
    if (!ids.length || found.has(path)) return
    for (const id of ids) {
      const count = (counts.get(id) || 0) + 1
      if (count > 64) throw new Error('匹配工作目录超过64个，请缩小目录范围；尚未添加匹配结果。')
      counts.set(id, count)
    }
    found.set(path, ids)
  }

  for (let index = 0; index < pending.length; index++) {
    const { path, depth } = pending[index]
    if (inspected.has(path)) continue
    let marker
    try { marker = await fs.lstat(Path.join(path, '.git')) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    if (marker) {
      inspected.add(path)
      if (!marker.isDirectory() && !marker.isFile()) continue
      if (!(await inspect(path)).length) continue
      for (const tree of await listWorktrees(path)) {
        if (tree.isPrunable || branch !== undefined && tree.branch !== `refs/heads/${branch}`) continue
        const relative = Path.relative(root, tree.path)
        if (relative === '..' || relative.startsWith('..' + Path.sep) || Path.isAbsolute(relative)) continue
        let parent = root
        let linked = false
        for (const part of relative.split(Path.sep).filter(Boolean)) {
          parent = Path.join(parent, part)
          if ((await fs.lstat(parent)).isSymbolicLink()) { linked = true; break }
        }
        if (linked || found.has(tree.path)) continue
        record(tree.path, await inspect(tree.path))
        inspected.add(tree.path)
      }
      // Check the Git marker before listing contents, including unmatched repos.
      continue
    }
    // The selected parent is level zero; deep branches do not discard siblings.
    if (depth >= 6) continue
    if (++expanded > 4000) throw new Error('需要展开的候选父目录超过4000个；请选择更具体的项目父目录，原关联未改变。')
    const entries = await fs.readdir(path, { withFileTypes: true })
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory() && !['.git', 'node_modules', '.cache', '_builds'].includes(entry.name)) pending.push({ path: Path.join(path, entry.name), depth: depth + 1 })
    }
  }
  return found
}
