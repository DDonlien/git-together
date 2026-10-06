import { Button, Icon, Notice, Textarea } from './ui';
import type { RepositoryCommit, RepositoryTask } from './repository-model';
import { RepositoryCommitDetails } from './RepositoryCommitDetails';
import type { RemoteCommitState } from './use-remote-commits';

export function RepositoryRemoteChanges({ task, commitId, selectedCommit, state, selected, onSelect, search, focused, onFocus, showFocus }: {
  task: RepositoryTask; commitId: string; selectedCommit?: RepositoryCommit; state?: RemoteCommitState; selected?: string; onSelect: (path?: string) => void;
  search: string; focused: boolean; onFocus: () => void; showFocus: boolean;
}) {
  const current = state?.id === commitId ? state : undefined;
  const details = current?.details;
  const visibleFiles = details?.files.filter(file => file.path.toLowerCase().includes(search.toLowerCase())) || [];
  return <section className="repository-change-task" aria-label={`远端提交：${task.branch}`}>
    {showFocus && <div className="repository-task-header repository-task-controls"><Button variant="quiet" onClick={onFocus} aria-pressed={focused} aria-label={`${focused ? '退出聚焦' : '聚焦'}远端任务：${task.branch}`}>{focused ? '退出聚焦' : '聚焦'}</Button></div>}
    <div className="repository-task-body">
      {current?.error && <Notice kind="error">{current.error}{details && ' 显示上次读取的提交。'} 正在自动重试。</Notice>}
      {task.error && <Notice kind="error">{task.error}</Notice>}
      {!details ? <div className="repository-column-empty" role="status"><Icon name={!task.error ? 'spinner' : 'commit'} className={!task.error ? 'spin' : ''} size={24} /><p>{task.error ? '远端内容尚未读取' : '正在读取远端提交…'}</p></div> : <>
        <div className="repository-changed-files" aria-label={`已提交文件：${task.branch}`}>{visibleFiles.map(file => <button key={file.path} className={`readonly-file ${selected === file.path ? 'selected' : ''}`} onClick={() => onSelect(file.path)} aria-pressed={selected === file.path}><Icon name="file" size={15} /><span title={file.path}>{file.path}</span><code>{file.status}</code></button>)}{!visibleFiles.length && <p className="repository-data-note">{details.files.length ? '没有符合搜索条件的文件。' : '此提交没有文件差异。'}</p>}</div>
        {details.warnings.map(warning => <p key={warning} className="repository-data-note">{warning}</p>)}
      </>}
    </div>
    <div className="repository-commit-composer" hidden={!!selectedCommit}><Textarea label={`提交说明：${task.branch}`} placeholder="本地未提交更改在关联目录后单独显示" value="" rows={3} disabled /><div className="repository-commit-actions"><small>{details ? '正在浏览已提交内容' : '尚未读取提交内容'}</small><Button variant="primary" disabled title="远端浏览不会修改仓库">Commit</Button></div></div>
    {selectedCommit && <RepositoryCommitDetails commit={details?.commit || selectedCommit} branch={task.branch} />}
  </section>;
}
