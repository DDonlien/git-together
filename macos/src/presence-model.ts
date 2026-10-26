import type { RemoteRepository } from './import-model';

export type PresenceFact = 'clean' | 'dirty' | 'unknown';
export type PresenceFile = {
  path: string; git: PresenceFact; editor: PresenceFact; dirty: PresenceFact; pending: boolean;
  tracked: boolean; index: string; worktree: string; activity: 'idle' | 'viewing' | 'editing';
  sources: { sourceId: string; kind: 'unreal' | 'godot'; alive: boolean; unsaved: PresenceFact; activity: 'idle' | 'viewing' | 'editing' }[];
};
export type PresenceProject = { repositoryId: string; worktreeId: string; branch: string | null; head: string | null; gitReady: boolean; unpublishedCommits: number | null; files: PresenceFile[]; organizationId?: string | null };
export type PresenceSession = { sessionId: string; userId: string; identityId?: string; serverId?: string; isCurrent?: boolean; displayName: string; avatarUrl: string | null; deviceId: string; deviceName?: string | null; alive: boolean; lastSeen: number; projects: PresenceProject[] };
export type PresenceOrganization = { id: string; name: string; role: 'owner' | 'admin' | 'member'; projects: string[]; revision: number; serverId: string; serverUrl: string; connected: boolean };
export type PresenceServer = { id: string; url: string; enabled: boolean; connection: 'disabled' | 'connecting' | 'connected' | 'offline'; error: string };
export type PresenceStatus = {
  version: 1; enabled: boolean; configured: boolean; serverUrl: string; serverName: string;
  connection: 'disabled' | 'connecting' | 'connected' | 'offline'; error: string; localError?: string; sessions: PresenceSession[];
  bridge: { connected: boolean; error: string; projects: PresenceProject[] };
  local?: { deviceId: string; deviceName: string; connected: boolean; projects: PresenceProject[] } | null;
  account?: { id: string; identityId?: string; issuer?: string; subject?: string; email: string; displayName: string; emailVerified: boolean; expiresAt: number; repositories: string[]; mode: 'personal' | 'hosted' } | null;
  servers?: PresenceServer[];
  organizations?: PresenceOrganization[];
  accountService?: { version: 1; mode: 'personal' | 'hosted'; organizationManagement: boolean; registrationAvailable: boolean; setupRequired: boolean } | null;
  localRepositories?: { id: string; name: string; remoteId: string; bound: boolean }[];
};
export type PresenceAccountMethod = 'accountStatus' | 'register' | 'login' | 'logout' | 'openAccount';
export type PresenceServerMethod = 'addServer' | 'selectServer' | 'removeServer';
export type PresenceMethod = 'status' | 'configure' | 'reconnect' | PresenceAccountMethod | PresenceServerMethod;
export type PresenceConfiguration = { enabled: boolean };
export const presenceConnectionLabels: Record<PresenceStatus['connection'], string> = { disabled: '已停用', connecting: '正在连接…', connected: '已连接', offline: '连接已断开，状态未知' };

export function presenceRepositoryId(repository: Pick<RemoteRepository, 'url'>): string {
  const url = new URL(repository.url);
  return `${url.host}${url.pathname.replace(/\/$/, '')}`.toLowerCase();
}
export const presenceRoleLabels = { owner: '所有者', admin: '管理员', member: '成员' } as const;
export function managedOrganizations(status: PresenceStatus | null | undefined, repositoryId: string): PresenceOrganization[] {
  return status?.enabled ? (status.organizations || []).filter(o => o.projects.includes(repositoryId)) : [];
}
export function managedOrganizationKey(organization: PresenceOrganization): string { return `${organization.serverId}:${organization.id}`; }
export function presenceProjectSummary(project: PresenceProject, valid: boolean): string {
  const changed = project.files.filter(file => file.git === 'dirty').length;
  const editing = project.files.filter(file => file.editor === 'dirty').length;
  if (!valid) return `状态未知 · 上次 Git 修改 ${changed} · ${project.files.some(file => file.sources.length) ? `编辑器未保存 ${editing}` : '编辑器未接入'}`;
  const git = project.gitReady && !project.files.some(file => file.git === 'unknown' || file.pending) ? `Git 修改 ${changed}` : 'Git 状态未知';
  const editor = !project.files.some(file => file.sources.length) ? '编辑器未接入' : project.files.some(file => file.editor === 'unknown') ? '编辑器状态未知' : `编辑器未保存 ${editing}`;
  return `${git} · ${editor}`;
}

export type PresenceWorkState = 'editing' | 'changed' | 'committed';
export type PresenceWorkCounts = { editingFiles: number; changedFiles: number; unpublishedCommits: number };
const emptyWorkCounts = (): PresenceWorkCounts => ({ editingFiles: 0, changedFiles: 0, unpublishedCommits: 0 });
export type PresenceBranch = {
  branch: string | null; counts: PresenceWorkCounts;
  sources: ({ serverId?: string; userId: string; identityId?: string; deviceId: string; worktreeId: string; organizationId: string | null } & PresenceWorkCounts)[];
};
export type PresencePerson = {
  userId: string; displayName: string; avatarUrl: string | null; state: PresenceWorkState;
  branches: PresenceBranch[];
  deviceName: string;
};
const workPriority: Record<PresenceWorkState, number> = { editing: 3, changed: 2, committed: 1 };

function projectWorkState(project: PresenceProject): PresenceWorkState | null {
  if (project.files.some(file => file.activity === 'editing')) return 'editing';
  if (project.gitReady && project.files.some(file => file.git === 'dirty' && !file.pending)) return 'changed';
  return project.gitReady && project.unpublishedCommits !== null && project.unpublishedCommits > 0 ? 'committed' : null;
}

export type PresenceWorkspaceConnection = 'online' | 'offline' | 'unknown';
export const presenceWorkspaceConnectionLabels = { online: '在线', offline: '离线', unknown: '状态未知' } as const;
export function presenceSessionConnection(status: PresenceStatus, session: PresenceSession): PresenceWorkspaceConnection {
  if (!status.enabled || status.connection !== 'connected' || session.serverId && status.servers && !status.servers.some(server => server.id === session.serverId && server.enabled && server.connection === 'connected')) return 'unknown';
  return session.alive ? 'online' : 'offline';
}

export function presencePeople(status: PresenceStatus | null, repositoryId: string, branch?: string, { excludeCurrent = false }: { excludeCurrent?: boolean } = {}): PresencePerson[] {
  if (!status?.enabled || status.connection !== 'connected') return [];
  const people = new Map<string, PresencePerson>();
  for (const session of status.sessions) {
    if (presenceSessionConnection(status, session) !== 'online' || excludeCurrent && session.isCurrent) continue;
    for (const project of session.projects) {
      if (project.repositoryId.toLowerCase() !== repositoryId || (branch !== undefined && project.branch !== branch)) continue;
      const state = projectWorkState(project);
      if (!state) continue;
      const key = JSON.stringify([session.serverId || '', project.organizationId || null, session.identityId || session.userId, session.deviceId]);
      let person = people.get(key);
      if (!person) {
        person = { userId: key, displayName: session.displayName, avatarUrl: session.avatarUrl, state, branches: [], deviceName: session.deviceName?.trim() || '设备未知' };
        people.set(key, person);
      }
      if (workPriority[state] > workPriority[person.state]) person.state = state;
      let existing = person.branches.find(value => value.branch === project.branch);
      if (!existing) {
        existing = { branch: project.branch, counts: emptyWorkCounts(), sources: [] };
        person.branches.push(existing);
      }
      if (!existing.sources.some(source => source.deviceId === session.deviceId && source.worktreeId === project.worktreeId)) {
        const counts: PresenceWorkCounts = {
          editingFiles: project.files.filter(file => file.activity === 'editing').length,
          changedFiles: project.gitReady ? project.files.filter(file => file.git === 'dirty' && !file.pending).length : 0,
          unpublishedCommits: project.gitReady && project.unpublishedCommits !== null ? Math.max(0, project.unpublishedCommits) : 0,
        };
        existing.sources.push({ serverId: session.serverId, userId: session.userId, identityId: session.identityId, deviceId: session.deviceId, worktreeId: project.worktreeId, organizationId: project.organizationId ?? null, ...counts });
        existing.counts.editingFiles += counts.editingFiles;
        existing.counts.changedFiles += counts.changedFiles;
        existing.counts.unpublishedCommits += counts.unpublishedCommits;
      }
    }
  }
  return [...people.values()].sort((a, b) => a.userId.localeCompare(b.userId)).map(person => ({ ...person, branches: person.branches.sort((a, b) => (a.branch || '').localeCompare(b.branch || '')) }));
}

export type PresenceWorkspace = {
  key: string; displayName: string; deviceName: string; isCurrent: boolean; connection: PresenceWorkspaceConnection; serverId?: string; project: PresenceProject;
};
export function presenceWorkspaces(status: PresenceStatus | null, repositoryId: string): PresenceWorkspace[] {
  if (!status?.enabled) return [];
  const local = status.local;
  const projects = local?.projects.filter(project => project.repositoryId.toLowerCase() === repositoryId) || [];
  const workspaces: PresenceWorkspace[] = projects.map(project => ({
    key: `local:${project.worktreeId}`, displayName: status.account?.displayName || '我', deviceName: local!.deviceName,
    isCurrent: true, connection: local!.connected ? 'online' : 'unknown', project,
  }));
  for (const session of status.sessions) for (const project of session.projects) {
    if (project.repositoryId.toLowerCase() !== repositoryId || session.isCurrent && projects.some(local => local.worktreeId === project.worktreeId)) continue;
    workspaces.push({
      key: JSON.stringify([session.serverId, project.organizationId, session.sessionId, project.worktreeId]),
      displayName: session.displayName, deviceName: session.deviceName?.trim() || '设备未知',
      isCurrent: session.isCurrent === true, connection: presenceSessionConnection(status, session), serverId: session.serverId, project,
    });
  }
  return workspaces;
}
