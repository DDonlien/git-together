import * as React from 'react'
import shapes from './phosphor-shapes.json'
import * as symbols from '../octicons/octicons.generated'
import type { OcticonSymbol } from '../octicons'
export type MaterialIconName = keyof typeof shapes

export function MaterialIcon({ name, size = 20, className = '', title }: { name: MaterialIconName; size?: number; className?: string; title?: string }) {
  return <svg className={`gt-icon ${className}`} viewBox="0 0 256 256" width={size} height={size} fill="currentColor" aria-hidden={title ? undefined : true} aria-label={title} role={title ? 'img' : undefined} dangerouslySetInnerHTML={{ __html: shapes[name] }} />
}

const exact: Record<string, MaterialIconName> = {
  triangleDown: 'CaretDown', triangleUp: 'ArrowUp', triangleLeft: 'CaretLeft', triangleRight: 'CaretRight',
  x: 'X', alert: 'WarningCircle', stop: 'WarningCircle', info: 'Info', check: 'CheckCircle', checkCircle: 'CheckCircle',
  markGithub: 'GitBranch', logoGithub: 'GitBranch', desktopDownload: 'Desktop', repo: 'FolderSimple', repoClone: 'CloudArrowDown',
  gitBranch: 'GitBranch', gitCommit: 'GitCommit', gitMerge: 'GitMerge', gitPullRequest: 'GitPullRequest',
  repoForked: 'GitBranch', fileDirectory: 'FolderSimple', file: 'File', fileCode: 'FileCode',
  key: 'Key', lock: 'LockKey', shield: 'ShieldCheck', gear: 'GearSix', sync: 'ArrowsClockwise', syncClockwise: 'SpinnerGap',
  search: 'MagnifyingGlass', trash: 'Trash', pencil: 'PencilSimple', copy: 'Copy', clock: 'Clock', people: 'Users', person: 'User',
  plus: 'Plus', dash: 'Minus', kebabHorizontal: 'DotsThree', listUnordered: 'List', terminal: 'Terminal', tag: 'Tag',
  chevronDown: 'CaretDown', chevronLeft: 'CaretLeft', chevronRight: 'CaretRight', arrowDown: 'ArrowDown', arrowUp: 'ArrowUp',
  linkExternal: 'ArrowSquareOut', link: 'Link', cloud: 'CloudArrowDown', download: 'DownloadSimple', upload: 'UploadSimple',
  home: 'SquaresFour', paintbrush: 'PaintBrush', bell: 'Bell', question: 'Question', copilot: 'Robot', sparkle: 'Sparkle',
  globe: 'Globe', mail: 'Envelope', signOut: 'SignOut', signIn: 'SignIn', eye: 'Eye', eyeClosed: 'EyeSlash',
  play: 'Play', square: 'Stop', book: 'BookOpen', code: 'Code', screenFull: 'Square', screenNormal: 'Square',
}
const names = new Map<OcticonSymbol, MaterialIconName>()
for (const [key, symbol] of Object.entries(symbols)) {
  const name = exact[key] ?? (/conflict|alert|warning|error|stop/i.test(key) ? 'WarningCircle'
    : /branch|fork/i.test(key) ? 'GitBranch' : /pullRequest/i.test(key) ? 'GitPullRequest' : /commit/i.test(key) ? 'GitCommit'
    : /repo|folder|directory/i.test(key) ? 'FolderSimple' : /file|diff/i.test(key) ? 'FileCode'
    : /key|password/i.test(key) ? 'Key' : /lock|shield/i.test(key) ? 'ShieldCheck'
    : /chevron|triangle|arrowRight/i.test(key) ? 'CaretRight' : /check|success/i.test(key) ? 'CheckCircle'
    : /person|accessibility/i.test(key) ? 'User' : /loading|sync/i.test(key) ? 'SpinnerGap' : 'Info')
  names.set(symbol as OcticonSymbol, name)
}
export const iconForSymbol = (symbol: OcticonSymbol): MaterialIconName => names.get(symbol) ?? 'Info'
