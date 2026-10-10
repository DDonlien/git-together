import { useState } from 'react';
import { Button, Icon, Notice } from './ui';
import { RepositoryCommitComposer } from './RepositoryCommitComposer';
import { RepositoryActionDialog } from './RepositoryActionDialog';
import type { GenerateCommitMessage, PushLocalCommit, SubmitLocalCommit } from './local-submit-model';
import { RepositoryCommitDetails } from './RepositoryCommitDetails';
import { RepositoryChangedFiles } from './RepositoryChangedFiles';
import type { RepositoryCommit, RepositoryTask } from './repository-model';
import type { LocalCommitState } from './local-commit-model';

export function RepositoryChanges({ task, selectedCommit, historyState, selected, onSelect, search, grouped = false, focused, onFocus, loading, linked, showFocus, repositoryId, repositoryName, onSubmit, onGenerate, onPush, onCommitted, published = false }: {
  task: RepositoryTask; selectedCommit?: RepositoryCommit; selected?: string; onSelect: (path?: string) => void; search: string;
  grouped?: boolean; focused: boolean; onFocus: () => void; loading: boolean; linked: boolean; showFocus: boolean;
  historyState?: LocalCommitState;
  repositoryId?: string; onSubmit?: SubmitLocalCommit; onGenerate?: GenerateCommitMessage;
  repositoryName?: string; onPush?: PushLocalCommit; onCommitted?: (taskId: string, commitId: string) => void; published?: boolean;
}) {
  const [pushPopup, setPushPopup] = useState(false), [pushFeedback, setPushFeedback] = useState('');
  const history = selectedCommit && historyState?.id === selectedCommit.id ? historyState : undefined;
  const details = history?.details;
  return <section className="repository-change-task" aria-label={`更改任务：${task.branch}`}>
    <div className="repository-task-header"><span className="branch-label"><Icon name="branch" size={14} /><strong>{task.branch}</strong></span>{showFocus && <Button variant="quiet" onClick={onFocus} aria-pressed={focused}>{focused ? '退出聚焦' : '聚焦'}</Button>}</div>
    <p className="repository-task-path" title={task.path || undefined}>{task.path || (linked ? '未检出 · 分支快照' : '未关联本地目录')}</p>
    <div className="repository-task-body">
      {selectedCommit && <>
        {task.error && <Notice kind="error">{task.error}</Notice>}
        {history?.error && <Notice kind="error">{history.error}{details && ' 显示上次读取的提交。'} 正在自动重试。</Notice>}
        {!details ? !history?.error && <div className="repository-column-empty" role="status"><Icon name="spinner" className="spin" size={24} /><p>正在读取本地提交…</p></div> : <>
          {details.commit.parents.length > 1 && <p className="repository-data-note">合并提交 · 与第一个父提交比较</p>}
          <RepositoryChangedFiles files={details.files} selected={selected} onSelect={onSelect} search={search} grouped={grouped} label={`已提交文件：${task.branch}`} />
        </>}
      </>}
      <div className="repository-working-changes" hidden={!!selectedCommit}>
      {loading ? <div className="repository-column-empty" role="status"><Icon name="spinner" className="spin" size={24} /><p>正在读取本地 Git 仓库…</p></div> : <>
        <RepositoryChangedFiles files={task.files} selected={selected} onSelect={onSelect} search={search} grouped={grouped} label={`文件更改：${task.branch}`} empty={<div className="repository-column-empty"><Icon name="commit" size={28} /><p>{!task.path ? linked ? '没有工作目录更改，可在右侧查看分支文件' : '关联本地目录后查看更改' : '没有未提交的更改'}</p></div>} />
      </>}
      {task.error && <Notice kind="error">{task.error}</Notice>}
      </div>
    </div>
    <RepositoryCommitComposer hidden={!!selectedCommit} task={task} repositoryId={repositoryId} repositoryName={repositoryName} onSubmit={onSubmit} onGenerate={onGenerate} onPush={onPush} onCommitted={onCommitted} />
    {selectedCommit && <>
      <RepositoryCommitDetails commit={details?.commit || selectedCommit} branch={task.branch} />
      <div className="repository-committed-actions"><small>{published ? '已在远端' : '仅推送当前选中的提交及其必要祖先'}</small><Button variant="primary" disabled={published || !!task.error || !task.path || !repositoryId || !onPush || !onSubmit || !onGenerate} onClick={() => setPushPopup(true)}><Icon name="arrowUp" size={14} />Push</Button></div>
      {pushFeedback && <p className="repository-commit-feedback" role="status">{pushFeedback}</p>}
      {pushPopup && repositoryId && onSubmit && onGenerate && onPush && <RepositoryActionDialog mode="push" targets={[{ repositoryId, repositoryName: repositoryName || '', task, commitId: selectedCommit.id }]} onCommit={onSubmit} onGenerate={onGenerate} onPush={onPush} onComplete={setPushFeedback} onClose={() => setPushPopup(false)} />}
    </>}
  </section>;
}
