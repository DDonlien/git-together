import { useRef, useState, type CSSProperties } from 'react';
import type { RemoteRepository } from './import-model';
import { usePresence } from './PresenceProvider';
import { presencePeople, presenceRepositoryId, type PresencePerson } from './presence-model';
import { Button, Icon, Popover } from './ui';

function PresenceAvatar({ person, large = false }: { person: PresencePerson; large?: boolean }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return <span className={`presence-avatar ${person.state}${large ? ' is-large' : ''}`} style={{ '--presence-color': person.color } as CSSProperties} aria-hidden="true">{person.avatarUrl && person.avatarUrl !== failedUrl ? <img src={person.avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setFailedUrl(person.avatarUrl)} /> : <span className="presence-avatar-initials">{Array.from(person.displayName.trim()).slice(0, 2).join('').toUpperCase()}</span>}</span>;
}
export function PresenceAvatars({ repository, branch, className = '', excludeCurrent = false }: { repository: RemoteRepository; branch?: string; className?: string; excludeCurrent?: boolean }) {
  const presence = usePresence(), id = presenceRepositoryId(repository);
  const people = presencePeople(presence?.status || null, id, branch, { excludeCurrent });
  return people.length ? <PresenceAvatarGroup key={`${id}:${branch ?? ''}`} repository={repository} branch={branch} people={people} className={className} /> : null;
}
export function PresenceAvatarGroup({ repository, branch, people, className = '' }: { repository: RemoteRepository; branch?: string; people: PresencePerson[]; className?: string }) {
  const [open, setOpen] = useState(false), trigger = useRef<HTMLButtonElement>(null);
  const label = `${branch === undefined ? repository.name : branch} · ${people.length} 台协作设备`;
  return <Popover label={label} open={open} onOpenChange={setOpen} placement="start" className={`presence-avatar-popover ${className}`} trigger={<button ref={trigger} type="button" className="presence-avatar-trigger" aria-haspopup="dialog" title={label} onClick={event => event.stopPropagation()}><span className="presence-avatar-stack">{people.slice(0, 3).map((person, index) => <span key={person.userId} style={{ zIndex: 3 - index }}><PresenceAvatar person={person} /></span>)}</span></button>}>
    <div className="presence-people-content" onClick={event => event.stopPropagation()}><div className="presence-people-heading"><strong>{branch === undefined ? repository.name : branch}</strong><Button variant="quiet" aria-label="关闭协作人员" onClick={() => { setOpen(false); trigger.current?.focus(); }}><Icon name="close" size={13} /></Button></div><ul className="presence-people-list">{people.map(person => <li key={person.userId}><PresenceAvatar person={person} large /><div><strong>{person.displayName} ({person.deviceName})</strong><ul className="presence-people-branches">{person.branches.map(entry => <li key={entry.branch || ''}><div className="presence-branch-row"><span className="presence-branch-name">{entry.branch || '分离 HEAD'}</span>{entry.counts.editingFiles > 0 && <span className="presence-branch-editing-count">{entry.counts.editingFiles} 个文件正在编辑</span>}</div></li>)}</ul></div></li>)}</ul></div>
  </Popover>;
}
