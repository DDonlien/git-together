import { useEffect, useRef, useState } from 'react';
import type { GitSignals } from './branch-links';
import { IconButton, type IconName } from './ui';
import { logDiagnostic } from './diagnostics-api';

type RepositoryActionKey = keyof GitSignals;
type RepositoryAction = { key: RepositoryActionKey; label: string; icon: IconName; description: string };
const actions: RepositoryAction[] = [
  { key: 'commit', label: 'Commit', icon: 'commit', description: '把本地更改创建为本地提交。' },
  { key: 'fetch', label: 'Fetch', icon: 'refresh', description: '获取远端引用与对象，更新本地远端跟踪信息。' },
  { key: 'pull', label: 'Pull', icon: 'arrowDown', description: '获取远端更新并合入当前本地分支。' },
  { key: 'push', label: 'Push', icon: 'upload', description: '把本地提交推送到远端。' },
  { key: 'latest', label: 'Get Latest', icon: 'download', description: '下载当前分支最新快照，仅保留1层历史；下载完成后清理旧 Git 历史与历史 LFS 缓存，释放空间。' },
  { key: 'reconcile', label: 'Reconcile', icon: 'reconcile', description: '以本地为准比较远端：本地多出的文件标记添加，内容不同的采用本地版本并创建本地提交，本地缺少的忽略。' },
  { key: 'clear', label: 'Clear', icon: 'clear', description: '以远端为准比较本地：本地多出的文件标记删除，内容不同的恢复远端版本，本地缺少的下载。' },
];

export function RepositoryActions({ label, signals }: { label: string; signals: GitSignals }) {
  const [pressed, setPressed] = useState<RepositoryActionKey | null>(null);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPress = () => { if (releaseTimer.current) clearTimeout(releaseTimer.current); releaseTimer.current = null; setPressed(null); };
  const press = (key: RepositoryActionKey) => { if (releaseTimer.current) clearTimeout(releaseTimer.current); releaseTimer.current = null; setPressed(key); };
  // Feedback acknowledges input only. The actual Git buttons remain
  // disabled until their execution is implemented; never report fake success.
  const pulse = (key: RepositoryActionKey) => { logDiagnostic({ event: 'ui-action', outcome: 'blocked', method: key }); press(key); releaseTimer.current = setTimeout(() => { releaseTimer.current = null; setPressed(null); }, 180); };
  useEffect(() => () => { if (releaseTimer.current) clearTimeout(releaseTimer.current); }, []);
  const describe = (action: RepositoryAction) => `${action.description} ${signals[action.key].detail} ${signals[action.key].statusDetail || ''} 此 Git 操作尚未接入执行，不会修改工作目录。`;
  return <div className="repository-actions" role="group" aria-label={label}>
    {actions.map(action => {
      const signal = signals[action.key];
      const count = signal.count;
      return <span key={action.key} className={`git-action-anchor${pressed === action.key ? ' is-pressed' : ''}`} role="button" aria-disabled="true" tabIndex={0} aria-label={`${action.label}${count !== undefined ? `，数量 ${count}` : ''}：${describe(action)}`}
        onPointerDown={event => { if (event.button === 0) press(action.key); }} onPointerCancel={clearPress} onPointerLeave={clearPress}
        onClick={() => pulse(action.key)} onBlur={clearPress}
        onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); press(action.key); } else if (event.key === 'Escape') clearPress(); }}
        onKeyUp={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pulse(action.key); } }}>
        <IconButton icon={action.icon} label={action.label} title="" aria-hidden="true" tabIndex={-1} disabled />
        {count !== undefined && <span aria-hidden="true" className={`git-action-badge ${signal.tone}`}>{count}</span>}
        {signal.status && <span aria-hidden="true" className={`git-action-read-badge ${signal.status}`}>{signal.status === 'reading' ? <span className="git-action-read-spinner" /> : '!'}</span>}
      </span>;
    })}
  </div>;
}
