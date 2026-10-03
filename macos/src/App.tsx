// @refresh reset
import { useEffect, useRef, useState } from 'react';
import { CircleIcon } from '@phosphor-icons/react/dist/csr/Circle';
import { createWorkspace, scenes } from './data';
import { commitWorktree, updateWorktree } from './domain';
import { useWorkspace } from './use-workspace';
import { Dashboard } from './Dashboard';
import { RepositoryView } from './RepositoryView';
import { Button, GlassSystemProvider, Icon, IconButton, Menu, MenuItem, Modal, Notice, Popover, SearchInput, Select, Switch, TextField } from './ui';
import pkg from '../package.json';
import { componentTheme } from './theme';

export function App() {
  const controller = useWorkspace();
  const [page, setPage] = useState<'dashboard' | 'repo' | 'guide'>('dashboard');
  const [sceneRevision, setSceneRevision] = useState(0);
  const [repoId, setRepoId] = useState('ball-maze');
  const [worktreeId, setWorktreeId] = useState('ball-controller');
  const [expanded, setExpanded] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [detailsTab, setDetailsTab] = useState<'graph' | 'tree'>('graph');
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [fileId, setFileId] = useState<string>();
  const [globalSearch, setGlobalSearch] = useState('');
  const [popover, setPopover] = useState<'scenes' | 'layout' | 'profile' | null>(null);
  const [modal, setModal] = useState<'settings' | 'add' | 'reset' | null>(null);
  const [repoName, setRepoName] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const [nativeMaterial, setNativeMaterial] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const repositories = controller.state.repositories;
  const repository = repositories.find(r => r.id === repoId) || repositories[0];
  const openRepository = (id: string, worktree?: string) => {
    const repo = repositories.find(r => r.id === id)!;
    setRepoId(id); setWorktreeId(worktree || repo.worktrees.find(w => /controller/.test(w.branch))?.id || repo.worktrees[0].id);
    setFileId(undefined); setGlobalSearch(''); setPage('repo');
  };

  function applyScene(id: string, reset = true) {
    setSceneRevision(n => n + 1);
    const url = new URL(window.location.href); url.searchParams.set('scene', id); window.history.replaceState({}, '', url);
    setPopover(null); setGlobalSearch(''); setSelected([]); setFileId(undefined); setDetailsOpen(id !== '12');
    setDetailsTab(id === '07' || id === '09' ? 'tree' : 'graph');
    if (reset) controller.load({ ...createWorkspace(), lastScene: id, preferences: { ...controller.state.preferences, rowActions: id === '05', failCommit: id === '11' } });
    if (id === '00') { setPage('guide'); return; }
    if (Number(id) <= 5) {
      setPage('dashboard'); setExpanded(id === '01' ? [] : ['ball-maze', ...(id === '04' ? ['must-be-human', 'lebab'] : [])]);
      if (id === '03' || id === '04') setSelected(['ball-controller', 'human-main', 'lebab-main']);
      if (id === '05') setSelected(['ball-controller']);
      if (id === '04' && reset) {
        controller.setOutcomes({ 'ball-controller': { phase: 'success', action: 'Fetch', message: 'Fetch 演示完成' }, 'human-main': { phase: 'error', action: 'Get Latest', message: '工作目录有冲突，已阻止更新。' }, 'lebab-main': { phase: 'running', action: 'Submit', message: 'Submit 正在执行…' } });
        window.setTimeout(() => void controller.batch(['lebab-main'], 'Submit'), 450);
      } else controller.setOutcomes({});
    } else {
      if (reset) {
      const seed = createWorkspace(); seed.lastScene = id; seed.preferences = { ...controller.state.preferences, rowActions: false, failCommit: id === '11' };
      controller.setCommitResult({});
      if (id === '10') {
        seed.repositories = updateWorktree(seed.repositories, 'ball-controller', w => commitWorktree({ ...w, draft: { summary: 'Improve controller input handling', description: 'Update controller dead-zone handling and main-menu navigation.' } }, '4d62b1c', '刚刚'));
        controller.setCommitResult({ 'ball-controller': { kind: 'success', message: '本地演示提交 4d62b1c 已创建 · 未推送' } });
      }
      if (id === '11') {
        seed.repositories = updateWorktree(seed.repositories, 'ball-controller', w => ({ ...w, draft: { summary: 'Improve controller input handling', description: 'Update controller dead-zone handling.\nUpdate input mapping and main-menu navigation.' } }));
        controller.setCommitResult({ 'ball-controller': { kind: 'error', message: '演示提交检查未通过。你的概要、描述和文件选择已保留。' } });
      }
      controller.setState(seed);
      }
      setRepoId('ball-maze'); setWorktreeId('ball-controller'); setPage('repo');
      if (id === '08') setFileId('controller');
      if (id === '09' && reset) window.setTimeout(() => void controller.ai('ball-controller'), 120);
    }
  }

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get('scene');
    const timer = initial && scenes.some(s => s[0] === initial) ? window.setTimeout(() => applyScene(initial, controller.state.lastScene !== initial), 60) : undefined;
    void window.gittogether?.environment().then(env => { setNativeMaterial(env.nativeGlass); document.documentElement.dataset.desktop = 'true'; });
    return () => { if (timer) window.clearTimeout(timer); };
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const theme = controller.state.preferences.theme;
      document.documentElement.dataset.theme = theme === 'system' ? media.matches ? 'dark' : 'light' : theme;
      document.documentElement.dataset.reducedGlass = String(controller.state.preferences.reducedGlass);
      void window.gittogether?.setTheme(theme);
    };
    apply(); media.addEventListener('change', apply); return () => media.removeEventListener('change', apply);
  }, [controller.state.preferences.theme, controller.state.preferences.reducedGlass]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchRef.current?.focus(); }
      if (event.key === 'Escape') setPopover(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return <GlassSystemProvider renderer="css" motion="system" toasts={false} theme={{ appearance: controller.state.preferences.theme, defaultAppearance: 'light', theme: { preset: 'neutral', accent: '#0064dc', contrast: 'high', radius: 'balanced', glass: { rim: 0.55, lensing: 0.15, shadow: 0.2, blur: 0.85, saturation: 0.68, brightness: 0.92, opacity: 1.3 } }, style: componentTheme, className: 'app-theme' }}><div className="app-frame">
    <aside className="global-sidebar glass-panel">
      <div className="traffic-lights" aria-label="窗口控制">{!window.gittogether && <><button title="关闭预览菜单" onClick={() => setPopover(null)}><CircleIcon weight="fill" size={12} color="#ff6058" /></button><button title="打开布局设置" onClick={() => setPopover('layout')}><CircleIcon weight="fill" size={12} color="#febc2e" /></button><button title="切换全屏" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen(); }}><CircleIcon weight="fill" size={12} color="#29c840" /></button></>}</div>
      <div className="brand"><Icon name="branch" size={21} /><span>GitTogether</span></div>
      <nav className="global-nav"><button className={`nav-item ${page === 'dashboard' ? 'active' : ''}`} onClick={() => { setPage('dashboard'); setGlobalSearch(''); }}><Icon name="dashboard" size={19} />Dashboard</button></nav>
      <div className="sidebar-label">REPOSITORIES <span>{repositories.length}</span></div>
      <nav className="repo-sidebar-list">{repositories.map(repo => <button key={repo.id} className={`nav-item repository-item ${page === 'repo' && repo.id === repoId ? 'active' : ''}`} onClick={() => openRepository(repo.id)}><Icon name="folder" size={18} style={{ color: repo.color }} /><span>{repo.name}</span>{repo.worktrees.some(w => w.agents > 0) && <span className="mini-dot" style={{ background: repo.color }} />}</button>)}</nav>
      <button className="add-repo-sidebar" onClick={() => setModal('add')}><Icon name="plus" size={16} />添加仓库</button>
      <div className="sidebar-bottom"><div className="presence-summary"><span className="mini-dot teal" /><span>Presence<small>演示连接</small></span><Icon name="users" size={17} /></div><button className={`nav-item ${page === 'guide' ? 'active' : ''}`} onClick={() => { setPage('guide'); setGlobalSearch(''); }}><Icon name="book" size={18} />页面与交互指南</button><button className="nav-item" onClick={() => setModal('settings')}><Icon name="settings" size={18} />设置</button><div className="sidebar-profile"><span className="avatar">ZG</span><span>Zhengtao<small>本地工作台</small></span><Popover label="用户菜单" open={popover === 'profile'} onOpenChange={open => setPopover(open ? 'profile' : null)} placement="start" className="profile-menu" trigger={<IconButton icon="more" label="用户菜单" />}><strong>Zhengtao</strong><p>当前数据仅保存在本机。</p><Button variant="quiet" onClick={() => { setModal('settings'); setPopover(null); }}>打开设置</Button></Popover></div></div>
    </aside>
    <div className="app-content"><header className="topbar"><div className="breadcrumb"><strong>{page === 'dashboard' ? 'Dashboard' : page === 'guide' ? 'Guide' : repository.name}</strong>{page === 'repo' && <><Icon name="right" size={12} /><span>{repository.worktrees.find(w => w.id === worktreeId)?.label || 'Local'}</span></>}<span className="header-demo-badge" title="演示模式，未连接真实 Git">Demo</span></div><SearchInput inputRef={searchRef} value={globalSearch} onChange={setGlobalSearch} placeholder="搜索仓库、文件或分支…" /><kbd className="search-shortcut">⌘ K</kbd><div className="topbar-actions"><span className="local-mode"><span className="mini-dot teal" />Local</span><div className="toolbar-group"><Menu label="布局" open={popover === 'layout'} onOpenChange={open => setPopover(open ? 'layout' : null)} className="layout-menu" trigger={<Button className="toolbar-button" leadingIcon={<Icon name="sliders" size={17} />} trailingIcon={<Icon name="down" size={11} />}>布局</Button>}><p className="popover-title">Dashboard 操作方式</p><MenuItem onClick={() => controller.preferences({ rowActions: false })}><Icon name="list" size={16} />统一操作栏{!controller.state.preferences.rowActions && <Icon name="success" size={14} />}</MenuItem><MenuItem onClick={() => controller.preferences({ rowActions: true })}><Icon name="sliders" size={16} />行内操作{controller.state.preferences.rowActions && <Icon name="success" size={14} />}</MenuItem><div className="menu-divider" /><MenuItem onClick={() => setDetailsOpen(!detailsOpen)}><Icon name="sidebar" size={16} />{detailsOpen ? '收起详情栏' : '显示详情栏'}</MenuItem></Menu><Button className="toolbar-button add-toolbar" onClick={() => setModal('add')} leadingIcon={<Icon name="plus" size={17} />}>仓库</Button></div><Menu label="演示场景" open={popover === 'scenes'} onOpenChange={open => setPopover(open ? 'scenes' : null)} className="scene-popover" trigger={<Button className="scenes-trigger" leadingIcon={<Icon name="squares" size={17} />} trailingIcon={<Icon name="down" size={11} />}>演示场景</Button>}><p className="popover-title">Wireframes v0.1 · 13 个状态</p>{scenes.map(scene => <MenuItem key={scene[0]} onClick={() => applyScene(scene[0])}><span className="scene-number">{scene[0]}</span>{scene[1]}</MenuItem>)}</Menu></div></header>
      {controller.storageError && <Notice kind="error">{controller.storageError}<button className="text-button" onClick={() => setModal('reset')}>重置演示数据</button></Notice>}
      {page === 'dashboard' && <Dashboard key={sceneRevision} controller={controller} onOpen={openRepository} expanded={expanded} setExpanded={setExpanded} selected={selected} setSelected={setSelected} globalSearch={globalSearch} />}
      {page === 'repo' && <RepositoryView key={`${repoId}-${sceneRevision}`} controller={controller} repository={repository} worktreeId={worktreeId} setWorktreeId={setWorktreeId} detailsTab={detailsTab} setDetailsTab={setDetailsTab} detailsOpen={detailsOpen} setDetailsOpen={setDetailsOpen} fileId={fileId} setFileId={setFileId} globalSearch={globalSearch} />}
      {page === 'guide' && <main className="guide-view"><div className="page-heading"><div><p className="eyebrow">A FRESH START</p><h1>Good work starts together.</h1><p className="subtitle">GitTogether · 页面与交互指南</p></div><span className="demo-badge">v{pkg.version}</span></div><div className="guide-intro"><div><Icon name="branch" size={27} /><h2>你的仓库，你的工作方式。</h2><p>从多个项目的全局视野，到一个文件的细微变化。选择工作目录、查看 Diff、整理提交，所有操作都有清晰的边界。</p></div><div><h3>这是一份可交互的演示</h3><p>8 个仓库 · 11 个本地 worktree · 3 个 Agent · 1 个 Presence 提醒。数据与 Git/AI 结果均为演示，不改变真实仓库。</p><p>选择和提交说明会保存在本机。切换场景会加载相应示例状态；设置内可以重置演示。</p></div></div><h2 className="guide-section-title">探索每一个状态</h2><div className="scene-grid">{scenes.filter(scene => scene[0] !== '00').map(scene => <button key={scene[0]} onClick={() => applyScene(scene[0])}><span className="scene-number">{scene[0]}</span><span>{scene[1]}<small>{scene[2] === 'dashboard' ? '多仓库总览与批量操作' : '仓库文件与提交工作流'}</small></span><Icon name="right" size={17} /></button>)}</div><div className="guide-shortcuts"><span><kbd>⌘</kbd><kbd>K</kbd> 快速搜索</span><span><kbd>⌘</kbd><kbd>↵</kbd> 提交选中文件</span><span><kbd>esc</kbd> 关闭弹窗或菜单</span></div></main>}
    </div>
    {modal === 'settings' && <Modal title="设置" onClose={() => setModal(null)}><section className="settings-section"><h3>外观</h3><div className="settings-group"><div className="setting-row"><span>颜色方案<small>与系统一致，或选择亮色与暗色</small></span><Select label={<span className="sr-only">颜色方案</span>} options={[{value:'light',label:'亮色'},{value:'dark',label:'暗色'},{value:'system',label:'跟随系统'}]} value={controller.state.preferences.theme} onChange={e => controller.preferences({ theme: e.target.value as 'light' | 'dark' | 'system' })} /></div><Switch className="setting-row" label="减少透明度" description="使用更实的导航与控制层" checked={controller.state.preferences.reducedGlass} onCheckedChange={checked => controller.preferences({ reducedGlass: checked })} /></div><div className="setting-material"><Icon name="desktop" size={15} />{nativeMaterial ? 'Electron · 原生 Liquid Glass 已启用' : 'OpenGlass UI · 浏览器预览'}</div></section><section className="settings-section"><h3>演示行为</h3><div className="settings-group"><Switch className="setting-row" label="提交失败" description="演示失败后保留表单和文件选择" checked={controller.state.preferences.failCommit} onCheckedChange={checked => controller.preferences({ failCommit: checked })} /><Switch className="setting-row" label="批量操作部分失败" description="Lebab 演示远端不可达；其他项目分别反馈" checked={controller.state.preferences.failBatch} onCheckedChange={checked => controller.preferences({ failBatch: checked })} /></div><Button variant="quiet" className="danger-text" onClick={() => setModal('reset')}>重置演示数据</Button></section><footer className="settings-footer">GitTogether {pkg.version} · 独立 TypeScript 实现</footer></Modal>}
    {modal === 'add' && <Modal title="添加仓库" onClose={() => setModal(null)}><p>添加一个本地演示仓库。此版本不扫描磁盘或执行真实 Git 命令。</p><form onSubmit={e => { e.preventDefault(); controller.addRepository(repoName.trim(), repoPath.trim()); setModal(null); setRepoName(''); setRepoPath(''); }}><TextField className="modal-field" label="仓库名称" value={repoName} onChange={e => setRepoName(e.target.value)} placeholder="My next project" required /><TextField className="modal-field" label="工作目录" value={repoPath} onChange={e => setRepoPath(e.target.value)} placeholder="~/Projects/my-next-project" required /><div className="modal-actions"><Button onClick={() => setModal(null)}>取消</Button><Button variant="primary" disabled={!repoName.trim() || !repoPath.trim()} type="submit">添加仓库</Button></div></form></Modal>}
    {modal === 'reset' && <Modal title="重置演示数据？" onClose={() => setModal(null)}><p>将清除这个演示客户端中保存的文件选择、提交说明和模拟提交，恢复最初的 8 个仓库。真实仓库不受影响。</p><div className="modal-actions"><Button onClick={() => setModal(null)}>取消</Button><Button variant="danger" onClick={() => { controller.reset(); setModal(null); setPage('dashboard'); setSelected([]); setExpanded([]); }}>重置演示</Button></div></Modal>}
  </div></GlassSystemProvider>;
}
