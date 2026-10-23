import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import * as React from 'react'
import { act } from 'react-dom/test-utils'

import { DiffSelection, DiffSelectionType } from '../../../src/models/diff'
import { ManualConflictResolution } from '../../../src/models/manual-conflict-resolution'
import { MultiCommitOperationKind } from '../../../src/models/multi-commit-operation'
import { Repository } from '../../../src/models/repository'
import {
  AppFileStatusKind,
  GitStatusEntry,
  UnmergedEntrySummary,
  WorkingDirectoryFileChange,
  WorkingDirectoryStatus,
} from '../../../src/models/status'
import type { Dispatcher } from '../../../src/ui/dispatcher'
import { ConflictsDialog } from '../../../src/ui/multi-commit-operation/dialog/conflicts-dialog'
import { fireEvent, render, waitFor } from '../../helpers/ui/render'

type DialogProps = React.ComponentProps<typeof ConflictsDialog>

const showModalDescriptor = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  'showModal'
)
const closeDescriptor = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  'close'
)
let restoreIpcSend: (() => void) | undefined

function markerFile(path: string, conflictMarkerCount = 1) {
  return new WorkingDirectoryFileChange(
    path,
    {
      kind: AppFileStatusKind.Conflicted,
      entry: {
        kind: 'conflicted',
        action: UnmergedEntrySummary.BothModified,
        us: GitStatusEntry.UpdatedButUnmerged,
        them: GitStatusEntry.UpdatedButUnmerged,
      },
      conflictMarkerCount,
    },
    DiffSelection.fromInitialSelection(DiffSelectionType.All)
  )
}

function createProps(overrides: Partial<DialogProps> = {}): DialogProps {
  return {
    operationKind: MultiCommitOperationKind.Merge,
    dispatcher: {} as Dispatcher,
    repository: new Repository('/unused-conflict-submission', -1, null, false),
    workingDirectory: WorkingDirectoryStatus.fromFiles([]),
    manualResolutions: new Map(),
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
    ...overrides,
  }
}

function getForm(container: HTMLElement) {
  const form = container.querySelector('form')
  assert.ok(form)
  return form
}

function getContinueButton(container: HTMLElement) {
  const button = container.querySelector<HTMLButtonElement>(
    'button[type="submit"]'
  )
  assert.ok(button)
  return button
}

describe('conflicts dialog submission', () => {
  beforeEach(async () => {
    const electron = await import('electron')
    const previousSend = electron.ipcRenderer.send
    electron.ipcRenderer.send = () => {}
    restoreIpcSend = () => {
      electron.ipcRenderer.send = previousSend
    }
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true
    }
    HTMLDialogElement.prototype.close = function () {
      this.open = false
    }
  })

  afterEach(() => {
    restoreIpcSend?.()
    for (const [name, descriptor] of [
      ['showModal', showModalDescriptor],
      ['close', closeDescriptor],
    ] as const) {
      if (descriptor === undefined) {
        Reflect.deleteProperty(HTMLDialogElement.prototype, name)
      } else {
        Object.defineProperty(HTMLDialogElement.prototype, name, descriptor)
      }
    }
  })

  it('blocks clicks and form submissions until all seven files are resolved', () => {
    let submitted = 0
    const files = Array.from({ length: 7 }, (_, i) => markerFile(`${i}.txt`))
    const props = createProps({
      workingDirectory: WorkingDirectoryStatus.fromFiles(files),
      onSubmit: async () => {
        submitted++
      },
    })
    const view = render(<ConflictsDialog {...props} />)

    for (const resolved of [0, 1, 3, 6]) {
      view.rerender(
        <ConflictsDialog
          {...props}
          manualResolutions={
            new Map(
              files
                .slice(0, resolved)
                .map(file => [file.path, ManualConflictResolution.ours])
            )
          }
        />
      )
      const button = getContinueButton(view.container)
      assert.equal(button.disabled, true)
      assert.equal(button.getAttribute('aria-disabled'), 'true')
      fireEvent.click(button)
      // Enter uses this same form submission entry point. jsdom does not
      // synthesize a form submission from keyboard events itself.
      fireEvent.submit(getForm(view.container))
      assert.equal(submitted, 0)
    }

    view.rerender(
      <ConflictsDialog
        {...props}
        manualResolutions={
          new Map(
            files.map(file => [file.path, ManualConflictResolution.theirs])
          )
        }
      />
    )
    const button = getContinueButton(view.container)
    assert.equal(button.disabled, false)
    fireEvent.click(button)
    assert.equal(submitted, 1)
  })

  it('also blocks the submission entry point while a marker count is unknown', () => {
    let submitted = 0
    const view = render(
      <ConflictsDialog
        {...createProps({
          workingDirectory: WorkingDirectoryStatus.fromFiles([
            markerFile('unknown.txt', NaN),
          ]),
          onSubmit: async () => {
            submitted++
          },
        })}
      />
    )
    assert.equal(getContinueButton(view.container).disabled, true)
    fireEvent.submit(getForm(view.container))
    assert.equal(submitted, 0)
  })

  it('accepts only one submission before React applies the disabled state', () => {
    let submitted = 0
    let complete: () => void = () => {}
    const pending = new Promise<void>(resolve => {
      complete = resolve
    })
    const view = render(
      <ConflictsDialog
        {...createProps({
          onSubmit: async () => {
            submitted++
            await pending
          },
        })}
      />
    )
    const form = getForm(view.container)
    act(() => {
      fireEvent.submit(form)
      fireEvent.submit(form)
    })
    assert.equal(submitted, 1)
    assert.equal(getContinueButton(view.container).disabled, true)
    assert.equal(form.querySelector('fieldset')?.disabled, true)
    fireEvent.submit(form)
    assert.equal(submitted, 1)
    complete()
  })

  it('allows retry after the original submit callback rejects', async () => {
    let submitted = 0
    let rejectSubmit: (error: Error) => void = () => {}
    const pending = new Promise<void>((_, reject) => {
      rejectSubmit = reject
    })
    const view = render(
      <ConflictsDialog
        {...createProps({
          onSubmit: async () => {
            submitted++
            if (submitted === 1) {
              await pending
            }
          },
        })}
      />
    )
    fireEvent.submit(getForm(view.container))
    rejectSubmit(new Error('Fixture submit failure'))
    await waitFor(() => {
      assert.equal(getContinueButton(view.container).disabled, false)
    })
    fireEvent.submit(getForm(view.container))
    assert.equal(submitted, 2)
  })

  it('prevents continue and repeated abort actions while aborting', async () => {
    let submitted = 0
    let aborted = 0
    let complete: () => void = () => {}
    const pending = new Promise<void>(resolve => {
      complete = resolve
    })
    const view = render(
      <ConflictsDialog
        {...createProps({
          onSubmit: async () => {
            submitted++
          },
          onAbort: async () => {
            aborted++
            await pending
          },
        })}
      />
    )
    const abort = view.container.querySelector<HTMLButtonElement>(
      'button[type="reset"]'
    )
    assert.ok(abort)
    act(() => {
      fireEvent.click(abort)
      fireEvent.click(abort)
      fireEvent.submit(getForm(view.container))
    })
    assert.equal(aborted, 1)
    assert.equal(submitted, 0)
    assert.equal(getContinueButton(view.container).disabled, true)
    assert.equal(abort.matches(':disabled'), true)
    complete()
    await waitFor(() => {
      assert.equal(getContinueButton(view.container).disabled, false)
    })
  })
})
