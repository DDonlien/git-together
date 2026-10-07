import { Icon, Notice } from './ui';
import type { RepositoryCommit, RepositoryTask } from './repository-model';
import { RepositoryCommitDetails } from './RepositoryCommitDetails';
import { RepositoryChangedFiles } from './RepositoryChangedFiles';
import type { RemoteCommitState } from './use-remote-commits';

export function RepositoryRemoteChanges({ task, commitId, selectedCommit, state, selected, onSelect, search, grouped = false }: {
  task: RepositoryTask; commitId: string; selectedCommit?: RepositoryCommit; state?: RemoteCommitState; selected?: string; onSelect: (path?: string) => void;
  search: string; grouped?: boolean;
}) {
  const current = state?.id === commitId ? state : undefined;
  const details = current?.details;
  return <section className="repository-change-task" aria-label={`远端提交：${task.branch}`}>
    <div className="repository-task-body">
      {current?.error && <Notice kind="error">{current.error}{details && ' 显示上次读取的提交。'} 正在自动重试。</Notice>}
      {task.error && <Notice kind="error">{task.error}</Notice>}
      {!details ? <div className="repository-column-empty" role="status"><Icon name={!task.error ? 'spinner' : 'commit'} className={!task.error ? 'spin' : ''} size={24} /><p>{task.error ? '远端内容尚未读取' : '正在读取远端提交…'}</p></div> : <>
        <RepositoryChangedFiles files={details.files} selected={selected} onSelect={onSelect} search={search} grouped={grouped} label={`已提交文件：${task.branch}`} />
        {details.warnings.map(warning => <p key={warning} className="repository-data-note">{warning}</p>)}
      </>}
    </div>
    {selectedCommit && <RepositoryCommitDetails commit={details?.commit || selectedCommit} branch={task.branch} />}
  </section>;
}
