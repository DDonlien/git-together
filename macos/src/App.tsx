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
import { Button, GlassSystemProvider, Icon, Notice } from './ui';
import { componentTheme } from './theme';
import type { RemoteRepository } from './import-model';

export function App() {
  const controller = useWorkspace();
  const [page, setPage] = useState<'dashboard' | 'repo' | 'settings'>('dashboard');
  const [repoId, setRepoId] = useState('');
  const [globalSearch, setGlobalSearch] = useState('');
  const [configuring, setConfiguring] = useState<RemoteRepository | null>(null);
  const [bridgeError, setBridgeError] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const repository = controller.catalog.repositories.find(r => r.id === repoId);
  const account = controller.catalog.accounts.find(a => a.id === repository?.accountId);
  const localPath = controller.catalog.links.find(link => link.repositoryId === repoId)?.path;
  const remote = useRemoteRepository(page === 'repo' ? repository : undefined, controller.catalog.instanceId, !controller.loading && !controller.needsReload);
  const showDashboard = () => { setPage('dashboard'); setGlobalSearch(''); };
  const showSettings = () => { setPage('settings'); setGlobalSearch(''); };
  const openRepository = (id: string) => { setRepoId(id); setPage('repo'); setGlobalSearch(''); };
  useEffect(() => {
    // Old deep links no longer seed or reset workspace data.
    const url = new URL(location.href);
    if (url.searchParams.has('scene')) { url.searchParams.delete('scene'); history.replaceState({}, '', url); }
    let cancelled = false;
    if (window.gittogether) {
      document.documentElement.dataset.desktop = 'true';
      void window.gittogether.environment().catch(() => { if (!cancelled) setBridgeError('桌面材质桥接不可用，已使用浏览器材质。'); });
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
      document.documentElement.dataset.reducedGlass = String(controller.preferences.reducedGlass);
      void window.gittogether?.setTheme(theme).catch(() => setBridgeError('无法同步桌面外观，网页外观仍可使用。'));
    };
    apply(); media.addEventListener('change', apply); return () => media.removeEventListener('change', apply);
  }, [controller.preferences.theme, controller.preferences.reducedGlass]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !configuring) { event.preventDefault(); searchRef.current?.focus(); } };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [configuring]);
  return <GlassSystemProvider renderer="css" motion="system" toasts={false} theme={{ appearance: controller.preferences.theme, defaultAppearance: 'light', theme: { preset: 'neutral', accent: '#0064dc', contrast: 'high', radius: 'balanced', glass: { rim: 0.55, lensing: 0.15, shadow: 0.2, blur: 0.85, saturation: 0.68, brightness: 0.92, opacity: 1.3 } }, style: componentTheme, className: 'app-theme' }}><div className="app-frame">
    <WindowChrome native={!!window.gittogether} />
    <div className="app-body">
    <aside id="global-sidebar" className={`global-sidebar glass-panel${sidebarCollapsed ? ' is-collapsed' : ''}`}><SidebarHeader collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(value => !value)} /><nav className="global-nav"><button className={`nav-item ${page === 'dashboard' ? 'active' : ''}`} title="Dashboard" aria-label="Dashboard" onClick={showDashboard}><Icon name="dashboard" size={19} /><span>Dashboard</span></button></nav>
      <AccountSidebar catalog={controller.catalog} collapsedAccounts={controller.preferences.collapsedAccounts} loading={controller.loading} selectedRepositoryId={page === 'repo' ? repoId : undefined} onOpen={openRepository} onToggleAccount={id => controller.updatePreferences({ collapsedAccounts: controller.preferences.collapsedAccounts.includes(id) ? controller.preferences.collapsedAccounts.filter(accountId => accountId !== id) : [...controller.preferences.collapsedAccounts, id] })} />
      <div className="sidebar-bottom"><button className={`nav-item ${page === 'settings' ? 'active' : ''}`} title="设置" aria-label="设置" onClick={showSettings}><Icon name="settings" size={18} /><span>设置</span></button></div>
    </aside>
    <div className="app-content">
      {controller.error && <Notice kind="error">{controller.error}<Button variant="quiet" disabled={controller.loading} onClick={() => { if (controller.needsReload) location.reload(); else void controller.reload(); }}>{controller.needsReload ? '刷新页面' : controller.loading ? '检查连接…' : '重新连接'}</Button></Notice>}{controller.storageError && <Notice kind="error">{controller.storageError}</Notice>}{bridgeError && <Notice kind="info">{bridgeError}</Notice>}
      {page === 'dashboard' && <Dashboard controller={controller} onOpen={openRepository} onSettings={showSettings} onConfigure={setConfiguring} globalSearch={globalSearch} onSearchChange={setGlobalSearch} searchRef={searchRef} />}
      {page === 'repo' && repository && account && <RepositoryView key={`${controller.catalog.instanceId}:${repoId}:${localPath || ''}`} repository={repository} account={account} localPath={localPath} localState={controller.localStates[repoId]} remoteState={remote.state} readRemoteCommit={remote.readCommit} globalSearch={globalSearch} onSearchChange={setGlobalSearch} searchRef={searchRef} onConfigure={() => setConfiguring(repository)} />}
      {page === 'settings' && <SettingsView controller={controller} onDashboard={showDashboard} />}
    </div></div>{configuring && <LocalRepositoryModal key={configuring.id} repository={controller.catalog.repositories.find(r => r.id === configuring.id) || configuring} controller={controller} onClose={() => setConfiguring(null)} />}
  </div></GlassSystemProvider>;
}
