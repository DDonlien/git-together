import { useId, useState, type RefObject } from 'react';
import { accountLabel, providerName, type Account, type RemoteRepository } from './import-model';
import type { WorkspaceController } from './use-workspace';
import { useRemoteRepository } from './use-remote-repository';
import type { RemoteRepositoryState } from './remote-repository-model';
import { Button, Icon, IconButton, Notice, SearchInput } from './ui';
import { RepositoryActions } from './RepositoryActions';
import { FilterMenu } from './FilterMenu';
import { MultiFilterMenu } from './MultiFilterMenu';
import { matchesRepositoryFilters, organizationGroups, repositoryClassification, repositorySources, repositoryTypes, toggleFilter, type FilterSelection } from './dashboard-filters';

export function Dashboard({ controller, globalSearch, onSearchChange, searchRef, onSettings, onConfigure, onOpen }: { controller: WorkspaceController; globalSearch: string; onSearchChange: (value: string) => void; searchRef?: RefObject<HTMLInputElement | null>; onSettings: () => void; onConfigure: (repository: RemoteRepository) => void; onOpen: (id: string) => void }) {
  const [accountId, setAccountId] = useState('all');
  const [organization, setOrganization] = useState<FilterSelection>(null);
  const [source, setSource] = useState<FilterSelection>(null);
  const [type, setType] = useState<FilterSelection>(null);
  const [expandedRepositories, setExpandedRepositories] = useState<Set<string>>(new Set());
  const { accounts, repositories, links } = controller.catalog;
  const selectedAccountId = accounts.some(account => account.id === accountId) ? accountId : 'all';
  const visibleAccounts = accounts.filter(a => selectedAccountId === 'all' || a.id === selectedAccountId);
  const organizations = organizationGroups(accounts, repositories);
  const organizationOptions = organizations.flatMap(group => group.options);
  const accountsById = new Map(accounts.map(account => [account.id, account]));
  const mapped = new Map(links.map(link => [link.repositoryId, link.path]));
  const filtered = repositories.filter(repo => {
    const account = accountsById.get(repo.accountId)!;
    return (selectedAccountId === 'all' || repo.accountId === selectedAccountId) &&
      `${repo.fullName} ${repo.description} ${accountLabel(account)} ${repo.defaultBranch} ${mapped.get(repo.id) || ''}`.toLowerCase().includes(globalSearch.toLowerCase()) &&
      matchesRepositoryFilters(repo, mapped.has(repo.id), { organization, source, type }, organizationOptions);
  });
  const lastChecked = visibleAccounts.map(account => account.updatedAt).filter(Boolean).sort()[0];
  return <main className="dashboard-view import-dashboard" aria-label="仓库总览">
    <section className="stats-grid import-stats" aria-label="仓库统计"><div className="stat-card"><span>账号</span><strong>{accounts.length}</strong><small>独立管理身份</small></div><div className="stat-card"><span>可访问仓库</span><strong>{repositories.filter(r => r.available).length}</strong><small>来自账号令牌权限</small></div><div className="stat-card"><span>已关联本地</span><strong>{links.length}</strong><small>可查看本地更改</small></div><div className="stat-card"><span>未关联本地</span><strong>{repositories.filter(r => r.available && !mapped.has(r.id)).length}</strong><small>按需选择本地目录</small></div></section>
    {controller.loading ? <div className="import-empty flat-group" role="status"><Icon name="spinner" className="spin" size={26} /><h2>正在读取账号…</h2></div> : !accounts.length ? <div className="import-empty flat-group"><Icon name="users" size={34} /><h2>先连接你的账号</h2><p>在设置中添加 GitHub 或 Gitea，仓库会自动显示在左侧和列表中。<br />需要查看本地更改时，再关联已有目录。</p><Button variant="primary" onClick={onSettings}>打开设置，添加账号</Button></div> : <>
      <div className="import-filterbar" role="search" aria-label="搜索与筛选仓库">
        <div className="dashboard-search"><SearchInput inputRef={searchRef} value={globalSearch} onChange={onSearchChange} placeholder="搜索仓库、账号或本地目录…" />{!globalSearch && <kbd className="search-shortcut">⌘ K</kbd>}</div>
        <FilterMenu label="筛选账号" value={selectedAccountId} onChange={setAccountId} options={[{ value: 'all', label: '全部账号' }, ...accounts.map(account => ({ value: account.id, label: account.name, detail: `${providerName(account.provider)} · ${account.login}@${new URL(account.host).host}` }))]} />
        <MultiFilterMenu label="组织" groups={organizations} selections={Object.fromEntries(organizations.map(group => [group.id, organization]))} onToggle={(_groupId, value) => setOrganization(current => toggleFilter(current, value, organizationOptions))} />
        <MultiFilterMenu label="仓库" groups={[{ id: 'source', label: '位置', options: repositorySources }, { id: 'type', label: '类型', options: repositoryTypes }]} selections={{ source, type }} onToggle={(groupId, value) => groupId === 'source' ? setSource(current => toggleFilter(current, value, repositorySources)) : setType(current => toggleFilter(current, value, repositoryTypes))} note={repositories.some(repo => repo.fork === undefined || repo.collaborator === undefined) ? '未确认的分类不会参与单项筛选；全选仍保留这些仓库。' : undefined} />
        <span className="repository-count muted" title={controller.error || visibleAccounts.some(account => account.error) ? '部分数据检查失败，正在自动重试；显示上次成功读取的列表。' : lastChecked ? `远端最近检查：${new Date(lastChecked).toLocaleString()}；前台自动检查` : '正在自动检查仓库列表'}>{filtered.length} 个仓库</span>
      </div>
      {visibleAccounts.filter(account => account.error).map(account => <Notice kind="error" key={account.id}>{account.name}：{account.error}{account.updatedAt && ' 已保留上次读取的仓库列表。'} 正在自动重试。</Notice>)}
      <section className="remote-repository-group flat-group" aria-label="仓库列表">
        <div className="remote-table-scroll"><table className="remote-repo-table"><thead><tr><th scope="col">仓库</th><th scope="col">组织 / 用户</th><th scope="col">账号</th><th scope="col">本地目录</th><th scope="col">状态</th><th scope="col"><span className="sr-only">仓库操作</span></th></tr></thead>{filtered.map(repo => {
          const key = JSON.stringify([controller.catalog.instanceId, repo.id]);
          return <DashboardRepositoryRows key={key} repository={repo} account={accountsById.get(repo.accountId)!} controller={controller} localPath={mapped.get(repo.id)} expanded={expandedRepositories.has(key)} onToggle={() => setExpandedRepositories(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; })} onOpen={onOpen} onConfigure={onConfigure} />;
        })}</table></div>
        {!filtered.length && <div className="account-repos-empty">{repositories.some(repo => selectedAccountId === 'all' || repo.accountId === selectedAccountId) ? '没有符合搜索或筛选条件的仓库。' : visibleAccounts.some(account => account.error) ? '仓库读取未完成，正在自动重试；请检查账号权限。' : '当前账号没有可访问的仓库。'}</div>}
      </section>
    </>}
  </main>;
}

function DashboardRepositoryRows({ repository: repo, account, controller, localPath, expanded, onToggle, onOpen, onConfigure }: {
  repository: RemoteRepository; account: Account; controller: WorkspaceController; localPath?: string; expanded: boolean; onToggle: () => void; onOpen: (id: string) => void; onConfigure: (repository: RemoteRepository) => void;
}) {
  const branchesId = useId();
  const ready = !controller.loading && !controller.needsReload;
  // Keep the reader mounted across disclosure, but only visible expanded rows
  // own a heartbeat. Filtering/unmounting cancels through the shared reader.
  const { state } = useRemoteRepository(repo, controller.catalog.instanceId, expanded && ready);
  const owner = repo.fullName.split('/')[0];
  const local = controller.localStates[repo.id];
  return <>
    <tbody><tr className="dashboard-repository-row">
      <td><div className="remote-name"><IconButton className="repository-disclosure" icon={expanded ? 'down' : 'right'} label={`${expanded ? '收起' : '展开'}分支：${repo.fullName} · ${accountLabel(account)}`} aria-expanded={expanded} aria-controls={branchesId} onClick={onToggle} /><span className="repository-icon-tile" aria-hidden="true"><Icon name="folder" size={19} /></span><div><button className="repository-link" title={repo.fullName} onClick={() => onOpen(repo.id)}>{repo.name}</button><small><span className="repository-visibility">{repo.private ? '私有' : '公开'}</span>{repo.description ? ` · ${repo.description}` : ''}</small></div></div></td>
      <td><span className="repository-owner" title={owner}>{owner}</span></td>
      <td><div className="remote-account-cell" title={accountLabel(account)}><div><strong>{account.name}</strong><small>{providerName(account.provider)} · {account.login}@{new URL(account.host).host}</small></div></div></td>
      <td><button className={`local-path local-path-action ${localPath ? '' : 'muted'}`} title={localPath || '选择已有 Git 目录'} aria-label={`配置本地目录：${repo.fullName} · ${accountLabel(account)}`} disabled={!repo.available && !localPath} onClick={() => onConfigure(repo)}>{localPath || '尚未关联'}</button></td>
      <td><span title={[repositoryClassification(repo), local?.error || (local?.checkedAt ? `本地最近检查：${new Date(local.checkedAt).toLocaleString()}` : '')].filter(Boolean).join(' · ')} className={`mapping-status ${!repo.available || local?.error ? 'unavailable' : localPath ? 'linked' : ''}`}>{!repo.available ? '失去访问权限' : local?.error ? '本地不可用' : localPath ? '已关联' : '未关联本地'}</span></td>
      <td><RepositoryActions label={`仓库操作：${repo.fullName} · ${accountLabel(account)}`} repository={repo} hasLocalDirectory={!!localPath} onOpen={onOpen} onConfigure={onConfigure} /></td>
    </tr></tbody>
    <tbody id={branchesId} className="dashboard-repository-branches" aria-label={`远端分支：${repo.fullName} · ${accountLabel(account)}`} hidden={!expanded}>{expanded && <RepositoryBranchRows repository={repo} state={state} blocked={!ready} />}</tbody>
  </>;
}

export function RepositoryBranchRows({ repository, state, blocked = false }: { repository: RemoteRepository; state: RemoteRepositoryState; blocked?: boolean }) {
  const { workspace, loading } = state;
  const error = repository.available ? state.error : '访问账号目前无权读取此仓库。';
  const branchWarnings = workspace?.warnings.filter(warning => warning.startsWith('分支超过')) || [];
  return <>
    {error && <tr className="dashboard-branch-message"><td colSpan={6}><Notice kind="error">{error}{workspace ? ' 已保留上次读取的分支。' : ''} 收起后重新展开可重试。</Notice></td></tr>}
    {!workspace && !error && <tr className="dashboard-branch-message"><td colSpan={6}><span role="status">{blocked ? '账号服务尚未就绪。' : loading ? <><Icon name="spinner" className="spin" size={13} />正在读取远端分支…</> : '正在准备远端读取…'}</span></td></tr>}
    {workspace && !workspace.tasks.length && !error && <tr className="dashboard-branch-message"><td colSpan={6}><span role="status">此仓库暂无远端分支。</span></td></tr>}
    {workspace?.tasks.map(task => <tr className="dashboard-branch-row" key={task.id}><td colSpan={6}><div className="dashboard-branch-content"><span className="branch-label" title={task.branch}><Icon name="branch" size={13} /><span>{task.branch}</span></span>{task.branch === repository.defaultBranch && <small className="dashboard-default-branch">默认</small>}</div></td></tr>)}
    {!!branchWarnings.length && <tr className="dashboard-branch-message"><td colSpan={6}><Notice kind="info">{branchWarnings.join(' ')}</Notice></td></tr>}
  </>;
}
