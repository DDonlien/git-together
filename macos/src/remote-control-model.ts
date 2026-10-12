export type RemoteAction = 'commit' | 'submit' | 'abort' | 'discard';
export type ControlWorkspace = { id: string; repositoryId: string; branch: string; head: string; teamId: string | null; scopeVersion?: number; actions: RemoteAction[] };
export type ControlDevice = { deviceId: string; userId: string; identityId?: string; serverId?: string; isCurrent?: boolean; name: string; online: boolean; lastSeen: number; workspaces: ControlWorkspace[] };
export type RemoteFile = { path: string; fromPath?: string | null; status: string; tracked: boolean };
export type ControlResult = {
  branch?: string;
  previewId?: string; expiresAt?: number; files?: RemoteFile[]; summary?: string; description?: string;
  aiError?: string; operation?: 'none' | 'merge' | 'rebase'; running?: boolean; cancelRequested?: boolean;
  phase?: 'prepared' | 'committed' | 'pushed' | 'aborted' | 'discarded' | 'restored' | 'interrupted';
  commitId?: string; pushed?: boolean; backupId?: string; warning?: string; head?: string; changeKey?: string;
};
export type ControlJob = {
  previousId?: string;
  serverId?: string;
  organizationId?: string | null;
  scopeVersion?: number | null;
  id: string; deviceId: string; workspaceId: string; repositoryId: string; action: RemoteAction;
  kind: 'preview' | 'generate' | 'execute' | 'retryPush' | 'restore';
  status: 'queued' | 'running' | 'done' | 'failed' | 'expired'; expiresAt: number; result: ControlResult | null; error: string;
};
export function controlRepositoryId(input: string): string {
  const url = new URL(input);
  return (url.host + url.pathname.replace(/\/$/, '')).toLowerCase();
}
export type ControlStatus = {
  enabled: boolean; registered: boolean; deviceId: string; userId: string; name: string;
  connection: 'disabled' | 'connected' | 'offline'; error: string;
  devices: ControlDevice[]; jobs: ControlJob[]; repositories: string[];
  teams: { id: string; name?: string; role?: string; serverId?: string; projects: string[] }[];
  localRepositories: { id: string; name: string; remoteId: string; enabled: boolean; teamId: string | null }[];
};
export const remoteActionLabels: Record<RemoteAction, string> = { commit: 'Commit', submit: 'Submit', abort: '中止操作', discard: '丢弃更改' };
export function controlJobLabel(job: ControlJob): string {
  if (job.status === 'queued') return '等待目标设备';
  if (job.status === 'running') return ['preview', 'generate'].includes(job.kind) ? '正在准备更改清单…' : '目标正在执行…';
  if (job.status === 'failed' || job.status === 'expired') return job.error || '远端操作未完成';
  switch (job.result?.phase) {
    case 'prepared': return '预览已准备';
    case 'committed': return job.action === 'submit' ? '已提交，推送未确认' : '已提交';
    case 'pushed': return '已提交并推送';
    case 'aborted': return job.result.cancelRequested ? '已请求中止，等待安全收尾' : '已中止';
    case 'discarded': return '已丢弃，备份已保留';
    case 'restored': return '已恢复';
    case 'interrupted': return '执行被打断，请查看目标状态';
    default: return '操作已结束';
  }
}
