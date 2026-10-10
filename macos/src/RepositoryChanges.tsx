import { useState } from 'react';
import { Button, Icon, Notice, Textarea } from './ui';
import { RepositoryCommitDetails } from './RepositoryCommitDetails';
import { RepositoryChangedFiles } from './RepositoryChangedFiles';
import type { RepositoryCommit, RepositoryTask } from './repository-model';
import type { LocalCommitState } from './local-commit-model';

export function RepositoryChanges({ task, selectedCommit, historyState, selected, onSelect, search, grouped = false, focused, onFocus, loading, linked, showFocus }: {
  task: RepositoryTask; selectedCommit?: RepositoryCommit; selected?: string; onSelect: (path?: string) => void; search: string;
  grouped?: boolean; focused: boolean; onFocus: () => void; loading: boolean; linked: boolean; showFocus: boolean;
  historyState?: LocalCommitState;
}) {
  const [description, setDescription] = useState('');
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
    <div className="repository-commit-composer" hidden={!!selectedCommit}>
      <Textarea label={`提交说明：${task.branch}`} placeholder="填写提交说明…" value={description} onChange={event => setDescription(event.target.value)} rows={3} disabled={!task.path} />
      <div className="repository-commit-actions"><small>Git 提交尚未接入</small><Button variant="primary" disabled title="Git 写操作尚未接入，不会修改仓库">Commit</Button></div>
    </div>
    {selectedCommit && <RepositoryCommitDetails commit={details?.commit || selectedCommit} branch={task.branch} />}
  </section>;
}
