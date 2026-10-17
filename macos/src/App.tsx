import { useEffect, useRef, useState } from 'react';
import { useWorkspace } from './use-workspace';
import { useRemoteRepository } from './use-remote-repository';
import { Dashboard } from './Dashboard';
import { RepositoryView } from './RepositoryView';
import { AccountSidebar } from './AccountSidebar';
import { WindowChrome } from './WindowChrome';
import { SidebarHeader } from './SidebarHeader';
import { SettingsView } from './SettingsView';
import { LocalRepositoryModal } from './LocalRepositoryModal';
import { BranchDownloadModal } from './BranchDownloadModal';
import { RepositoryActionDraftsProvider } from './RepositoryActionDialog';
import { RepositoryOperationProvider } from './RepositoryOperationProvider';
import { Button, MaterialProvider, Icon, Notice } from './ui';
import type { RemoteRepository } from './import-model';
import { hiddenEntryKey } from './branch-links';
import { branchHiddenEntries, toggleBranchVisibility } from './branch-behavior';
import { PresenceProvider } from './PresenceProvider';
import { RemoteControlProvider } from './RemoteControlProvider';
type AppPage = 'dashboard' | 'repo' | 'settings';
type AppLocation = { page: AppPage; repoId: string; commitTask: string | null; globalSearch: string };
const sameLocation = (left: AppLocation, right: AppLocation) => left.page === right.page && left.repoId === right.repoId && left.commitTask === right.commitTask && left.globalSearch === right.globalSearch;

export function App() {
  const controller = useWorkspace();
  const [page, setPage] = useState<AppPage>('dashboard');
  const [repoId, setRepoId] = useState('');
  const [commitTask, setCommitTask] = useState<string | null>(null);
  const [globalSearch, setGlobalSearch] = useState('');
  const routeHistory = useRef<AppLocation[]>([{ page: 'dashboard', repoId: '', commitTask: null, globalSearch: '' }]);
  const routeIndex = useRef(0);
  const [navigationState, setNavigationState] = useState({ canGoBack: false, canRedo: false });
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFeedback, setRefreshFeedback] = useState<{ kind: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [configuring, setConfiguring] = useState<{ repository: RemoteRepository; branch?: string } | null>(null);
  const [downloading, setDownloading] = useState<{ repository: RemoteRepository; branch: string } | null>(null);
  const [bridgeError, setBridgeError] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const searchRef = useRef<HTMLElement>(null);
  const repository = controller.catalog.repositories.find(r => r.id === repoId);
  const account = controller.catalog.accounts.find(a => a.id === repository?.accountId);
  const localLink = controller.catalog.links.find(link => link.repositoryId === repoId);
  const localPath = localLink?.path;
  const remote = useRemoteRepository(page === 'repo' ? repository : undefined, controller.catalog.instanceId, !controller.loading && !controller.needsReload && !controller.updates.installing, page === 'repo' ? controller.remoteStates[repoId] : undefined, controller.preferences.unworkedBranchBehavior === 'hide');
  const hiddenEntries = branchHiddenEntries(repoId, controller.preferences, remote.state.workspace?.tasks, controller.localStates[repoId]?.workspace?.tasks);
  const currentLocation = (): AppLocation => ({ page, repoId, commitTask, globalSearch });
  const applyLocation = (location: AppLocation) => { setPage(location.page); setRepoId(location.repoId); setCommitTask(location.commitTask); setGlobalSearch(location.globalSearch); };
  const updateNavigationState = () => setNavigationState({ canGoBack: routeIndex.current > 0, canRedo: routeIndex.current < routeHistory.current.length - 1 });
  const navigate = (location: AppLocation, replace = false) => {
    routeHistory.current[routeIndex.current] = currentLocation();
    if (replace) routeHistory.current[routeIndex.current] = location;
    else if (!sameLocation(routeHistory.current[routeIndex.current], location)) {
      routeHistory.current = [...routeHistory.current.slice(0, routeIndex.current + 1), location];
      routeIndex.current = routeHistory.current.length - 1;
    }
    applyLocation(location); updateNavigationState();
  };
  const goBack = () => {
    if (routeIndex.current < 1) return;
    routeHistory.current[routeIndex.current] = currentLocation(); routeIndex.current--;
    applyLocation(routeHistory.current[routeIndex.current]); updateNavigationState();
  };
  const redoNavigation = () => {
    if (routeIndex.current >= routeHistory.current.length - 1) return;
    routeHistory.current[routeIndex.current] = currentLocation(); routeIndex.current++;
    applyLocation(routeHistory.current[routeIndex.current]); updateNavigationState();
  };
  const showDashboard = () => navigate({ page: 'dashboard', repoId: '', commitTask: null, globalSearch: '' });
  const showSettings = () => navigate({ page: 'settings', repoId: '', commitTask: null, globalSearch: '' });
  const openRepository = (id: string, taskId?: string) => {
    const target = controller.catalog.repositories.find(item => item.id === id);
    if (target && controller.preferences.collapsedAccounts.includes(target.accountId)) {
      controller.updatePreferences({ collapsedAccounts: controller.preferences.collapsedAccounts.filter(accountId => accountId !== target.accountId) });
    }
    setSidebarCollapsed(false);
    navigate({ page: 'repo', repoId: id, commitTask: taskId || null, globalSearch: '' });
  };
  const refreshRepositories = async () => {
    if (refreshing || controller.loading || controller.needsReload || controller.updates.installing) return;
    const accounts = [...controller.catalog.accounts];
    setRefreshFeedback(null); setRefreshing(true);
    if (!accounts.length) { setRefreshFeedback({ kind: 'info', message: '没有可刷新的账号。' }); setRefreshing(false); return; }
    const failures: string[] = [];
    for (const account of accounts) {
      try {
        const next = await controller.refresh(account.id);
        const failure = next.accounts.find(item => item.id === account.id)?.error;
        if (failure) failures.push(`${account.name}：${failure}`);
      } catch (problem) {
        failures.push(`${account.name}：${problem instanceof Error ? problem.message : '刷新失败。'}`);
      }
    }
    setRefreshFeedback(failures.length
      ? { kind: 'error', message: `${failures.length} 个账号未能完整刷新；已保留这些账号上次成功的仓库目录。${failures[0]}` }
      : { kind: 'success', message: '仓库列表已刷新。' });
    setRefreshing(false);
  };
  useEffect(() => {
    // Old deep links no longer seed or reset workspace data.
    const url = new URL(location.href);
    if (url.searchParams.has('scene')) { url.searchParams.delete('scene'); history.replaceState({}, '', url); }
    let cancelled = false;
    if (window.gittogether) {
      document.documentElement.dataset.desktop = 'true';
      void window.gittogether.environment().catch(() => { if (!cancelled) setBridgeError('桌面桥接不可用，部分本地操作可能无法使用。'); });
    }
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (page === 'repo' && !controller.loading && !repository) navigate({ page: 'dashboard', repoId: '', commitTask: null, globalSearch: '' }, true);
  }, [page, repository, controller.loading]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const theme = controller.preferences.theme;
      document.documentElement.dataset.theme = theme === 'system' ? media.matches ? 'dark' : 'light' : theme;
      void window.gittogether?.setTheme(theme).catch(() => setBridgeError('无法同步桌面外观，网页外观仍可使用。'));
    };
    apply(); media.addEventListener('change', apply); return () => media.removeEventListener('change', apply);
  }, [controller.preferences.theme]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !configuring && !downloading) { event.preventDefault(); searchRef.current?.focus(); } };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [configuring, downloading]);
  return <MaterialProvider appearance={controller.preferences.theme}><PresenceProvider><RemoteControlProvider><RepositoryActionDraftsProvider sessionId={controller.catalog.instanceId}><RepositoryOperationProvider sessionId={controller.catalog.instanceId} pauseRepositoryRefresh={controller.pauseRepositoryRefresh}><div className="app-frame">
    <WindowChrome native={!!window.gittogether} />
    <div className="app-body">
    <aside id="global-sidebar" className={`global-sidebar${sidebarCollapsed ? ' is-collapsed' : ''}`}><SidebarHeader collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(value => !value)} /><nav className="global-nav"><button className={`nav-item sidebar-permanent ${page === 'dashboard' ? 'active' : ''}`} title="Dashboard" aria-label="Dashboard" onClick={showDashboard}><span className="sidebar-button-icon" aria-hidden="true"><Icon name="dashboard" size={19} /></span><span>Dashboard</span></button></nav>
      <AccountSidebar catalog={controller.catalog} collapsedAccounts={controller.preferences.collapsedAccounts} pinnedRepositories={controller.preferences.pinnedRepositories} onTogglePin={controller.toggleRepositoryPin} loading={controller.loading} selectedRepositoryId={page === 'repo' ? repoId : undefined} onOpen={openRepository} onToggleAccount={id => controller.updatePreferences({ collapsedAccounts: controller.preferences.collapsedAccounts.includes(id) ? controller.preferences.collapsedAccounts.filter(accountId => accountId !== id) : [...controller.preferences.collapsedAccounts, id] })} />
      <div className="sidebar-bottom"><button className={`nav-item sidebar-permanent ${page === 'settings' ? 'active' : ''}`} title="设置" aria-label="设置" onClick={showSettings}><span className="sidebar-button-icon" aria-hidden="true"><Icon name="settings" size={19} /></span><span>设置</span></button></div>
    </aside>
    <div className="app-content">
      {!controller.updates.installing && controller.error && <Notice kind="error">{controller.error}<Button variant="quiet" disabled={controller.loading} onClick={() => { if (controller.needsReload) location.reload(); else void controller.reload(); }}>{controller.needsReload ? '刷新页面' : controller.loading ? '检查连接…' : '重新连接'}</Button></Notice>}{controller.storageError && <Notice kind="error">{controller.storageError}</Notice>}{bridgeError && <Notice kind="info">{bridgeError}</Notice>}
      {page === 'dashboard' && <Dashboard controller={controller} onOpen={openRepository} onSettings={showSettings} onConfigure={(repository, branch) => setConfiguring({ repository, branch })} onDownload={(repository, branch) => setDownloading({ repository, branch })} globalSearch={globalSearch} onSearchChange={setGlobalSearch} searchRef={searchRef} canGoBack={navigationState.canGoBack} canRedo={navigationState.canRedo} onBack={goBack} onRedo={redoNavigation} onRefresh={refreshRepositories} refreshDisabled={controller.loading || controller.needsReload || controller.updates.installing} refreshing={refreshing} refreshFeedback={refreshFeedback} />}
      {page === 'repo' && repository && account && <RepositoryView key={`${controller.catalog.instanceId}:${repoId}:${localPath || ''}`} initialCommitTask={commitTask} repository={repository} account={account} localPath={localPath} localLink={localLink} hiddenEntries={hiddenEntries} manualHiddenEntries={new Set(controller.preferences.hiddenEntries || [])} onToggleHidden={() => { const key = hiddenEntryKey(repoId); controller.updatePreferences(toggleBranchVisibility(controller.preferences, key, hiddenEntries.has(key))); }} localState={controller.localStates[repoId]} remoteState={remote.state} readRemoteCommit={remote.readCommit} submitCommit={controller.submitCommit} pushCommit={controller.pushCommit} applySync={controller.applySync} writeGraph={controller.writeGraph} onLocalFilesChanged={() => controller.refreshLocal(repoId)} globalSearch={globalSearch} onSearchChange={setGlobalSearch} searchRef={searchRef} onConfigure={() => setConfiguring({ repository })} canGoBack={navigationState.canGoBack} canRedo={navigationState.canRedo} onBack={goBack} onRedo={redoNavigation} onRefresh={refreshRepositories} refreshDisabled={controller.loading || controller.needsReload || controller.updates.installing} refreshing={refreshing} refreshFeedback={refreshFeedback} />}
      {page === 'settings' && <SettingsView controller={controller} onDashboard={showDashboard} />}
    </div></div>{configuring && <LocalRepositoryModal key={`${configuring.repository.id}:${configuring.branch || ''}`} repository={controller.catalog.repositories.find(r => r.id === configuring.repository.id) || configuring.repository} branch={configuring.branch} controller={controller} onClose={() => setConfiguring(null)} />}{downloading && <BranchDownloadModal key={`${downloading.repository.id}:${downloading.branch}`} repository={controller.catalog.repositories.find(r => r.id === downloading.repository.id) || downloading.repository} branch={downloading.branch} controller={controller} onClose={() => setDownloading(null)} />}
  </div></RepositoryOperationProvider></RepositoryActionDraftsProvider></RemoteControlProvider></PresenceProvider></MaterialProvider>;
}
