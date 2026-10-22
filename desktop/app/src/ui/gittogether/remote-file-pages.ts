import type { RemoteFile, RemoteFileSelection } from '../../../../../macos/src/remote-control-model'

// Each response fits the existing 128 KiB control envelope, even with long paths.
const pageFiles = 100
const pageBytes = 48 * 1024

export function remoteFilePage(files: readonly RemoteFile[], cursor: unknown = 0) {
  if (!Number.isSafeInteger(cursor) || (cursor as number) < 0 || (cursor as number) > files.length) throw new Error('文件页游标无效，请重新预览。')
  const offset = cursor as number
  const page: RemoteFile[] = []
  let bytes = 2
  for (const file of files.slice(offset, offset + pageFiles)) {
    const size = Buffer.byteLength(JSON.stringify(file), 'utf8') + 1
    if (bytes + size > pageBytes) {
      if (!page.length) throw new Error('单个文件路径超过传输限制，无法读取此文件页。')
      break
    }
    page.push(file)
    bytes += size
  }
  const next = offset + page.length
  return { files: page, filePage: { offset, total: files.length, ...(next < files.length ? { nextCursor: next } : {}) } }
}

export function selectedRemoteFiles(files: readonly RemoteFile[], selection: RemoteFileSelection): RemoteFile[] {
  if (!selection || typeof selection.all !== 'boolean' || !Array.isArray(selection.ranges)) throw new Error('文件选择范围无效。')
  let previous = -1
  for (const range of selection.ranges) {
    if (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isSafeInteger) || range[0] <= previous || range[1] < range[0] || range[1] >= files.length) throw new Error('文件选择范围已失效，请重新预览。')
    previous = range[1]
  }
  let range = 0
  return files.filter((_, index) => {
    while (range < selection.ranges.length && selection.ranges[range][1] < index) range++
    const listed = range < selection.ranges.length && selection.ranges[range][0] <= index
    return selection.all !== listed
  })
}
