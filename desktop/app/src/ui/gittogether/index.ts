import { AppStore } from '../../lib/stores'
import { RepositoryStateCache } from '../../lib/stores/repository-state-cache'
import { CopilotStore } from '../../lib/stores/copilot-store'
import { Dispatcher } from '../dispatcher'
import { DesktopAdapter } from './adapter'
import { PresenceHost } from './presence-host'
import { showOpenDialog, getPath } from '../main-process-proxy'
import { shell } from '../../lib/app-shell'
import * as Path from 'path'
import { PopupType } from '../../models/popup'
import { ApplicationTheme } from '../lib/application-theme'
import { AccountsStore } from '../../lib/stores/accounts-store'
import { DesktopUpdates } from './updates'
import { upgradeLegacy } from './upgrade'
import type { ApiInputs, ApiMethod } from '../../../../../macos/src/import-model'

export function installGitTogether(store: AppStore, dispatcher: Dispatcher, cache: RepositoryStateCache, copilot: CopilotStore, accounts: AccountsStore) {
  const adapter = new DesktopAdapter(store, dispatcher, cache, copilot)
  if (process.env.GITTOGETHER_SMOKE === '1') Object.assign(window, { __gittogetherAdapter: adapter })
  const presence = new PresenceHost(adapter)
  let activeOperations = 0
  const updates = new DesktopUpdates(async () => {
    if (activeOperations !== 0) return false
    const result = await presence.command('internal', 'canInstall', {}) as { ok: boolean; value?: boolean; error?: string }
    if (!result.ok) throw new Error(result.error || '无法确认远端操作状态，请稍后重试。')
    return result.value === true
  })
  let upgrade: Promise<void> | undefined
  if (process.env.GITTOGETHER_SMOKE === '1') Object.assign(window, { __gittogetherPresence: presence })
  const frame = document.createElement('iframe')
  frame.id = 'gittogether-ui'
  frame.title = 'GitTogether'
  frame.src = new URL('./gittogether/index.html', location.href).href
  frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:0;background:#f6f5fa;'
  document.body.appendChild(frame)
  let activePort: MessagePort | null = null
  let lastTheme: ApplicationTheme | undefined
  let lastResolvedTheme: ApplicationTheme | undefined
  const updateVisibility = () => {
    const s = store.getState()
    if (lastTheme !== s.selectedTheme || lastResolvedTheme !== s.currentTheme) {
      lastTheme = s.selectedTheme
      lastResolvedTheme = s.currentTheme
      activePort?.postMessage({ event: 'presentation', value: { method: 'theme', theme: lastTheme, resolvedTheme: lastResolvedTheme } })
    }
    // The inherited App runs upstream subscriptions, but its stock render is
    // never mounted. GitTogether owns the frame, all modal views and chrome.
    if (s.showWelcomeFlow) void dispatcher.endWelcomeFlow()
  }
  store.onDidUpdate(updateVisibility)
  window.addEventListener('gittogether:presentation', event => activePort?.postMessage({ event: 'presentation', value: (event as CustomEvent).detail }))
  window.addEventListener('gittogether:sync-progress', event => activePort?.postMessage({ event: 'sync-progress', value: (event as CustomEvent).detail }))
  window.addEventListener('message', event => {
    if (event.source !== frame.contentWindow || event.data?.type !== 'gittogether:ready' || frame.contentWindow?.location.href !== frame.src) return
    activePort?.close()
    const channel = new MessageChannel()
    activePort = channel.port1
    channel.port1.onmessage = async message => {
      const { id, group, method, input } = message.data || {}
      if (typeof id !== 'string' || typeof group !== 'string' || typeof method !== 'string') return
      try {
        let value: unknown
        if (group === 'import') {
          activeOperations++
          try {
            if (!upgrade) upgrade = upgradeLegacy(adapter, presence, accounts).catch(error => { upgrade = undefined; throw error })
            await upgrade
            value = { ok: true, value: await adapter.handle(method as ApiMethod, input as ApiInputs[ApiMethod]) }
          }
          catch (e) { value = { ok: false, error: e instanceof Error ? e.message : String(e) } }
          finally { activeOperations-- }
        } else if (group === 'environment') { const state = store.getState(); value = { nativeGlass: false, platform: process.platform, backend: 'github-desktop', theme: state.selectedTheme, resolvedTheme: state.currentTheme } }
        else if (group === 'select') { await dispatcher.selectRepository(await adapter.repository(method)) }
        else if (group === 'directory') value = await showOpenDialog({ title: '选择本地 Git 仓库或下载位置', properties: ['openDirectory'] })
        else if (group === 'theme') { if (!['system', 'light', 'dark'].includes(method)) throw new Error('颜色方案无效。'); await dispatcher.setSelectedTheme(method as ApplicationTheme) }
        else if (group === 'presentation') {
          if (method === 'Preferences' || method === 'About' || method === 'Acknowledgements') dispatcher.showPopup({ type: PopupType[method] })
          else if (method === 'RepositorySettings') dispatcher.showPopup({ type: PopupType.RepositorySettings, repository: await adapter.repository((input as { id: string }).id) })
          else throw new Error('界面入口无效。')
        }
        else if (group === 'presence' || group === 'control') value = await presence.command(group, method, input)
        else if (group === 'updates') value = await updates.command(method)
        else if (group === 'diagnostics') {
          const directory = Path.join(await getPath('userData'), 'logs')
          if (method === 'status') value = { directory, retentionHours: 24, maxBytes: 0, limited: false, error: '' }
          else if (method === 'open') { shell.showFolderContents(directory); value = true }
          else if (method === 'record') { log.info(`GitTogether UI ${JSON.stringify(input)}`); value = true }
          else throw new Error("请打开日志目录后复制日志文件。")
        } else throw new Error('此接口不在 GitTogether 的扩展范围内。')
        channel.port1.postMessage({ id, ok: true, value })
      } catch (e) { channel.port1.postMessage({ id, ok: false, error: e instanceof Error ? e.message : String(e) }) }
    }
    frame.contentWindow!.postMessage({ type: 'gittogether:connect' }, '*', [channel.port2])
  })
  return adapter
}
