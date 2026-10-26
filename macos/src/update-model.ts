// Release assets are built from this Git branch; GitHub Releases remains the
// download feed (a Git branch is not an electron-updater channel).
export const releaseBranch = 'main';
export const updateSource = { provider: 'github', owner: 'DDonlien', repo: 'git-together', private: false } as const;
export type UpdatePhase = 'unavailable' | 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'ready' | 'installing' | 'error';
export interface UpdateStatus {
  phase: UpdatePhase;
  currentVersion: string;
  availableVersion?: string;
  percent?: number;
  downloadedBytes?: number;
  totalBytes?: number;
  bytesPerSecond?: number;
  progressUpdatedAt?: number;
  message?: string;
  checkedAt?: number;
}
export interface UpdateBridge {
  status(): Promise<UpdateStatus>;
  check(): Promise<UpdateStatus>;
  download(): Promise<UpdateStatus>;
  install(): Promise<UpdateStatus>;
}

export function updateProgressPercent(status: UpdateStatus): number | undefined {
  if (status.percent !== undefined && Number.isFinite(status.percent)) {
    return Math.max(0, Math.min(100, status.percent));
  }
  if (
    status.downloadedBytes !== undefined &&
    status.totalBytes !== undefined &&
    status.totalBytes > 0
  ) {
    return Math.max(
      0,
      Math.min(100, (status.downloadedBytes / status.totalBytes) * 100)
    );
  }
  return undefined;
}

export function formatUpdateBytes(bytes: number): string {
  let value = Math.max(0, Number.isFinite(bytes) ? bytes : 0);
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) { value /= 1000; unit++; }
  if (unit === 0) return `${Math.round(value)} B`;
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[unit]}`;
}

export function updateTransferDescription(status: UpdateStatus, now = Date.now()): string {
  const parts: string[] = [];
  const total =
    status.totalBytes !== undefined && status.totalBytes > 0
      ? status.totalBytes
      : undefined;
  if (status.downloadedBytes !== undefined || total !== undefined) {
    const downloaded = status.downloadedBytes === undefined ? '容量未知' : formatUpdateBytes(status.downloadedBytes);
    parts.push(
      total === undefined
        ? `已下载 ${downloaded} / 总容量未知`
        : `已下载 ${downloaded} / ${formatUpdateBytes(total)}`
    );
  } else {
    parts.push('正在读取下载容量…');
  }
  const percent = updateProgressPercent(status);
  if (percent !== undefined) parts.push(`${percent.toFixed(1)}%`);
  else if (status.phase === 'downloading') parts.push('进度计算中');
  if (status.phase === 'downloading') {
    const speed = status.progressUpdatedAt !== undefined && now - status.progressUpdatedAt >= 2000
      ? 0 : status.bytesPerSecond;
    parts.push(
      speed === undefined
        ? '速度计算中'
        : `${formatUpdateBytes(speed)}/s`
    );
  }
  return parts.join(' · ');
}

export function updateDescription(status: UpdateStatus): string {
  if (status.message) return status.message;
  switch (status.phase) {
    case 'unavailable': return '请在安装的桌面 App 中检查和安装更新。';
    case 'idle': return '从 GitHub Releases 检查新版。';
    case 'checking': return '正在检查更新…';
    case 'current': return '已是最新版本。';
    case 'available': return `发现新版本 ${status.availableVersion}。`;
    case 'downloading': return `正在下载 ${status.availableVersion}…`;
    case 'ready': return `新版 ${status.availableVersion} 已下载，重启时校验签名并安装。`;
    case 'installing': return '正在验证更新并准备重启…';
    case 'error': return '更新失败，请重试。';
  }
}
