import { accountLabel, type Catalog } from './import-model';
import { RepositoryLogo } from './RepositoryLogo';
import { PresenceAvatars } from './PresenceAvatars';
import { RepositoryPinButton } from './RepositoryPinButton';
import { Icon } from './ui';

export function AccountSidebar({ catalog, collapsedAccounts, pinnedRepositories, loading, selectedRepositoryId, onToggleAccount, onTogglePin, onOpen }: {
  catalog: Catalog;
  collapsedAccounts: string[];
  pinnedRepositories: readonly string[];
  loading: boolean;
  selectedRepositoryId?: string;
  onToggleAccount: (id: string) => void;
  onTogglePin: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const pinned = new Set(pinnedRepositories);
  return <nav className="account-sidebar-list" aria-label="账号与仓库">
    {catalog.accounts.map(account => {
      const collapsed = collapsedAccounts.includes(account.id);
      const repositories = catalog.repositories.filter(repo => repo.accountId === account.id).sort((a, b) => Number(pinned.has(b.id)) - Number(pinned.has(a.id)));
      return <section className="sidebar-account" key={account.id}>
        <button className="sidebar-account-toggle" aria-expanded={!collapsed} aria-controls={`account-${account.id}`} aria-label={accountLabel(account)} title={accountLabel(account)} onClick={() => onToggleAccount(account.id)}>
          <span className="sidebar-account-disclosure" aria-hidden="true"><Icon name={collapsed ? 'right' : 'down'} size={11} /></span><span className="sidebar-account-name">{account.name}</span><small>{repositories.length}</small>
        </button>
        {!collapsed && <div id={`account-${account.id}`} className="sidebar-account-repositories">
          {repositories.map(repo => <div key={repo.id} className="sidebar-repository-entry"><button className={`nav-item repository-item ${repo.id === selectedRepositoryId ? 'active' : ''}`} title={repo.fullName} aria-label={repo.available ? repo.name : `${repo.name}（不可访问）`} onClick={() => onOpen(repo.id)}>
            <RepositoryLogo repository={repo} /><span>{repo.name}</span>{!repo.available && <Icon name="warning" size={13} />}
          </button><PresenceAvatars repository={repo} excludeCurrent /><RepositoryPinButton name={repo.fullName} pinned={pinned.has(repo.id)} onToggle={() => onTogglePin(repo.id)} /></div>)}
          {!repositories.length && <p className="sidebar-account-empty">{account.error ? '仓库读取失败' : '此账号暂无仓库'}</p>}
        </div>}
      </section>;
    })}
    {!loading && !catalog.accounts.length && <p className="sidebar-no-accounts">从设置添加账号</p>}
  </nav>;
}
