import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import '../../helpers/ui/setup'
import { exec } from 'dugite'
import { writeFile } from 'fs/promises'
import { join } from 'path'

import {
  AppFileStatusKind,
  ConflictedFileStatus,
  GitStatusEntry,
  UnmergedEntrySummary,
  WorkingDirectoryFileChange,
  WorkingDirectoryStatus,
} from '../../../src/models/status'
import { DiffSelection, DiffSelectionType } from '../../../src/models/diff'
import { ManualConflictResolution } from '../../../src/models/manual-conflict-resolution'
import { MultiCommitOperationKind } from '../../../src/models/multi-commit-operation'
import { Repository } from '../../../src/models/repository'
import { Dispatcher } from '../../../src/ui/dispatcher'
import { ConflictsDialog } from '../../../src/ui/multi-commit-operation/dialog/conflicts-dialog'
import { isolateGitConfig } from '../../helpers/git-config'
import { setupEmptyRepository } from '../../helpers/repositories'
import { makeCommit, switchTo } from '../../helpers/repository-scaffolding'
import { getStatusOrThrow } from '../../helpers/status'

function createDialog(
  workingDirectory: WorkingDirectoryStatus,
  manualResolutions = new Map<string, ManualConflictResolution>()
) {
  return new ConflictsDialog({
    operationKind: MultiCommitOperationKind.Merge,
    dispatcher: {} as Dispatcher,
    repository: new Repository('/unused-conflict-fixture', -1, null, false),
    workingDirectory,
    manualResolutions,
    resolvedExternalEditor: null,
    headerTitle: 'Resolve conflicts',
    submitButton: 'Continue Merge',
    abortButton: 'Abort Merge',
    onSubmit: async () => {},
    onAbort: async () => {},
    onDismissed: () => {},
    openFileInExternalEditor: () => {},
    openRepositoryInShell: () => {},
    accounts: [],
    shouldShowCopilotConflictResolutionCallOut: false,
  })
}

function renderDialog(dialog: ConflictsDialog) {
  return renderToStaticMarkup(dialog.render()).replace(
    /<svg\b[\s\S]*?<\/svg>/g,
    ''
  )
}

function continueDisabled(html: string) {
  const container = document.createElement('div')
  container.innerHTML = html
  const button = container.querySelector<HTMLButtonElement>(
    'button[type="submit"]'
  )
  assert.ok(button)
  // Native disabled behavior is owned by the dependent continue-button issue.
  return button.disabled || button.getAttribute('aria-disabled') === 'true'
}

function markerFile(path: string, conflictMarkerCount: number) {
  const status: ConflictedFileStatus = {
    kind: AppFileStatusKind.Conflicted,
    entry: {
      kind: 'conflicted',
      action: UnmergedEntrySummary.BothModified,
      us: GitStatusEntry.UpdatedButUnmerged,
      them: GitStatusEntry.UpdatedButUnmerged,
    },
    conflictMarkerCount,
  }
  return new WorkingDirectoryFileChange(
    path,
    status,
    DiffSelection.fromInitialSelection(DiffSelectionType.All)
  )
}

describe('conflicts dialog progress', () => {
  it('keeps the other six files unresolved after one version choice', () => {
    const workingDirectory = WorkingDirectoryStatus.fromFiles(
      Array.from({ length: 7 }, (_, i) => markerFile(`${i}.txt`, 3))
    )
    const dialog = createDialog(
      workingDirectory,
      new Map([['0.txt', ManualConflictResolution.ours]])
    )
    const html = renderDialog(dialog)
    assert.match(html, /已解决 1 个文件，仍有 6 个文件存在冲突/)
    assert.equal(
      (html.match(/unmerged-file-status-conflicts/g) ?? []).length,
      6
    )
    assert.equal((html.match(/unmerged-file-status-resolved/g) ?? []).length, 1)
    assert.doesNotMatch(
      html,
      /所有文件的冲突均已解决|All conflicted files have been resolved/
    )
    assert.equal(continueDisabled(html), true)
  })

  it('does not treat an unknown marker count as zero', () => {
    for (const count of [undefined, null, NaN, -1]) {
      const dialog = createDialog(
        WorkingDirectoryStatus.fromFiles([
          markerFile('chosen.txt', 3),
          markerFile('unknown.txt', count as number),
        ]),
        new Map([['chosen.txt', ManualConflictResolution.theirs]])
      )
      const html = renderDialog(dialog)
      assert.match(html, /已解决 1 个文件，仍有 1 个文件存在冲突/)
      assert.match(html, /冲突状态待确认/)
      assert.equal(
        (html.match(/unmerged-file-status-conflicts/g) ?? []).length,
        1
      )
      assert.doesNotMatch(
        html,
        /所有文件的冲突均已解决|All conflicted files have been resolved/
      )
    }
  })

  it('scopes a marker-free row to that file and preserves undo for a chosen version', () => {
    const workingDirectory = WorkingDirectoryStatus.fromFiles([
      markerFile('edited.txt', 0),
      markerFile('chosen.txt', 0),
      markerFile('remaining.txt', 3),
    ])
    const dialog = createDialog(
      workingDirectory,
      new Map([['chosen.txt', ManualConflictResolution.ours]])
    )
    const html = renderDialog(dialog)
    assert.match(html, /此文件的冲突已解决/)
    assert.match(html, /undo-button/)
    assert.match(html, /已解决 2 个文件，仍有 1 个文件存在冲突/)
    assert.doesNotMatch(html, /No conflicts remaining/)
  })

  it('counts manual conflicts and ignores choices for files outside the conflict list', () => {
    const manualFile = new WorkingDirectoryFileChange(
      'binary.dat',
      {
        kind: AppFileStatusKind.Conflicted,
        entry: {
          kind: 'conflicted',
          action: UnmergedEntrySummary.BothModified,
          us: GitStatusEntry.UpdatedButUnmerged,
          them: GitStatusEntry.UpdatedButUnmerged,
        },
      },
      DiffSelection.fromInitialSelection(DiffSelectionType.All)
    )
    const workingDirectory = WorkingDirectoryStatus.fromFiles([
      manualFile,
      markerFile('text.txt', 3),
    ])
    const choices = new Map([
      ['not-in-this-conflict.txt', ManualConflictResolution.ours],
      ['text.txt', ManualConflictResolution.theirs],
    ])
    const dialog = createDialog(workingDirectory, choices)
    assert.match(renderDialog(dialog), /已解决 1 个文件，仍有 1 个文件存在冲突/)
    choices.set('binary.dat', ManualConflictResolution.ours)
    assert.match(renderDialog(dialog), /所有文件的冲突均已解决/)
    choices.delete('binary.dat')
    assert.match(renderDialog(dialog), /已解决 1 个文件，仍有 1 个文件存在冲突/)
  })

  it('tracks first, middle, last, undo and reload in an isolated seven-file Git merge', async t => {
    await isolateGitConfig(t)
    const repository = await setupEmptyRepository(t)
    const paths = Array.from({ length: 7 }, (_, i) => `${i}.txt`)
    const tree = (contents: string) => ({
      entries: paths.map(path => ({ path, contents })),
    })
    await makeCommit(repository, tree('base\n'))
    assert.equal(
      (await exec(['branch', 'incoming'], repository.path)).exitCode,
      0
    )
    await makeCommit(repository, tree('local\n'))
    await switchTo(repository, 'incoming')
    await makeCommit(repository, tree('remote\n'))
    await switchTo(repository, 'master')
    assert.equal(
      (await exec(['merge', 'incoming'], repository.path)).exitCode,
      1
    )

    const status = await getStatusOrThrow(repository)
    assert.equal(status.workingDirectory.files.length, 7)
    const choices = new Map<string, ManualConflictResolution>()
    const dialog = createDialog(status.workingDirectory, choices)
    const assertProgress = async (resolved: number, total = 7) => {
      const refreshed = await getStatusOrThrow(repository)
      // Simulate the original Store's prop update without mounting a native dialog.
      Object.assign(dialog.props, {
        workingDirectory: refreshed.workingDirectory,
      })
      const html = renderDialog(dialog)
      assert.equal(
        (html.match(/unmerged-file-status-conflicts/g) ?? []).length,
        total - resolved
      )
      assert.equal(
        (html.match(/unmerged-file-status-resolved/g) ?? []).length,
        resolved
      )
      if (resolved === total) {
        assert.match(html, /所有文件的冲突均已解决/)
        assert.equal(continueDisabled(html), false)
      } else {
        assert.doesNotMatch(
          html,
          /所有文件的冲突均已解决|All conflicted files have been resolved/
        )
        assert.equal(continueDisabled(html), true)
        if (resolved > 0) {
          assert.match(
            html,
            new RegExp(
              `已解决 ${resolved} 个文件，仍有 ${
                total - resolved
              } 个文件存在冲突`
            )
          )
        }
      }
    }

    await assertProgress(0)
    for (let i = 0; i < paths.length; i++) {
      choices.set(
        paths[i],
        i % 2 === 0
          ? ManualConflictResolution.ours
          : ManualConflictResolution.theirs
      )
      await assertProgress(i + 1)
    }
    choices.delete(paths[3])
    await assertProgress(6)
    choices.clear()
    await assertProgress(0)
    assert.match(renderDialog(dialog), /仍有 7 个文件存在冲突，请继续处理/)

    // Resolve actual contents externally and then reread original Git status.
    for (let i = 0; i < paths.length; i++) {
      await writeFile(join(repository.path, paths[i]), 'edited resolution\n')
      await assertProgress(i === 0 ? 1 : i, i === 0 ? 7 : 6)
      if (i === 0) {
        // A partial stage removes the resolved row while six conflicts remain.
        assert.equal(
          (await exec(['add', '--', paths[0]], repository.path)).exitCode,
          0
        )
        const partlyStaged = await getStatusOrThrow(repository)
        assert.equal(partlyStaged.mergeHeadFound, true)
        Object.assign(dialog.props, {
          workingDirectory: partlyStaged.workingDirectory,
        })
        const html = renderDialog(dialog)
        assert.match(html, /仍有 6 个文件存在冲突，请继续处理/)
        assert.doesNotMatch(html, /已撤销|所有文件的冲突均已解决/)
        assert.equal(continueDisabled(html), true)
      }
    }
    // Once staged, resolved files leave the conflict list entirely.
    assert.equal(
      (await exec(['add', '--', ...paths], repository.path)).exitCode,
      0
    )
    const staged = await getStatusOrThrow(repository)
    Object.assign(dialog.props, { workingDirectory: staged.workingDirectory })
    const html = renderDialog(dialog)
    assert.match(html, /所有文件的冲突均已解决/)
    assert.doesNotMatch(html, /已撤销/)
  })
})
