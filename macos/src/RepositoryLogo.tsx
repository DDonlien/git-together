import { Icon } from './ui';

export function RepositoryLogo({ presence = 'offline', size = 18 }: { presence?: 'offline' | 'online' | 'attention'; size?: number }) {
  const label = presence === 'online' ? 'Presence 已连接' : presence === 'attention' ? 'Presence 需要注意' : 'Presence 尚未连接';
  return <span className="repository-logo" title={label} aria-label={label}><Icon name="folder" size={size} /><span className={`repository-presence ${presence}`} aria-hidden="true" /></span>;
}
