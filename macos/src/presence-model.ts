import type { RemoteRepository } from './import-model';

export type PresenceFact = 'clean' | 'dirty' | 'unknown';
export type PresenceFile = {
  path: string; git: PresenceFact; editor: PresenceFact; dirty: PresenceFact; pending: boolean;
  tracked: boolean; index: string; worktree: string; activity: 'idle' | 'viewing' | 'editing';
  sources: { sourceId: string; kind: 'unreal' | 'godot'; alive: boolean; unsaved: PresenceFact; activity: 'idle' | 'viewing' | 'editing' }[];
};
export type PresenceProject = { repositoryId: string; worktreeId: string; branch: string | null; head: string | null; gitReady: boolean; unpublishedCommits: number | null; files: PresenceFile[] };
export type PresenceSession = { sessionId: string; userId: string; displayName: string; avatarUrl: string | null; deviceId: string; alive: boolean; lastSeen: number; projects: PresenceProject[] };
export type PresenceStatus = {
  version: 1; enabled: boolean; configured: boolean; serverUrl: string; serverName: string;
  connection: 'disabled' | 'connecting' | 'connected' | 'offline'; error: string; sessions: PresenceSession[];
  bridge: { connected: boolean; error: string; projects: PresenceProject[] };
  account?: { id: string; email: string; displayName: string; emailVerified: boolean; expiresAt: number; repositories: string[]; mode: 'personal' | 'hosted' } | null;
  accountService?: { version: 1; mode: 'personal' | 'hosted'; organizationManagement: boolean; registrationAvailable: boolean; setupRequired: boolean } | null;
  localRepositories?: { id: string; name: string; remoteId: string; bound: boolean }[];
};
export type PresenceAccountMethod = 'accountStatus' | 'register' | 'login' | 'logout' | 'bindRepository' | 'password';
export type PresenceMethod = 'status' | 'configure' | 'reconnect' | PresenceAccountMethod;
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

export type PresenceWorkState = 'editing' | 'changed' | 'committed';
export type PresencePerson = {
  userId: string; displayName: string; avatarUrl: string | null; state: PresenceWorkState;
  branches: { branch: string | null; state: PresenceWorkState }[];
};
export const presenceWorkLabels: Record<PresenceWorkState, string> = { editing: '编辑中', changed: '有未 Commit 更改', committed: '有未 Push 提交' };
const workPriority: Record<PresenceWorkState, number> = { editing: 3, changed: 2, committed: 1 };

function projectWorkState(project: PresenceProject): PresenceWorkState | null {
  if (project.files.some(file => file.activity === 'editing')) return 'editing';
  if (project.gitReady && project.files.some(file => file.git === 'dirty' && !file.pending)) return 'changed';
  return project.gitReady && project.unpublishedCommits !== null && project.unpublishedCommits > 0 ? 'committed' : null;
}

export function presencePeople(status: PresenceStatus | null, repositoryId: string, branch?: string): PresencePerson[] {
  if (!status?.enabled || status.connection !== 'connected') return [];
  const people = new Map<string, PresencePerson>();
  for (const session of status.sessions) {
    if (!session.alive) continue;
    for (const project of session.projects) {
      if (project.repositoryId.toLowerCase() !== repositoryId || (branch !== undefined && project.branch !== branch)) continue;
      const state = projectWorkState(project);
      if (!state) continue;
      let person = people.get(session.userId);
      if (!person) {
        person = { userId: session.userId, displayName: session.displayName, avatarUrl: session.avatarUrl, state, branches: [] };
        people.set(session.userId, person);
      }
      if (workPriority[state] > workPriority[person.state]) person.state = state;
      const existing = person.branches.find(value => value.branch === project.branch);
      if (!existing) person.branches.push({ branch: project.branch, state });
      else if (workPriority[state] > workPriority[existing.state]) existing.state = state;
    }
  }
  return [...people.values()].sort((a, b) => a.userId.localeCompare(b.userId)).map(person => ({ ...person, branches: person.branches.sort((a, b) => (a.branch || '').localeCompare(b.branch || '')) }));
}

export function presenceRepositoryColor(repositoryId: string): string {
  let hash = 2166136261;
  for (const char of repositoryId) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `hsl(${(hash >>> 0) % 360} 62% 52%)`;
}
