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
import { Button, MaterialProvider, Icon, Notice } from './ui';
import type { RemoteRepository } from './import-model';
import { hiddenEntryKey } from './branch-links';

export function App() {
  const controller = useWorkspace();
  const [page, setPage] = useState<'dashboard' | 'repo' | 'settings'>('dashboard');
  const [repoId, setRepoId] = useState('');
  const [commitTask, setCommitTask] = useState<string | null>(null);
  const [globalSearch, setGlobalSearch] = useState('');
  const [configuring, setConfiguring] = useState<{ repository: RemoteRepository; branch?: string } | null>(null);
  const [downloading, setDownloading] = useState<{ repository: RemoteRepository; branch: string } | null>(null);
  const [bridgeError, setBridgeError] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const searchRef = useRef<HTMLElement>(null);
  const repository = controller.catalog.repositories.find(r => r.id === repoId);
  const account = controller.catalog.accounts.find(a => a.id === repository?.accountId);
  const localLink = controller.catalog.links.find(link => link.repositoryId === repoId);
  const localPath = localLink?.path;
  const hiddenEntries = new Set(controller.preferences.hiddenEntries || []);
  const remote = useRemoteRepository(page === 'repo' ? repository : undefined, controller.catalog.instanceId, !controller.loading && !controller.needsReload, page === 'repo' ? controller.remoteStates[repoId] : undefined);
  const showDashboard = () => { setPage('dashboard'); setGlobalSearch(''); };
  const showSettings = () => { setPage('settings'); setGlobalSearch(''); };
  const openRepository = (id: string, taskId?: string) => {
    setCommitTask(taskId || null);
    const target = controller.catalog.repositories.find(item => item.id === id);
    if (target && controller.preferences.collapsedAccounts.includes(target.accountId)) {
      controller.updatePreferences({ collapsedAccounts: controller.preferences.collapsedAccounts.filter(accountId => accountId !== target.accountId) });
    }
    setSidebarCollapsed(false);
    setRepoId(id); setPage('repo'); setGlobalSearch('');
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
    if (page === 'repo' && !controller.loading && !repository) showDashboard();
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
  return <MaterialProvider appearance={controller.preferences.theme}><RepositoryActionDraftsProvider sessionId={controller.catalog.instanceId}><div className="app-frame">
    <WindowChrome native={!!window.gittogether} />
    <div className="app-body">
    <aside id="global-sidebar" className={`global-sidebar${sidebarCollapsed ? ' is-collapsed' : ''}`}><SidebarHeader collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(value => !value)} /><nav className="global-nav"><button className={`nav-item sidebar-permanent ${page === 'dashboard' ? 'active' : ''}`} title="Dashboard" aria-label="Dashboard" onClick={showDashboard}><span className="sidebar-button-icon" aria-hidden="true"><Icon name="dashboard" size={19} /></span><span>Dashboard</span></button></nav>
      <AccountSidebar catalog={controller.catalog} collapsedAccounts={controller.preferences.collapsedAccounts} loading={controller.loading} selectedRepositoryId={page === 'repo' ? repoId : undefined} onOpen={openRepository} onToggleAccount={id => controller.updatePreferences({ collapsedAccounts: controller.preferences.collapsedAccounts.includes(id) ? controller.preferences.collapsedAccounts.filter(accountId => accountId !== id) : [...controller.preferences.collapsedAccounts, id] })} />
      <div className="sidebar-bottom"><button className={`nav-item sidebar-permanent ${page === 'settings' ? 'active' : ''}`} title="设置" aria-label="设置" onClick={showSettings}><span className="sidebar-button-icon" aria-hidden="true"><Icon name="settings" size={19} /></span><span>设置</span></button></div>
    </aside>
    <div className="app-content">
      {controller.error && <Notice kind="error">{controller.error}<Button variant="quiet" disabled={controller.loading} onClick={() => { if (controller.needsReload) location.reload(); else void controller.reload(); }}>{controller.needsReload ? '刷新页面' : controller.loading ? '检查连接…' : '重新连接'}</Button></Notice>}{controller.storageError && <Notice kind="error">{controller.storageError}</Notice>}{bridgeError && <Notice kind="info">{bridgeError}</Notice>}
      {page === 'dashboard' && <Dashboard controller={controller} onOpen={openRepository} onSettings={showSettings} onConfigure={(repository, branch) => setConfiguring({ repository, branch })} onDownload={(repository, branch) => setDownloading({ repository, branch })} globalSearch={globalSearch} onSearchChange={setGlobalSearch} searchRef={searchRef} />}
      {page === 'repo' && repository && account && <RepositoryView key={`${controller.catalog.instanceId}:${repoId}:${localPath || ''}`} initialCommitTask={commitTask} repository={repository} account={account} localPath={localPath} localLink={localLink} hiddenEntries={hiddenEntries} onToggleHidden={() => { const next = new Set(hiddenEntries); const key = hiddenEntryKey(repoId); if (!next.delete(key)) next.add(key); controller.updatePreferences({ hiddenEntries: [...next] }); }} localState={controller.localStates[repoId]} remoteState={remote.state} readRemoteCommit={remote.readCommit} submitCommit={controller.submitCommit} pushCommit={controller.pushCommit} applySync={controller.applySync} globalSearch={globalSearch} onSearchChange={setGlobalSearch} searchRef={searchRef} onConfigure={() => setConfiguring({ repository })} />}
      {page === 'settings' && <SettingsView controller={controller} onDashboard={showDashboard} />}
    </div></div>{configuring && <LocalRepositoryModal key={`${configuring.repository.id}:${configuring.branch || ''}`} repository={controller.catalog.repositories.find(r => r.id === configuring.repository.id) || configuring.repository} branch={configuring.branch} controller={controller} onClose={() => setConfiguring(null)} />}{downloading && <BranchDownloadModal key={`${downloading.repository.id}:${downloading.branch}`} repository={controller.catalog.repositories.find(r => r.id === downloading.repository.id) || downloading.repository} branch={downloading.branch} controller={controller} onClose={() => setDownloading(null)} />}
  </div></RepositoryActionDraftsProvider></MaterialProvider>;
}
