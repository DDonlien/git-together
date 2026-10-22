import type { RemoteRepository } from './import-model';
import { usePresence } from './PresenceProvider';
import { presenceProjectSummary, presenceRepositoryId, presenceWorkspaces, presenceWorkspaceConnectionLabels, managedOrganizations, type PresenceProject } from './presence-model';
import { Icon } from './ui';
import { RemoteControlProjects } from './RemoteControlProjects';
import { controlRepositoryId } from './remote-control-model';

function ProjectFiles({ project, valid }: { project: PresenceProject; valid: boolean }) {
  const files = project.files.filter(file => file.git !== 'clean' || file.editor !== 'clean' || file.activity === 'editing');
  return <div className="presence-project"><small>{presenceProjectSummary(project, valid)}</small>{files.length > 0 && <ul className="presence-files">{files.map(file => <li key={file.path}><span>{file.path}</span><small>{!valid ? '状态未知（上次记录）' : [file.git === 'dirty' ? 'Git 修改' : file.git === 'unknown' || file.pending ? 'Git 未知' : '', file.editor === 'dirty' ? '编辑器未保存' : file.editor === 'unknown' ? '编辑器未知' : ''].filter(Boolean).join(' · ')}</small></li>)}</ul>}</div>;
}
export function RepositoryPresence({ repository }: { repository: RemoteRepository }) {
  const presence = usePresence();
  const status = presence?.status;
  if (!status?.enabled) return null;
  const id = presenceRepositoryId(repository);
  const organizations = managedOrganizations(status, id);
  const peers = presenceWorkspaces(status, id);
  const online = peers.filter(peer => peer.connection === 'online').length;
  const unknown = peers.some(peer => peer.connection === 'unknown');
  return <details className="repository-presence-panel"><summary><span className="presence-disclosure"><Icon name="right" size={11} /></span><Icon name="users" size={16} /><span>Presence</span><small>{online ? `${online} 个在线工作区` : status.connection !== 'connected' || unknown ? '协作状态未知' : peers.length ? '暂无在线工作区' : '暂无工作区状态'}</small></summary><div className="presence-projects">
    {peers.map(({ key, displayName, deviceName, isCurrent, serverId, connection, project }) => <div className="presence-session" key={key}><strong>{displayName} ({deviceName}) · {project.branch || '未检出分支'}<span className="presence-session-validity">{isCurrent ? '此电脑' : project.organizationId ? organizations.find(o => o.serverId === serverId && o.id === project.organizationId)?.name : '个人'} · {presenceWorkspaceConnectionLabels[connection]}</span></strong><ProjectFiles project={project} valid={connection === 'online'} /></div>)}
    {!peers.length && <p className="presence-empty">{status.connection === 'connected' ? '尚无这个仓库的工作区状态。' : '连接未就绪，无法确认这个仓库的协作状态。'}</p>}
    {repository.available && <RemoteControlProjects repositoryId={controlRepositoryId(repository.url)} />}
    {status.localError && <p className="presence-error">{status.localError}</p>}
    {(presence?.error || status.error) && <p className="presence-error">{presence?.error || status.error}</p>}
  </div></details>;
}
