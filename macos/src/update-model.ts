export const updateSource = { provider: 'github', owner: 'DDonlien', repo: 'git-together', private: false } as const;
export type UpdatePhase = 'unavailable' | 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'ready' | 'installing' | 'error';
export interface UpdateStatus {
  phase: UpdatePhase;
  currentVersion: string;
  availableVersion?: string;
  percent?: number;
  message?: string;
  checkedAt?: number;
}
export interface UpdateBridge {
  status(): Promise<UpdateStatus>;
  check(): Promise<UpdateStatus>;
  download(): Promise<UpdateStatus>;
  install(): Promise<UpdateStatus>;
}

export function updateDescription(status: UpdateStatus): string {
  if (status.message) return status.message;
  switch (status.phase) {
    case 'unavailable': return '请在安装的桌面 App 中检查和安装更新。';
    case 'idle': return '从 GitHub Releases 检查新版。';
    case 'checking': return '正在检查更新…';
    case 'current': return '已是最新版本。';
    case 'available': return `发现新版本 ${status.availableVersion}。`;
    case 'downloading': return `正在下载 ${status.availableVersion}：${Math.floor(status.percent ?? 0)}%`;
    case 'ready': return `新版 ${status.availableVersion} 已下载，重启时校验签名并安装。`;
    case 'installing': return '正在验证更新并准备重启…';
    case 'error': return '更新失败，请重试。';
  }
}
