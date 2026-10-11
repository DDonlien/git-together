import { Icon } from './ui';
import { usePresence } from './PresenceProvider';
import { presenceRepositoryId } from './presence-model';
import type { RemoteRepository } from './import-model';

export function RepositoryLogo({ repository, size = 18 }: { repository: RemoteRepository; size?: number }) {
  const controller = usePresence();
  const status = controller?.status;
  const id = presenceRepositoryId(repository);
  const online = status?.connection === 'connected' && !controller?.error && status.sessions.some(session => session.alive && session.projects.some(project => project.repositoryId.toLowerCase() === id));
  const presence = online ? 'online' : status?.connection === 'connected' && !controller?.error ? 'offline' : 'attention';
  const label = !status?.enabled ? undefined : online ? 'Presence：此仓库有在线协作工作区' : presence === 'offline' ? 'Presence：此仓库暂无在线协作会话' : 'Presence：协作连接未就绪，状态未知';
  return <span className="repository-logo" title={label}><Icon name="folder" size={size} />{status?.enabled && <span className={`repository-presence ${presence}`} aria-label={label} />}</span>;
}
