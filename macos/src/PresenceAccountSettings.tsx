import { useEffect, useState } from 'react';
import { usePresence } from './PresenceProvider';
import { Button, TextField } from './ui';
import './presence-account.css';

export function PresenceAccountSettings({ disabled = false }: { disabled?: boolean }) {
  const presence = usePresence();
  const status = presence?.status;
  const [editing, setEditing] = useState(false);
  const [serverUrl, setServerUrl] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  useEffect(() => { setServerUrl(status?.account?.issuer || status?.serverUrl || ''); setEmail(status?.account?.email || ''); setPassword(''); }, [status?.account?.id, status?.serverUrl]);
  if (!presence || !status) return null;
  const busy = disabled || presence.busy;
  const account = status.account;
  async function login() {
    if (!presence) return;
    try { await presence.account('login', { serverUrl, email, password }); setPassword(''); setEditing(false); } catch { /* Shared controller retains the form and error. */ }
  }
  return <section className="presence-account-settings" aria-labelledby="presence-account-title">
    <div className="setting-row"><span><strong id="presence-account-title">Presence 账号</strong>{account && <small>{account.displayName} · {account.email}</small>}</span>{account && <span className="presence-settings-actions"><Button variant="quiet" disabled={busy} onClick={() => setEditing(value => !value)}>重新登录</Button><Button variant="quiet" disabled={busy} onClick={() => { void presence.account('logout').catch(() => {}); }}>退出登录</Button></span>}</div>
    {(!account || editing) && <form className="presence-account-form" onSubmit={event => { event.preventDefault(); void login(); }}>
      <TextField label="账号服务地址" value={serverUrl} onChange={event => setServerUrl(event.target.value)} type="url" maxLength={2048} required disabled={busy} />
      <TextField label="邮箱" type="email" value={email} onChange={event => setEmail(event.target.value)} maxLength={254} autoComplete="username" required disabled={busy} />
      <TextField label="密码" type="password" value={password} onChange={event => setPassword(event.target.value)} maxLength={128} minLength={1} autoComplete="current-password" required disabled={busy} />
      <div className="presence-settings-actions"><Button type="submit" variant="primary" disabled={busy}>登录</Button>{account ? <Button disabled={busy} onClick={() => { setEditing(false); setPassword(''); }}>取消</Button> : <Button variant="quiet" disabled={busy || !serverUrl} onClick={() => { void presence.account('openAccount', { serverUrl }).catch(() => {}); }}>创建账号</Button>}</div>
    </form>}
  </section>;
}
