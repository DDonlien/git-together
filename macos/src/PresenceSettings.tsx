import { useEffect, useId, useRef, useState } from 'react';
import { usePresence } from './PresenceProvider';
import { presenceConnectionLabels, type PresenceServer } from './presence-model';
import { Button, Notice, Switch } from './ui';
import { PresenceAccountSettings, type PresenceLoginTarget } from './PresenceAccountSettings';

export function PresenceSettings({ disabled = false }: { disabled?: boolean }) {
  const presence = usePresence();
  const [editing, setEditing] = useState<PresenceLoginTarget | null>(null);
  const [serverError, setServerError] = useState('');
  const formId = useId(), trigger = useRef<HTMLButtonElement | null>(null);
  const status = presence?.status;
  const busy = disabled || !!presence?.busy;
  const servers = (status?.servers || []).filter(server => server.loggedIn ?? !!status?.account);
  const visibleIds = servers.map(server => server.id).join(',');
  useEffect(() => { if (!status?.enabled || editing?.serverId && !servers.some(server => server.id === editing.serverId)) setEditing(null); }, [status?.enabled, editing?.serverId, visibleIds]);
  const sharedError = status?.error || (!editing && !serverError ? presence?.error : '');
  const summary = (server: PresenceServer) => server.accountSummary === undefined && server.authMode === undefined ? status?.account : server.accountSummary;
  const add = () => setEditing({ serverUrl: '', email: '' });
  const login = (server: PresenceServer) => setEditing({ serverId: server.id, serverUrl: server.url, email: summary(server)?.email || '', delegated: server.authMode === 'delegated' });
  async function logout(server: PresenceServer) {
    if (!presence || busy) return;
    setServerError('');
    try { await presence.account('logout', { serverId: server.id }); }
    catch (problem) { setServerError(`${summary(server)?.displayName || server.name || 'Presence 服务器'} · ${server.url}：${problem instanceof Error ? problem.message : '退出登录未完成，请重试。'}`); }
  }
  const closeForm = () => { setEditing(null); requestAnimationFrame(() => { if (trigger.current?.isConnected) trigger.current.focus(); }); };
  const form = editing && <PresenceAccountSettings key={editing.serverId || 'add'} id={formId} target={editing} disabled={disabled} onSaved={closeForm} onCancel={closeForm} />;
  return <section className="settings-section" aria-labelledby="plugins-settings-title"><h2 id="plugins-settings-title">插件</h2><div className="settings-group presence-settings">
    <div className="setting-row presence-plugin-heading"><span className="presence-plugin-name"><strong>Presence</strong><small>个人设备与组织协作</small></span><Switch label="启用 Presence" checked={!!status?.enabled} disabled={busy || !status} onCheckedChange={enabled => { void presence?.configure({ enabled }).catch(() => {}); }} /></div>
    {status?.enabled && <>
      {status.localError && <Notice kind="warning">{status.localError}</Notice>}
      <div className="presence-server-list">{servers.map(server => <div className="presence-server-entry" data-server-id={server.id} key={server.id}>
        <div className="setting-row presence-server-row"><span className="presence-server-identity"><strong title={summary(server)?.email || undefined}>{summary(server)?.displayName || server.name || 'Presence 服务器'}</strong><small title={server.url}>{server.url}</small></span><span className="presence-settings-actions"><span className={`presence-connection ${server.connection}`}><i aria-hidden="true" />{server.authMode === 'delegated' ? '共享账号' : presenceConnectionLabels[server.connection]}</span><Button variant="quiet" disabled={busy} aria-expanded={editing?.serverId === server.id} aria-controls={formId} onClick={event => { trigger.current = event.currentTarget; login(server); }}>重新登录</Button><Button variant="quiet" disabled={busy} onClick={() => { void logout(server); }}>退出登录</Button></span></div>
        {server.error && <Notice kind="error">{server.error}</Notice>}
        {editing?.serverId === server.id && form}
      </div>)}</div>
      <div className={`setting-row presence-account-add-row${servers.length ? ' presence-server-add-row' : ''}`}><span><strong>{servers.length ? '添加 Presence 服务器' : 'Presence 账号'}</strong>{!servers.length && <small>连接个人设备与组织协作</small>}</span><Button disabled={busy} aria-expanded={!!editing && !editing.serverId} aria-controls={formId} onClick={event => { trigger.current = event.currentTarget; add(); }}>添加</Button></div>
      {editing && !editing.serverId && form}
    </>}
    {serverError && <Notice kind="error" onClose={() => setServerError('')}>{serverError}</Notice>}
    {sharedError && <Notice kind="error">{sharedError}</Notice>}
  </div></section>;
}
