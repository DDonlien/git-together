import { Button, Icon, Notice } from './ui';
import { RepositoryCommitComposer } from './RepositoryCommitComposer';
import { useRepositoryOperations } from './RepositoryOperationProvider';
import { repositoryOperationScope } from './repository-action-model';
import type { GenerateCommitMessage, PushLocalCommit, SubmitLocalCommit } from './local-submit-model';
import { RepositoryCommitDetails } from './RepositoryCommitDetails';
import { RepositoryChangedFiles } from './RepositoryChangedFiles';
import { PresenceAvatars } from './PresenceAvatars';
import type { BranchIssue, RemoteRepository } from './import-model';
import { LocalPathIssue, type DismissBranchIssue } from './BranchIssueNotice';
import type { RepositoryCommit, RepositoryTask } from './repository-model';
import type { LocalCommitState } from './local-commit-model';

export function RepositoryChanges({ task, selectedCommit, historyState, selected, onSelect, search, grouped = false, focused, onFocus, loading, linked, showFocus, repository, repositoryId, repositoryName, onSubmit, onGenerate, onPush, onCommitted, published = false, branchIssues = [], onDismissIssue }: {
  task: RepositoryTask; selectedCommit?: RepositoryCommit; selected?: string; onSelect: (path?: string) => void; search: string;
  grouped?: boolean; focused: boolean; onFocus: () => void; loading: boolean; linked: boolean; showFocus: boolean;
  historyState?: LocalCommitState; branchIssues?: BranchIssue[]; onDismissIssue?: DismissBranchIssue;
  repository?: RemoteRepository; repositoryId?: string; onSubmit?: SubmitLocalCommit; onGenerate?: GenerateCommitMessage;
  repositoryName?: string; onPush?: PushLocalCommit; onCommitted?: (taskId: string, commitId: string) => void; published?: boolean;
}) {
  const operations = useRepositoryOperations();
  const scope = repositoryOperationScope(repositoryId || '', task.branch, task.id);
  const targets = repositoryId ? [{ repositoryId, repositoryName: repositoryName || '', task, commitId: selectedCommit?.id }] : [];
  const pushPopup = operations.get('push', scope, targets);
  const history = selectedCommit && historyState?.id === selectedCommit.id ? historyState : undefined;
  const details = history?.details;
  return <section className="repository-change-task" aria-label={`更改任务：${task.branch}`}>
    <div className="repository-task-header"><div className="branch-label"><Icon name="branch" size={14} /><strong>{task.branch}</strong>{repository && <PresenceAvatars repository={repository} branch={task.branch} />}</div>{showFocus && <Button variant="quiet" onClick={onFocus} aria-pressed={focused}>{focused ? '退出聚焦' : '聚焦'}</Button>}</div>
    <div className="repository-task-path local-path-with-issue"><span title={task.path || undefined}>{task.path || (linked ? '未检出 · 分支快照' : '未关联本地目录')}</span>{branchIssues.map(issue => <LocalPathIssue key={issue.id} issue={issue} onDismiss={onDismissIssue} />)}</div>
    <div className="repository-task-body">
      {selectedCommit && <>
        {task.error && !task.missing && <Notice kind="error">{task.error}</Notice>}
        {history?.error && <Notice kind="error">{history.error}{details && ' 显示上次读取的提交。'} 正在自动重试。</Notice>}
        {!details ? !history?.error && <div className="repository-column-empty" role="status"><Icon name="spinner" className="spin" size={24} /><p>正在读取本地提交…</p></div> : <>
          {details.commit.parents.length > 1 && <p className="repository-data-note">合并提交 · 与第一个父提交比较</p>}
          <RepositoryChangedFiles files={details.files} selected={selected} onSelect={onSelect} search={search} grouped={grouped} label={`已提交文件：${task.branch}`} />
        </>}
      </>}
      <div className="repository-working-changes" hidden={!!selectedCommit}>
      {loading ? <div className="repository-column-empty" role="status"><Icon name="spinner" className="spin" size={24} /><p>正在读取本地 Git 仓库…</p></div> : <>
        <RepositoryChangedFiles files={task.files} selected={selected} onSelect={onSelect} search={search} grouped={grouped} label={`文件更改：${task.branch}`} empty={<div className="repository-column-empty"><Icon name="commit" size={28} /><p>{task.missing ? '本地目录不存在' : !task.path ? linked ? '没有工作目录更改，可在右侧查看分支文件' : '关联本地目录后查看更改' : '没有未提交的更改'}</p></div>} />
      </>}
      {task.error && !task.missing && <Notice kind="error">{task.error}</Notice>}
      </div>
    </div>
    <RepositoryCommitComposer hidden={!!selectedCommit} task={task} repositoryId={repositoryId} repositoryName={repositoryName} onSubmit={onSubmit} onGenerate={onGenerate} onPush={onPush} onCommitted={onCommitted} />
    {selectedCommit && <>
      <RepositoryCommitDetails commit={details?.commit || selectedCommit} branch={task.branch} />
      <div className="repository-committed-actions"><small>{published ? '已在远端' : '仅推送当前选中的提交及其必要祖先'}</small><Button variant="primary" disabled={!pushPopup && (published || !!task.error || !task.path || !repositoryId || !onPush || !onSubmit || !onGenerate || operations.blocked(targets))} aria-busy={pushPopup?.state === 'working'} onClick={() => { if (pushPopup) operations.restore(pushPopup.id); else if (repositoryId && onSubmit && onGenerate && onPush) operations.open({ mode: 'push', scope, targets, onCommit: onSubmit, onGenerate, onPush }); }}><Icon name="arrowUp" size={14} />Push</Button></div>
    </>}
  </section>;
}
