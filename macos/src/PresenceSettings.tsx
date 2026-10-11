import { useState } from 'react';
import { usePresence } from './PresenceProvider';
import { presenceConnectionLabels, presenceProjectSummary } from './presence-model';
import { Button, Icon, Notice, Switch, TextField } from './ui';

export function PresenceSettings({ disabled = false }: { disabled?: boolean }) {
  const presence = usePresence();
  const [editing, setEditing] = useState(false);
  const [enableAfterSave, setEnableAfterSave] = useState(false);
  const [serverUrl, setServerUrl] = useState('');
  const [serverName, setServerName] = useState('');
  const [serverToken, setServerToken] = useState('');
  const status = presence?.status;
  const busy = disabled || !!presence?.busy;
  function edit(enable = false) { if (!status) return; setServerUrl(status.serverUrl); setServerName(status.serverName); setServerToken(''); setEnableAfterSave(enable); setEditing(true); }
  async function save() {
    if (!presence || !status) return;
    try { await presence.configure({ enabled: status.enabled || enableAfterSave, serverUrl, serverName, serverToken }); setServerToken(''); setEditing(false); } catch { /* The shared controller retains the actual failure and the form. */ }
  }
  async function toggle(enabled: boolean) {
    if (!presence || !status) return;
    if (enabled && !status.configured) { edit(true); return; }
    try { await presence.configure({ enabled, serverUrl: status.serverUrl, serverName: status.serverName }); } catch { /* Failure remains visible in this card. */ }
  }
  return <section className="settings-section" aria-labelledby="plugins-settings-title"><h2 id="plugins-settings-title">插件</h2><div className="settings-group presence-settings">
    <div className="setting-row presence-plugin-heading"><span className="presence-plugin-name"><Icon name="users" size={20} /><span><strong>Presence</strong><small>查看团队正在编辑的分支与文件</small></span></span><Switch label="启用 Presence" checked={!!status?.enabled} disabled={busy || !status || editing} onCheckedChange={enabled => void toggle(enabled)} /></div>
    {status && <div className="setting-row presence-server-row"><span><strong>{status.serverName}</strong><small title={status.serverUrl}>{status.serverUrl}</small></span><span className="presence-settings-actions"><span className={`presence-connection ${status.connection}`}><i aria-hidden="true" />{presenceConnectionLabels[status.connection]}</span><Button variant="quiet" disabled={busy || editing} onClick={() => edit()}>配置</Button>{status.enabled && <Button variant="quiet" disabled={busy || status.connection === 'connecting' || editing} onClick={() => { void presence?.reconnect().catch(() => {}); }}>重新连接</Button>}</span></div>}
    {editing && status && <form className="presence-configuration" onSubmit={event => { event.preventDefault(); void save(); }} aria-label="Presence 服务器配置">
      <TextField label="服务器名称" value={serverName} onChange={event => setServerName(event.target.value)} maxLength={120} required disabled={busy} />
      <TextField label="服务器地址" value={serverUrl} onChange={event => setServerUrl(event.target.value)} placeholder="https://presence.example.com/" type="url" required disabled={busy} />
      <TextField label={status.configured ? '访问密钥（留空保留已保存的密钥）' : '访问密钥'} value={serverToken} onChange={event => setServerToken(event.target.value)} type="password" autoComplete="off" maxLength={512} disabled={busy} required={!status.configured} />
      <div className="presence-settings-actions"><Button disabled={busy} onClick={() => { setEditing(false); setServerToken(''); }}>取消</Button><Button variant="primary" type="submit" disabled={busy}>{enableAfterSave ? '保存并启用' : '保存'}</Button></div>
    </form>}
    <div className="presence-feedback" aria-live="polite">{(presence?.error || status?.error) && <Notice kind="error">{presence?.error || status?.error}</Notice>}</div>
    {status?.enabled && <div className="presence-sessions"><div className="presence-local-status"><Icon name="folder" size={16} /><span>本机协作服务：{status.bridge.connected ? '已连接' : status.bridge.error || '正在连接…'}</span></div>
      {status.bridge.projects.map(project => <div className="presence-session" key={`local:${project.repositoryId}:${project.worktreeId}`}><strong>此电脑 · {project.branch || '未检出分支'}</strong><small>{project.repositoryId} · {presenceProjectSummary(project, status.bridge.connected)}</small></div>)}
      <h3>服务器会话</h3>
      {status.sessions.length ? status.sessions.map(session => <div className="presence-session" key={session.sessionId}><strong>{session.displayName}<span className="presence-session-validity">{status.connection === 'connected' && session.alive ? '在线' : '离线，状态未知'}</span></strong>{session.projects.map(project => <small key={`${project.repositoryId}:${project.worktreeId}`}>{project.repositoryId} · {project.branch || '未检出分支'} · {presenceProjectSummary(project, status.connection === 'connected' && session.alive)}</small>)}</div>) : <p className="presence-empty">{status.connection === 'connected' ? '已连接，等待授权仓库的协作状态。' : '服务器尚未连接，协作状态未知。'}</p>}
    </div>}
  </div></section>;
}
