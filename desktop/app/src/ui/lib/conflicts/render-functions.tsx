import * as React from 'react'
import { Octicon } from '../../octicons'
import * as octicons from '../../octicons/octicons.generated'
import { LinkButton } from '../link-button'

export function renderUnmergedFilesSummary(conflictedFilesCount: number) {
  const message =
    conflictedFilesCount === 0
      ? '所有文件的冲突均已解决'
      : `仍有 ${conflictedFilesCount} 个文件存在冲突`
  return <h2 className="summary">{message}</h2>
}

export function renderAllResolved() {
  return (
    <div className="all-conflicts-resolved">
      <div className="green-circle">
        <Octicon symbol={octicons.check} />
      </div>
      <div className="message">所有文件的冲突均已解决</div>
    </div>
  )
}

export function renderShellLink(openThisRepositoryInShell: () => void) {
  return (
    <div>
      <LinkButton onClick={openThisRepositoryInShell}>
        Open in command line,
      </LinkButton>{' '}
      your tool of choice, or close to resolve manually.
    </div>
  )
}
