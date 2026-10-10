import { useEffect, useRef, useState } from 'react';
import type { GitSignals } from './branch-links';
import { IconButton, type IconName } from './ui';
import { logDiagnostic } from './diagnostics-api';

type ActionKey = 'pull' | 'latest' | 'commit' | 'submit' | 'push' | 'clear';
type Action = { key: ActionKey; label: string; icon: IconName; description: string };
const groups: { key: keyof GitSignals; label: string; actions: Action[] }[] = [
  { key: 'pull', label: '远端内容', actions: [
    { key: 'pull', label: 'Pull', icon: 'arrowDown', description: '获取远端更新并合入当前本地分支。' },
    { key: 'latest', label: 'Get Latest', icon: 'download', description: '下载当前分支最新快照，确认下载完成后清理旧历史与缓存。' },
  ] },
  { key: 'commit', label: '待提交', actions: [
    { key: 'commit', label: 'Commit', icon: 'commit', description: '确认提交说明和文件清单后，仅创建本地提交。' },
    { key: 'submit', label: 'Submit', icon: 'upload', description: 'AI 生成说明，确认文件清单后创建本地提交并推送。' },
  ] },
  { key: 'push', label: '本地内容', actions: [{ key: 'push', label: 'Push', icon: 'arrowUp', description: '推送所选范围内已有的本地提交。' }] },
  { key: 'clear', label: '清理', actions: [{ key: 'clear', label: 'Clean', icon: 'clear', description: '以远端为准清理或恢复本地文件。' }] },
];

type ActionCallbacks = { onCommit?: () => void; onSubmit?: () => void; onPush?: () => void; onPull?: () => void; onLatest?: () => void; onClean?: () => void; busy?: boolean };

export function RepositoryRowActions({ itemLabel, signals, hidden, onToggleHidden, unlinked = false, onDownload, downloadBlocked = false, downloadBusy = false, ...callbacks }: {
  itemLabel: string; signals: GitSignals; hidden: boolean; onToggleHidden?: () => void;
  unlinked?: boolean; onDownload?: () => void; downloadBlocked?: boolean; downloadBusy?: boolean;
} & ActionCallbacks) {
  const reading = downloadBusy || (unlinked ? signals.fetch.status === 'reading' : Object.values(signals).some(signal => signal.status === 'reading'));
  return <div className={`repository-row-actions${reading ? ' is-reading' : ''}`} aria-busy={reading || callbacks.busy}>
    {unlinked ? <IconButton className="repository-download-action" icon="downloadSimple" label={`下载分支并关联：${itemLabel}`} data-action-name="下载" title="" disabled={downloadBlocked || downloadBusy || !onDownload} onClick={onDownload} /> : <RepositoryActions label={`Git 操作：${itemLabel}`} signals={signals} {...callbacks} />}
    {onToggleHidden && <span className="git-action-group repository-visibility-actions"><IconButton className="repository-hide-action" icon={hidden ? 'eye' : 'eyeSlash'} label={`${hidden ? '恢复显示' : '隐藏'}：${itemLabel}`} data-action-name={hidden ? '恢复显示' : '隐藏'} title="" aria-pressed={hidden} disabled={callbacks.busy} onClick={onToggleHidden} /></span>}
  </div>;
}

export function RepositoryActions({ label, signals, onCommit, onSubmit, onPush, onPull, onLatest, onClean, busy = false }: { label: string; signals: GitSignals } & ActionCallbacks) {
  const [pressed, setPressed] = useState<ActionKey | null>(null);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPress = () => { if (releaseTimer.current) clearTimeout(releaseTimer.current); releaseTimer.current = null; setPressed(null); };
  const press = (key: ActionKey) => { if (releaseTimer.current) clearTimeout(releaseTimer.current); releaseTimer.current = null; setPressed(key); };
  const pulse = (key: ActionKey) => { logDiagnostic({ event: 'ui-action', outcome: 'blocked', method: key }); press(key); releaseTimer.current = setTimeout(() => { releaseTimer.current = null; setPressed(null); }, 180); };
  useEffect(() => () => { if (releaseTimer.current) clearTimeout(releaseTimer.current); }, []);
  const callbacks = { commit: onCommit, submit: onSubmit, push: onPush, pull: onPull, latest: onLatest, clear: onClean };
  return <div className="repository-actions" role="group" aria-label={label}>
    {groups.map(group => {
      const signal = signals[group.key], count = signal.count, hasCount = count !== undefined && count > 0;
      return <div key={group.key} className="git-action-group" role="group" aria-label={group.label}>
        {group.actions.map(action => {
          const ownSignal = signals[action.key === 'submit' ? 'commit' : action.key];
          const callback = action.key in callbacks ? callbacks[action.key as keyof typeof callbacks] : undefined;
          const description = `${action.description} ${ownSignal.detail} ${ownSignal.statusDetail || ''}`;
          if (callback) return <span key={action.key} data-action-name={action.label} className="git-action-anchor"><IconButton icon={action.icon} label={`${action.label}：${description}`} title="" disabled={busy || (['commit', 'submit', 'push'].includes(action.key) && !hasCount)} onClick={callback} /></span>;
          // Missing callbacks represent an unavailable task/scope; execution
          // is enabled only when the parent supplies a validated target range.
          return <span key={action.key} data-action-name={action.label} className={`git-action-anchor${pressed === action.key ? ' is-pressed' : ''}`} role="button" aria-disabled="true" tabIndex={0} aria-label={`${action.label}：${description} 当前范围没有可操作的工作目录。`}
            onPointerDown={event => { if (event.button === 0) press(action.key); }} onPointerCancel={clearPress} onPointerLeave={clearPress}
            onClick={() => pulse(action.key)} onBlur={clearPress}
            onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); press(action.key); } else if (event.key === 'Escape') clearPress(); }}
            onKeyUp={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pulse(action.key); } }}>
            <IconButton icon={action.icon} label={action.label} title="" aria-hidden="true" tabIndex={-1} disabled />
          </span>;
        })}
        {hasCount && <span aria-hidden="true" className={`git-action-badge ${signal.tone}`}>{count}</span>}
        {group.actions.some(action => signals[action.key === 'submit' ? 'commit' : action.key].status === 'error') && <span aria-hidden="true" className="git-action-read-badge error">!</span>}
      </div>;
    })}
  </div>;
}
