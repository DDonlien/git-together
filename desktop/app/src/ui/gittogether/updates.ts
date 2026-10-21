import { updateStore, UpdateStatus } from '../lib/update-store'
import type { UpdateStatus as PresentationStatus } from '../../../../../macos/src/update-model'
import { productVersion } from './adapter'
import { gt } from 'semver'

/** Translate the original updater; downloads, verification and installation stay upstream. */
export class DesktopUpdates {
  private error: string | undefined
  public constructor(private readonly canInstall: () => boolean | Promise<boolean>) {
    updateStore.onError(error => { this.error = error.message })
    updateStore.onDidChange(() => { this.error = undefined })
  }
  public status(): PresentationStatus {
    if (__RELEASE_CHANNEL__ === 'development') return { phase: 'unavailable', currentVersion: productVersion, message: '开发版本暂不提供自动更新。' }
    const state = updateStore.state
    const releaseVersion = state.newReleases?.[0]?.latestVersion
    const availableVersion = releaseVersion && gt(releaseVersion, productVersion) ? releaseVersion : undefined
    const phase = this.error ? 'error' : ({
      [UpdateStatus.CheckingForUpdates]: 'checking',
      [UpdateStatus.UpdateAvailable]: 'downloading',
      [UpdateStatus.UpdateNotAvailable]: 'current',
      [UpdateStatus.UpdateReady]: 'ready',
      [UpdateStatus.UpdateNotChecked]: 'idle',
    } as const)[state.status]
    return { phase, currentVersion: productVersion, availableVersion,
      checkedAt: state.lastSuccessfulCheck?.getTime(), message: this.error ?? (phase === 'downloading' ? '正在下载更新，完成后可重启安装。' : phase === 'ready' && !availableVersion ? '更新已下载，重启后完成安装。' : undefined) }
  }
  public async command(method: string): Promise<PresentationStatus> {
    if (__RELEASE_CHANNEL__ === 'development') return this.status()
    if (method === 'check') { this.error = undefined; await updateStore.checkForUpdates(false, true) }
    else if (method === 'download') {
      if (updateStore.state.status === UpdateStatus.UpdateNotChecked) await updateStore.checkForUpdates(false, true)
    } else if (method === 'install') {
      if (!await this.canInstall()) throw new Error('请等待当前操作完成后再安装更新。')
      if (updateStore.state.status !== UpdateStatus.UpdateReady) throw new Error('请等待更新下载完成。')
      updateStore.quitAndInstallUpdate()
      return { ...this.status(), phase: 'installing' }
    } else if (method !== 'status') throw new Error('更新操作无效。')
    return this.status()
  }
}
