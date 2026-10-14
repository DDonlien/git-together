import type { PresenceBranch } from './presence-model';

export type RemoteAction = 'commit' | 'submit' | 'abort' | 'discard';
export type ControlWorkspace = { id: string; repositoryId: string; branch: string; head: string; teamId: string | null; worktreeId?: string; scopeVersion?: number; actions: RemoteAction[] };
export type ControlDevice = { deviceId: string; userId: string; identityId?: string; serverId?: string; isCurrent?: boolean; name: string; online: boolean; lastSeen: number; workspaces: ControlWorkspace[] };
export type RemoteTarget = { device: ControlDevice; workspace: ControlWorkspace };
export type RemoteActionTarget = RemoteTarget & { action: RemoteAction };
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
  servers?: { serverId: string; connection: 'disabled' | 'connected' | 'offline' }[];
  teams: { id: string; name?: string; role?: string; serverId?: string; projects: string[] }[];
  localRepositories: { id: string; name: string; remoteId: string; enabled: boolean; teamId: string | null }[];
};
// Keep current-device labels and remote targets on the same scoped identity match.
export function presenceDeviceSources(device: ControlDevice, branch: PresenceBranch): PresenceBranch['sources'] {
  return branch.sources.filter(source => source.serverId === device.serverId && source.deviceId === device.deviceId && source.userId === device.userId && (!source.identityId || source.identityId === device.identityId));
}
export function presenceRemoteTargets(status: ControlStatus | null | undefined, repositoryId: string, branch: PresenceBranch): RemoteTarget[] {
  if (!status?.enabled) return [];
  return status.devices.filter(device => !device.isCurrent && device.deviceId !== status.deviceId).flatMap(device => {
    const sources = presenceDeviceSources(device, branch);
    if (!sources.length) return [];
    const workspaces = device.workspaces.filter(workspace => workspace.repositoryId === repositoryId && workspace.branch === (branch.branch ?? 'Detached HEAD') && workspace.actions.length > 0 && sources.some(source => source.organizationId === workspace.teamId));
    // Older devices omit worktreeId; only a unique branch target is unambiguous.
    return workspaces.filter(workspace => workspace.worktreeId ? sources.some(source => source.worktreeId === workspace.worktreeId && source.organizationId === workspace.teamId) : workspaces.length === 1).map(workspace => ({ device, workspace }));
  });
}
export function controlDeviceOnline(status: ControlStatus, device: ControlDevice): boolean {
  return status.enabled && device.online && status.connection === 'connected' && (!device.serverId || !status.servers || status.servers.some(server => server.serverId === device.serverId && server.connection === 'connected'));
}
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
