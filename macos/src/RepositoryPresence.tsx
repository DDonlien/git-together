import type { RemoteRepository } from './import-model';
import { usePresence } from './PresenceProvider';
import { presenceProjectSummary, presenceRepositoryId, type PresenceProject } from './presence-model';
import { Icon } from './ui';

function ProjectFiles({ project, valid }: { project: PresenceProject; valid: boolean }) {
  const files = project.files.filter(file => file.git !== 'clean' || file.editor !== 'clean' || file.activity === 'editing');
  return <div className="presence-project"><small>{presenceProjectSummary(project, valid)}</small>{files.length > 0 && <ul className="presence-files">{files.map(file => <li key={file.path}><span>{file.path}</span><small>{!valid ? '状态未知（上次记录）' : [file.git === 'dirty' ? 'Git 修改' : file.git === 'unknown' || file.pending ? 'Git 未知' : '', file.editor === 'dirty' ? '编辑器未保存' : file.editor === 'unknown' ? '编辑器未知' : ''].filter(Boolean).join(' · ')}</small></li>)}</ul>}</div>;
}
export function RepositoryPresence({ repository }: { repository: RemoteRepository }) {
  const presence = usePresence();
  const status = presence?.status;
  if (!status?.enabled) return null;
  const id = presenceRepositoryId(repository);
  const local = status.bridge.projects.filter(project => project.repositoryId.toLowerCase() === id);
  const peers = status.sessions.flatMap(session => session.projects.filter(project => project.repositoryId.toLowerCase() === id).map(project => ({ session, project })));
  const online = peers.filter(peer => status.connection === 'connected' && peer.session.alive).length;
  return <details className="repository-presence-panel"><summary><span className="presence-disclosure"><Icon name="right" size={11} /></span><Icon name="users" size={16} /><span>Presence</span><small>{online ? `${online} 个在线工作区` : status.connection === 'connected' ? '暂无在线协作' : '协作状态未知'}</small></summary><div className="presence-projects">
    {local.map(project => <div className="presence-session" key={`local:${project.worktreeId}`}><strong>此电脑 · {project.branch || '未检出分支'}</strong><ProjectFiles project={project} valid={status.bridge.connected} /></div>)}
    {peers.map(({ session, project }) => <div className="presence-session" key={`${session.sessionId}:${project.worktreeId}`}><strong>{session.displayName} · {project.branch || '未检出分支'}<span className="presence-session-validity">{status.connection === 'connected' && session.alive ? '在线' : '离线，状态未知'}</span></strong><ProjectFiles project={project} valid={status.connection === 'connected' && session.alive} /></div>)}
    {!local.length && !peers.length && <p className="presence-empty">{status.connection === 'connected' ? '尚无这个仓库的协作会话。' : '连接未就绪，无法确认这个仓库的协作状态。'}</p>}
    {(presence?.error || status.error) && <p className="presence-error">{presence?.error || status.error}</p>}
  </div></details>;
}
