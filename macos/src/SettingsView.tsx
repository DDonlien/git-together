import { useEffect, useRef, useState } from 'react';
import { accountLabel, providerName, type Account, type Catalog, type Provider } from './import-model';
import type { WorkspaceController } from './use-workspace';
import { Button, Icon, Modal, Notice, Segmented, Select, TextField } from './ui';
import pkg from '../package.json';
import { AccountSignInOptions } from './AccountSignInOptions';
import { AccountEditForm } from './AccountEditForm';
import { GitHubBrowserAuthorizationModal } from './GitHubBrowserAuthorizationModal';
import { cancelGitHubWebAuthorization, navigateGitHubWebWindow, openGitHubWebAuthorization, reserveGitHubWebWindow, startGitHubWebAuthorization } from './github-web-api';
import type { GitHubWebSession } from './github-web-model';
import { UpdateSettings } from './UpdateSettings';
import { DiagnosticsSettings } from './DiagnosticsSettings';

export function SettingsView({ controller, onDashboard }: { controller: WorkspaceController; onDashboard: () => void }) {
  const [adding, setAdding] = useState(false);
  const [provider, setProvider] = useState<Provider>('github');
  const [host, setHost] = useState('');
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [manual, setManual] = useState(false);
  const [starting, setStarting] = useState(false);
  const [browserAuthorization, setBrowserAuthorization] = useState<{ session: GitHubWebSession; opened: boolean } | null>(null);
  const startingRef = useRef(false);
  const mounted = useRef(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [removing, setRemoving] = useState<Account | null>(null);
  const [editing, setEditing] = useState<Account | null>(null);
  const busy = !!controller.busy.connect || starting || !!browserAuthorization;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  function connected(catalog: Catalog) {
    setBrowserAuthorization(null); setToken(''); setHost(''); setName(''); setAdding(false); setManual(false);
    setMessage(catalog.accounts.some(account => account.error) ? '账号已连接，但部分仓库未能读取。请在 Dashboard 重试。' : '账号已连接，仓库已显示在左侧账号下和 Dashboard。');
  }
  async function authorizeGithub() {
    if (startingRef.current) return;
    startingRef.current = true; setStarting(true); setError(''); setMessage('');
    const popup = window.gittogether ? null : reserveGitHubWebWindow();
    try {
      const session = await startGitHubWebAuthorization(name);
      if (!mounted.current) { popup?.close(); await cancelGitHubWebAuthorization(session.id); return; }
      setBrowserAuthorization({ session, opened: window.gittogether ? await openGitHubWebAuthorization(session) : navigateGitHubWebWindow(popup, session.authorizationURL) });
    } catch (problem) { popup?.close(); if (mounted.current) setError(problem instanceof Error ? problem.message : '无法开始网页授权。'); }
    finally { startingRef.current = false; if (mounted.current) setStarting(false); }
  }
  async function connect(event: React.FormEvent) {
    event.preventDefault(); setError(''); setMessage('');
    try {
      const catalog = await controller.connect({ provider, host: provider === 'github' ? 'https://github.com' : host, token, name });
      connected(catalog);
    } catch (problem) { setError(problem instanceof Error ? problem.message : '连接失败。'); }
  }
  return <main className="settings-view">
    <div className="settings-scroll">
    <div className="settings-heading"><h1>设置</h1></div>
    <section className="settings-section"><div className="section-title"><div><h2>账号</h2><p>连接账号后，自动显示可访问的仓库。</p></div><Button leadingIcon={<Icon name="plus" size={15} />} onClick={() => { setAdding(true); setError(''); setMessage(''); }} disabled={adding || !!editing}>添加账号</Button></div>
      <div className="settings-group account-settings-list">{controller.catalog.accounts.length ? controller.catalog.accounts.map(account => <div className="account-setting" key={account.id}><span className={`provider-mark ${account.provider}`}><Icon name="branch" size={17} /></span><div><strong>{account.name}</strong><small>{providerName(account.provider)} · {account.login} · {new URL(account.host).host}</small>{account.error && <span className="account-warning">仓库加载失败，可在 Dashboard 重试</span>}</div>{account.provider === 'github' && <Button variant="quiet" disabled={busy || !!editing || !!controller.busy[account.id]} onClick={() => { setAdding(true); setProvider('github'); setManual(false); setName(account.name); setToken(''); setError(''); }}>重新授权</Button>}<Button variant="quiet" aria-label={`编辑 ${accountLabel(account)}`} disabled={busy || adding || !!editing || !!controller.busy[account.id]} onClick={() => { setEditing(account); setError(''); setMessage(''); }}>编辑</Button></div>) : <div className="settings-empty"><Icon name="users" size={24} /><strong>还没有连接账号</strong></div>}</div>
      {adding && <form className="account-connect-form flat-group" onSubmit={event => { event.preventDefault(); if (provider === 'github' && !manual) void authorizeGithub(); else void connect(event); }} aria-label="添加账号"><div className="section-title"><h3>连接新账号</h3><Button variant="quiet" disabled={busy} onClick={() => { setAdding(false); setToken(''); setError(''); }}>取消</Button></div><Segmented<Provider> aria-label="账号服务" value={provider} onValueChange={value => { setProvider(value); setManual(false); setToken(''); setError(''); }} disabled={busy} items={[{ value: 'github', label: 'GitHub' }, { value: 'gitea', label: 'Gitea' }]} />
        {provider === 'gitea' && <TextField label="Gitea 域名" placeholder="https://git.example.com" value={host} onChange={event => setHost(event.target.value)} required disabled={busy} autoComplete="url" />}
        <TextField label="账号名称（选填）" placeholder="例如：工作账号 / 个人账号" value={name} onChange={event => setName(event.target.value)} disabled={busy} maxLength={120} />
        <AccountSignInOptions provider={provider} manual={manual} busy={busy} disabled={controller.loading || !!controller.error || (provider === 'gitea' && !host.trim())} token={token} onToken={setToken} onManual={value => { setManual(value); setToken(''); setError(''); }} onWebAuthorization={() => void authorizeGithub()}>{error && <Notice kind="error">{error}</Notice>}</AccountSignInOptions>
      </form>}
      {message && <Notice kind="success">{message}<Button variant="quiet" onClick={onDashboard}>打开 Dashboard</Button></Notice>}
    </section>
    <section className="settings-section"><h2>外观</h2><div className="settings-group"><div className="setting-row"><span>颜色方案<small>跟随系统，或选择亮色与暗色</small></span><Select label={<span className="sr-only">颜色方案</span>} options={[{ value: 'system', label: '跟随系统' }, { value: 'light', label: '亮色' }, { value: 'dark', label: '暗色' }]} value={controller.preferences.theme} onChange={event => controller.updatePreferences({ theme: event.target.value as 'light' | 'dark' | 'system' })} /></div></div></section>
    <UpdateSettings busy={busy || Object.values(controller.busy).some(Boolean)} />
    <DiagnosticsSettings />
    </div>
    <footer className="settings-footer">GitTogether {pkg.version}</footer>
    {editing && <Modal title="编辑账号" onClose={() => { if (!controller.busy[editing.id]) setEditing(null); }}><AccountEditForm key={editing.id} account={editing} busy={!!controller.busy[editing.id]} onSubmit={controller.updateAccount} onSaved={() => { setEditing(null); setMessage('账号已更新。'); }} onCancel={() => setEditing(null)} onRemove={() => { setRemoving(editing); setError(''); }} /></Modal>}
    {removing && <Modal title={`移除 ${removing.name}？`} onClose={() => { if (!controller.busy[removing.id]) setRemoving(null); }}><p>{accountLabel(removing)}</p><p>移除这个账号的凭据、仓库列表与应用内的本地关联。不会删除任何本地文件。</p>{error && <Notice kind="error">{error}</Notice>}<div className="modal-actions"><Button disabled={!!controller.busy[removing.id]} onClick={() => setRemoving(null)}>取消</Button><Button variant="danger" disabled={!!controller.busy[removing.id]} onClick={() => { setError(''); void controller.removeAccount(removing.id).then(() => { setRemoving(null); setEditing(null); }).catch(problem => setError(problem instanceof Error ? problem.message : '移除失败。')); }}>移除账号</Button></div></Modal>}
    {browserAuthorization && <GitHubBrowserAuthorizationModal key={browserAuthorization.session.id} {...browserAuthorization} onComplete={catalog => { void controller.reload(); connected(catalog); }} onClose={() => setBrowserAuthorization(null)} onRestart={() => { setBrowserAuthorization(null); void authorizeGithub(); }} />}
  </main>;
}
