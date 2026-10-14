import { IconButton } from './ui';

export function RepositoryPinButton({ name, pinned, onToggle }: { name: string; pinned: boolean; onToggle: () => void }) {
  return <IconButton type="button" icon="pin" className={`repository-pin-button${pinned ? ' is-pinned' : ''}`} label={`${pinned ? '取消置顶' : '置顶'}：${name}`} aria-pressed={pinned} onClick={event => { event.stopPropagation(); onToggle(); }} />;
}
