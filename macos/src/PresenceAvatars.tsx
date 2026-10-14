import { useRef, useState, type CSSProperties } from 'react';
import type { RemoteRepository } from './import-model';
import { usePresence } from './PresenceProvider';
import { presencePeople, presenceRepositoryColor, presenceRepositoryId, presenceWorkLabels, type PresencePerson } from './presence-model';
import { useRemoteControl } from './RemoteControlProvider';
import { RemoteActionDialog, RemoteWorkspaceActions } from './RemoteControlProjects';
import { controlDeviceOnline, presenceRemoteTargets, type RemoteActionTarget } from './remote-control-model';
import { Button, Icon, Notice, Popover } from './ui';

function PresenceAvatar({ person, large = false }: { person: PresencePerson; large?: boolean }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return <span className={`presence-avatar ${person.state}${large ? ' is-large' : ''}`} aria-hidden="true">
    {person.avatarUrl && person.avatarUrl !== failedUrl ? <img src={person.avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setFailedUrl(person.avatarUrl)} /> : <span className="presence-avatar-initials">{Array.from(person.displayName.trim()).slice(0, 2).join('').toUpperCase()}</span>}
  </span>;
}

export function PresenceAvatars({ repository, branch, className = '' }: { repository: RemoteRepository; branch?: string; className?: string }) {
  const presence = usePresence();
  const id = presenceRepositoryId(repository);
  const people = presencePeople(presence?.status || null, id, branch);
  return people.length > 0 ? <PresenceAvatarGroup key={`${id}:${branch ?? ''}`} repository={repository} branch={branch} people={people} className={className} /> : null;
}

export function PresenceAvatarGroup({ repository, branch, people, className = '' }: { repository: RemoteRepository; branch?: string; people: PresencePerson[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<RemoteActionTarget | null>(null);
  const control = useRemoteControl();
  const status = control?.status;
  const trigger = useRef<HTMLButtonElement>(null);
  const id = presenceRepositoryId(repository);
  const label = `${branch === undefined ? repository.name : branch} · ${people.length} 台协作设备`;
  const color = { '--presence-color': presenceRepositoryColor(id) } as CSSProperties;
  const rows = people.map(person => ({ person, branches: person.branches.map(entry => ({ ...entry, targets: open ? presenceRemoteTargets(status, id, entry) : [] })) }));
  // The shared popup measures once on opening; changing actions/results can grow it.
  const roster = JSON.stringify([people, rows.map(row => row.branches.map(entry => entry.targets.map(({ device, workspace }) => [device.serverId, device.deviceId, device.name, workspace.id, workspace.actions, status && controlDeviceOnline(status, device), status?.jobs.filter(job => job.serverId === device.serverId && job.deviceId === device.deviceId && job.workspaceId === workspace.id).map(job => [job.id, job.status, job.result?.phase, job.result?.warning, job.error])])))]);
  function openAction(value: RemoteActionTarget) {
    setOpen(false);
    setTarget(value);
  }
  function closeAction() {
    setTarget(null);
    requestAnimationFrame(() => trigger.current?.focus());
  }
  return <><Popover key={roster} label={label} open={open} onOpenChange={setOpen} placement="start" className={`presence-avatar-popover ${className}`} style={color} trigger={<button ref={trigger} type="button" className="presence-avatar-trigger" aria-haspopup="dialog" title={label} onClick={event => event.stopPropagation()}>
    <span className="presence-avatar-stack">{people.slice(0, 3).map((person, index) => <span key={person.userId} style={{ zIndex: 3 - index }}><PresenceAvatar person={person} /></span>)}</span>
  </button>}>
    <div className="presence-people-content" style={color} onClick={event => event.stopPropagation()}><div className="presence-people-heading"><div><strong>{branch === undefined ? repository.name : branch}</strong><small>{people.length} 台设备正在操作{branch === undefined ? '此仓库' : '此分支'}</small></div><Button variant="quiet" aria-label="关闭协作人员" onClick={() => { setOpen(false); trigger.current?.focus(); }}><Icon name="close" size={13} /></Button></div>
    <ul className="presence-people-list">{rows.map(({ person, branches }) => <li key={person.userId}><PresenceAvatar person={person} large /><div><strong>{person.displayName} ({person.deviceName})</strong>{person.scope && <small>{person.scope}</small>}<ul className="presence-people-branches">{branches.map(entry => <li key={entry.branch || ''}>
      <div className="presence-branch-heading"><span title={entry.branch || undefined}>{entry.branch || '分离 HEAD'}</span><small>{presenceWorkLabels[entry.state]}</small></div>
      {entry.targets.length ? entry.targets.map(({ device, workspace }, index) => <RemoteWorkspaceActions key={`${device.serverId || ''}:${device.deviceId}:${workspace.id}`} device={device} workspace={workspace} compact label={device.name + (entry.targets.filter(value => value.device.deviceId === device.deviceId).length > 1 ? ` · 工作目录 ${index + 1}` : '')} onAction={openAction} />) : <p className="presence-remote-empty">{status?.enabled && status.connection === 'connected' ? '暂无可执行的远程操作' : '远程控制未连接'}</p>}
    </li>)}</ul></div></li>)}</ul>
    {(control?.error || status?.error) && <Notice kind="error">{control?.error || status?.error}</Notice>}
    <div className="presence-avatar-legend"><span><i className="editing" />编辑中</span><span><i className="changed" />未 Commit</span><span><i className="committed" />未 Push</span></div></div>
  </Popover>{target && <span className="presence-action-boundary" onClick={event => event.stopPropagation()}><RemoteActionDialog key={`${target.device.serverId || ''}:${target.device.deviceId}:${target.workspace.id}:${target.action}`} {...target} onClose={closeAction} /></span>}</>;
}
