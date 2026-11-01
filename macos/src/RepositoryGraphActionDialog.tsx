import { useEffect, useRef, useState } from 'react';
import { importAPI } from './import-api';
import type { RemoteRepository } from './import-model';
import type { RepositoryCommit, RepositoryTask } from './repository-model';
import type { RepositoryActionTarget, RepositoryOperationControls } from './repository-action-model';
import { graphActionLabels, graphSnapshot, type GraphAction, type GraphPreview, type GraphWrite, type GraphWriteResult } from './graph-operation-model';
import { Button, Modal, Notice, Select } from './ui';
import { LinearProgress, OutlinedTextField } from './material-inputs';
import { RepositoryPreparedDiff } from './RepositoryPreparedDiff';
import { RepositoryFileChangeLabel } from './RepositoryFileChangeLabel';
export type GraphOperationInput = { kind: 'graph'; mode: GraphAction; scope: string; repository: RemoteRepository; commit?: RepositoryCommit; targets: RepositoryActionTarget[]; candidates: RepositoryTask[]; onWrite?: GraphWrite; onComplete?: (message: string, complete?: boolean) => void };
const problemMessage = (problem: unknown) => problem instanceof Error ? problem.message : 'Git 操作未完成。';
export function RepositoryGraphActionDialog({ targets, candidates, onTargetChange, working = false, ...props }: GraphOperationInput & RepositoryOperationControls & { working?: boolean; onClose: () => void; onTargetChange: (task: RepositoryTask) => void }) {
  const task = targets[0]?.task;
  return <Modal title={graphActionLabels[props.mode]} visible={props.visible} onCollapse={props.onCollapse} onClose={working ? props.onCollapse || (() => {}) : props.onClose}>{task ? <GraphTaskDialog key={task.id} {...props} task={task} candidates={candidates} onTargetChange={onTargetChange} /> : <Notice kind="info">请先关联一个本地工作目录。</Notice>}</Modal>;
}
function GraphTaskDialog({ mode, repository, commit, task, candidates, onTargetChange, onWrite, onStateChange, onFinished, onComplete, onClose, pauseRefresh }: Omit<GraphOperationInput, 'targets' | 'kind' | 'scope'> & { task: RepositoryTask; onTargetChange: (task: RepositoryTask) => void; onClose: () => void } & RepositoryOperationControls) {
  const branchRef = commit?.refs.find(ref => ref !== 'HEAD' && !/^(origin\/|refs\/remotes\/|refs\/tags\/)/.test(ref));
  const [name, setName] = useState(mode === 'checkout' ? branchRef?.replace(/^refs\/heads\//, '') || '' : '');
  const [resetMode, setResetMode] = useState<'soft' | 'mixed' | 'hard'>('mixed'), [mainline, setMainline] = useState(1);
  const [preview, setPreview] = useState<GraphPreview | null>(null), [reading, setReading] = useState(false), [writing, setWriting] = useState(false), [error, setError] = useState(''), [result, setResult] = useState<GraphWriteResult | null>(null), [revision, setRevision] = useState(0);
  const operation = useRef(crypto.randomUUID()), snapshot = graphSnapshot(repository.id, task);
  const needsPreview = !['abort', 'branch', 'tag', 'checkout'].includes(mode);
  useEffect(() => { onStateChange?.(result ? 'completed' : writing ? 'working' : error ? 'failed' : reading ? 'preparing' : 'ready'); }, [result, writing, error, reading, onStateChange]);
  useEffect(() => {
    if (!needsPreview || !commit) return;
    const cancellation = new AbortController(); setReading(true); setError(''); setPreview(null);
    void importAPI('graphPreview', { ...snapshot, commitId: commit.id, action: mode, mainline }, cancellation.signal).then(value => { if (!cancellation.signal.aborted) setPreview(value); }).catch(problem => { if (!cancellation.signal.aborted) setError(problemMessage(problem)); }).finally(() => { if (!cancellation.signal.aborted) setReading(false); });
    return () => cancellation.abort();
  }, [needsPreview, mode, task.id, task.head, task.changeKey, repository.id, commit?.id, mainline, revision]);
  async function retry() {
    setReading(true); setError('');
    try {
      const workspace = await importAPI('localWorkspace', { repositoryId: repository.id });
      const current = workspace.tasks.find(item => item.id === task.id && item.path === task.path && !item.error);
      if (!current) throw new Error('目标工作目录已变化，请重新选择。');
      if (current.head !== task.head || current.changeKey !== task.changeKey) onTargetChange(current);
      operation.current = crypto.randomUUID(); setRevision(value => value + 1);
    } catch (problem) { setError(problemMessage(problem)); }
    finally { setReading(false); }
  }
  const ready = !reading && !writing && !result && !error && (needsPreview ? !!preview : ['branch', 'tag', 'checkout'].includes(mode) ? !!name.trim() : true);
  async function confirm() {
    if (!ready) return;
    setWriting(true); setError(''); const resume = pauseRefresh?.();
    try {
      const input = { ...snapshot, commitId: commit?.id || task.head, action: mode, operationId: operation.current, name, mainline, resetMode };
      const next = await (onWrite ? onWrite('executeGraph', input) : importAPI('executeGraph', input));
      setResult(next); onFinished?.(); onComplete?.(`${graphActionLabels[mode]}已完成。${next.warning || ''}`, !next.warning);
    } catch (problem) { setError(problemMessage(problem)); }
    finally { resume?.(); setWriting(false); }
  }
  return <div className="graph-action-dialog"><Select label="目标工作目录" value={task.id} disabled={writing || !!result} options={candidates.map(candidate => ({ value: candidate.id, label: `${candidate.branch} · ${candidate.path}` }))} onChange={event => { const target = candidates.find(candidate => candidate.id === event.target.value); if (target) onTargetChange(target); }} />
    <p className="muted graph-operation-identity">HEAD <code>{task.head.slice(0, 8)}</code>{commit && <> · 所选提交 <code>{commit.id.slice(0, 8)}</code> · {commit.summary}</>}</p>
    {['branch', 'tag', 'checkout'].includes(mode) && <OutlinedTextField label={mode === 'tag' ? '标签名称' : mode === 'checkout' ? '已有本地分支名称' : '新分支名称'} value={name} disabled={writing || !!result} onChange={event => setName(event.target.value)} />}
    {mode === 'checkout' && <p className="muted">切换需要工作目录没有未提交更改；所选提交必须是目标分支的最新提交。</p>}
    {mode === 'reset' && <><Select label="Reset 模式" value={resetMode} disabled={writing || !!result} options={[{ value: 'soft', label: 'Soft · 保留工作文件和暂存内容' }, { value: 'mixed', label: 'Mixed · 保留工作文件，取消暂存' }, { value: 'hard', label: 'Hard · 工作文件恢复到所选提交' }]} onChange={event => setResetMode(event.target.value as typeof resetMode)} />{resetMode === 'hard' && <Notice kind="info">确认后会覆盖目标目录中的对应更改；执行前会保存恢复点。</Notice>}</>}
    {['merge', 'rebase', 'cherry-pick', 'revert'].includes(mode) && <p className="muted">出现冲突时保留 Git 状态，可在外部解决或中止操作。</p>}
    {(mode === 'cherry-pick' || mode === 'revert') && commit && commit.parents.length > 1 && <Select label="合并提交的父提交" value={String(mainline)} disabled={writing || !!result} options={commit.parents.map((parent, index) => ({ value: String(index + 1), label: `父提交 ${index + 1} · ${parent.slice(0, 8)}` }))} onChange={event => setMainline(Number(event.target.value))} />}
    {mode === 'abort' && <p className="muted">中止这个工作目录正在进行的 Merge、Rebase、Cherry-pick 或 Revert。</p>}
    {reading && <LinearProgress indeterminate aria-label="正在读取提交差异" />}{error && <Notice kind="error">{error}</Notice>}
    {preview && <><RepositoryPreparedDiff files={preview.files} patch={preview.patch} />{mode === 'reset' && resetMode === 'hard' && !!preview.localChanges.length && <section aria-label="当前未提交更改">{preview.localChanges.map(file => <div className="submit-file-choice" key={file.path}><RepositoryFileChangeLabel file={file} /></div>)}</section>}</>}
    {result && <Notice kind={result.warning ? 'info' : 'success'}>{result.warning || `${graphActionLabels[mode]}已完成。`}</Notice>}<div className="modal-actions"><Button disabled={writing} onClick={onClose}>关闭</Button>{error && <Button disabled={writing || reading} onClick={() => void retry()}>重新检查</Button>}{mode !== 'compare' && !result && <Button variant="primary" disabled={!ready} onClick={() => void confirm()}>{writing ? '正在执行…' : `确认${graphActionLabels[mode]}`}</Button>}</div>
  </div>;
}
