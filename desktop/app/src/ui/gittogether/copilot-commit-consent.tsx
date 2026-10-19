import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { offsetFromNow } from '../../lib/offset-from'
import { PopupType } from '../../models/popup'
import { CopilotDisclaimer } from '../copilot/copilot-disclaimer'
import { DialogStackContext } from '../dialog'
import { MaterialPopup } from './material-dialog'
import type { DesktopAdapter } from './adapter'

/** Reuse Desktop's disclaimer without its follow-up that stages the real index. */
export class CopilotCommitConsent {
  private dialog?: { host: HTMLElement; waiters: Map<AbortSignal, (accepted: boolean) => void> }
  public constructor(private readonly desktop: DesktopAdapter) {}

  public request(signal: AbortSignal): Promise<boolean> {
    signal.throwIfAborted()
    const lastSeen = this.desktop.store.getState().commitMessageGenerationDisclaimerLastSeen
    if (lastSeen && offsetFromNow(-30, 'days') <= lastSeen) return Promise.resolve(true)
    return new Promise(resolve => {
      const isNew = !this.dialog
      const dialog = this.dialog ?? { host: document.createElement('div'), waiters: new Map() }
      this.dialog = dialog
      const abort = () => {
        dialog.waiters.delete(signal)
        signal.removeEventListener('abort', abort)
        resolve(false)
        if (!dialog.waiters.size) this.finish(false)
      }
      dialog.waiters.set(signal, accepted => {
        signal.removeEventListener('abort', abort)
        resolve(accepted)
      })
      signal.addEventListener('abort', abort, { once: true })
      if (isNew) {
        document.body.appendChild(dialog.host)
        ReactDOM.render(<MaterialPopup type={PopupType.GenerateCommitMessageDisclaimer}>
          <DialogStackContext.Provider value={{ isTopMost: true }}>
            <CopilotDisclaimer onAccepted={() => this.finish(true)} onDismissed={() => this.finish(false)}>
              Review and edit the generated message carefully before use.
            </CopilotDisclaimer>
          </DialogStackContext.Provider>
        </MaterialPopup>, dialog.host)
      }
    })
  }

  private finish(accepted: boolean) {
    const dialog = this.dialog
    if (!dialog) return
    this.dialog = undefined
    if (accepted) this.desktop.dispatcher.updateCommitMessageGenerationDisclaimerLastSeen()
    ReactDOM.unmountComponentAtNode(dialog.host)
    dialog.host.remove()
    for (const resolve of dialog.waiters.values()) resolve(accepted)
  }
}
