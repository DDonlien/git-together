import { useState } from 'react';
import { Button, Icon, IconButton, Notice, Textarea } from './ui';
import { useAutoRefresh } from './use-auto-refresh';
import { syncIntervals } from './auto-refresh';
import { RepositoryCommitDetails } from './RepositoryCommitDetails';
import { RepositoryChangedFiles } from './RepositoryChangedFiles';
import type { RepositoryCommit, RepositoryTask } from './repository-model';

export type ReadTaskDiff = (task: RepositoryTask, path: string, signal: AbortSignal) => Promise<string>;

export function RepositoryChanges({ task, selectedCommit, selected, onSelect, search, grouped = false, focused, onFocus, readDiff, loading, linked, active, showFocus }: {
  task: RepositoryTask; selectedCommit?: RepositoryCommit; selected?: string; onSelect: (path?: string) => void; search: string;
  grouped?: boolean; focused: boolean; onFocus: () => void; readDiff: ReadTaskDiff; loading: boolean; linked: boolean; active: boolean; showFocus: boolean;
}) {
  const [description, setDescription] = useState('');
  const [diff, setDiff] = useState<{ file: string; text: string | null; error: string } | null>(null);
  const changed = task.files.find(file => file.path === selected);
  useAutoRefresh({ resources: active && !selectedCommit && changed && task.path ? [changed.path] : [], intervalMs: syncIntervals.local,
    run: async (path, signal) => {
      try {
        const text = await readDiff(task, path, signal);
        if (!signal.aborted) setDiff(previous => previous?.file === path && previous.text === text && !previous.error ? previous : { file: path, text, error: '' });
      } catch (problem) {
        if (signal.aborted) return;
        setDiff(previous => ({ file: path, text: previous?.file === path ? previous.text : null, error: problem instanceof Error ? problem.message : '读取 Diff 失败。' }));
        throw problem;
      }
    },
  });
  const selectedDiff = diff?.file === selected ? diff : null;
  return <section className="repository-change-task" aria-label={`更改任务：${task.branch}`}>
    <div className="repository-task-header"><span className="branch-label"><Icon name="branch" size={14} /><strong>{task.branch}</strong></span>{showFocus && <Button variant="quiet" onClick={onFocus} aria-pressed={focused}>{focused ? '退出聚焦' : '聚焦'}</Button>}</div>
    <p className="repository-task-path" title={task.path || undefined}>{task.path || (linked ? '未检出 · 分支快照' : '未关联本地目录')}</p>
    <div className="repository-task-body">
      {selectedCommit && <div className="repository-column-empty" role="status"><Icon name="commit" size={28} /><p>本地历史提交差异尚未接入</p></div>}
      <div className="repository-working-changes" hidden={!!selectedCommit}>
      {loading ? <div className="repository-column-empty" role="status"><Icon name="spinner" className="spin" size={24} /><p>正在读取本地 Git 仓库…</p></div> : <>
        <RepositoryChangedFiles files={task.files} selected={selected} onSelect={onSelect} search={search} grouped={grouped} label={`文件更改：${task.branch}`} empty={<div className="repository-column-empty"><Icon name="commit" size={28} /><p>{!task.path ? linked ? '没有工作目录更改，可在右侧查看分支文件' : '关联本地目录后查看更改' : '没有未提交的更改'}</p></div>} />
        {selected && <div className="repository-inline-diff"><div className="section-title"><strong title={selected}>{selected}</strong><IconButton icon="close" label={`关闭 Diff：${task.branch}`} onClick={() => onSelect()} /></div>
          {!changed ? <p className="repository-data-note">这个文件没有未提交的更改。</p> : <>
            {selectedDiff?.error && <Notice kind="error">{selectedDiff.error}{selectedDiff.text !== null && ' 显示上次读取的 Diff。'} 正在自动重试。</Notice>}
            {!selectedDiff ? <p className="repository-data-note" role="status">正在读取 Diff…</p> : selectedDiff.text !== null && <pre aria-label={`文件 Diff：${task.branch}`}>{selectedDiff.text.split('\n').map((line, index) => <span key={index} className={line.startsWith('+') && !line.startsWith('+++') ? 'added' : line.startsWith('-') && !line.startsWith('---') ? 'removed' : ''}>{line}{'\n'}</span>)}</pre>}
          </>}
        </div>}
      </>}
      {task.error && <Notice kind="error">{task.error}</Notice>}
      </div>
    </div>
    <div className="repository-commit-composer" hidden={!!selectedCommit}>
      <Textarea label={`提交说明：${task.branch}`} placeholder="填写提交说明…" value={description} onChange={event => setDescription(event.target.value)} rows={3} disabled={!task.path} />
      <div className="repository-commit-actions"><small>Git 提交尚未接入</small><Button variant="primary" disabled title="Git 写操作尚未接入，不会修改仓库">Commit</Button></div>
    </div>
    {selectedCommit && <RepositoryCommitDetails commit={selectedCommit} branch={task.branch} />}
  </section>;
}
