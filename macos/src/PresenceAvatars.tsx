import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { RemoteRepository } from './import-model';
import { usePresence } from './PresenceProvider';
import { presencePeople, presenceRepositoryColor, presenceRepositoryId, presenceWorkLabels, type PresencePerson } from './presence-model';
import { Button, Icon, Popover } from './ui';

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
  const trigger = useRef<HTMLButtonElement>(null);
  const id = presenceRepositoryId(repository);
  const label = `${branch === undefined ? repository.name : branch} · ${people.length} 位协作人员`;
  const color = { '--presence-color': presenceRepositoryColor(id) } as CSSProperties;
  // Recalculate the shared popup's viewport placement when its roster changes.
  const roster = JSON.stringify(people.map(person => [person.userId, person.displayName, person.branches]));
  return <Popover key={roster} label={label} open={open} onOpenChange={setOpen} placement="start" className={`presence-avatar-popover ${className}`} style={color} trigger={<button ref={trigger} type="button" className="presence-avatar-trigger" aria-haspopup="dialog" title={label} onClick={event => event.stopPropagation()}>
    <span className="presence-avatar-stack">{people.slice(0, 3).map((person, index) => <span key={person.userId} style={{ zIndex: 3 - index }}><PresenceAvatar person={person} /></span>)}</span>
  </button>}>
    <div className="presence-people-content" style={color}><div className="presence-people-heading"><div><strong>{branch === undefined ? repository.name : branch}</strong><small>{people.length} 位正在操作{branch === undefined ? '此仓库' : '此分支'}</small></div><Button variant="quiet" aria-label="关闭协作人员" onClick={() => { setOpen(false); trigger.current?.focus(); }}><Icon name="close" size={13} /></Button></div>
    <ul className="presence-people-list">{people.map(person => <li key={person.userId}><PresenceAvatar person={person} large /><div><strong>{person.displayName}</strong><ul className="presence-people-branches">{person.branches.map(entry => <li key={entry.branch || ''}><span title={entry.branch || undefined}>{entry.branch || '分离 HEAD'}</span><small>{presenceWorkLabels[entry.state]}</small></li>)}</ul></div></li>)}</ul>
    <div className="presence-avatar-legend"><span><i className="editing" />编辑中</span><span><i className="changed" />未 Commit</span><span><i className="committed" />未 Push</span></div></div>
  </Popover>;
}

export function PresenceBranchIcon({ repository, branch, children, size = 14 }: { repository?: RemoteRepository; branch: string; children?: ReactNode; size?: number }) {
  return <div className="presence-branch-icon">{children || <Icon name="branch" size={size} />}{repository && <PresenceAvatars repository={repository} branch={branch} />}</div>;
}
