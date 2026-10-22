import { Icon } from './ui';
import { usePresence } from './PresenceProvider';
import { presenceRepositoryId, presenceWorkspaces } from './presence-model';
import type { RemoteRepository } from './import-model';
import { usePresenceRepositoryIcon } from './PresenceManaged';

export function RepositoryLogo({ repository, size = 18 }: { repository: RemoteRepository; size?: number }) {
  const folder = usePresenceRepositoryIcon(repository);
  const controller = usePresence();
  const status = controller?.status;
  const id = presenceRepositoryId(repository);
  const peers = presenceWorkspaces(status || null, id).filter(workspace => !workspace.isCurrent);
  const online = peers.some(peer => peer.connection === 'online');
  const presence = online ? 'online' : peers.some(peer => peer.connection === 'unknown') ? 'attention' : 'offline';
  const label = !peers.length ? undefined : online ? 'Presence：此仓库有其他在线协作工作区' : presence === 'offline' ? 'Presence：其他协作设备已离线' : 'Presence：其他设备的协作状态未知';
  return <span className="repository-logo" title={[folder.title, label].filter(Boolean).join(' · ') || undefined}><Icon name={folder.icon} size={size} />{peers.length > 0 && <span className={`repository-presence ${presence}`} aria-label={label} />}</span>;
}
