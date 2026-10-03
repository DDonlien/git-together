import { Fragment, useMemo, useState } from 'react';
import { relativeTime, resolveSelection, toggleRepository, worktreesOf, type Operation, type Outcome, type Repository, type Worktree } from './domain';
import type { WorkspaceController } from './use-workspace';
import { Button, Checkbox, Icon, IconButton, SearchInput, Select, Toolbar } from './ui';

export function Actions({ onAction, disabled, compact = false }: { onAction: (action: Operation) => void; disabled?: boolean; compact?: boolean }) {
  return <div className={`action-buttons ${compact ? 'compact' : ''}`}>
    {(['Get Latest', 'Submit', 'Fetch', 'Pull'] as Operation[]).map((action, i) => compact ? <IconButton key={action} icon={i === 0 ? 'download' : i === 1 ? 'upload' : i === 2 ? 'refresh' : 'arrowDown'} label={action} disabled={disabled} onClick={() => onAction(action)} /> : <Button key={action} variant="quiet" className="action-button" disabled={disabled} onClick={() => onAction(action)} leadingIcon={<Icon name={i === 0 ? 'download' : i === 1 ? 'upload' : i === 2 ? 'refresh' : 'arrowDown'} size={16} />}>{action}</Button>)}
  </div>;
}

function Status({ outcome, worktree, onRetry, onCancel }: { outcome?: Outcome; worktree: Worktree; onRetry: () => void; onCancel: () => void }) {
  if (outcome) return <div className={`operation-status ${outcome.phase}`} title={outcome.message}>
    <Icon name={outcome.phase === 'running' ? 'spinner' : outcome.phase === 'success' ? 'success' : 'warning'} size={15} className={outcome.phase === 'running' ? 'spin' : ''} />
    <span>{outcome.phase === 'running' ? `${outcome.action} 中` : outcome.phase === 'success' ? `${outcome.action} 完成` : outcome.phase === 'cancelled' ? '已取消' : '执行失败'}</span>
    {outcome.phase === 'error' && <IconButton icon="refresh" label={`重试 ${worktree.label}`} onClick={onRetry} />}
    {outcome.phase === 'running' && <IconButton icon="close" label={`取消 ${worktree.label}`} onClick={onCancel} />}
  </div>;
  return <span className={`status-pill ${worktree.conflict ? 'warning' : ''}`}>{worktree.conflict ? <><Icon name="warning" size={12} /> 有冲突</> : 'Local'}</span>;
}

export function Dashboard({ controller, onOpen, expanded, setExpanded, selected, setSelected, globalSearch }: {
  controller: WorkspaceController; onOpen: (repo: string, worktree?: string) => void;
  expanded: string[]; setExpanded: (ids: string[]) => void; selected: string[]; setSelected: (ids: string[]) => void; globalSearch: string;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [source, setSource] = useState('all');
  const [sort, setSort] = useState('activity');
  const { repositories, preferences } = controller.state;
  const allWorktrees = worktreesOf(repositories);
  const targets = resolveSelection(repositories, selected);
  const visible = useMemo(() => repositories.filter(r => {
    const queries = `${search} ${globalSearch}`.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const text = `${r.name} ${r.description} ${r.worktrees.map(w => `${w.branch} ${w.path}`).join(' ')}`.toLowerCase();
    const matchesSearch = queries.every(query => text.includes(query));
    const matchesFilter = filter === 'all' || r.worktrees.some(w => filter === 'changes' ? w.files.length > 0 : filter === 'clean' ? !w.files.length : filter === 'agents' ? w.agents > 0 : filter === 'presence' ? w.presence : w.conflict);
    return matchesSearch && matchesFilter && (source === 'all' || r.source === source);
  }).sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : Math.min(...a.worktrees.map(w => w.activity)) - Math.min(...b.worktrees.map(w => w.activity))), [repositories, search, globalSearch, filter, source, sort]);
  const visibleIds = visible.flatMap(r => r.worktrees.map(w => w.id));
  const allChecked = visibleIds.length > 0 && visibleIds.every(id => selected.includes(id));
  const running = Object.values(controller.outcomes).filter(o => o.phase === 'running').length;
  const successes = Object.values(controller.outcomes).filter(o => o.phase === 'success').length;
  const failures = Object.values(controller.outcomes).filter(o => o.phase === 'error').length;
  const canRun = targets.length > 0 && !running;
  const stats = [
    { name: 'Repositories', value: repositories.length, detail: '你的项目，一处管理', icon: 'folder' as const, tone: 'blue', filter: 'all' },
    { name: 'Local worktrees', value: allWorktrees.length, detail: '相互隔离的工作目录', icon: 'branch' as const, tone: 'slate', filter: 'all' },
    { name: 'Running agents', value: allWorktrees.reduce((n, w) => n + w.agents, 0), detail: '正在协作的 Agent', icon: 'robot' as const, tone: 'teal', filter: 'agents' },
    { name: 'Presence alerts', value: allWorktrees.filter(w => w.presence).length, detail: '需要留意的共享文件', icon: 'users' as const, tone: 'amber', filter: 'presence' },
  ];
  const execute = (ids: string[], action: Operation) => void controller.batch(ids, action);
  const rowOutcome = (r: Repository) => r.worktrees.map(w => controller.outcomes[w.id]).find(o => o?.phase === 'error') || r.worktrees.map(w => controller.outcomes[w.id]).find(Boolean);
  return <main className="dashboard-view">
    <div className="page-heading"><div><h1>Dashboard</h1><p className="subtitle">所有仓库与本地工作目录</p></div><span className="demo-badge"><span className="dot" /> 本地演示</span></div>
    <section className="stats" aria-label="仓库统计">{stats.map(stat => <button key={stat.name} className={`stat-card ${stat.tone}`} onClick={() => setFilter(stat.filter)}><span className="stat-label">{stat.name}<Icon name={stat.icon} size={19} /></span><strong>{stat.value}<small>{stat.detail}</small></strong></button>)}</section>
    <section className="repository-section">
      <div className="section-heading"><h2>Repositories <span className="count">{visible.length}</span></h2><Button variant="quiet" className="text-button" onClick={() => setExpanded(expanded.length ? [] : repositories.map(r => r.id))}>{expanded.length ? '全部折叠' : '全部展开'}<Icon name={expanded.length ? 'right' : 'down'} size={13} /></Button></div>
      <div className="filter-bar"><SearchInput value={search} onChange={setSearch} placeholder="搜索仓库或分支…" /><div className="filter-selects"><Select label={<span className="sr-only">状态筛选</span>} value={filter} onChange={e => setFilter(e.target.value)} options={[{value:'all',label:'全部状态'},{value:'changes',label:'有修改'},{value:'clean',label:'工作目录干净'},{value:'agents',label:'Agent 运行中'},{value:'presence',label:'Presence 提醒'},{value:'conflicts',label:'有冲突'}]} /><Select label={<span className="sr-only">来源筛选</span>} value={source} onChange={e => setSource(e.target.value)} options={[{value:'all',label:'所有来源'},{value:'local',label:'Local'},{value:'online',label:'Online'}]} /></div><Select className="sort-select" label={<span className="sr-only">排序</span>} value={sort} onChange={e => setSort(e.target.value)} options={[{value:'activity',label:'最近活动 ↓'},{value:'name',label:'名称 A–Z'}]} /></div>
      {!preferences.rowActions && <Toolbar label="仓库批量操作" className="batch-toolbar" material="regular" style={{ backdropFilter: 'none', WebkitBackdropFilter: 'none' }}><div className="selection-label">{targets.length ? <><span className="selection-number">{targets.length}</span> 个工作目录已选择<Button variant="quiet" className="text-button muted" onClick={() => setSelected([])}>取消选择</Button></> : <><Icon name="list" size={16} /> 选择仓库或工作目录以执行操作</>}</div><Actions disabled={!canRun} onAction={action => execute(selected, action)} /></Toolbar>}
      {(running + successes + failures > 0) && <div className={`batch-summary ${failures ? 'has-error' : ''}`} role="status"><Icon name={running ? 'spinner' : failures ? 'warning' : 'success'} className={running ? 'spin' : ''} size={16} /><span>{running ? '操作进行中' : '操作已结束'} · {successes} 成功{failures > 0 && ` · ${failures} 失败`}{running > 0 && ` · ${running} 进行中`}</span>{failures > 0 && <Button variant="quiet" className="text-button" onClick={() => Object.entries(controller.outcomes).filter(([, o]) => o.phase === 'error').forEach(([id, o]) => execute([id], o.action))}>重试失败项</Button>}{!running && <Button variant="quiet" className="text-button muted" onClick={() => controller.setOutcomes({})}>清除结果</Button>}</div>}
      <div className="table-scroll"><table className="repo-table"><colgroup><col className="select-col" /><col className="repo-col" /><col className="branch-col" /><col className="change-col" /><col className="divergence-col" /><col className="agent-col" /><col className="activity-col" /><col className="status-col" /></colgroup><thead><tr><th><Checkbox checked={allChecked} mixed={!allChecked && visibleIds.some(id => selected.includes(id))} label="选择所有可见工作目录" onChange={() => setSelected(allChecked ? selected.filter(id => !visibleIds.includes(id)) : [...new Set([...selected, ...visibleIds])])} /></th><th>Repository</th><th>Branch / Worktree</th><th>Changes</th><th>↑ / ↓</th><th>Agent / Presence</th><th>Last activity</th><th>Status</th></tr></thead><tbody>
        {visible.map(repo => {
          const opened = expanded.includes(repo.id); const ids = repo.worktrees.map(w => w.id);
          const fullySelected = ids.every(id => selected.includes(id)); const partiallySelected = ids.some(id => selected.includes(id)); const first = repo.worktrees[0];
          return <Fragment key={repo.id}><tr className={`repository-row ${partiallySelected ? 'selected-row' : ''}`}>
            <td><Checkbox label={`选择 ${repo.name}`} checked={fullySelected} mixed={partiallySelected && !fullySelected} onChange={() => setSelected(toggleRepository(selected, repo))} /></td>
            <td><div className="repo-name-cell"><IconButton icon={opened ? 'down' : 'right'} label={`${opened ? '折叠' : '展开'} ${repo.name}`} onClick={() => setExpanded(opened ? expanded.filter(id => id !== repo.id) : [...expanded, repo.id])} /><span className="repo-glyph" style={{ color: repo.color, backgroundColor: `${repo.color}18` }}><Icon name="folder" size={20} /></span><button className="repo-link" onClick={() => onOpen(repo.id)}><strong>{repo.name}</strong><small>{repo.description}</small></button></div></td>
            <td><span className="branch-label">{opened ? `${repo.worktrees.length} 个本地工作目录` : first.branch}</span></td>
            <td><span className={repo.worktrees.some(w => w.files.length) ? 'change-number' : 'clean-text'}>{repo.worktrees.reduce((n, w) => n + w.files.length, 0) || 'Clean'}</span></td>
            <td><span className="divergence">↑ {Math.max(...repo.worktrees.map(w => w.ahead))} <span>↓ {Math.max(...repo.worktrees.map(w => w.behind))}</span></span></td>
            <td><span className="agent-status">{repo.worktrees.some(w => w.agents) ? <><span className="mini-dot teal" /> {repo.worktrees.reduce((n, w) => n + w.agents, 0)} Agent</> : <span className="muted">—</span>}{repo.worktrees.some(w => w.presence) && <Icon name="users" size={15} />}</span></td>
            <td className="muted">{relativeTime(Math.min(...repo.worktrees.map(w => w.activity)))}</td>
            <td><div className="status-cell">{preferences.rowActions ? <div className="inline-actions"><Actions compact disabled={!!running} onAction={action => execute(ids, action)} /></div> : <Status outcome={rowOutcome(repo)} worktree={first} onRetry={() => execute(ids, rowOutcome(repo)!.action)} onCancel={() => ids.forEach(controller.cancel)} />}<IconButton icon="more" label={`${repo.name} 操作`} onClick={() => { setSelected(ids); setExpanded([...new Set([...expanded, repo.id])]); }} /></div></td>
          </tr>
          {opened && repo.worktrees.map(w => <Fragment key={w.id}><tr className={`worktree-row ${selected.includes(w.id) ? 'selected-row' : ''}`}><td><Checkbox checked={selected.includes(w.id)} label={`选择 ${w.label}`} onChange={() => setSelected(selected.includes(w.id) ? selected.filter(id => id !== w.id) : [...selected, w.id])} /></td><td><button className="worktree-link" onClick={() => onOpen(repo.id, w.id)}><Icon name="branch" size={16} /><span>{w.label}<small>{w.path}</small></span></button></td><td><span className="branch-label">{w.branch}</span></td><td className={w.files.length ? 'change-number' : 'clean-text'}>{w.files.length || 'Clean'}</td><td><span className="divergence">↑ {w.ahead} <span>↓ {w.behind}</span></span></td><td><span className="agent-status">{w.agents ? <><span className="mini-dot teal" /> {w.agents} Agent</> : '—'}{w.presence && <Icon name="users" size={15} />}</span></td><td className="muted">{relativeTime(w.activity)}</td><td><div className="status-cell"><Status outcome={controller.outcomes[w.id]} worktree={w} onRetry={() => execute([w.id], controller.outcomes[w.id]!.action)} onCancel={() => controller.cancel(w.id)} />{preferences.rowActions && <div className="inline-actions"><Actions compact disabled={!!running} onAction={action => execute([w.id], action)} /></div>}</div></td></tr>{controller.outcomes[w.id]?.phase === 'error' && <tr className="error-detail"><td /><td colSpan={7}><Icon name="warning" size={13} />{controller.outcomes[w.id].message}</td></tr>}</Fragment>)}
          </Fragment>;
        })}
      </tbody></table>{!visible.length && <div className="empty-state"><Icon name="search" size={28} /><h3>没有匹配的仓库</h3><p>试试其他名称，或调整筛选条件。</p><Button variant="secondary" className="secondary-button" onClick={() => { setSearch(''); setFilter('all'); setSource('all'); }}>清除筛选</Button></div>}</div>
      <div className="table-footer"><span>{visible.length} 个仓库 · {visibleIds.length} 个本地工作目录</span><span><Icon name="success" size={13} /> 演示数据保存在本机</span></div>
    </section>
    <footer className="workspace-footer"><span>所有操作仅作用于演示数据</span><span className="keyboard-hint"><kbd>⌘</kbd><kbd>K</kbd> 快速搜索</span></footer>
  </main>;
}
