// @refresh reset
import { useEffect, useRef, useState } from 'react';
import { CircleIcon } from '@phosphor-icons/react/dist/csr/Circle';
import { useWorkspace } from './use-workspace';
import { Dashboard } from './Dashboard';
import { RepositoryView } from './RepositoryView';
import { RepositoryLogo } from './RepositoryLogo';
import { SettingsView } from './SettingsView';
import { LocalRepositoryModal } from './LocalRepositoryModal';
import { Button, GlassSystemProvider, Icon, Notice, SearchInput } from './ui';
import { componentTheme } from './theme';
import type { RemoteRepository } from './import-model';

export function App() {
  const controller = useWorkspace();
  const [page, setPage] = useState<'dashboard' | 'repo' | 'settings'>('dashboard');
  const [repoId, setRepoId] = useState('');
  const [globalSearch, setGlobalSearch] = useState('');
  const [configuring, setConfiguring] = useState<RemoteRepository | null>(null);
  const [nativeMaterial, setNativeMaterial] = useState(false);
  const [bridgeError, setBridgeError] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const repository = controller.catalog.repositories.find(r => r.id === repoId);
  const linked = new Set(controller.catalog.links.map(link => link.repositoryId));
  const showDashboard = () => { setPage('dashboard'); setGlobalSearch(''); };
  const showSettings = () => { setPage('settings'); setGlobalSearch(''); };
  const openRepository = (id: string) => { if (!linked.has(id)) return; setRepoId(id); setPage('repo'); setGlobalSearch(''); };
  useEffect(() => {
    // Old deep links no longer seed or reset workspace data.
    const url = new URL(location.href);
    if (url.searchParams.has('scene')) { url.searchParams.delete('scene'); history.replaceState({}, '', url); }
    let cancelled = false;
    if (window.gittogether) {
      document.documentElement.dataset.desktop = 'true';
      void window.gittogether.environment().then(env => { if (!cancelled) setNativeMaterial(env.nativeGlass); }).catch(() => { if (!cancelled) setBridgeError('桌面材质桥接不可用，已使用浏览器材质。'); });
    }
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (page === 'repo' && !controller.loading && (!repository || !linked.has(repoId))) showDashboard();
  }, [page, repository, repoId, controller.loading, controller.catalog.links]);
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
    <aside className="global-sidebar glass-panel"><div className="traffic-lights" aria-label="窗口控制">{!window.gittogether && <><span><CircleIcon weight="fill" size={12} color="#ff6058" /></span><span><CircleIcon weight="fill" size={12} color="#febc2e" /></span><button title="切换全屏" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen(); }}><CircleIcon weight="fill" size={12} color="#29c840" /></button></>}</div><div className="brand"><Icon name="branch" size={21} /><span>GitTogether</span></div><nav className="global-nav"><button className={`nav-item ${page === 'dashboard' ? 'active' : ''}`} title="Dashboard" onClick={showDashboard}><Icon name="dashboard" size={19} /><span>Dashboard</span></button></nav>
      <nav className="account-sidebar-list" aria-label="账号与本地仓库">{controller.catalog.accounts.map(account => {
        const collapsed = controller.preferences.collapsedAccounts.includes(account.id);
        const repositories = controller.catalog.repositories.filter(repo => repo.accountId === account.id && linked.has(repo.id));
        return <section className="sidebar-account" key={account.id}><button className="sidebar-account-toggle" aria-expanded={!collapsed} aria-controls={`account-${account.id}`} title={`${account.name} · ${account.login}@${new URL(account.host).host}`} onClick={() => controller.updatePreferences({ collapsedAccounts: collapsed ? controller.preferences.collapsedAccounts.filter(id => id !== account.id) : [...controller.preferences.collapsedAccounts, account.id] })}><Icon name={collapsed ? 'right' : 'down'} size={11} /><span>{account.name}</span><small>{repositories.length}</small></button>{!collapsed && <div id={`account-${account.id}`} className="sidebar-account-repositories">{repositories.map(repo => <button key={repo.id} className={`nav-item repository-item ${page === 'repo' && repo.id === repoId ? 'active' : ''}`} title={repo.fullName} onClick={() => openRepository(repo.id)}><RepositoryLogo /><span>{repo.name}</span>{!repo.available && <Icon name="warning" size={13} />}</button>)}{!repositories.length && <button className="sidebar-account-empty" onClick={showDashboard}>在 Dashboard 关联仓库</button>}</div>}</section>;
      })}{!controller.loading && !controller.catalog.accounts.length && <p className="sidebar-no-accounts">从设置添加账号</p>}</nav>
      <div className="sidebar-bottom"><button className={`nav-item ${page === 'settings' ? 'active' : ''}`} title="设置" onClick={showSettings}><Icon name="settings" size={18} /><span>设置</span></button></div>
    </aside>
    <div className="app-content"><header className="topbar import-topbar">{page === 'repo' && repository && <div className="breadcrumb"><strong>{repository.name}</strong></div>}{page !== 'settings' && <><SearchInput inputRef={searchRef} value={globalSearch} onChange={setGlobalSearch} placeholder={page === 'repo' ? '搜索文件或提交…' : '搜索仓库或本地目录…'} /><kbd className="search-shortcut">⌘ K</kbd></>}</header>
      {controller.error && <Notice kind="error">{controller.error}<Button variant="quiet" onClick={() => void controller.reload()}>重试</Button></Notice>}{controller.storageError && <Notice kind="error">{controller.storageError}</Notice>}{bridgeError && <Notice kind="info">{bridgeError}</Notice>}
      {page === 'dashboard' && <Dashboard controller={controller} onOpen={openRepository} onSettings={showSettings} onConfigure={setConfiguring} globalSearch={globalSearch} />}
      {page === 'repo' && repository && linked.has(repoId) && <RepositoryView key={`${repoId}:${controller.catalog.links.find(l => l.repositoryId === repoId)?.path}`} repository={repository} globalSearch={globalSearch} onConfigure={() => setConfiguring(repository)} />}
      {page === 'settings' && <SettingsView controller={controller} nativeMaterial={nativeMaterial} onDashboard={showDashboard} />}
    </div>{configuring && <LocalRepositoryModal key={configuring.id} repository={controller.catalog.repositories.find(r => r.id === configuring.id) || configuring} controller={controller} onClose={() => setConfiguring(null)} />}
  </div></GlassSystemProvider>;
}
