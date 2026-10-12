import { useEffect, useState } from 'react';
import { useRemoteControl } from './RemoteControlProvider';
import { Button, Checkbox, Notice, Switch, TextField } from './ui';
import { usePresence } from './PresenceProvider';

export function RemoteControlSettings({ disabled = false }: { disabled?: boolean }) {
  const control = useRemoteControl();
  const presence = usePresence();
  const status = control?.status;
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [registrationKey, setRegistrationKey] = useState('');
  useEffect(() => { setName(status?.name || '我的电脑'); }, [status?.deviceId]);
  if (!control || !status) return null;
  const busy = disabled || control.busy;
  const projects = status.localRepositories.filter(r => r.enabled).map(r => ({ repositoryId: r.id, teamId: r.teamId }));
  async function save(input: { enabled?: boolean; projects?: typeof projects } = {}) {
    if (!control || !status) return;
    setError('');
    try { await control.settings('configure', { enabled: input.enabled ?? status.enabled, name, projects: input.projects ?? projects }); }
    catch (problem) { setError(problem instanceof Error ? problem.message : '保存失败。'); }
  }
  async function enroll() {
    setError('');
    try { await control?.settings('enroll', { name, registrationKey }); setRegistrationKey(''); }
    catch (problem) { setError(problem instanceof Error ? problem.message : '设备登记失败。'); }
  }
  return <div className="remote-control-settings">
    <div className="setting-row"><span><strong>远端控制</strong><small>同账号设备互控；团队仅控制明确纳管的项目</small></span>
      {status.registered && <Switch label="启用远端控制" checked={status.enabled} disabled={busy} onCheckedChange={enabled => void save({ enabled })} />}
    </div>
    <div className="remote-device-name"><TextField label="此设备名称" value={name} onChange={event => setName(event.target.value)} maxLength={120} disabled={busy} />
      <Button disabled={busy || !name.trim()} onClick={() => { if (status.registered) void save(); else void enroll(); }}>{status.registered ? '保存名称' : '登记此设备'}</Button>
    </div>
    {!status.registered && (presence?.status?.account ? <p className="remote-control-hint">使用已登录的 Presence 账号登记此电脑，无需设备登记密钥。</p> : <TextField label="设备登记密钥（旧访问密钥模式）" type="password" value={registrationKey} onChange={event => setRegistrationKey(event.target.value)} autoComplete="off" maxLength={512} disabled={busy} />)}
    {status.registered && <>
      <p className="remote-control-hint">{!status.enabled ? '远端控制已停用' : status.connection === 'connected' ? '设备已连接' : '设备正在连接；离线时无法执行'}。启用后关闭窗口可继续在后台接收操作；从托盘退出会断开。</p>
      <h3>允许控制的本机项目</h3>
      <p className="remote-control-hint">勾选项目开放 Commit、Submit、中止和丢弃。选择团队后，该项目才进入团队控制范围。</p>
      <div className="remote-project-settings">{status.localRepositories.map(repository => <div className="remote-project-setting" key={repository.id}>
        <span><Checkbox label={'允许控制 ' + repository.name} checked={repository.enabled} disabled={busy || status.connection !== 'connected'} onChange={() => {
          const next = projects.filter(p => p.repositoryId !== repository.id);
          if (!repository.enabled) next.push({ repositoryId: repository.id, teamId: null });
          void save({ projects: next });
        }} /><strong>{repository.name}</strong></span>
        {repository.enabled && <select aria-label={repository.name + ' 的纳管团队'} value={repository.teamId || ''} disabled={busy || status.connection !== 'connected'} onChange={event => {
          void save({ projects: projects.map(p => p.repositoryId === repository.id ? { ...p, teamId: event.target.value || null } : p) });
        }}><option value="">仅同账号设备</option>{status.teams.filter(team => team.projects.includes(repository.remoteId)).map(team => <option value={team.id} key={team.id}>{team.id}</option>)}</select>}
      </div>)}</div>
      <h3>我的设备</h3>
      <div className="remote-own-devices">{status.devices.filter(d => d.userId === status.userId).map(device => <div key={device.deviceId}><span>{device.name}{device.deviceId === status.deviceId ? ' · 此电脑' : ''}<small>{device.online && status.connection === 'connected' ? '在线' : '离线'}</small></span><Button variant="quiet" disabled={busy} onClick={() => { if (window.confirm('撤销“' + device.name + '”的远端控制凭证？')) void control.settings('revoke', { deviceId: device.deviceId }).catch(problem => setError(problem instanceof Error ? problem.message : '撤销失败。')); }}>撤销设备</Button></div>)}</div>
    </>}
    {(error || control.error || status.error) && <Notice kind="error">{error || control.error || status.error}</Notice>}
  </div>;
}
