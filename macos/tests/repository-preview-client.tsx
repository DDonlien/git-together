// Isolated browser QA entry. Not imported by src/main.tsx or the app build.
import { StrictMode, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RepositoryView } from '../src/RepositoryView';
import { WindowChrome } from '../src/WindowChrome';
import { SidebarHeader } from '../src/SidebarHeader';
import { GlassSystemProvider, Icon, Notice } from '../src/ui';
import { componentTheme } from '../src/theme';
import { useAutoRefresh } from '../src/use-auto-refresh';
import type { RepositoryWorkspace } from '../src/repository-model';
import 'open-glass-ui/styles.css';
import '../src/styles.css';

function FixtureApp() {
  const [workspace, setWorkspace] = useState<RepositoryWorkspace | null>(null);
  const [path, setPath] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  useAutoRefresh({ resources: ['isolated-workspace'], intervalMs: 5000, run: async (_resource, signal) => {
    const response = await fetch('/fixture/workspace', { signal });
    if (!response.ok) throw new Error(`QA workspace HTTP ${response.status}`);
    const result: { root: string; workspace: RepositoryWorkspace } = await response.json();
    if (!signal.aborted) { setWorkspace(previous => previous && JSON.stringify(previous) === JSON.stringify(result.workspace) ? previous : result.workspace); setPath(result.root); setError(''); }
  }, onError: (_resource, problem) => setError(problem instanceof Error ? problem.message : 'QA failed') });
  const repository = { id: 'qa:1', remoteId: 1, accountId: 'qa', name: 'repository-workspace', fullName: 'QA/repository-workspace', description: '', defaultBranch: 'main', private: true, url: 'https://git.example.test/qa/project', available: true };
  const account = { id: 'qa', provider: 'gitea' as const, host: 'https://git.example.test', name: '隔离测试', login: 'qa', updatedAt: '' };
  async function remoteRead<T>(route: string, input: object, signal: AbortSignal): Promise<T> {
    const response = await fetch(route, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GitTogether-QA': '1' }, body: JSON.stringify(input), signal });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `QA HTTP ${response.status}`);
    return result as T;
  }
  return <GlassSystemProvider renderer="css" motion="system" toasts={false} theme={{ appearance: theme, style: componentTheme, className: 'app-theme' }}><div className="app-frame" data-fixture="real-temporary-git">
    <WindowChrome native={false} />
    <div className="app-body">
    <aside id="global-sidebar" className={`global-sidebar glass-panel${sidebarCollapsed ? ' is-collapsed' : ''}`}><SidebarHeader collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(value => !value)} /><nav className="global-nav"><button className="nav-item sidebar-permanent active" title="隔离 Git 测试" aria-label="隔离 Git 测试"><span className="sidebar-button-icon" aria-hidden="true"><Icon name="dashboard" size={19} /></span><span>隔离 Git 测试</span></button></nav><p className="sidebar-no-accounts">临时真实 Git 仓库<br />不使用你的账号或目录</p><div className="sidebar-bottom"><button className="nav-item sidebar-permanent" title="切换亮暗色" aria-label="切换亮暗色" onClick={() => { const next = theme === 'light' ? 'dark' : 'light'; setTheme(next); document.documentElement.dataset.theme = next; }}><span className="sidebar-button-icon" aria-hidden="true"><Icon name={theme === 'light' ? 'moon' : 'sun'} size={19} /></span><span>切换亮暗色</span></button></div></aside>
    <div className="app-content">{error && <Notice kind="error">{error}</Notice>}{workspace && <RepositoryView repository={repository} account={account} localPath={path || undefined} workspace={workspace} globalSearch={search} onSearchChange={setSearch} searchRef={searchRef} onConfigure={() => {}} readRemoteCommit={(commitId, signal) => remoteRead('/fixture/commit', { commitId }, signal)} readDiff={async (task, file, signal) => {
      const response = await fetch('/fixture/diff', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GitTogether-QA': '1' }, body: JSON.stringify({ taskId: task.id, path: file }), signal });
      const result: { text?: string; error?: string } = await response.json();
      if (!response.ok || result.text === undefined) throw new Error(result.error || `QA diff HTTP ${response.status}`);
      return result.text;
    }} />}</div></div>
  </div></GlassSystemProvider>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><FixtureApp /></StrictMode>);
