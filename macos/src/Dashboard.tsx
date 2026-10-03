import { useState } from 'react';
import { accountLabel, providerName, type RemoteRepository } from './import-model';
import type { WorkspaceController } from './use-workspace';
import { Button, Icon, Notice, Select } from './ui';

export function Dashboard({ controller, globalSearch, onSettings, onConfigure, onOpen }: { controller: WorkspaceController; globalSearch: string; onSettings: () => void; onConfigure: (repository: RemoteRepository) => void; onOpen: (id: string) => void }) {
  const [accountId, setAccountId] = useState('all');
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  const { accounts, repositories, links } = controller.catalog;
  const visibleAccounts = accounts.filter(a => accountId === 'all' || a.id === accountId);
  const mapped = new Map(links.map(link => [link.repositoryId, link.path]));
  const filtered = repositories.filter(repo => `${repo.fullName} ${repo.description} ${mapped.get(repo.id) || ''}`.toLowerCase().includes(globalSearch.toLowerCase()) && (filter === 'all' || (filter === 'linked') === mapped.has(repo.id)));
  return <main className="dashboard-view import-dashboard" aria-label="仓库总览">
    <section className="stats-grid import-stats" aria-label="仓库统计"><div className="stat-card"><span>账号</span><strong>{accounts.length}</strong><small>独立管理身份</small></div><div className="stat-card"><span>可访问仓库</span><strong>{repositories.filter(r => r.available).length}</strong><small>来自账号令牌权限</small></div><div className="stat-card"><span>已关联本地</span><strong>{links.length}</strong><small>可从侧栏打开</small></div><div className="stat-card"><span>待关联</span><strong>{repositories.filter(r => r.available && !mapped.has(r.id)).length}</strong><small>按需选择本地目录</small></div></section>
    {controller.loading ? <div className="import-empty flat-group" role="status"><Icon name="spinner" className="spin" size={26} /><h2>正在读取账号…</h2></div> : !accounts.length ? <div className="import-empty flat-group"><Icon name="users" size={34} /><h2>先连接你的账号</h2><p>在设置中添加 GitHub 或 Gitea，仓库列表会自动出现在这里。<br />然后逐个关联你已有的本地目录。</p><Button variant="primary" onClick={onSettings}>打开设置，添加账号</Button></div> : <>
      <div className="import-filterbar"><Select label={<span className="sr-only">筛选账号</span>} value={accountId} onChange={event => setAccountId(event.target.value)} options={[{ value: 'all', label: '全部账号' }, ...accounts.map(a => ({ value: a.id, label: accountLabel(a) }))]} /><Select label={<span className="sr-only">本地关联状态</span>} value={filter} onChange={event => setFilter(event.target.value)} options={[{ value: 'all', label: '全部仓库' }, { value: 'linked', label: '已关联本地' }, { value: 'unlinked', label: '未关联本地' }]} /><span className="muted">只读导入 · 不自动克隆</span></div>
      {error && <Notice kind="error">{error}</Notice>}
      {visibleAccounts.map(account => {
        const items = filtered.filter(repo => repo.accountId === account.id);
        return <section className="remote-account-group flat-group" key={account.id} aria-label={accountLabel(account)}><div className="remote-account-heading"><span className={`provider-mark ${account.provider}`}><Icon name="branch" size={17} /></span><div><h2>{account.name}</h2><p>{providerName(account.provider)} · {account.login}@{new URL(account.host).host}</p></div><span className="muted">{items.length} 个仓库</span><Button variant="quiet" disabled={!!controller.busy[account.id]} leadingIcon={<Icon name={controller.busy[account.id] ? 'spinner' : 'refresh'} className={controller.busy[account.id] ? 'spin' : ''} size={15} />} onClick={() => { setError(''); void controller.refresh(account.id).catch(problem => setError(problem instanceof Error ? problem.message : '读取失败。')); }}>{controller.busy[account.id] ? '正在读取…' : '重新加载'}</Button></div>
          {account.error && <Notice kind="error">{account.error}{account.updatedAt && ' 已保留上次读取的仓库列表。'}</Notice>}
          <div className="remote-table-scroll"><table className="remote-repo-table"><thead><tr><th>仓库</th><th>默认分支</th><th>本地目录</th><th>状态</th><th><span className="sr-only">关联操作</span></th></tr></thead><tbody>{items.map(repo => <tr key={repo.id}><td><div className="remote-name"><Icon name="folder" size={19} /><div>{mapped.has(repo.id) ? <button className="repository-link" onClick={() => onOpen(repo.id)}>{repo.fullName}</button> : <strong>{repo.fullName}</strong>}<small>{repo.private ? '私有' : '公开'}{repo.description ? ` · ${repo.description}` : ''}</small></div></div></td><td><span className="branch-label"><Icon name="branch" size={13} />{repo.defaultBranch || '—'}</span></td><td><span className={`local-path ${mapped.has(repo.id) ? '' : 'muted'}`} title={mapped.get(repo.id)}>{mapped.get(repo.id) || '尚未关联'}</span></td><td><span className={`mapping-status ${!repo.available ? 'unavailable' : mapped.has(repo.id) ? 'linked' : ''}`}>{!repo.available ? '失去访问权限' : mapped.has(repo.id) ? '已关联' : '未添加本地'}</span></td><td><Button disabled={!repo.available && !mapped.has(repo.id)} onClick={() => onConfigure(repo)}>{mapped.has(repo.id) ? '配置本地' : '关联本地'}</Button></td></tr>)}</tbody></table></div>
          {!items.length && <div className="account-repos-empty">{repositories.some(r => r.accountId === account.id) ? '没有符合搜索或筛选条件的仓库。' : account.error ? '读取未完成，请重新加载或检查账号令牌。' : '这个令牌目前没有可访问的仓库，请检查权限范围。'}</div>}
        </section>;
      })}
    </>}
  </main>;
}
