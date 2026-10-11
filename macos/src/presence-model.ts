import type { RemoteRepository } from './import-model';

export type PresenceFact = 'clean' | 'dirty' | 'unknown';
export type PresenceFile = {
  path: string; git: PresenceFact; editor: PresenceFact; dirty: PresenceFact; pending: boolean;
  tracked: boolean; index: string; worktree: string; activity: 'idle' | 'viewing' | 'editing';
  sources: { sourceId: string; kind: 'unreal' | 'godot'; alive: boolean; unsaved: PresenceFact; activity: 'idle' | 'viewing' | 'editing' }[];
};
export type PresenceProject = { repositoryId: string; worktreeId: string; branch: string | null; head: string | null; gitReady: boolean; files: PresenceFile[] };
export type PresenceSession = { sessionId: string; userId: string; displayName: string; deviceId: string; alive: boolean; lastSeen: number; projects: PresenceProject[] };
export type PresenceStatus = {
  version: 1; enabled: boolean; configured: boolean; serverUrl: string; serverName: string;
  connection: 'disabled' | 'connecting' | 'connected' | 'offline'; error: string; sessions: PresenceSession[];
  bridge: { connected: boolean; error: string; projects: PresenceProject[] };
};
export type PresenceConfiguration = { enabled: boolean; serverUrl: string; serverName: string; serverToken?: string };
export const presenceConnectionLabels: Record<PresenceStatus['connection'], string> = { disabled: '已停用', connecting: '正在连接…', connected: '已连接', offline: '连接已断开，状态未知' };

export function presenceRepositoryId(repository: Pick<RemoteRepository, 'url'>): string {
  const url = new URL(repository.url);
  return `${url.host}${url.pathname.replace(/\/$/, '').replace(/\.git$/, '')}`.toLowerCase();
}
export function presenceProjectSummary(project: PresenceProject, valid: boolean): string {
  const changed = project.files.filter(file => file.git === 'dirty').length;
  const editing = project.files.filter(file => file.editor === 'dirty').length;
  if (!valid) return `状态未知 · 上次 Git 修改 ${changed} · ${project.files.some(file => file.sources.length) ? `编辑器未保存 ${editing}` : '编辑器未接入'}`;
  const git = project.gitReady && !project.files.some(file => file.git === 'unknown' || file.pending) ? `Git 修改 ${changed}` : 'Git 状态未知';
  const editor = !project.files.some(file => file.sources.length) ? '编辑器未接入' : project.files.some(file => file.editor === 'unknown') ? '编辑器状态未知' : `编辑器未保存 ${editing}`;
  return `${git} · ${editor}`;
}
