import * as React from 'react'
import { App } from '../app'
import { MissingRepository } from '../missing-repository'
import { Dialog, DialogContent, DialogStackContext } from '../dialog'
import { Dispatcher } from '../dispatcher'
import { IAppState, FoldoutType, SelectionType } from '../../lib/app-state'
import { Banner, BannerType } from '../../models/banner'
import { IMenu } from '../../models/app-menu'
import { PopupType } from '../../models/popup'
import { FetchType } from '../../models/fetch'
import { MaterialPopupContext } from './material-dialog'
import { MaterialIcon } from './material-icon'
import { bannerSurfaces, foldoutSurfaces } from './surfaces'
import { minimizeWindow, maximizeWindow, restoreWindow, closeWindow, getAppleActionOnDoubleClick } from '../main-process-proxy'
import * as ipcRenderer from '../../lib/ipc-renderer'
import { assertNever } from '../../lib/fatal-error'
import { isCheckoutWorktree } from './worktree'

/** Retain the complete upstream App lifecycle, but never call its visual render. */
export class GitTogetherApp extends App {
  public render() {
    return <MaterialApplication state={this.state} dispatcher={this.props.dispatcher}>{this.allPopupContent()}</MaterialApplication>
  }
}

function MaterialApplication({ state, dispatcher, children }: React.PropsWithChildren<{ state: IAppState; dispatcher: Dispatcher }>) {
  React.useEffect(() => {
    const onMenu = (_: Electron.IpcRendererEvent, name: string) => {
      // UI navigation only. The inherited listener executes original commands.
      if (['show-history', 'show-changes', 'go-to-commit-message', 'find-text', 'compare-to-branch'].includes(name)) window.dispatchEvent(new CustomEvent('gittogether:presentation', { detail: { method: name } }))
    }
    ipcRenderer.on('menu-event', onMenu)
    return () => { ipcRenderer.removeListener('menu-event', onMenu) }
  }, [])
  React.useEffect(() => { document.documentElement.dataset.theme = state.currentTheme }, [state.currentTheme])
  const doubleClick = async () => {
    const action = __DARWIN__ ? await getAppleActionOnDoubleClick() : 'Maximize'
    if (action === 'Minimize') minimizeWindow()
    else if (action === 'Maximize') state.windowState === 'maximized' ? restoreWindow() : maximizeWindow()
  }
  return <div id="gittogether-presentation" data-theme={state.currentTheme}>
    {state.windowState !== 'full-screen' && <div className="gt-window-bar" onDoubleClick={() => void doubleClick()}>
      {__WIN32__ && <><button className="gt-window-menu" aria-label="应用菜单" onClick={() => dispatcher.showFoldout({ type: FoldoutType.AppMenu, enableAccessKeyNavigation: false })}><MaterialIcon name="List" size={18} />GitTogether</button>
        <div className="gt-window-controls"><button aria-label="最小化" onClick={() => minimizeWindow()}><MaterialIcon name="Minus" size={16} /></button><button aria-label={state.windowState === 'maximized' ? '还原' : '最大化'} onClick={() => state.windowState === 'maximized' ? restoreWindow() : maximizeWindow()}><MaterialIcon name="Square" size={14} /></button><button aria-label="关闭窗口" onClick={() => closeWindow()}><MaterialIcon name="X" size={18} /></button></div></>}
    </div>}
    <div className="gt-status-stack">
      {state.selectedState?.type === SelectionType.MissingRepository && <div className="gt-missing-state" data-gittogether-surface="MissingRepository"><MissingRepository repository={state.selectedState.repository} dispatcher={dispatcher} /></div>}
      {state.currentBanner && <MaterialBanner banner={state.currentBanner} dispatcher={dispatcher} />}
      {(state.isUpdateAvailableBannerVisible || state.isUpdateShowcaseVisible) && <div className="gt-notice" role="status"><MaterialIcon name="DownloadSimple" /><span>有可用更新</span><button onClick={() => dispatcher.showPopup({ type: PopupType.About })}>查看更新</button><button aria-label="关闭更新提示" onClick={() => dispatcher.setUpdateBannerVisibility(false)}><MaterialIcon name="X" /></button></div>}
      {state.selectedState?.type === SelectionType.CloningRepository && <div className="gt-notice" role="status"><MaterialIcon name="SpinnerGap" className="gt-spin" /><span>正在下载 {state.selectedState.repository.name}…</span></div>}
    </div>
    {state.currentFoldout && <MaterialChooser key={state.currentFoldout.type} state={state} dispatcher={dispatcher} />}
    {children}
  </div>
}

function MaterialBanner({ banner, dispatcher }: { banner: Banner; dispatcher: Dispatcher }) {
  const surface = bannerSurfaces[banner.type]
  let detail: React.ReactNode = null
  let action: (() => void) | undefined
  let actionLabel = '处理冲突'
  switch (banner.type) {
    case BannerType.SuccessfulMerge: detail = `${banner.theirBranch ?? ''} → ${banner.ourBranch}`; break
    case BannerType.MergeConflictsFound: detail = banner.ourBranch; action = () => dispatcher.showPopup(banner.popup); break
    case BannerType.SuccessfulRebase: detail = `${banner.targetBranch} → ${banner.baseBranch ?? ''}`; break
    case BannerType.RebaseConflictsFound: detail = banner.targetBranch; action = banner.onOpenDialog; break
    case BannerType.BranchAlreadyUpToDate: detail = banner.ourBranch; break
    case BannerType.SuccessfulCherryPick: detail = `${banner.targetBranchName} · ${banner.count} 个提交`; action = banner.onUndo; actionLabel = '撤销'; break
    case BannerType.CherryPickConflictsFound: detail = banner.targetBranchName; action = banner.onOpenConflictsDialog; break
    case BannerType.CherryPickUndone: detail = banner.targetBranchName; break
    case BannerType.SquashUndone: detail = `${banner.commitsCount} 个提交`; break
    case BannerType.ReorderUndone: detail = `${banner.commitsCount} 个提交`; break
    case BannerType.OpenThankYouCard: action = banner.onOpenCard; actionLabel = '查看'; break
    case BannerType.SuccessfulSquash: detail = `${banner.count} 个提交`; action = banner.onUndo; actionLabel = '撤销'; break
    case BannerType.SuccessfulReorder: detail = `${banner.count} 个提交`; action = banner.onUndo; actionLabel = '撤销'; break
    case BannerType.ConflictsFound: detail = banner.operationDescription; action = banner.onOpenConflictsDialog; break
    case BannerType.OSVersionNoLongerSupported: detail = '请使用受支持的操作系统版本。'; break
    default: return assertNever(banner, 'Unmapped banner')
  }
  const dismiss = () => { if (banner.type === BannerType.OpenThankYouCard) banner.onThrowCardAway(); dispatcher.clearBanner() }
  return <div className={`gt-notice gt-tone-${surface.kind}`} data-gittogether-banner={banner.type} role={surface.kind === 'flow' ? 'alert' : 'status'}><MaterialIcon name={surface.kind === 'flow' ? 'WarningCircle' : 'CheckCircle'} /><div><strong>{surface.title}</strong>{detail && <span>{detail}</span>}</div>{action && <button onClick={() => { action(); dispatcher.clearBanner() }}>{actionLabel}</button>}<button className="gt-icon-button" aria-label="关闭提示" onClick={dismiss}><MaterialIcon name="X" size={18} /></button></div>
}

function MaterialMenu({ menu, dispatcher, close }: { menu: IMenu; dispatcher: Dispatcher; close: () => void }) {
  const [path, setPath] = React.useState<ReadonlyArray<string>>([])
  let active = menu
  for (const id of path) { const item = active.items.find(candidate => candidate.id === id); if (item?.type === 'submenuItem') active = item.menu }
  const list = React.useRef<HTMLDivElement>(null)
  const keys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(list.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
    const index = items.indexOf(document.activeElement as HTMLButtonElement)
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
      items[next]?.focus()
    } else if (event.key === 'ArrowLeft' && path.length > 0) { event.preventDefault(); setPath(path.slice(0, -1)) }
  }
  React.useEffect(() => { list.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus() }, [path])
  return <div className="gt-menu-list" role="menu" aria-label="应用菜单" ref={list} onKeyDown={keys}>
    {path.length > 0 && <button role="menuitem" onClick={() => setPath(path.slice(0, -1))}><MaterialIcon name="CaretLeft" />返回</button>}
    {active.items.filter(item => item.visible).map(item => item.type === 'separator' ? <hr key={item.id} role="separator" /> : <button key={item.id} role={item.type === 'checkbox' ? 'menuitemcheckbox' : item.type === 'radio' ? 'menuitemradio' : 'menuitem'} aria-checked={'checked' in item ? item.checked : undefined} disabled={!item.enabled} onClick={() => { if (item.type === 'submenuItem') setPath([...path, item.id]); else { close(); dispatcher.executeMenuItem(item) } }}><span>{'checked' in item && item.checked && <MaterialIcon name="CheckCircle" size={16} />}{item.label.replace(/&/g, '')}</span>{item.type === 'submenuItem' ? <MaterialIcon name="CaretRight" size={16} /> : item.accelerator && <kbd>{item.accelerator}</kbd>}</button>)}
  </div>
}

function MaterialChooser({ state, dispatcher }: { state: IAppState; dispatcher: Dispatcher }) {
  const foldout = state.currentFoldout!
  const surface = foldoutSurfaces[foldout.type]
  const [filter, setFilter] = React.useState('')
  const [error, setError] = React.useState('')
  const selection = state.selectedState?.type === SelectionType.Repository ? state.selectedState : null
  const close = () => dispatcher.closeCurrentFoldout()
  const run = (fn: () => Promise<unknown>) => { close(); void fn().catch(e => dispatcher.postError(e)) }
  let content: React.ReactNode
  switch (foldout.type) {
    case FoldoutType.AppMenu: content = state.appMenuState[0] ? <MaterialMenu menu={state.appMenuState[0]} dispatcher={dispatcher} close={close} /> : <p>菜单正在加载…</p>; break
    case FoldoutType.Repository: content = <>{state.repositories.filter(repo => repo.name.toLowerCase().includes(filter.toLowerCase())).map(repo => <button key={repo.id} className="gt-choice" onClick={() => run(() => dispatcher.selectRepository(repo))}><MaterialIcon name="FolderSimple" /><span><strong>{repo.name}</strong><small>{repo.path}</small></span></button>)}</>; break
    case FoldoutType.Branch: content = selection?.state.branchesState.allBranches.filter(branch => branch.name.toLowerCase().includes(filter.toLowerCase())).map(branch => <button key={branch.ref} className="gt-choice" onClick={() => run(() => dispatcher.checkoutBranch(selection.repository, branch))}><MaterialIcon name="GitBranch" /><span>{branch.name}</span></button>); break
    case FoldoutType.Worktree: content = selection?.state.worktrees.filter(isCheckoutWorktree).filter(tree => `${tree.path} ${tree.branch}`.toLowerCase().includes(filter.toLowerCase())).map(tree => <button key={tree.path} className="gt-choice" onClick={() => run(() => dispatcher.switchWorktree(selection.repository, tree))}><MaterialIcon name="FolderSimple" /><span><strong>{tree.branch?.replace('refs/heads/', '') ?? tree.head.slice(0, 8)}</strong><small>{tree.path}</small></span></button>); break
    case FoldoutType.AddMenu: content = <>{[['添加本地仓库', PopupType.AddRepository], ['新建仓库', PopupType.CreateRepository], ['下载仓库', PopupType.CloneRepository]].map(([label, type]) => <button className="gt-choice" key={type} onClick={() => { close(); if (type === PopupType.CloneRepository) dispatcher.showPopup({ type, initialURL: null }); else if (type === PopupType.AddRepository || type === PopupType.CreateRepository) dispatcher.showPopup({ type }); else setError('操作不可用。') }}><MaterialIcon name="Plus" />{label}</button>)}</>; break
    case FoldoutType.PushPull: content = selection && <>{[['获取远端更改', () => dispatcher.fetch(selection.repository, FetchType.UserInitiatedTask)], ['拉取并合并', () => dispatcher.pull(selection.repository)], ['推送', () => dispatcher.push(selection.repository)]].map(([label, fn]) => <button className="gt-choice" key={label as string} onClick={() => run(fn as () => Promise<unknown>)}><MaterialIcon name="ArrowsClockwise" />{label as string}</button>)}</>; break
    default: return assertNever(foldout, 'Unmapped foldout')
  }
  return <MaterialPopupContext.Provider value={{ ...surface, type: `Selector-${foldout.type}` }}><DialogStackContext.Provider value={{ isTopMost: state.currentPopup === null }}><Dialog id="gittogether-selector" title={surface.title} onDismissed={close}><DialogContent>{![FoldoutType.AppMenu, FoldoutType.AddMenu, FoldoutType.PushPull].includes(foldout.type) && <label className="gt-filter-field">搜索<input autoFocus aria-label={surface.title} value={filter} onChange={e => setFilter(e.target.value)} /></label>}{error && <p role="alert">{error}</p>}<div className="gt-choices">{content ?? <p>当前没有可用项目。</p>}</div></DialogContent></Dialog></DialogStackContext.Provider></MaterialPopupContext.Provider>
}
