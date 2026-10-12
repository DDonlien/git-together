import { useEffect, useRef, useState } from 'react';
import { usePresence } from './PresenceProvider';
import { Button, Checkbox, Notice, TextField } from './ui';
import './presence-account.css';

export function PresenceAccountSettings({ disabled = false }: { disabled?: boolean }) {
  const presence = usePresence();
  const status = presence?.status;
  const accountCommand = presence?.account;
  const presenceBusy = presence?.busy;
  const currentServerUrl = status?.serverUrl;
  const checked = useRef('');
  const [register, setRegister] = useState(false);
  const [reauthenticating, setReauthenticating] = useState(false);
  const [serverUrl, setServerUrl] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [name, setName] = useState('');
  const [setupKey, setSetupKey] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  useEffect(() => {
    if (!currentServerUrl || !accountCommand || presenceBusy || checked.current === currentServerUrl) return;
    checked.current = currentServerUrl;
    setServerUrl(currentServerUrl);
    void accountCommand('accountStatus').catch(() => { /* Shared controller displays the failure. */ });
  }, [currentServerUrl, presenceBusy, accountCommand]);
  useEffect(() => {setPassword('');setConfirmation('');setSetupKey('');setCurrentPassword('');setNewPassword('');}, [status?.account?.id]);
  if (!presence || !status) return null;
  const busy = disabled || presence.busy;
  const account = status.account;
  const service = status.accountService;
  async function signIn() {
    if (!presence) return;
    setError(''); setFeedback('');
    if (register && password !== confirmation) { setError('两次密码不一致。'); return; }
    try {
      await presence.account(register ? 'register' : 'login', { serverUrl, email, password, ...(register ? { displayName: name, setupKey } : {}) });
      setPassword(''); setConfirmation(''); setSetupKey('');
      setReauthenticating(false);
    } catch (problem) { setError(problem instanceof Error ? problem.message : '登录未完成。'); }
  }
  return <section className="presence-account-settings" aria-labelledby="presence-account-title">
    <div className="setting-row"><span><strong id="presence-account-title">Presence 账号</strong><small>{account ? `${account.displayName} · ${account.email}` : '登录同一个账号，连接你的多台设备'}</small></span>
      {account && <span className="presence-settings-actions"><Button variant="quiet" disabled={busy} onClick={() => {setEmail(account.email);setRegister(false);setReauthenticating(true);}}>重新登录</Button><Button variant="quiet" disabled={busy} onClick={() => { void presence.account('logout').catch(() => {}); }}>退出此设备</Button></span>}
    </div>
    {account && !reauthenticating ? <>
      <p className="presence-account-hint">{account.mode === 'personal' ? '个人实例 · 一个账号，可绑定多个仓库和设备' : '托管服务 · 组织成员和项目由管理员明确纳管'}</p>
      <div className="presence-account-project-heading"><h3>绑定的仓库</h3><Button variant="quiet" disabled={busy} onClick={() => { void presence.account('accountStatus').catch(() => {}); }}>刷新</Button></div>
      <div className="presence-account-projects">{[...new Map((status.localRepositories || []).map(repository => [repository.remoteId, repository])).values()].map(repository => <label key={repository.remoteId}>
        <Checkbox label={`绑定 ${repository.name}`} checked={repository.bound} disabled={busy} onChange={() => { void presence.account('bindRepository', { repositoryId: repository.remoteId, enabled: !repository.bound }).catch(() => {}); }} /><span title={repository.remoteId}>{repository.name}</span>
      </label>)}
      {account.repositories.filter(id => !(status.localRepositories || []).some(r => r.remoteId === id)).map(id => <div key={id}><span>{id}</span><Button variant="quiet" disabled={busy} onClick={() => { void presence.account('bindRepository', { repositoryId: id, enabled: false }).catch(() => {}); }}>解除绑定</Button></div>)}</div>
      {!account.repositories.length && <p className="presence-account-hint">选择已连接 Git 账号有权访问的仓库；绑定不上传文件内容，也不会自动开放远端控制。</p>}
      <details className="presence-account-password"><summary>修改密码</summary><form onSubmit={event => { event.preventDefault(); setError(''); setFeedback(''); void presence.account('password', { currentPassword, password: newPassword }).then(() => { setCurrentPassword(''); setNewPassword(''); setFeedback('密码已修改，请重新登录；各台设备需重新登记。'); }).catch(problem => setError(problem instanceof Error ? problem.message : '修改失败。')); }}>
        <TextField label="当前密码" type="password" autoComplete="current-password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} maxLength={128} required disabled={busy} />
        <TextField label="新密码（至少15个字符）" type="password" autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} minLength={15} maxLength={128} required disabled={busy} />
        <Button type="submit" disabled={busy}>修改并退出所有会话</Button>
      </form></details>
    </> : <>
      <div className="presence-account-tabs"><Button variant={register ? 'quiet' : 'primary'} disabled={busy} onClick={() => { setRegister(false); setError(''); }}>登录</Button><Button variant={register ? 'primary' : 'quiet'} disabled={busy || service?.registrationAvailable === false} onClick={() => { setRegister(true); setError(''); }}>创建账号</Button></div>
      {service?.mode === 'personal' && service.registrationAvailable === false && <p className="presence-account-hint">此个人实例已有账号，请在各台设备登录同一个账号。</p>}
      <form className="presence-account-form" onSubmit={event => { event.preventDefault(); void signIn(); }}>
        <div className="presence-account-address"><TextField label="Presence 服务器地址" value={serverUrl} onChange={e => setServerUrl(e.target.value)} type="url" maxLength={2048} required disabled={busy} /><Button variant="quiet" disabled={busy || !serverUrl.trim()} onClick={() => { void presence.account('accountStatus', { serverUrl }).catch(() => {}); }}>检查</Button></div>
        {register && <TextField label="显示名称" value={name} onChange={e => setName(e.target.value)} maxLength={120} autoComplete="nickname" required disabled={busy} />}
        <TextField label="邮箱" type="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={254} autoComplete="username" required disabled={busy} />
        <TextField label={register ? '密码（至少15个字符）' : '密码'} type="password" value={password} onChange={e => setPassword(e.target.value)} maxLength={128} minLength={register ? 15 : 1} autoComplete={register ? 'new-password' : 'current-password'} required disabled={busy} />
        {register && <TextField label="确认密码" type="password" value={confirmation} onChange={e => setConfirmation(e.target.value)} maxLength={128} autoComplete="new-password" required disabled={busy} />}
        {register && service?.setupRequired !== false && <TextField label="安装密钥（安装者已配置可留空）" type="password" value={setupKey} onChange={e => setSetupKey(e.target.value)} maxLength={512} autoComplete="off" disabled={busy} />}
        <Button type="submit" variant="primary" disabled={busy}>{register ? '创建账号并登录' : '登录'}</Button>
      </form>
    </>}
    {(error || feedback) && <Notice kind={error ? 'error' : 'info'}>{error || feedback}</Notice>}
  </section>;
}
