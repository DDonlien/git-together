import { accountLabel, type Catalog } from './import-model';
import { RepositoryLogo } from './RepositoryLogo';
import { Icon } from './ui';

export function AccountSidebar({ catalog, collapsedAccounts, loading, selectedRepositoryId, onToggleAccount, onOpen }: {
  catalog: Catalog;
  collapsedAccounts: string[];
  loading: boolean;
  selectedRepositoryId?: string;
  onToggleAccount: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  return <nav className="account-sidebar-list" aria-label="账号与仓库">
    {catalog.accounts.map(account => {
      const collapsed = collapsedAccounts.includes(account.id);
      const repositories = catalog.repositories.filter(repo => repo.accountId === account.id);
      return <section className="sidebar-account" key={account.id}>
        <button className="sidebar-account-toggle" aria-expanded={!collapsed} aria-controls={`account-${account.id}`} aria-label={accountLabel(account)} title={accountLabel(account)} onClick={() => onToggleAccount(account.id)}>
          <span className="sidebar-account-disclosure" aria-hidden="true"><Icon name={collapsed ? 'right' : 'down'} size={11} /></span><span className="sidebar-account-name">{account.name}</span><small>{repositories.length}</small>
        </button>
        {!collapsed && <div id={`account-${account.id}`} className="sidebar-account-repositories">
          {repositories.map(repo => <button key={repo.id} className={`nav-item repository-item ${repo.id === selectedRepositoryId ? 'active' : ''}`} title={repo.fullName} aria-label={repo.available ? repo.name : `${repo.name}（不可访问）`} onClick={() => onOpen(repo.id)}>
            <RepositoryLogo /><span>{repo.name}</span>{!repo.available && <Icon name="warning" size={13} />}
          </button>)}
          {!repositories.length && <p className="sidebar-account-empty">{account.error ? '仓库读取失败' : '此账号暂无仓库'}</p>}
        </div>}
      </section>;
    })}
    {!loading && !catalog.accounts.length && <p className="sidebar-no-accounts">从设置添加账号</p>}
  </nav>;
}
