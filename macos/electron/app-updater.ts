import type { EventEmitter } from 'node:events';
import type { UpdateStatus } from '../src/update-model';
import type { LocalDiagnostics } from '../server/diagnostics';
import { diagnosticCode } from '../src/diagnostics-model';

// The updater owns networking, SHA-512 validation and native signed installation;
// this controller exposes only user-initiated lifecycle actions to the renderer.
export type UpdateEngine = EventEmitter & {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowDowngrade: boolean;
  allowPrerelease: boolean;
  disableDifferentialDownload: boolean;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(): void;
};

export class AppUpdater {
  private state: UpdateStatus;
  private operation: 'check' | 'download' | 'install' = 'check';
  private started = 0;
  constructor(private engine: UpdateEngine | null, version: string, private canInstall: () => boolean, private diagnostics?: Pick<LocalDiagnostics, 'record'>) {
    this.state = { phase: engine ? 'idle' : 'unavailable', currentVersion: version };
    if (!engine) return;
    engine.autoDownload = false;
    engine.autoInstallOnAppQuit = false;
    engine.allowDowngrade = false;
    engine.allowPrerelease = false;
    // Initial releases ship full ZIPs, not blockmaps or a differential feed.
    engine.disableDifferentialDownload = true;
    engine.on('update-available', (info: { version: string }) => this.set({ phase: 'available', availableVersion: info.version, checkedAt: Date.now() }));
    engine.on('update-not-available', () => this.set({ phase: 'current', checkedAt: Date.now() }));
    engine.on('download-progress', (info: { percent: number }) => {
      if (this.state.phase === 'downloading') this.set({ percent: Math.max(0, Math.min(100, info.percent)) });
    });
    engine.on('update-downloaded', (info: { version: string }) => this.set({ phase: 'ready', availableVersion: info.version, percent: 100 }));
    engine.on('error', (error: Error) => this.failed(error));
  }
  status(): UpdateStatus { return { ...this.state }; }
  private set(change: Partial<UpdateStatus>) {
    this.state = { ...this.state, message: undefined, ...change };
    if (change.phase === 'available' || change.phase === 'current' || change.phase === 'ready' || change.phase === 'installing') this.diagnostics?.record({ event: 'update', outcome: change.phase, method: this.operation, durationMs: Math.round(performance.now() - this.started) });
  }
  private failed(error: unknown) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    // GitHubProvider may wrap a missing stable release as INVALID_RELEASE_FEED.
    // Never treat all such failures as missing releases or expose its raw XML/URLs.
    const message = code === 'ERR_UPDATER_LATEST_VERSION_NOT_FOUND' || code === 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND' || code === 'ERR_UPDATER_NO_PUBLISHED_VERSIONS'
      ? 'GitHub 暂时没有可用的更新发布，请稍后重试。'
      : code === 'ERR_UPDATER_INVALID_RELEASE_FEED' || code === 'ERR_XML_MISSED_ELEMENT' || code === 'ERR_UPDATER_ZIP_FILE_NOT_FOUND'
        ? '无法读取 GitHub 更新发布信息，请确认正式版本、更新清单和安装包已公开发布。'
        : this.operation === 'check' ? '无法检查 GitHub 更新，请检查网络或稍后重试。'
          : this.operation === 'download' ? '更新下载或校验失败，请重新检查并下载。尚未安装更新。'
            : '更新安装失败，请确认应用位于可写目录且新版签名与当前应用一致，再重试。';
    const safeCode = diagnosticCode(error);
    console.error('GitTogether update failed:', safeCode);
    this.diagnostics?.record({ event: 'update', outcome: 'failure', method: this.operation, code: safeCode, durationMs: Math.round(performance.now() - this.started) });
    this.set({ phase: 'error', message });
  }
  async check() {
    if (!this.engine || ['checking', 'available', 'downloading', 'ready', 'installing'].includes(this.state.phase)) return this.status();
    this.operation = 'check';
    this.started = performance.now(); this.diagnostics?.record({ event: 'update', outcome: 'start', method: 'check' });
    this.state = { phase: 'checking', currentVersion: this.state.currentVersion };
    try { await this.engine.checkForUpdates(); }
    catch (error) { this.failed(error); }
    return this.status();
  }
  async download() {
    if (!this.engine || this.state.phase !== 'available') return this.status();
    this.operation = 'download';
    this.started = performance.now(); this.diagnostics?.record({ event: 'update', outcome: 'start', method: 'download' });
    this.set({ phase: 'downloading', percent: 0 });
    try { await this.engine.downloadUpdate(); }
    catch (error) { this.failed(error); }
    return this.status();
  }
  install() {
    if (!this.engine || this.state.phase !== 'ready') return this.status();
    if (!this.canInstall()) {
      this.diagnostics?.record({ event: 'update', outcome: 'blocked', method: 'install' });
      this.set({ message: '账号或仓库操作正在进行，请完成后再重启更新。' });
      return this.status();
    }
    this.operation = 'install';
    this.started = performance.now();
    this.set({ phase: 'installing' });
    try { this.engine.quitAndInstall(); }
    catch (error) { this.failed(error); }
    return this.status();
  }
}
