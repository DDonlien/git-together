import type { RemoteRepository } from './import-model';
import { usePresence } from './PresenceProvider';
import { managedOrganizations, managedOrganizationKey, presenceRepositoryId, presenceRoleLabels } from './presence-model';
import { Icon, type IconName } from './ui';
import './presence-management.css';

function organizationLabel(organizations: ReturnType<typeof managedOrganizations>) {
  return `托管组织：${organizations.map(o => `${o.name} · ${presenceRoleLabels[o.role]}${o.connected ? '' : '（上次确认）'}`).join('、')}`;
}

export function usePresenceRepositoryIcon(repository: RemoteRepository): { icon: IconName; title?: string } {
  const status = usePresence()?.status;
  // An active Presence identity automatically manages every accessible Git repository.
  // Connection and member activity remain independent indicators.
  if (!status?.enabled || !status.account || !repository.available) return { icon: 'folder' };
  const organizations = managedOrganizations(status, presenceRepositoryId(repository));
  const scope = organizations.length ? organizationLabel(organizations) : '个人账号';
  return { icon: 'folderManaged', title: `Presence管理 · ${scope}` };
}

export function PresenceManagedMark({ repository }: { repository: RemoteRepository }) {
  const organizations = managedOrganizations(usePresence()?.status, presenceRepositoryId(repository));
  if (!organizations.length) return null;
  const label = organizationLabel(organizations);
  return <span className="presence-managed-mark" role="img" aria-label={label} title={label}><Icon name="users" size={11} /></span>;
}
export function PresenceManagedNames({ repository }: { repository: RemoteRepository }) {
  const organizations = managedOrganizations(usePresence()?.status, presenceRepositoryId(repository));
  return <span className="presence-managed-names">{organizations.map(o => <span key={managedOrganizationKey(o)} title={`${o.serverUrl} · 我的角色：${presenceRoleLabels[o.role]}${o.connected ? '' : ' · 连接已断开，上次确认的信息'}`}>{o.name}</span>)}</span>;
}
export function PresenceManagedDetails({ repository }: { repository: RemoteRepository }) {
  const status = usePresence()?.status;
  if (!status?.enabled || !status.account) return null;
  const organizations = managedOrganizations(status, presenceRepositoryId(repository));
  return <div className="presence-managed-details"><span><Icon name="users" size={14} />{status.account.displayName}</span>{organizations.length ? organizations.map(o => <span key={managedOrganizationKey(o)} title={o.serverUrl}>托管组织：{o.name} · {presenceRoleLabels[o.role]}{!o.connected && <small>上次确认</small>}</span>) : <span className="muted">个人身份</span>}</div>;
}
