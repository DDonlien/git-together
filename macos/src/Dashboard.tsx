import { usesSystemAuthentication } from './repository-auth-model';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type RefObject, type TdHTMLAttributes } from 'react';
import { accountLabel, providerName, type Account, type LocalLink, type RemoteRepository } from './import-model';
import { repositoryActionBusy, type WorkspaceController } from './use-workspace';
import { useRemoteRepository } from './use-remote-repository';
import type { RemoteRepositoryState } from './remote-repository-model';
import { Button, Icon, IconButton, Notice } from './ui';
import { SearchBar } from './material-inputs';
import { RepositoryRowActions } from './RepositoryActions';
import { RepositoryReadBadge } from './RepositoryReadBadge';
import { PresenceAvatars } from './PresenceAvatars';
import { RepositoryPinButton } from './RepositoryPinButton';
import { usePresence } from './PresenceProvider';
import { presencePeople, presenceRepositoryId, managedOrganizations, managedOrganizationKey } from './presence-model';
import { PresenceManagedMark, PresenceManagedNames, usePresenceRepositoryIcon } from './PresenceManaged';
import { PushFeedbackIcon, branchPushState, repositoryPushState, usePushActivity } from './PushFeedback';
import { useRepositoryOperations } from './RepositoryOperationProvider';
import type { RepositoryActionMode, RepositoryActionTarget } from './repository-action-model';
import { repositoryActionTargets, repositoryOperationScope } from './repository-action-model';
import { generateCommitMessage } from './import-api';
import { DashboardActionNames } from './DashboardActionNames';
import { MultiFilterMenu } from './MultiFilterMenu';
import { accountOptions, isSelected, matchesRepositoryFilters, matchesRepositoryType, organizationGroups, repositorySources, repositoryTypes, repositoryTypeCoverage, repositoryVisibilities, toggleFilter, type FilterSelection } from './dashboard-filters';
import { aggregateGitSignals, gitSignals, hiddenEntryKey, linkedTasks, repositoryLocalDirectory, repositoryReadFeedback, type GitSignals } from './branch-links';
import { useAssociationStatus } from './use-association-status';
import type { RepositoryTask } from './repository-model';
import type { LocalRepositoryState } from './use-workspace';
import { chooseLocalDirectory, displayLocalPath } from './local-directory';
import { branchHiddenEntries, toggleBranchVisibility } from './branch-behavior';
import { recordUIRender } from './performance-diagnostics';
import { NavigationControls } from './NavigationControls';

type DashboardSortKey = 'status' | 'repository' | 'owner' | 'account' | 'managedOrganization' | 'updatedAt' | 'modifiedAt' | 'localPath' | 'pull' | 'push' | 'commit' | 'hidden';
type DashboardSort = { key: DashboardSortKey; direction: 'asc' | 'desc' };
type DashboardRepositoryRow = { repo: RemoteRepository; account: Account; localPath?: string; modifiedAt?: string };
type DirectoryMatchFeedback = { kind: 'success' | 'error' | 'info'; message: string };
const dashboardDate = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
const emptyRemoteState: RemoteRepositoryState = { workspace: null, loading: false, error: '' };
const repositorySearchText = (repository: RemoteRepository, account: Account) => `${repository.fullName} ${repository.description} ${accountLabel(account)}`.toLowerCase();
const taskMatchesSearch = (task: Pick<RepositoryTask, 'branch' | 'path'>, search: string) => `${task.branch} ${task.path || ''}`.toLowerCase().includes(search.toLowerCase());

function latestCommitTime(commits: readonly { time: string }[] | undefined) {
  return commits?.reduce<{ time: string; timestamp: number } | undefined>((latest, commit) => {
    const timestamp = Date.parse(commit.time);
    return Number.isFinite(timestamp) && (!latest || timestamp > latest.timestamp) ? { time: commit.time, timestamp } : latest;
  }, undefined)?.time;
}

function DashboardSortHeader({ label, column, sort, onSort }: { label: string; column: DashboardSortKey; sort: DashboardSort; onSort: (column: DashboardSortKey) => void }) {
  const active = sort.key === column || (column === 'repository' && sort.key === 'status');
  const button = (text: string, key: DashboardSortKey) => <button type="button" className={`repository-sort-button${key === 'status' ? ' repository-status-sort' : ''}`} aria-pressed={sort.key === key} aria-label={`${text}，按${text}排序${sort.key === key ? sort.direction === 'asc' ? '，升序' : '，降序' : ''}`} onClick={() => onSort(key)}><span className="repository-sort-label">{text}<span className="repository-sort-indicator" aria-hidden="true">{sort.key === key ? sort.direction === 'asc' ? '↑' : '↓' : '↕'}</span></span></button>;
  return <th scope="col" aria-sort={active ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}>{column === 'repository' ? <div className="repository-identity-header">{button('状态', 'status')}{button(label, column)}</div> : button(label, column)}</th>;
}

function repositoryStatusOrder(signals: GitSignals, pushing = false) {
  const feedback = repositoryReadFeedback(signals);
  if (feedback.reading || pushing) return 1;
  if (feedback.error) return 0;
  if (Object.values(signals).some(signal => signal.tone === 'warning')) return 2;
  return signals.pull.tone === 'good' ? 3 : 4;
}

function BranchCell({ children, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td {...props}><div className="dashboard-branch-cell"><div><div className="dashboard-branch-cell-content">{children}</div></div></div></td>;
}

function RepositoryDate({ value, source }: { value?: string; source: string }) {
  if (!value) return <span className="repository-date muted">—</span>;
  const date = new Date(value);
  return <time className="repository-date" dateTime={date.toISOString()} title={`${source}：${date.toLocaleString()}`}>{dashboardDate.format(date)}</time>;
}

export function Dashboard({ controller, globalSearch, onSearchChange, searchRef, onSettings, onConfigure, onDownload, onOpen, canGoBack = false, canRedo = false, onBack = () => {}, onRedo = () => {}, onRefresh = () => {}, refreshDisabled = false, refreshing = false, refreshFeedback }: { controller: WorkspaceController; globalSearch: string; onSearchChange: (value: string) => void; searchRef?: RefObject<HTMLElement | null>; onSettings: () => void; onConfigure: (repository: RemoteRepository, branch?: string) => void; onDownload?: (repository: RemoteRepository, branch: string) => void; onOpen: (id: string, taskId?: string) => void; canGoBack?: boolean; canRedo?: boolean; onBack?: () => void; onRedo?: () => void; onRefresh?: () => void; refreshDisabled?: boolean; refreshing?: boolean; refreshFeedback?: { kind: 'success' | 'error' | 'info'; message: string } | null }) {
  const renderStarted = performance.now();
  const [selectedAccounts, setSelectedAccounts] = useState<FilterSelection>(null);
  const [organization, setOrganization] = useState<FilterSelection>(null);
  const presence = usePresence();
  const [managedFilter, setManagedFilter] = useState<FilterSelection>(null);
  const managedChoices = (presence?.status?.enabled ? presence.status.organizations || [] : []).filter(o => controller.catalog.repositories.some(r => o.projects.includes(presenceRepositoryId(r)))).map(o => ({ value: managedOrganizationKey(o), label: `${o.name} · ${new URL(o.serverUrl).host}${new URL(o.serverUrl).pathname === '/' ? '' : new URL(o.serverUrl).pathname}` }));
  const repositoryOrganizations = (repo: RemoteRepository) => managedOrganizations(presence?.status, presenceRepositoryId(repo));
  const [source, setSource] = useState<FilterSelection>(null);
  const [type, setType] = useState<FilterSelection>(null);
  const [visibility, setVisibility] = useState<FilterSelection>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [reportedHiddenBranches, setReportedHiddenBranches] = useState<Record<string, string[]>>({});
  const reportHiddenBranches = useCallback((key: string, entries: string[]) => setReportedHiddenBranches(current => JSON.stringify(current[key]) === JSON.stringify(entries) ? current : { ...current, [key]: entries }), []);
  const hiddenEntries = new Set(controller.hiddenEntries || controller.preferences.hiddenEntries || []);
  if (controller.preferences.unworkedBranchBehavior === 'hide') for (const repo of controller.catalog.repositories) {
    if (controller.remoteStates[repo.id]) continue;
    for (const key of reportedHiddenBranches[JSON.stringify([controller.catalog.instanceId, repo.id])] || []) if (!controller.preferences.shownBranches?.includes(key)) hiddenEntries.add(key);
  }
  const toggleHidden = (key: string) => {
    controller.updatePreferences(toggleBranchVisibility(controller.preferences, key, hiddenEntries.has(key)));
  };
  const [expandedRepositories, setExpandedRepositories] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<DashboardSort>({ key: 'repository', direction: 'asc' });
  // Unlinked reads are row-owned. Report only their sort order so the header
  // follows the same live icon state without starting another remote reader.
  const [repositoryStatuses, setRepositoryStatuses] = useState<Record<string, number>>({});
  const reportStatus = useCallback((key: string, order: number) => setRepositoryStatuses(current => current[key] === order ? current : { ...current, [key]: order }), []);
  const [matchingPhase, setMatchingPhase] = useState<'choosing' | 'matching' | null>(null);
  const [directoryMatch, setDirectoryMatch] = useState<DirectoryMatchFeedback | null>(null);
  const operations = useRepositoryOperations();
  const [actionFeedback, setActionFeedback] = useState('');
  useEffect(() => {
    if (!directoryMatch) return;
    const timeout = window.setTimeout(() => setDirectoryMatch(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [directoryMatch]);
  const { accounts, repositories, links } = controller.catalog;
  const accountChoices = accountOptions(accounts);
  const visibleAccounts = accounts.filter(account => isSelected(selectedAccounts, account.id));
  const matchableAccounts = visibleAccounts.filter(account => repositories.some(repository => repository.accountId === account.id && repository.available));
  const matchableAccountIds = new Set(matchableAccounts.map(account => account.id));
  const matchableRepositoryCount = repositories.filter(repository => repository.available && matchableAccountIds.has(repository.accountId)).length;
  const organizations = organizationGroups(accounts, repositories);
  const organizationOptions = organizations.flatMap(group => group.options);
  const accountsById = new Map(accounts.map(account => [account.id, account]));
  const linksById = new Map(links.map(link => [link.repositoryId, link]));
  const mapped = new Map(repositories.filter(repo => linksById.has(repo.id)).map(repo => [repo.id, repositoryLocalDirectory(repo.name, linksById.get(repo.id))]));
  // Showing hidden rows is a recovery view; only restoring them changes global stats.
  const countedRepositories = repositories.filter(repo => !hiddenEntries.has(hiddenEntryKey(repo.id)));
  const countedRepositoryIds = new Set(countedRepositories.map(repo => repo.id));
  const countedLinkedIds = new Set(links.filter(link => countedRepositoryIds.has(link.repositoryId) && linkedTasks(link, controller.localStates[link.repositoryId], hiddenEntries).length > 0).map(link => link.repositoryId));
  const candidates = repositories.filter(repo => {
    const account = accountsById.get(repo.accountId)!;
    const tasks = [...linkedTasks(linksById.get(repo.id), controller.localStates[repo.id], hiddenEntries), ...(controller.remoteStates[repo.id]?.workspace?.tasks || [])];
    const matchesSearch = repositorySearchText(repo, account).includes(globalSearch.toLowerCase()) || tasks.some(task => taskMatchesSearch(task, globalSearch)) || `${repo.defaultBranch} ${mapped.get(repo.id) || ''}`.toLowerCase().includes(globalSearch.toLowerCase());
    return (showHidden || !hiddenEntries.has(hiddenEntryKey(repo.id))) && isSelected(selectedAccounts, repo.accountId) &&
      matchesSearch && (!presence?.status?.enabled || !managedChoices.length || managedFilter === null || repositoryOrganizations(repo).some(o => managedFilter.has(managedOrganizationKey(o)))) &&
      matchesRepositoryFilters(repo, mapped.has(repo.id), { organization, source, type: null, visibility }, organizationOptions);
  });
  const filtered = candidates.filter(repo => matchesRepositoryType(repo, type));
  const coverage = repositoryTypeCoverage(candidates, type);
  const incompleteClassification = coverage.unknown > 0 || coverage.errors.length > 0;
  const scopedTasks = (repo: RemoteRepository) => linkedTasks(linksById.get(repo.id), controller.localStates[repo.id], hiddenEntries).filter(task => repositorySearchText(repo, accountsById.get(repo.accountId)!).includes(globalSearch.toLowerCase()) || taskMatchesSearch(task, globalSearch));
  const rowSignals = (repo: RemoteRepository) => gitSignals(scopedTasks(repo), controller.remoteStates[repo.id] || emptyRemoteState, controller.localStates[repo.id], undefined, repo.available, usesSystemAuthentication(linksById.get(repo.id)));
  const hiddenCount = (repo: RemoteRepository) => showHidden ? [...hiddenEntries].filter(key => key.startsWith(`[${JSON.stringify(repo.id)},`)).length : 0;
  const actionRepositories = filtered.filter(repo => !hiddenEntries.has(hiddenEntryKey(repo.id)));
  const batchSignals = aggregateGitSignals(actionRepositories.map(rowSignals));
  const openAction = (mode: RepositoryActionMode, targets: RepositoryActionTarget[], scope: string) => { setActionFeedback(''); operations.open({ mode, targets, scope, onSync: controller.applySync, onCommit: controller.submitCommit, onPush: controller.pushCommit, onGenerate: generateCommitMessage, onComplete: setActionFeedback }); };
  const rows: DashboardRepositoryRow[] = filtered.map(repo => ({
    repo,
    account: accountsById.get(repo.accountId)!,
    localPath: mapped.get(repo.id),
    modifiedAt: latestCommitTime(controller.localStates[repo.id]?.workspace?.commits),
  }));
  const pinnedRepositories = new Set(controller.preferences.pinnedRepositories);
  rows.sort((a, b) => {
    const pinOrder = Number(pinnedRepositories.has(b.repo.id)) - Number(pinnedRepositories.has(a.repo.id));
    if (pinOrder) return pinOrder;
    let comparison = 0;
    switch (sort.key) {
      case 'status': comparison = (repositoryStatuses[JSON.stringify([controller.catalog.instanceId, a.repo.id])] ?? repositoryStatusOrder(rowSignals(a.repo))) - (repositoryStatuses[JSON.stringify([controller.catalog.instanceId, b.repo.id])] ?? repositoryStatusOrder(rowSignals(b.repo))); break;
      case 'repository': comparison = a.repo.fullName.localeCompare(b.repo.fullName); break;
      case 'owner': comparison = a.repo.fullName.split('/').slice(0, -1).join('/').localeCompare(b.repo.fullName.split('/').slice(0, -1).join('/')); break;
      case 'account': comparison = a.account.name.localeCompare(b.account.name) || a.account.login.localeCompare(b.account.login); break;
      case 'managedOrganization': comparison = repositoryOrganizations(a.repo).map(o => o.name).join(' ').localeCompare(repositoryOrganizations(b.repo).map(o => o.name).join(' ')); break;
      case 'localPath': comparison = (a.localPath || '').localeCompare(b.localPath || ''); break;
      case 'pull': case 'push': case 'commit': comparison = (rowSignals(a.repo)[sort.key].count || 0) - (rowSignals(b.repo)[sort.key].count || 0); break;
      case 'hidden': comparison = hiddenCount(a.repo) - hiddenCount(b.repo); break;
      case 'updatedAt':
      case 'modifiedAt': {
        const left = Date.parse(sort.key === 'updatedAt' ? a.repo.updatedAt || '' : a.modifiedAt || '');
        const right = Date.parse(sort.key === 'updatedAt' ? b.repo.updatedAt || '' : b.modifiedAt || '');
        const leftValid = Number.isFinite(left);
        const rightValid = Number.isFinite(right);
        if (leftValid !== rightValid) return leftValid ? -1 : 1;
        if (leftValid && rightValid) comparison = left - right;
        break;
      }
    }
    if (comparison === 0) comparison = a.repo.fullName.localeCompare(b.repo.fullName) || a.repo.accountId.localeCompare(b.repo.accountId);
    return sort.direction === 'asc' ? comparison : -comparison;
  });
  const changeSort = (key: DashboardSortKey) => setSort(current => current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: ['pull', 'push', 'commit', 'hidden'].includes(key) ? 'desc' : 'asc' });
  useLayoutEffect(() => recordUIRender('dashboard-render', renderStarted, rows.length));
  async function matchAccountRepositories() {
    if (matchingPhase || !matchableRepositoryCount) return;
    setDirectoryMatch(null);
    setMatchingPhase('choosing');
    try {
      const path = await chooseLocalDirectory();
      if (path === null) return;
      setMatchingPhase('matching');
      const matchedIds: string[] = [];
      const errors: string[] = [];
      for (const account of matchableAccounts) {
        try { matchedIds.push(...await controller.matchAccountRepositories(account.id, path)); }
        catch (problem) { errors.push(`${account.name}：${problem instanceof Error ? problem.message : '匹配失败。'}`); }
      }
      const unmatched = matchableRepositoryCount - matchedIds.length;
      const message = errors.length
        ? `已匹配 ${matchedIds.length}/${matchableRepositoryCount} 个仓库。${errors.join(' ')}`
        : matchedIds.length
          ? `已匹配 ${matchedIds.length}/${matchableRepositoryCount} 个仓库${unmatched ? `，其余 ${unmatched} 个在所选文件夹内未找到` : ''}。`
          : '在所选文件夹及子文件夹中没有找到远端匹配的仓库；既有关联保持不变。';
      setDirectoryMatch({ kind: errors.length ? 'error' : matchedIds.length ? 'success' : 'info', message });
    } catch (problem) {
      setDirectoryMatch({ kind: 'error', message: problem instanceof Error ? problem.message : '无法打开系统文件夹选择器。' });
    } finally { setMatchingPhase(null); }
  }
  return <main className="dashboard-view import-dashboard" aria-label="仓库总览">
    <section className="stats-grid import-stats" aria-label="仓库统计"><div className="stat-card"><span>账号</span><strong>{accounts.length}</strong><small>独立管理身份</small></div><div className="stat-card"><span>可访问仓库</span><strong>{countedRepositories.filter(r => r.available).length}</strong><small>来自账号令牌权限</small></div><div className="stat-card"><span>已关联本地</span><strong>{countedLinkedIds.size}</strong><small>可查看本地更改</small></div><div className="stat-card"><span>未关联本地</span><strong>{countedRepositories.filter(r => r.available && !countedLinkedIds.has(r.id)).length}</strong><small>按需选择本地目录</small></div></section>
    {controller.loading ? <div className="import-empty flat-group" role="status"><Icon name="spinner" className="spin" size={26} /><h2>正在读取账号…</h2></div> : !accounts.length ? <div className="import-empty flat-group"><Icon name="users" size={34} /><h2>先连接你的账号</h2><p>{window.gittogether?.backend === 'github-desktop' ? '在设置中登录 GitHub、GitHub Enterprise，或添加已有的本地 Git 仓库。' : '在设置中添加 GitHub、GitHub 企业版、GitLab、Gitee 或 Gitea，仓库会自动显示在左侧和列表中。'}<br />需要查看本地更改时，再关联已有目录。</p><Button variant="primary" onClick={onSettings}>打开设置，添加账号</Button></div> : <>
      <div className="import-filterbar" role="search" aria-label="搜索与筛选仓库">
        <div className="dashboard-search"><SearchBar inputRef={searchRef} value={globalSearch} onChange={onSearchChange} placeholder="搜索仓库、账号或本地目录…" />{!globalSearch && <kbd className="search-shortcut">⌘ K</kbd>}</div>
        <NavigationControls canGoBack={canGoBack} canRedo={canRedo} refreshing={refreshing} refreshDisabled={refreshDisabled} onBack={onBack} onRedo={onRedo} onRefresh={onRefresh} />
        <MultiFilterMenu label="账号" groups={[{ id: 'account', label: '访问账号', options: accountChoices }]} selections={{ account: selectedAccounts }} onToggle={(_groupId, value) => setSelectedAccounts(current => toggleFilter(current, value, accountChoices))} />
        <MultiFilterMenu label="组织" groups={organizations} selections={Object.fromEntries(organizations.map(group => [group.id, organization]))} onToggle={(_groupId, value) => setOrganization(current => toggleFilter(current, value, organizationOptions))} />
        {managedChoices.length > 0 && <MultiFilterMenu label="托管组织" groups={[{ id: 'managed', label: 'Presence 托管组织', options: managedChoices }]} selections={{ managed: managedFilter }} onToggle={(_groupId, value) => setManagedFilter(current => toggleFilter(current, value, managedChoices))} />}
        <MultiFilterMenu label="仓库" groups={[{ id: 'source', label: '位置', options: repositorySources }, { id: 'type', label: '类型', options: repositoryTypes }]} selections={{ source, type }} onToggle={(groupId, value) => groupId === 'source' ? setSource(current => toggleFilter(current, value, repositorySources)) : setType(current => toggleFilter(current, value, repositoryTypes))} note={repositories.some(repo => repo.fork === undefined || repo.collaborator === undefined) ? '未确认的分类不会参与单项筛选；全选仍保留这些仓库。' : undefined} />
        <MultiFilterMenu label="可见性" groups={[{ id: 'visibility', label: '可见性', options: repositoryVisibilities }]} selections={{ visibility }} onToggle={(_groupId, value) => setVisibility(current => toggleFilter(current, value, repositoryVisibilities))} />
        {hiddenEntries.size > 0 && <button type="button" className="dashboard-hidden-toggle" aria-label="显示已隐藏项目" aria-pressed={showHidden} onClick={() => setShowHidden(value => !value)}><Icon name={showHidden ? 'eye' : 'eyeSlash'} size={14} />已隐藏（{hiddenEntries.size}）</button>}
        <button type="button" className="repository-count repository-count-action" aria-label={`${filtered.length} 个仓库。点击选择父文件夹并匹配当前账号筛选中的全部可访问仓库。`} title={matchableRepositoryCount ? `选择一个本地父文件夹，匹配当前账号筛选中的 ${matchableRepositoryCount} 个可访问仓库；搜索、组织、类型和可见性筛选不影响匹配范围。` : '当前账号筛选下没有可匹配的仓库。'} disabled={!!matchingPhase || !matchableRepositoryCount || controller.loading || controller.needsReload} onClick={() => void matchAccountRepositories()}>{matchingPhase && <Icon name="spinner" className="spin" size={12} />}{matchingPhase === 'choosing' ? '选择中…' : matchingPhase === 'matching' ? '正在匹配…' : `${filtered.length} 个仓库`}</button>
      </div>
      {refreshFeedback && <Notice kind={refreshFeedback.kind}>{refreshFeedback.message}</Notice>}
      {directoryMatch && <Notice kind={directoryMatch.kind}>{directoryMatch.message}</Notice>}
      {actionFeedback && <Notice kind="success">{actionFeedback}</Notice>}
      {visibleAccounts.filter(account => account.error).map(account => <Notice kind="error" key={account.id}>{account.name}：{account.error}{account.updatedAt && ' 已保留上次读取的仓库列表。'} 正在自动重试。</Notice>)}
      {incompleteClassification && <Notice kind="info">分类尚未读全{coverage.unknown > 0 ? `：${coverage.unknown} 个仓库的所选分类未确认` : ''}。当前只显示已确认的匹配项，全选可查看已读取的完整目录。{coverage.errors.length > 0 && ` ${coverage.errors[0]}`}</Notice>}
      <section className="remote-repository-group flat-group" aria-label="仓库列表">
        <DashboardActionNames>
        <div className="remote-table-scroll"><table className="remote-repo-table has-managed-column has-repository-pins"><thead><tr><DashboardSortHeader label="仓库" column="repository" sort={sort} onSort={changeSort} /><DashboardSortHeader label="组织 / 用户" column="owner" sort={sort} onSort={changeSort} /><DashboardSortHeader label="账号" column="account" sort={sort} onSort={changeSort} /><DashboardSortHeader label="托管组织" column="managedOrganization" sort={sort} onSort={changeSort} /><DashboardSortHeader label="更新日期" column="updatedAt" sort={sort} onSort={changeSort} /><DashboardSortHeader label="修改日期" column="modifiedAt" sort={sort} onSort={changeSort} /><DashboardSortHeader label="本地目录" column="localPath" sort={sort} onSort={changeSort} /><th scope="col" className="repository-action-cell"><div className="dashboard-signal-sort">{([{ key: 'pull', label: '远端内容' }, { key: 'commit', label: '本地内容' }, { key: 'push', label: '待推送' }, { key: 'hidden', label: '隐藏' }] as const).map(item => { const count = item.key === 'hidden' ? filtered.reduce((sum, repo) => sum + hiddenCount(repo), 0) : batchSignals[item.key].count || 0; return <button type="button" key={item.key} data-signal={item.key} aria-pressed={sort.key === item.key} aria-label={`${item.label}，按数量排序${sort.key === item.key ? sort.direction === 'asc' ? '，升序' : '，降序' : ''}`} onClick={() => changeSort(item.key)}><span className="dashboard-sort-label">{item.label}{sort.key === item.key && <span className="repository-sort-indicator" aria-hidden="true">{sort.direction === 'asc' ? '↑' : '↓'}</span>}{count > 0 && <span className="dashboard-sort-count">{count}</span>}</span></button>; })}</div></th></tr></thead>{rows.map(({ repo, account, localPath, modifiedAt }) => {
          const key = JSON.stringify([controller.catalog.instanceId, repo.id]);
          return <DashboardRepositoryRows key={key} repository={repo} account={account} controller={controller} localPath={localPath} modifiedAt={modifiedAt} expanded={expandedRepositories.has(key)} onToggle={() => setExpandedRepositories(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; })} onOpen={onOpen} onConfigure={onConfigure} onDownload={onDownload} showHidden={showHidden} onToggleHidden={toggleHidden} taskSearch={repositorySearchText(repo, account).includes(globalSearch.toLowerCase()) ? '' : globalSearch} onAction={openAction} onStatus={reportStatus} onHiddenBranches={reportHiddenBranches} />;
        })}</table></div>
        </DashboardActionNames>
        {!filtered.length && <div className="account-repos-empty">{incompleteClassification ? '所选分类尚未读取完整，暂时没有已确认的匹配项。' : !visibleAccounts.length || repositories.some(repo => isSelected(selectedAccounts, repo.accountId)) ? '没有符合搜索或筛选条件的仓库。' : visibleAccounts.some(account => account.error) ? '仓库读取未完成，正在自动重试；请检查账号权限。' : '当前账号没有可访问的仓库。'}</div>}
      </section>
    </>}
  </main>;
}

function DashboardRepositoryRows({ repository: repo, account, controller, localPath, modifiedAt, expanded, onToggle, onOpen, onConfigure, onDownload, showHidden, onToggleHidden, taskSearch, onAction, onStatus, onHiddenBranches }: {
  repository: RemoteRepository; account: Account; controller: WorkspaceController; localPath?: string; modifiedAt?: string; expanded: boolean; onToggle: () => void; onOpen: (id: string, taskId?: string) => void; onConfigure: (repository: RemoteRepository, branch?: string) => void; onDownload?: (repository: RemoteRepository, branch: string) => void; showHidden: boolean; onToggleHidden: (key: string) => void;
  taskSearch: string; onAction: (mode: RepositoryActionMode, targets: RepositoryActionTarget[], scope: string) => void; onStatus: (key: string, order: number) => void; onHiddenBranches: (key: string, entries: string[]) => void;
}) {
  const folder = usePresenceRepositoryIcon(repo);
  const branchesId = useId();
  const branchesRef = useRef<HTMLTableSectionElement>(null);
  const [branchesMounted, setBranchesMounted] = useState(expanded);
  const [branchesOpen, setBranchesOpen] = useState(false);
  const [branchesSettled, setBranchesSettled] = useState(false);
  const ready = !controller.loading && !controller.needsReload;
  const link = controller.catalog.links.find(link => link.repositoryId === repo.id);
  const { state } = useRemoteRepository(repo, controller.catalog.instanceId, (expanded || !!link) && ready, controller.remoteStates[repo.id], controller.preferences.unworkedBranchBehavior === 'hide');
  const largeBranches = Math.max(state.workspace?.tasks.length || 0, controller.localStates[repo.id]?.workspace?.tasks.length || 0) > 40;
  useLayoutEffect(() => {
    setBranchesSettled(false);
    if (expanded) setBranchesMounted(true);
    else setBranchesOpen(false);
  }, [expanded]);
  useLayoutEffect(() => {
    if (!expanded || !branchesMounted) return;
    // Establish the collapsed geometry before transitioning newly mounted rows.
    if (!largeBranches) branchesRef.current!.getBoundingClientRect();
    setBranchesOpen(true);
  }, [expanded, branchesMounted, largeBranches]);
  useEffect(() => {
    if (!branchesMounted) return;
    // Reduced motion has no transitionend; also finish when the page is hidden.
    const timeout = window.setTimeout(() => { if (expanded) setBranchesSettled(true); else setBranchesMounted(false); }, largeBranches || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 250);
    return () => window.clearTimeout(timeout);
  }, [expanded, branchesMounted, largeBranches]);
  // Linked rows share workspace-owned checks, including while filtered out.
  // Unlinked repositories keep their expanded-row, on-demand reader.
  const owner = repo.fullName.split('/').slice(0, -1).join('/');
  const local = controller.localStates[repo.id];
  const hiddenEntries = branchHiddenEntries(repo.id, controller.preferences, state.workspace?.tasks, linkedTasks(link, local));
  const reportedEntries = JSON.stringify([...hiddenEntries].filter(key => key.startsWith(`[${JSON.stringify(repo.id)},`)).sort());
  useLayoutEffect(() => { onHiddenBranches(JSON.stringify([controller.catalog.instanceId, repo.id]), JSON.parse(reportedEntries)); }, [controller.catalog.instanceId, repo.id, reportedEntries, onHiddenBranches]);
  const pushActivity = usePushActivity();
  const pushState = repositoryPushState(pushActivity.runs[repo.id], linkedTasks(link, local));
  const associationScope = JSON.stringify([controller.preferences.unworkedBranchBehavior, controller.preferences.hiddenEntries, controller.preferences.shownBranches]);
  const association = useAssociationStatus(controller.catalog.instanceId, link, local, state, hiddenEntries, associationScope);
  const hidden = hiddenEntries.has(hiddenEntryKey(repo.id));
  const tasks = linkedTasks(link, local, hiddenEntries).filter(task => taskMatchesSearch(task, taskSearch));
  const signals = gitSignals(tasks, state, local, undefined, repo.available, usesSystemAuthentication(link));
  const readFeedback = repositoryReadFeedback(gitSignals(linkedTasks(link, local, hiddenEntries), state, local, undefined, repo.available, usesSystemAuthentication(link)));
  const statusKey = JSON.stringify([controller.catalog.instanceId, repo.id]);
  const statusOrder = repositoryStatusOrder(gitSignals(linkedTasks(link, local, hiddenEntries), state, local, undefined, repo.available, usesSystemAuthentication(link)), pushState?.phase === 'pushing');
  useEffect(() => onStatus(statusKey, statusOrder), [onStatus, statusKey, statusOrder]);
  const openAction = (mode: RepositoryActionMode) => onAction(mode, repositoryActionTargets(repo, tasks, mode, state, local, link), repositoryOperationScope(repo.id));
  return <>
    <tbody><tr className={`dashboard-repository-row${hidden ? ' dashboard-hidden-row' : ''}`}>
      <td><div className="remote-name"><div className="repository-icon-anchor" aria-busy={readFeedback.reading || pushState?.phase === 'pushing'}><IconButton className="repository-icon-tile repository-disclosure" icon={folder.icon} title={folder.title} aria-description={folder.title} label={`${expanded ? '收起' : '展开'}分支：${repo.fullName} · ${accountLabel(account)}`} aria-expanded={expanded} aria-controls={branchesId} onClick={onToggle} /><PresenceManagedMark repository={repo} /><RepositoryReadBadge {...readFeedback} reading={readFeedback.reading && !pushState} /><PushFeedbackIcon state={pushState} /></div><div><div className="repository-name-line"><button className="repository-link" title={repo.fullName} onClick={() => onOpen(repo.id)}>{repo.name}</button><PresenceAvatars repository={repo} /></div><small><span className="repository-visibility">{repo.private ? '私有' : '公开'}</span>{repo.description ? ` · ${repo.description}` : ''}</small></div></div></td>
      <td><span className="repository-owner" title={owner}>{owner}</span></td>
      <td><div className="remote-account-cell" title={accountLabel(account)}><div><strong>{account.name}</strong><small>{account.provider === 'local' ? '使用仓库原有连接' : `${providerName(account.provider)} · ${account.login}@${new URL(account.host).host}`}</small></div></div></td>
      <td className="repository-managed-cell"><PresenceManagedNames repository={repo} /></td>
      <td><RepositoryDate value={repo.updatedAt} source="远端更新日期" /></td>
      <td><RepositoryDate value={modifiedAt} source="本地最近提交日期" /></td>
      <td><button className={`local-path local-path-action ${localPath ? '' : 'muted'}`} title={association.detail} aria-label={`配置本地目录：${repo.fullName} · ${accountLabel(account)}`} disabled={!repo.available && !localPath} onClick={() => onConfigure(repo)}><span>{association.label}</span>{localPath && <small>{localPath}</small>}</button></td>
      <td className="repository-action-cell"><RepositoryRowActions allowUnknownPush={usesSystemAuthentication(link)} operationScope={repositoryOperationScope(repo.id)} operationTargets={tasks.map(task => ({ repositoryId: repo.id, repositoryName: repo.fullName, task }))} itemLabel={`${repo.fullName} · 当前筛选分支`} signals={signals} hidden={hidden} onPull={(repo.available || usesSystemAuthentication(link)) && tasks.length ? () => openAction('pull') : undefined} onLatest={(repo.available || usesSystemAuthentication(link)) && tasks.length ? () => openAction('latest') : undefined} onClean={(repo.available || usesSystemAuthentication(link)) && tasks.length ? () => openAction('clean') : undefined} onCommit={() => openAction('commit')} onSubmit={() => openAction('submit')} onPush={() => openAction('push')} busy={repositoryActionBusy(controller.busy, repo.id) || !ready} onToggleHidden={() => onToggleHidden(hiddenEntryKey(repo.id))} /><RepositoryPinButton name={repo.fullName} pinned={controller.preferences.pinnedRepositories.includes(repo.id)} onToggle={() => controller.toggleRepositoryPin(repo.id)} /></td>
    </tr></tbody>
    <tbody ref={branchesRef} id={branchesId} className={`dashboard-repository-branches${largeBranches ? ' is-large' : ''}${branchesOpen ? ' is-expanded' : ''}${branchesSettled ? ' is-settled' : ''}`} aria-label={`远端分支：${repo.fullName} · ${accountLabel(account)}`} aria-hidden={!expanded} inert={!expanded} hidden={!branchesMounted} onTransitionEnd={event => { if (event.target instanceof HTMLTableCellElement && event.propertyName === 'height') { if (expanded) setBranchesSettled(true); else setBranchesMounted(false); } }}>{branchesMounted && <RepositoryBranchRows repository={repo} state={state} blocked={!ready} link={link} localState={local} onConfigure={onConfigure} onDownload={onDownload} onOpen={onOpen} downloadBusy={repositoryActionBusy(controller.busy, repo.id)} hiddenEntries={hiddenEntries} showHidden={showHidden} onToggleHidden={onToggleHidden} taskSearch={taskSearch} onAction={onAction} />}</tbody>
  </>;
}

export function RepositoryBranchRows({ repository, state, blocked = false, link, localState, onConfigure, onDownload, downloadBusy = false, hiddenEntries, showHidden = false, onToggleHidden, onOpen, taskSearch = '', onAction }: { repository: RemoteRepository; state: RemoteRepositoryState; blocked?: boolean; link?: LocalLink; localState?: LocalRepositoryState; onConfigure?: (repository: RemoteRepository, branch?: string) => void; onDownload?: (repository: RemoteRepository, branch: string) => void; downloadBusy?: boolean; hiddenEntries?: ReadonlySet<string>; showHidden?: boolean; onToggleHidden?: (key: string) => void; onOpen?: (id: string, taskId?: string) => void; taskSearch?: string; onAction?: (mode: RepositoryActionMode, targets: RepositoryActionTarget[], scope: string) => void }) {
  const renderStarted = performance.now();
  const { workspace, loading } = state;
  const presence = usePresence();
  const pushActivity = usePushActivity();
  const error = repository.available ? state.error : '访问账号目前无权读取此仓库。';
  const branchWarnings = workspace?.warnings.filter(warning => warning.startsWith('分支超过') || warning.startsWith('分支参与记录')) || [];
  const localTasks = linkedTasks(link, localState);
  const localByBranch = new Map<string, RepositoryTask[]>(), remoteByBranch = new Map<string, RepositoryTask[]>();
  for (const [tasks, grouped] of [[localTasks, localByBranch], [workspace?.tasks || [], remoteByBranch]] as const) for (const task of tasks) { const group = grouped.get(task.branch) || []; group.push(task); grouped.set(task.branch, group); }
  const collaborationBranches = presencePeople(presence?.status || null, presenceRepositoryId(repository)).flatMap(person => person.branches.flatMap(entry => entry.branch === null ? [] : [entry.branch]));
  const branches = [...new Set([...(workspace?.tasks.map(task => task.branch) || []), ...localTasks.map(task => task.branch), ...collaborationBranches])];
  const searchableBranches = branches.filter(branch => showHidden || !hiddenEntries?.has(hiddenEntryKey(repository.id, branch)));
  const visibleBranches = searchableBranches.filter(branch => taskMatchesSearch({ branch, path: null }, taskSearch) || localByBranch.get(branch)?.some(task => taskMatchesSearch(task, taskSearch)));
  useLayoutEffect(() => recordUIRender('branch-render', renderStarted, visibleBranches.length));
  return <>
    {error && <tr className="dashboard-branch-message"><BranchCell colSpan={8}><Notice kind="error">{error}{workspace ? ' 已保留上次读取的分支。' : ''} 收起后重新展开可重试。</Notice></BranchCell></tr>}
    {!workspace && !error && <tr className="dashboard-branch-message"><BranchCell colSpan={8}><span role="status">{blocked ? '账号服务尚未就绪。' : loading ? <><Icon name="spinner" className="spin" size={13} />正在读取远端分支…</> : '正在准备远端读取…'}</span></BranchCell></tr>}
    {workspace && !workspace.tasks.length && !error && <tr className="dashboard-branch-message"><BranchCell colSpan={8}><span role="status">此仓库暂无远端分支。</span></BranchCell></tr>}
    {branches.length > 0 && !visibleBranches.length && !error && <tr className="dashboard-branch-message"><BranchCell colSpan={8}><span role="status">{searchableBranches.length ? '没有符合当前搜索的分支或工作目录。' : '此仓库的分支已隐藏，点击上方「已隐藏」可显示并恢复。'}</span></BranchCell></tr>}
    {visibleBranches.map(branch => { const tasks = localByBranch.get(branch) || []; const paths = tasks.map(task => displayLocalPath(task.path!)); const key = hiddenEntryKey(repository.id, branch); const hidden = !!hiddenEntries?.has(key); const presenceOnly = !tasks.length && !workspace?.tasks.some(task => task.branch === branch); const push = branchPushState(pushActivity.runs[repository.id], tasks); const branchState = workspace ? { ...state, workspace: { ...workspace, tasks: remoteByBranch.get(branch) || [] } } : state; return <tr className={`dashboard-branch-row${hidden ? ' dashboard-hidden-row' : ''}`} key={branch}>
      <BranchCell colSpan={3}><div className="dashboard-branch-content"><div className="branch-label" title={branch}>{push ? <PushFeedbackIcon state={push} size={13} /> : <Icon name="branch" size={13} />}<span>{branch}</span><PresenceAvatars repository={repository} branch={branch} /></div>{branch === repository.defaultBranch && <small className="dashboard-default-branch">默认</small>}{presenceOnly && <small className="dashboard-default-branch">仅协作端</small>}</div></BranchCell>
      <BranchCell aria-hidden="true"></BranchCell><BranchCell aria-hidden="true"></BranchCell><BranchCell aria-hidden="true"></BranchCell>
      <BranchCell><button className={`local-path local-path-action ${paths.length ? '' : 'muted'}`} title={paths[0] || '选择该分支的真实工作目录，或包含它的父目录'} aria-label={`配置分支目录：${repository.fullName} · ${branch}`} disabled={blocked || (!repository.available && !paths.length) || !onConfigure} onClick={() => onConfigure?.(repository, branch)}>{paths.length ? `${paths[0]}${paths.length > 1 ? ` +${paths.length - 1}` : ''}` : '关联工作目录'}</button></BranchCell>
<BranchCell className="repository-action-cell"><RepositoryRowActions allowUnknownPush={usesSystemAuthentication(link)} operationScope={repositoryOperationScope(repository.id, branch)} operationTargets={tasks.map(task => ({ repositoryId: repository.id, repositoryName: repository.fullName, task }))} itemLabel={`${repository.fullName} · ${branch}`} signals={gitSignals(tasks, branchState, localState, branch, repository.available, usesSystemAuthentication(link))} hidden={hidden} onPull={onAction && (repository.available || usesSystemAuthentication(link)) && tasks.length ? () => onAction('pull', repositoryActionTargets(repository, tasks, 'pull', state, localState, link), repositoryOperationScope(repository.id, branch)) : undefined} onLatest={onAction && (repository.available || usesSystemAuthentication(link)) && tasks.length ? () => onAction('latest', repositoryActionTargets(repository, tasks, 'latest', state, localState, link), repositoryOperationScope(repository.id, branch)) : undefined} onClean={onAction && (repository.available || usesSystemAuthentication(link)) && tasks.length ? () => onAction('clean', repositoryActionTargets(repository, tasks, 'clean', state, localState, link), repositoryOperationScope(repository.id, branch)) : undefined} onCommit={onAction ? () => onAction('commit', repositoryActionTargets(repository, tasks, 'commit', state, localState, link), repositoryOperationScope(repository.id, branch)) : onOpen ? () => { const task = tasks.find(task => task.path && task.files.length); if (task) onOpen(repository.id, task.id); } : undefined} onSubmit={onAction ? () => onAction('submit', repositoryActionTargets(repository, tasks, 'submit', state, localState, link), repositoryOperationScope(repository.id, branch)) : undefined} onPush={onAction ? () => onAction('push', repositoryActionTargets(repository, tasks, 'push', state, localState, link), repositoryOperationScope(repository.id, branch)) : undefined} busy={blocked || downloadBusy} unlinked={!paths.length} onDownload={onDownload ? () => onDownload(repository, branch) : undefined} downloadBusy={downloadBusy} downloadBlocked={blocked || !repository.available || !workspace?.tasks.some(task => task.branch === branch) || !!(link && !link.worktrees && !localState?.workspace)} onToggleHidden={onToggleHidden ? () => onToggleHidden(key) : undefined} /></BranchCell>
    </tr>; })}
    {!!branchWarnings.length && <tr className="dashboard-branch-message"><BranchCell colSpan={8}><Notice kind="info">{branchWarnings.join(' ')}</Notice></BranchCell></tr>}
  </>;
}
