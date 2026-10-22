import * as React from 'react'
import type { MultiCommitOperationStepKind } from '../../models/multi-commit-operation'
import { PopupType } from '../../models/popup'
import { popupSurfaces, multiCommitSurfaces, Surface } from './surfaces'
import { MaterialIcon, MaterialIconName } from './material-icon'

export const MaterialPopupContext = React.createContext<Surface & { type: string }>({ title: 'GitTogether', kind: 'form', type: 'GitTogether' })
export function MaterialPopup({ type, step, children }: React.PropsWithChildren<{ type: PopupType; step?: MultiCommitOperationStepKind }>) {
  return <MaterialPopupContext.Provider value={{ ...(step ? multiCommitSurfaces[step] : popupSurfaces[type]), type }}>{children}</MaterialPopupContext.Provider>
}
const glyphs: Record<Surface['kind'], MaterialIconName> = { form: 'GitBranch', auth: 'ShieldCheck', danger: 'WarningCircle', info: 'Info', progress: 'SpinnerGap', flow: 'GitMerge' }

export function MaterialDialogHeader({ title, titleId, loading, showCloseButton = true, onClose, accessory, children }: React.PropsWithChildren<{ title: React.ReactNode; titleId?: string; loading?: boolean; showCloseButton?: boolean; onClose?: (event: React.MouseEvent<HTMLButtonElement>) => void; accessory?: () => JSX.Element }>) {
  const surface = React.useContext(MaterialPopupContext)
  return <div className="dialog-header gt-dialog-header">
    <div className={`gt-dialog-symbol gt-tone-${surface.kind}`}><MaterialIcon name={loading ? 'SpinnerGap' : glyphs[surface.kind]} size={24} className={loading || surface.kind === 'progress' ? 'gt-spin' : ''} /></div>
    <div className="gt-dialog-heading"><h1 id={titleId}>{surface.type === 'GitTogether' ? title : surface.title}</h1>
      {title && title !== surface.title && <div className="gt-dialog-context">{title}</div>}
    </div>
    {accessory?.()}{showCloseButton && <button className="close gt-icon-button" type="button" aria-label="关闭" onClick={onClose}><MaterialIcon name="X" /></button>}{children}
  </div>
}

interface MaterialDialogProps {
  readonly native: React.DialogHTMLAttributes<HTMLDialogElement> & { ref: React.Ref<HTMLDialogElement> }
  readonly header: React.ReactNode
  readonly disabled?: boolean
  readonly onDismiss: () => void
  readonly onSubmit: React.FormEventHandler<HTMLFormElement>
}

/** Original dialog lifecycle owns focus, safe defaults, dismissal and stacking.
 * Only its view is replaced; original controller children retain every callback. */
export function MaterialDialog({ native, header, disabled, onDismiss, onSubmit, children }: React.PropsWithChildren<MaterialDialogProps>) {
  const surface = React.useContext(MaterialPopupContext)
  return <dialog {...native} className={`gt-dialog gt-tone-${surface.kind}${surface.wide ? ' gt-dialog-wide' : ''} ${native.className ?? ''}`} aria-modal="true" data-gittogether-surface={surface.type}>
    {header}
    <form onSubmit={onSubmit} onReset={onDismiss} className="gt-dialog-form"><fieldset disabled={disabled}>{children}</fieldset></form>
  </dialog>
}

