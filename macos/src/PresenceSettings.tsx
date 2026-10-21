import { useState } from 'react';
import { usePresence } from './PresenceProvider';
import { presenceConnectionLabels } from './presence-model';
import { Button, Checkbox, Notice, Switch } from './ui';
import { OutlinedTextField } from './material-inputs';
import { PresenceAccountSettings } from './PresenceAccountSettings';

export function PresenceSettings({ disabled = false }: { disabled?: boolean }) {
  const presence = usePresence();
  const [serverUrl, setServerUrl] = useState('');
  const status = presence?.status;
  const busy = disabled || !!presence?.busy;
  async function addServer() {
    if (!presence) return;
    try { await presence.server('addServer', { serverUrl }); setServerUrl(''); } catch { /* Shared controller keeps the error and entered URL. */ }
  }
  return <section className="settings-section" aria-labelledby="plugins-settings-title"><h2 id="plugins-settings-title">插件</h2><div className="settings-group presence-settings">
    <div className="setting-row presence-plugin-heading"><span className="presence-plugin-name"><strong>Presence</strong><small>个人设备与组织协作</small></span><Switch label="启用 Presence" checked={!!status?.enabled} disabled={busy || !status} onCheckedChange={enabled => { void presence?.configure({ enabled }).catch(() => {}); }} /></div>
    {status?.enabled && <>
      <PresenceAccountSettings disabled={disabled} />
      {status.localError && <Notice kind="warning">{status.localError}</Notice>}
      {status.account && <section className="presence-server-settings" aria-labelledby="presence-servers-title"><h3 id="presence-servers-title">Presence 服务器</h3>
        <div className="presence-server-list">{(status.servers || []).map(server => <div className="setting-row" key={server.id}><span className="presence-server-selection"><Checkbox label={`连接 ${server.url}`} checked={server.enabled} disabled={busy} onChange={() => { void presence?.server('selectServer', { serverId: server.id, enabled: !server.enabled }).catch(() => {}); }} /><span title={server.url}>{server.url}</span></span><span className="presence-settings-actions"><span className={`presence-connection ${server.connection}`}><i aria-hidden="true" />{presenceConnectionLabels[server.connection]}</span><Button variant="quiet" disabled={busy} onClick={() => { void presence?.server('removeServer', { serverId: server.id }).catch(() => {}); }}>移除</Button></span>{server.error && <Notice kind="error">{server.error}</Notice>}</div>)}</div>
        <form className="presence-server-add" onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.requestSubmit(); } }} onSubmit={event => { event.preventDefault(); void addServer(); }}><OutlinedTextField label="服务器地址" value={serverUrl} onChange={event => setServerUrl(event.target.value)} placeholder="https://presence.example.com/" type="url" required disabled={busy} /><Button type="submit" disabled={busy || !serverUrl.trim()}>添加</Button></form>
      </section>}
    </>}
    {(presence?.error || status?.error) && <Notice kind="error">{presence?.error || status?.error}</Notice>}
  </div></section>;
}
