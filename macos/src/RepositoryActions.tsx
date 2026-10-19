import { useEffect, useRef, useState } from 'react';
import type { GitSignals } from './branch-links';
import { Icon, IconButton, type IconName } from './ui';
import { useRepositoryOperations } from './RepositoryOperationProvider';
import type { RepositoryActionTarget } from './repository-action-model';
import { logDiagnostic } from './diagnostics-api';

type ActionKey = 'pull' | 'latest' | 'commit' | 'submit' | 'push' | 'clear';
type Action = { key: ActionKey; label: string; icon: IconName; description: string };
const groups: { key: keyof GitSignals; label: string; actions: Action[] }[] = [
  { key: 'pull', label: '远端内容', actions: [
    { key: 'pull', label: 'Pull', icon: 'arrowDown', description: '获取远端更新并合入当前本地分支。' },
    { key: 'latest', label: 'Get Latest', icon: 'download', description: '下载当前分支最新快照，确认下载完成后清理旧历史与缓存。' },
  ] },
  { key: 'commit', label: '本地内容', actions: [
    { key: 'commit', label: 'Commit', icon: 'commit', description: '确认提交说明和文件清单后，仅创建本地提交。' },
    { key: 'submit', label: 'Submit', icon: 'upload', description: '填写或 AI 生成说明，确认文件清单后创建本地提交并推送。' },
  ] },
  { key: 'push', label: '待推送', actions: [{ key: 'push', label: 'Push', icon: 'arrowUp', description: '推送所选范围内已有的本地提交。' }] },
  { key: 'clear', label: '清理', actions: [{ key: 'clear', label: 'Clear', icon: 'clear', description: '以远端为准清理或恢复本地文件。' }] },
];

type ActionCallbacks = { allowUnknownPush?: boolean; onCommit?: () => void; onSubmit?: () => void; onPush?: () => void; onPull?: () => void; onLatest?: () => void; onClean?: () => void; busy?: boolean; actionErrors?: Partial<Record<ActionKey, string>>; operationScope?: string; operationTargets?: readonly RepositoryActionTarget[] };

export function RepositoryRowActions({ itemLabel, signals, hidden, onToggleHidden, unlinked = false, onDownload, downloadBlocked = false, downloadBusy = false, ...callbacks }: {
  itemLabel: string; signals: GitSignals; hidden: boolean; onToggleHidden?: () => void;
  unlinked?: boolean; onDownload?: () => void; downloadBlocked?: boolean; downloadBusy?: boolean;
} & ActionCallbacks) {
  const reading = downloadBusy || Object.values(signals).some(signal => signal.status === 'reading');
  const busy = callbacks.busy || reading;
  return <div className={`repository-row-actions${reading ? ' is-reading' : ''}`} aria-busy={reading || callbacks.busy}>
    {unlinked ? <IconButton className="repository-download-action" icon="downloadSimple" label={`下载分支并关联：${itemLabel}`} data-action-name="下载" title="" disabled={downloadBlocked || busy || !onDownload} onClick={onDownload} /> : <RepositoryActions label={`Git 操作：${itemLabel}`} signals={signals} {...callbacks} busy={busy} />}
    {onToggleHidden && <span className="git-action-group repository-visibility-actions"><IconButton className="repository-hide-action" icon={hidden ? 'eye' : 'eyeSlash'} label={`${hidden ? '恢复显示' : '隐藏'}：${itemLabel}`} data-action-name={hidden ? '恢复显示' : '隐藏'} title="" aria-pressed={hidden} disabled={busy} onClick={onToggleHidden} /></span>}
  </div>;
}

export function RepositoryActions({ label, signals, onCommit, onSubmit, onPush, onPull, onLatest, onClean, busy = false, actionErrors = {}, operationScope, operationTargets, allowUnknownPush = false }: { label: string; signals: GitSignals } & ActionCallbacks) {
  const operations = useRepositoryOperations();
  const blocked = busy || Object.values(signals).some(signal => signal.status === 'reading');
  const [pressed, setPressed] = useState<ActionKey | null>(null);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPress = () => { if (releaseTimer.current) clearTimeout(releaseTimer.current); releaseTimer.current = null; setPressed(null); };
  const press = (key: ActionKey) => { if (releaseTimer.current) clearTimeout(releaseTimer.current); releaseTimer.current = null; setPressed(key); };
  const pulse = (key: ActionKey) => { logDiagnostic({ event: 'ui-action', outcome: 'blocked', method: key }); press(key); releaseTimer.current = setTimeout(() => { releaseTimer.current = null; setPressed(null); }, 180); };
  useEffect(() => () => { if (releaseTimer.current) clearTimeout(releaseTimer.current); }, []);
  useEffect(() => { if (blocked) clearPress(); }, [blocked]);
  const callbacks = { commit: onCommit, submit: onSubmit, push: onPush, pull: onPull, latest: onLatest, clear: onClean };
  return <div className="repository-actions" role="group" aria-label={label}>
    {groups.map(group => {
      const signal = signals[group.key], count = signal.count, hasCount = count !== undefined && count > 0;
      return <div key={group.key} className="git-action-group" role="group" aria-label={group.label}>
        {group.actions.map(action => {
          const ownSignal = signals[action.key === 'submit' ? 'commit' : action.key];
          const operation = operationScope ? operations.get(action.key === 'clear' ? 'clean' : action.key, operationScope, operationTargets) : undefined;
          const pending = operation?.state === 'preparing' || operation?.state === 'working';
          const actionBlocked = !operation && (blocked || !!operationTargets && operations.blocked(operationTargets));
          const callback = action.key in callbacks ? callbacks[action.key as keyof typeof callbacks] : undefined;
          const error = actionErrors[action.key] ? `${action.label}：${actionErrors[action.key]}` : '';
          const operationDetail = operation ? `${({ preparing: '正在准备', ready: '等待确认', working: '正在执行', failed: '执行未完成', completed: '已完成' } as const)[operation.state]}；点击查看原任务。` : '';
          const description = `${operationDetail || action.description} ${ownSignal.detail} ${ownSignal.statusDetail || ''} ${error}`;
          const badge = error && <span className="git-action-read-badge error" role="img" aria-label={error} data-action-name={error} tabIndex={blocked ? -1 : 0} onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()} onKeyUp={event => event.stopPropagation()}>!</span>;
          if (callback || operation) return <span key={action.key} data-action-name={action.label} className={`git-action-anchor${actionBlocked ? ' is-blocked' : ''}`}><IconButton icon={action.icon} label={`${action.label}：${description}`} title="" disabled={actionBlocked || !operation && ['commit', 'submit', 'push'].includes(action.key) && !hasCount && !(action.key === 'push' && allowUnknownPush && count === undefined && !!operationTargets?.some(target => target.task.path && target.task.head && !target.task.error))} aria-busy={pending || undefined} onClick={operation ? () => operations.restore(operation.id) : callback} />{operation && <span className="git-operation-indicator" data-state={operation.state} aria-hidden="true">{pending ? <Icon name="spinner" size={10} className="spin" /> : operation.state === 'failed' ? '!' : <Icon name={operation.state === 'completed' ? 'check' : 'clock'} size={10} />}</span>}{badge}</span>;
          // Missing callbacks represent an unavailable task/scope; execution
          // is enabled only when the parent supplies a validated target range.
          return <span key={action.key} data-action-name={action.label} className={`git-action-anchor${blocked ? ' is-blocked' : ''}${pressed === action.key && !blocked ? ' is-pressed' : ''}`} role="button" aria-disabled="true" tabIndex={blocked ? -1 : 0} aria-label={`${action.label}：${description} 当前范围没有可操作的工作目录。`}
            onPointerDown={event => { if (!blocked && event.button === 0) press(action.key); }} onPointerCancel={clearPress} onPointerLeave={clearPress}
            onClick={() => { if (!blocked) pulse(action.key); }} onBlur={clearPress}
            onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!blocked) press(action.key); } else if (event.key === 'Escape') clearPress(); }}
            onKeyUp={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!blocked) pulse(action.key); } }}>
            <IconButton icon={action.icon} label={action.label} title="" aria-hidden="true" tabIndex={-1} disabled />
            {badge}
          </span>;
        })}
        {hasCount && <span aria-hidden="true" className={`git-action-badge ${signal.tone}`}>{count}</span>}
      </div>;
    })}
  </div>;
}
