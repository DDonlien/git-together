import { useEffect, useState, type RefObject } from 'react';
import { accountLabel, providerName, type RemoteRepository } from './import-model';
import type { WorkspaceController } from './use-workspace';
import { Button, Icon, Notice, SearchInput } from './ui';
import { RepositoryActions } from './RepositoryActions';
import { FilterMenu } from './FilterMenu';

export function Dashboard({ controller, globalSearch, onSearchChange, searchRef, onSettings, onConfigure, onOpen }: { controller: WorkspaceController; globalSearch: string; onSearchChange: (value: string) => void; searchRef?: RefObject<HTMLInputElement | null>; onSettings: () => void; onConfigure: (repository: RemoteRepository) => void; onOpen: (id: string) => void }) {
  const [accountId, setAccountId] = useState('all');
  const [filter, setFilter] = useState('all');
  const { accounts, repositories, links } = controller.catalog;
  useEffect(() => { if (accountId !== 'all' && !accounts.some(account => account.id === accountId)) setAccountId('all'); }, [accounts, accountId]);
  const visibleAccounts = accounts.filter(a => accountId === 'all' || a.id === accountId);
  const accountsById = new Map(accounts.map(account => [account.id, account]));
  const mapped = new Map(links.map(link => [link.repositoryId, link.path]));
  const filtered = repositories.filter(repo => {
    const account = accountsById.get(repo.accountId)!;
    return (accountId === 'all' || repo.accountId === accountId) &&
      `${repo.fullName} ${repo.description} ${accountLabel(account)} ${repo.defaultBranch} ${mapped.get(repo.id) || ''}`.toLowerCase().includes(globalSearch.toLowerCase()) &&
      (filter === 'all' || (filter === 'linked') === mapped.has(repo.id));
  });
  const lastChecked = visibleAccounts.map(account => account.updatedAt).filter(Boolean).sort()[0];
  return <main className="dashboard-view import-dashboard" aria-label="仓库总览">
    <section className="stats-grid import-stats" aria-label="仓库统计"><div className="stat-card"><span>账号</span><strong>{accounts.length}</strong><small>独立管理身份</small></div><div className="stat-card"><span>可访问仓库</span><strong>{repositories.filter(r => r.available).length}</strong><small>来自账号令牌权限</small></div><div className="stat-card"><span>已关联本地</span><strong>{links.length}</strong><small>可查看本地更改</small></div><div className="stat-card"><span>未关联本地</span><strong>{repositories.filter(r => r.available && !mapped.has(r.id)).length}</strong><small>按需选择本地目录</small></div></section>
    {controller.loading ? <div className="import-empty flat-group" role="status"><Icon name="spinner" className="spin" size={26} /><h2>正在读取账号…</h2></div> : !accounts.length ? <div className="import-empty flat-group"><Icon name="users" size={34} /><h2>先连接你的账号</h2><p>在设置中添加 GitHub 或 Gitea，仓库会自动显示在左侧和列表中。<br />需要查看本地更改时，再关联已有目录。</p><Button variant="primary" onClick={onSettings}>打开设置，添加账号</Button></div> : <>
      <div className="import-filterbar" role="search" aria-label="搜索与筛选仓库">
        <div className="dashboard-search"><SearchInput inputRef={searchRef} value={globalSearch} onChange={onSearchChange} placeholder="搜索仓库、账号或本地目录…" />{!globalSearch && <kbd className="search-shortcut">⌘ K</kbd>}</div>
        <FilterMenu label="筛选账号" value={accountId} onChange={setAccountId} options={[{ value: 'all', label: '全部账号' }, ...accounts.map(account => ({ value: account.id, label: account.name, detail: `${providerName(account.provider)} · ${account.login}@${new URL(account.host).host}` }))]} />
        <FilterMenu label="本地关联状态" value={filter} onChange={setFilter} options={[{ value: 'all', label: '全部仓库' }, { value: 'linked', label: '已关联本地' }, { value: 'unlinked', label: '未关联本地' }]} />
        <span className="repository-count muted" title={controller.error || visibleAccounts.some(account => account.error) ? '部分数据检查失败，正在自动重试；显示上次成功读取的列表。' : lastChecked ? `远端最近检查：${new Date(lastChecked).toLocaleString()}；前台自动检查` : '正在自动检查仓库列表'}>{filtered.length} 个仓库</span>
      </div>
      {visibleAccounts.filter(account => account.error).map(account => <Notice kind="error" key={account.id}>{account.name}：{account.error}{account.updatedAt && ' 已保留上次读取的仓库列表。'} 正在自动重试。</Notice>)}
      <section className="remote-repository-group flat-group" aria-label="仓库列表">
        <div className="remote-table-scroll"><table className="remote-repo-table"><thead><tr><th scope="col">仓库</th><th scope="col">组织 / 用户</th><th scope="col">账号</th><th scope="col">默认分支</th><th scope="col">本地目录</th><th scope="col">状态</th><th scope="col"><span className="sr-only">仓库操作</span></th></tr></thead><tbody>{filtered.map(repo => {
          const account = accountsById.get(repo.accountId)!;
          const owner = repo.fullName.split('/')[0];
          const local = controller.localStates[repo.id];
          return <tr key={repo.id}>
            <td><div className="remote-name"><span className="repository-icon-tile" aria-hidden="true"><Icon name="folder" size={19} /></span><div><button className="repository-link" title={repo.fullName} onClick={() => onOpen(repo.id)}>{repo.name}</button><small><span className="repository-visibility">{repo.private ? '私有' : '公开'}</span>{repo.description ? ` · ${repo.description}` : ''}</small></div></div></td>
            <td><span className="repository-owner" title={owner}>{owner}</span></td>
            <td><div className="remote-account-cell" title={accountLabel(account)}><div><strong>{account.name}</strong><small>{providerName(account.provider)} · {account.login}@{new URL(account.host).host}</small></div></div></td>
            <td><span className="branch-label"><Icon name="branch" size={13} /><span>{repo.defaultBranch || '—'}</span></span></td>
            <td><button className={`local-path local-path-action ${mapped.has(repo.id) ? '' : 'muted'}`} title={mapped.get(repo.id) || '选择已有 Git 目录'} aria-label={`配置本地目录：${repo.fullName} · ${accountLabel(account)}`} disabled={!repo.available && !mapped.has(repo.id)} onClick={() => onConfigure(repo)}>{mapped.get(repo.id) || '尚未关联'}</button></td>
            <td><span title={local?.error || (local?.checkedAt ? `本地最近检查：${new Date(local.checkedAt).toLocaleString()}` : undefined)} className={`mapping-status ${!repo.available || local?.error ? 'unavailable' : mapped.has(repo.id) ? 'linked' : ''}`}>{!repo.available ? '失去访问权限' : local?.error ? '本地不可用' : mapped.has(repo.id) ? '已关联' : '未关联本地'}</span></td>
            <td><RepositoryActions label={`仓库操作：${repo.fullName} · ${accountLabel(account)}`} repository={repo} hasLocalDirectory={mapped.has(repo.id)} onOpen={onOpen} onConfigure={onConfigure} /></td>
          </tr>;
        })}</tbody></table></div>
        {!filtered.length && <div className="account-repos-empty">{repositories.some(repo => accountId === 'all' || repo.accountId === accountId) ? '没有符合搜索或筛选条件的仓库。' : visibleAccounts.some(account => account.error) ? '仓库读取未完成，正在自动重试；请检查账号权限。' : '当前账号没有可访问的仓库。'}</div>}
      </section>
    </>}
  </main>;
}
