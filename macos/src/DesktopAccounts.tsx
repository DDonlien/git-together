import { useState } from 'react';
import type { WorkspaceController } from './use-workspace';
import type { Account } from './import-model';
import { providerName } from './import-model';
import { desktopAccountProviders, type DesktopAccountProvider } from './desktop-account-providers';
import { Button, Icon, TextField, Notice } from './ui';
import { importAPI } from './import-api';
import './account-settings.css';

export function DesktopAccounts({ controller }: { controller: WorkspaceController }) {
  const [adding, setAdding] = useState(false);
  const [provider, setProvider] = useState<DesktopAccountProvider>('github');
  const [host, setHost] = useState('');
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const accounts = controller.catalog.accounts.filter(account => account.provider !== 'local');
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await action(); await controller.reload(); return true; }
    catch (problem) { setError(problem instanceof Error ? problem.message : String(problem)); return false; }
    finally { setBusy(false); }
  };
  const reset = () => { setAdding(false); setHost(''); setName(''); setToken(''); setError(''); };
  const select = (next: DesktopAccountProvider) => { setProvider(next); setHost(''); setToken(''); setError(''); };
  const add = (account?: Account) => {
    setProvider(account?.provider === 'gitea' ? 'gitea' : 'github');
    setHost(account?.host || ''); setName(account?.name || ''); setToken(''); setError(''); setAdding(true);
  };
  const connect = async () => {
    if (await run(() => controller.connect({ provider, host: provider === 'github' ? 'https://github.com' : host, name, token }))) reset();
  };
  return <section className="settings-section desktop-accounts" aria-label="账号">
    <div className="section-title"><h2>账号</h2><Button leadingIcon={<Icon name="plus" size={15} />} disabled={adding || busy} onClick={() => add()}>添加账号</Button></div>
    {(accounts.length > 0 || adding) && <div className="settings-group account-settings-list" role="group" aria-label="账号列表">
      {accounts.map(account => <div className="account-settings-entry" key={account.id}><div className="account-setting">
        <span className={'provider-mark ' + account.provider}><Icon name="branch" size={17} /></span>
        <div><strong>{account.name}</strong><small>{providerName(account.provider)} · {account.login} · {new URL(account.host).host}</small>{account.error && <span className="account-warning" role="status">{account.error}</span>}</div>
        <div className="account-entry-actions">
          {account.provider === 'gitea' && <Button variant="quiet" disabled={busy || adding} onClick={() => add(account)}>重新连接</Button>}
          <Button variant="quiet" disabled={busy} onClick={() => void run(() => controller.refresh(account.id))}>刷新</Button>
          <Button variant="quiet" disabled={busy} onClick={() => void run(() => importAPI('openAccountAccessSettings', { accountId: account.id }))}>授权管理</Button>
          <Button variant="quiet" disabled={busy} onClick={() => void run(() => controller.removeAccount(account.id))}>退出登录</Button>
        </div>
      </div></div>)}
      {adding && <form className="account-entry-form" aria-label="添加账号" onSubmit={event => { event.preventDefault(); if (!busy) void connect(); }}>
        <div className="account-entry-heading"><h3>添加账号</h3><Button variant="quiet" disabled={busy} onClick={reset}>取消</Button></div>
        <div className="account-provider-tabs" role="tablist" aria-label="账号类型">{desktopAccountProviders.map((item, index) => <button key={item.id} type="button" role="tab" id={'account-provider-' + item.id} aria-controls="account-provider-panel" aria-selected={provider === item.id} tabIndex={provider === item.id ? 0 : -1} disabled={busy} onClick={() => select(item.id)} onKeyDown={event => {
          const next = event.key === 'ArrowRight' ? (index + 1) % 3 : event.key === 'ArrowLeft' ? (index + 2) % 3 : event.key === 'Home' ? 0 : event.key === 'End' ? 2 : -1;
          if (next < 0) return;
          event.preventDefault(); select(desktopAccountProviders[next].id);
          (event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next])?.focus();
        }}>{item.label}</button>)}</div>
        <div className="account-entry-fields" id="account-provider-panel" role="tabpanel" aria-labelledby={'account-provider-' + provider}>
          {provider !== 'github' && <TextField label={provider === 'gitea' ? 'Gitea 服务器地址' : 'GitHub Enterprise 域名'} placeholder={provider === 'gitea' ? 'https://git.example.com' : 'https://github.company.com'} value={host} onChange={event => { setHost(event.target.value); setToken(''); setError(''); }} disabled={busy} required autoComplete="url" />}
          {provider === 'gitea' ? <>
            <TextField label="账号名称（选填）" value={name} onChange={event => setName(event.target.value)} maxLength={120} disabled={busy} />
            <TextField label="访问令牌" type="password" autoComplete="off" spellCheck={false} value={token} onChange={event => setToken(event.target.value)} maxLength={4096} required disabled={busy} />
            <p className="account-entry-help">使用 Gitea 设置 → 应用中的访问令牌，允许读取用户信息和仓库。</p>
          </> : <p className="account-entry-help">通过系统浏览器登录 {provider === 'github' ? 'GitHub' : 'GitHub Enterprise'}。</p>}
          <div className="account-form-actions"><Button variant="primary" type="submit" disabled={busy || controller.loading || (provider !== 'github' && !host.trim()) || (provider === 'gitea' && !token.trim())} leadingIcon={busy ? <Icon name="spinner" className="spin" size={15} /> : provider !== 'gitea' ? <Icon name="external" size={15} /> : undefined}>{busy ? '正在连接…' : provider === 'gitea' ? '连接账号' : provider === 'github' ? '登录 GitHub' : '登录 GitHub Enterprise'}</Button></div>
        </div>
      </form>}
    </div>}
    {error && <Notice kind="error">{error}</Notice>}
  </section>;
}
