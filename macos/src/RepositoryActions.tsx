import { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import type { GitSignals } from './branch-links';
import { IconButton } from './ui';

const actions = [
  { key: 'fetch', label: 'Fetch', icon: 'refresh' },
  { key: 'latest', label: 'Get Latest', icon: 'download' },
  { key: 'push', label: 'Push', icon: 'upload' },
  { key: 'commit', label: 'Commit', icon: 'commit' },
] as const;

export function RepositoryActions({ label, signals }: { label: string; signals: GitSignals }) {
  const id = useId();
  const [hover, setHover] = useState<{ key: keyof GitSignals; x: number; y: number } | null>(null);
  const describe = (key: keyof GitSignals) => `${signals[key].detail} 此 Git 操作尚未接入执行，不会修改工作目录。`;
  const show = (key: keyof GitSignals, x: number, y: number) => setHover({ key, x: Math.max(8, Math.min(x + 12, window.innerWidth - 272)), y: Math.max(8, Math.min(y + 8, window.innerHeight - 140)) });
  return <div className="repository-actions" role="group" aria-label={label}>
    {actions.map(action => <span key={action.key} className="git-action-anchor" tabIndex={0} aria-label={`${action.label}：${describe(action.key)}`} aria-describedby={hover?.key === action.key ? id : undefined}
      onMouseEnter={event => show(action.key, event.clientX, event.clientY)} onMouseMove={event => show(action.key, event.clientX, event.clientY)} onMouseLeave={() => setHover(null)}
      onFocus={event => { const rect = event.currentTarget.getBoundingClientRect(); show(action.key, rect.right, rect.top); }} onBlur={() => setHover(null)} onKeyDown={event => { if (event.key === 'Escape') setHover(null); }}>
      <IconButton icon={action.icon} label={action.label} disabled />
      {signals[action.key].tone !== 'off' && <span aria-hidden="true" className={`git-action-lamp ${signals[action.key].tone}`} />}
    </span>)}
    {hover && typeof document !== 'undefined' && createPortal(<div className="git-action-tooltip" role="tooltip" id={id} style={{ left: hover.x, top: hover.y }}><strong>{actions.find(action => action.key === hover.key)!.label}</strong><span>{describe(hover.key)}</span></div>, document.body)}
  </div>;
}
