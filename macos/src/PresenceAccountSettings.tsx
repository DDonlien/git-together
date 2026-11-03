import { useEffect, useRef, useState } from 'react';
import { usePresence } from './PresenceProvider';
import { Button, Notice, TextField } from './ui';
import './presence-account.css';

export type PresenceLoginTarget = { serverId?: string; serverUrl: string; email: string; delegated?: boolean };

export function PresenceAccountSettings({ disabled = false, id, target, onSaved, onCancel }: { disabled?: boolean; id?: string; target: PresenceLoginTarget; onSaved: () => void; onCancel: () => void }) {
  const presence = usePresence();
  const [serverUrl, setServerUrl] = useState(target.serverUrl);
  const [email, setEmail] = useState(target.email);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { form.current?.querySelector<HTMLInputElement>('input:not([readonly]):not(:disabled)')?.focus(); }, []);
  const busy = disabled || !!presence?.busy;
  const targetUrl = target.serverId ? target.serverUrl : serverUrl;
  async function login() {
    if (!presence || busy) return;
    setError('');
    try {
      await presence.account('login', { serverUrl: targetUrl, email, password, ...(target.serverId ? { serverId: target.serverId } : {}) });
      setPassword(''); onSaved();
    } catch (problem) { setError(problem instanceof Error ? problem.message : '登录未完成，请重试。'); }
  }
  async function openAccount() {
    if (!presence || busy || !targetUrl.trim()) return;
    setError('');
    try { await presence.account('openAccount', { serverUrl: targetUrl }); }
    catch (problem) { setError(problem instanceof Error ? problem.message : '账号页面打开失败，请重试。'); }
  }
  return <form ref={form} id={id} className="presence-account-form" aria-label={target.serverId ? '重新登录 Presence' : '添加 Presence'} onSubmit={event => { event.preventDefault(); void login(); }}>
    {target.delegated && <Notice kind="info">当前通过其他服务器的账号连接。重新登录只会更换这台服务器的账号。</Notice>}
    <TextField label="服务器地址" value={targetUrl} onChange={event => { if (!target.serverId) setServerUrl(event.target.value); }} type="url" maxLength={2048} required readOnly={!!target.serverId} disabled={busy} />
    <TextField label="邮箱" type="email" value={email} onChange={event => setEmail(event.target.value)} maxLength={254} autoComplete="username" required disabled={busy} />
    <TextField label="密码" type="password" value={password} onChange={event => setPassword(event.target.value)} maxLength={128} minLength={1} autoComplete="current-password" required disabled={busy} />
    {error && <Notice kind="error">{error}</Notice>}
    <div className="presence-settings-actions"><Button type="submit" variant="primary" disabled={busy || !targetUrl.trim() || !email.trim() || !password}>{busy ? '正在登录…' : '登录'}</Button><Button type="button" disabled={busy} onClick={() => { setPassword(''); onCancel(); }}>取消</Button><Button type="button" variant="quiet" disabled={busy || !targetUrl.trim()} onClick={() => { void openAccount(); }}>创建账号</Button></div>
  </form>;
}
