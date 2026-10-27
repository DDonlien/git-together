import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { importAPI } from './import-api';
import type { ApiOutputs, RemoteRepository } from './import-model';
import type { RepositoryCommit, RepositoryTask } from './repository-model';
import type { RepositoryActionTarget, RepositoryOperationControls } from './repository-action-model';
import { graphActionLabels, graphSnapshot, graphSourceKey, rememberedSources, type GraphAction, type GraphMergePlan, type GraphPreview, type GraphSource, type GraphSourceChoice, type GraphWrite, type GraphWriteResult } from './graph-operation-model';
import { isCommitDraft } from './local-submit-model';
import { Button, Icon, Modal, Notice, Popover, Select } from './ui';
import { LinearProgress, OutlinedTextField } from './material-inputs';
import { RepositoryPreparedDiff } from './RepositoryPreparedDiff';
import { RepositoryFileChangeLabel } from './RepositoryFileChangeLabel';

export type GraphOperationInput = { kind: 'graph'; mode: GraphAction; scope: string; repository: RemoteRepository; commit?: RepositoryCommit; targets: RepositoryActionTarget[]; candidates: RepositoryTask[]; onWrite?: GraphWrite; onComplete?: (message: string, complete?: boolean) => void };
const problemMessage = (problem: unknown) => problem instanceof Error ? problem.message : '图谱操作未完成。';
const discard = (plan: GraphMergePlan) => importAPI('discardGraphMerge', { repositoryId: plan.repositoryId, taskId: plan.taskId, planId: plan.id }).catch(problem => console.warn('合并预览清理未完成。', problemMessage(problem)));

export function RepositoryGraphActionDialog({ targets, candidates, onTargetChange, working = false, ...props }: GraphOperationInput & RepositoryOperationControls & { working?: boolean; onClose: () => void; onTargetChange: (task: RepositoryTask) => void }) {
  const task = targets[0]?.task;
  return <Modal title={graphActionLabels[props.mode]} visible={props.visible} onCollapse={props.onCollapse} onClose={working ? props.onCollapse || (() => {}) : props.onClose}>
    {task ? <GraphTaskDialog key={task.id} {...props} task={task} candidates={candidates} onTargetChange={onTargetChange} /> : <><Notice kind="info">请先关联一个本地工作目录。</Notice><div className="dialog-actions"><Button onClick={props.onClose}>关闭</Button></div></>}
  </Modal>;
}
function SourcePicker({ options, selection, onChange, disabled }: { options: GraphSource[]; selection: GraphSourceChoice[]; onChange: (selection: GraphSourceChoice[]) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const chosen = new Set(selection.map(graphSourceKey));
  const unavailable = selection.filter(source => !options.some(option => graphSourceKey(option) === graphSourceKey(source)));
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const inputs = [...event.currentTarget.querySelectorAll<HTMLInputElement>('input:not(:disabled)')];
    if (!inputs.length) return;
    const at = inputs.indexOf(document.activeElement as HTMLInputElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? inputs.length - 1 : event.key === 'ArrowDown' ? (at + 1) % inputs.length : (at - 1 + inputs.length) % inputs.length;
    event.preventDefault(); inputs[next]?.focus();
  }
  return <Popover label="选择要合并的分支" open={open} onOpenChange={setOpen} placement="start" focusOnOpen="first" trigger={<Button disabled={disabled} aria-haspopup="dialog"><Icon name="branch" size={14} />来源分支{selection.length ? `（${selection.length}）` : ''}<Icon name="down" size={12} /></Button>}>
    <div className="multi-filter-options graph-source-options" onKeyDown={navigate}>{(['remote', 'local'] as const).map(kind => <fieldset className="multi-filter-group" key={kind}><legend>{kind === 'remote' ? '远端分支' : '本地分支'}</legend>{options.filter(source => source.kind === kind).map(source => <label className="multi-filter-option" key={graphSourceKey(source)}>
      <input type="checkbox" checked={chosen.has(graphSourceKey(source))} disabled={disabled} onChange={() => {
        const next = chosen.has(graphSourceKey(source)) ? selection.filter(item => graphSourceKey(item) !== graphSourceKey(source)) : [...selection, { name: source.name, kind: source.kind, taskId: source.taskId }];
        onChange(next);
      }} /><span className="filter-option-label"><span>{source.name}</span><small>{source.head.slice(0, 8)}{source.taskId ? ` · ${source.taskId.replace(/^worktree:[^:]+:/, '')}` : ''}</small></span>
    </label>)}</fieldset>)}{!!unavailable.length && <fieldset className="multi-filter-group"><legend>已不可用的来源</legend>{unavailable.map(source => <label className="multi-filter-option" key={graphSourceKey(source)}><input type="checkbox" checked disabled={disabled} onChange={() => onChange(selection.filter(item => graphSourceKey(item) !== graphSourceKey(source)))} /><span>{source.name}</span></label>)}</fieldset>}</div>
  </Popover>;
}
function GraphTaskDialog({ mode, repository, commit, task, candidates, onTargetChange, onWrite, onStateChange, onFinished, onComplete, onClose }: Omit<GraphOperationInput, 'targets' | 'kind' | 'scope'> & { task: RepositoryTask; onTargetChange: (task: RepositoryTask) => void; onClose: () => void } & RepositoryOperationControls) {
  const [sourceList, setSourceList] = useState<ApiOutputs['graphSources'] | null>(null);
  const sources = sourceList?.sources ?? null;
  const [sourceRevision, setSourceRevision] = useState(0);
  const storageKey = `gittogether.merge-sources.v1:${JSON.stringify([repository.id, task.path, task.branch])}`;
  const [choice, setChoice] = useState(() => { try { return { selected: rememberedSources(storageKey), error: '' }; } catch (problem) { return { selected: null, error: problemMessage(problem) }; } });
  const [summary, setSummary] = useState(''), [description, setDescription] = useState('');
  const [name, setName] = useState(''), [parentPath, setParentPath] = useState(''), [folderName, setFolderName] = useState('');
  const [resetMode, setResetMode] = useState<'soft' | 'mixed' | 'hard'>('mixed'), [mainline, setMainline] = useState(1);
  const [plan, setPlan] = useState<GraphMergePlan | null>(null), [preview, setPreview] = useState<GraphPreview | null>(null);
  const [reading, setReading] = useState(mode !== 'abort' && mode !== 'branch' && mode !== 'tag' && mode !== 'worktree');
  const [writing, setWriting] = useState(false), [error, setError] = useState(''), [result, setResult] = useState<GraphWriteResult | null>(null), [revision, setRevision] = useState(0);
  const dirty = useRef({ summary: false, description: false });
  const savedPlan = useRef<GraphMergePlan | null>(null), serial = useRef<Promise<unknown>>(Promise.resolve()), operation = useRef(crypto.randomUUID());
  const snapshot = graphSnapshot(repository.id, task);
  const options = sources?.filter(source => !(source.kind === 'local' && source.name === task.branch && (!source.taskId || source.taskId === task.id))) || [];
  const defaults = options.filter(source => source.kind === 'remote' && (source.name === task.branch || source.name === repository.defaultBranch));
  const selection = choice.selected ?? defaults.map(({ name, kind, taskId }) => ({ name, kind, taskId }));
  const missing = sources !== null && selection.some(source => !options.some(option => graphSourceKey(option) === graphSourceKey(source)));
  const selectionKey = JSON.stringify(selection);
  const planSelectionKey = plan && JSON.stringify(plan.sources.map(({ name, kind, taskId }) => ({ name, kind, taskId })));
  const activePlan = plan && planSelectionKey === selectionKey && plan.head === task.head && !missing ? plan : null;
  const isAI = mode === 'ai-sync', compare = mode === 'compare';
  const needsPreview = !['ai-sync', 'abort', 'branch', 'tag', 'worktree'].includes(mode);
  useEffect(() => { onStateChange?.(result ? 'completed' : writing ? 'working' : error ? 'failed' : reading ? 'preparing' : 'ready'); }, [result, writing, error, reading, onStateChange]);
  useEffect(() => {
    if (!isAI) return;
    const controller = new AbortController();
    void importAPI('graphSources', { repositoryId: repository.id, taskId: task.id }, controller.signal).then(value => {
      if (!controller.signal.aborted) setSourceList(value);
    }).catch(problem => { if (!controller.signal.aborted) { setError(problemMessage(problem)); setReading(false); } });
    return () => controller.abort();
  }, [isAI, repository.id, task.id, sourceRevision]);
  useEffect(() => {
    if (!needsPreview || !commit) return;
    const controller = new AbortController(); setReading(true); setError(''); setPreview(null);
    void importAPI('graphPreview', { ...snapshot, commitId: commit.id, action: mode, mainline }, controller.signal).then(value => { if (!controller.signal.aborted) { setPreview(value); setReading(false); } }).catch(problem => { if (!controller.signal.aborted) { setError(problemMessage(problem)); setReading(false); } });
    return () => controller.abort();
  }, [needsPreview, mode, task.id, task.head, task.changeKey, repository.id, commit?.id, mainline, revision]);
  useEffect(() => {
    if (!isAI || sources === null) return;
    const controller = new AbortController(), generationId = crypto.randomUUID();
    setPlan(null); setError('');
    if (savedPlan.current) { void discard(savedPlan.current); savedPlan.current = null; }
    if (!selection.length || missing) { setReading(false); return; }
    setReading(true);
    const cancel = () => { void importAPI('cancelGraphPreparation', { repositoryId: repository.id, taskId: task.id, generationId }).catch(problem => console.warn('取消合并准备未完成。', problemMessage(problem))); };
    controller.signal.addEventListener('abort', cancel, { once: true });
    const pending = serial.current.catch(() => undefined).then(async () => {
      if (controller.signal.aborted) return;
      const next = await importAPI('prepareGraphMerge', { ...snapshot, sources: selection, generationId }, controller.signal);
      if (controller.signal.aborted) { await discard(next); return; }
      savedPlan.current = next; setPlan(next);
      if (!dirty.current.summary) setSummary(next.summary);
      if (!dirty.current.description) setDescription(next.description);
    }).catch(problem => { if (!controller.signal.aborted) setError(problemMessage(problem)); }).finally(() => { controller.signal.removeEventListener('abort', cancel); if (!controller.signal.aborted) setReading(false); });
    serial.current = pending;
    return () => { controller.abort(); if (savedPlan.current) { void discard(savedPlan.current); savedPlan.current = null; } };
  }, [isAI, sources !== null, selectionKey, missing, task.id, task.head, task.changeKey, repository.id, revision]);
  function chooseSources(selected: GraphSourceChoice[]) {
    if (selected.length > 64) { setError('最多同时合并64个来源分支。'); return; }
    let storageError = '';
    try { localStorage.setItem(storageKey, JSON.stringify(selected)); } catch { storageError = '无法保存分支选择；本次仍可合并。'; }
    setChoice({ selected, error: storageError });
  }
  async function chooseParent() {
    if (!window.gittogether) return;
    try { const path = await window.gittogether.chooseDirectory(); if (path) setParentPath(path); } catch (problem) { setError(problemMessage(problem)); }
  }
  async function retry() {
    setReading(true); setError('');
    try {
      const workspace = await importAPI('localWorkspace', { repositoryId: repository.id });
      const latest = workspace.tasks.find(item => item.id === task.id && item.path === task.path && !item.error);
      if (!latest) throw new Error('目标工作目录或分支已变化，请关闭后重新选择。');
      if (latest.head !== task.head || latest.changeKey !== task.changeKey) onTargetChange(latest);
      operation.current = crypto.randomUUID();
      if (isAI && sources === null) setSourceRevision(value => value + 1);
      else setRevision(value => value + 1);
    } catch (problem) { setError(problemMessage(problem)); }
    finally { setReading(false); }
  }
  async function confirm() {
    if (!ready || writing || result) return;
    setWriting(true); setError('');
    try {
      const next = isAI && activePlan ? await (onWrite ? onWrite('applyGraphMerge', { repositoryId: repository.id, taskId: task.id, planId: activePlan.id, operationId: operation.current, summary, description }) : importAPI('applyGraphMerge', { repositoryId: repository.id, taskId: task.id, planId: activePlan.id, operationId: operation.current, summary, description })) : await (onWrite ? onWrite(mode === 'worktree' ? 'createGraphWorktree' : 'executeGraph', { ...snapshot, commitId: commit?.id || task.head, action: mode, operationId: operation.current, name, mainline, resetMode, parentPath, folderName }) : importAPI(mode === 'worktree' ? 'createGraphWorktree' : 'executeGraph', { ...snapshot, commitId: commit?.id || task.head, action: mode, operationId: operation.current, name, mainline, resetMode, parentPath, folderName }));
      savedPlan.current = null; setResult(next); onFinished?.();
      const message = next.unchanged && isAI ? '所选分支已包含在当前分支中。' : `${graphActionLabels[mode]}已完成。`;
      onComplete?.(next.warning ? `${message} ${next.warning}` : message, !next.warning);
    } catch (problem) { setError(problemMessage(problem)); }
    finally { setWriting(false); }
  }
  const ready = !reading && !writing && !result && !error && (isAI ? !!activePlan && isCommitDraft({ summary, description }) : needsPreview ? !!preview : mode === 'branch' || mode === 'tag' ? !!name.trim() : mode === 'worktree' ? !!name.trim() && !!parentPath.trim() && !!folderName.trim() : true);
  return <div className="graph-action-dialog">
    <Select label="目标工作目录" value={task.id} disabled={writing || !!result} options={candidates.map(candidate => ({ value: candidate.id, label: `${candidate.branch} · ${candidate.path}` }))} onChange={event => { const target = candidates.find(candidate => candidate.id === event.target.value); if (target) onTargetChange(target); }} />
    <p className="muted graph-operation-identity">HEAD <code>{task.head.slice(0, 8)}</code>{!isAI && commit && <> · 所选提交 <code>{commit.id.slice(0, 8)}</code> · {commit.summary}</>}</p>
    {isAI && <><SourcePicker options={options} selection={selection} onChange={chooseSources} disabled={sources === null || writing || !!result} />{sourceList?.limited && <Notice kind="info">远端分支超过读取范围，当前仅显示已读取的来源分支。</Notice>}{choice.error && <Notice kind="info">{choice.error}</Notice>}{missing && <Notice kind="error">记住的来源分支已不可用，请重新选择。</Notice>}{sources !== null && !selection.length && <p className="muted">选择要合并的来源分支。</p>}</>}
    {(mode === 'branch' || mode === 'tag' || mode === 'worktree') && <OutlinedTextField label={mode === 'tag' ? '标签名称' : '新分支名称'} value={name} disabled={writing || !!result} onChange={event => setName(event.target.value)} />}
    {mode === 'worktree' && <><div className="graph-worktree-parent"><OutlinedTextField label="父目录" value={parentPath} disabled={writing || !!result} onChange={event => setParentPath(event.target.value)} />{window.gittogether && <Button disabled={writing || !!result} onClick={() => void chooseParent()}>选择目录</Button>}</div><OutlinedTextField label="文件夹名称" value={folderName} disabled={writing || !!result} onChange={event => setFolderName(event.target.value)} /></>}
    {mode === 'reset' && window.gittogether?.backend !== 'github-desktop' && <><Select label="Reset 模式" value={resetMode} disabled={writing || !!result} options={[{ value: 'soft', label: 'Soft · 保留工作文件和暂存内容' }, { value: 'mixed', label: 'Mixed · 保留工作文件，取消暂存' }, { value: 'hard', label: 'Hard · 工作文件恢复到所选提交' }]} onChange={event => setResetMode(event.target.value as typeof resetMode)} />{resetMode === 'hard' && <Notice kind="info">确认后会覆盖目标目录中的对应更改；执行前会保存恢复点。</Notice>}</>}
    {(mode === 'merge' || mode === 'rebase' || mode === 'cherry-pick' || mode === 'revert') && <p className="muted">只操作所选目标目录；出现冲突时保留 Git 状态，可解决或中止。</p>}
    {(mode === 'cherry-pick' || mode === 'revert') && commit && commit.parents.length > 1 && <Select label="合并提交的父提交" value={String(mainline)} disabled={writing || !!result} options={commit.parents.map((parent, index) => ({ value: String(index + 1), label: `父提交 ${index + 1} · ${parent.slice(0, 8)}` }))} onChange={event => setMainline(Number(event.target.value))} />}
    {mode === 'abort' && <p className="muted">中止这个工作目录正在进行的 Merge、Rebase、Cherry-pick 或 Revert。</p>}
    {reading && <div className="graph-preparing" role="status"><LinearProgress indeterminate aria-label="正在准备" /><span>{isAI ? '正在合并分支并准备提交内容…' : '正在读取提交差异…'}</span></div>}
    {error && <Notice kind="error">{error}</Notice>}
    {activePlan && <div className="graph-merge-review"><div className="graph-merge-sources">{activePlan.sources.map(source => <span key={graphSourceKey(source)}>{source.kind === 'remote' ? '远端' : '本地'} · {source.name} · <code>{source.head.slice(0, 8)}</code>{!source.included && ' · 已包含'}</span>)}</div>{activePlan.localChanges.length > 0 && !activePlan.unchanged && <Notice kind="info">此次提交包含当前目录的 {activePlan.localChanges.length} 项未提交更改，并保留执行前恢复点。</Notice>}{activePlan.resolvedConflicts.length > 0 && <p className="muted">已处理 {activePlan.resolvedConflicts.length} 个冲突文件，请审阅最终差异。</p>}{activePlan.unchanged ? <Notice kind="info">所选分支已包含在当前分支中；当前未提交更改保持。</Notice> : <><RepositoryPreparedDiff files={activePlan.files} patch={activePlan.patch} /><div className="graph-commit-fields"><OutlinedTextField label="Summary" value={summary} disabled={writing || !!result} onChange={event => { dirty.current.summary = true; setSummary(event.target.value); }} /><OutlinedTextField label="Description" type="textarea" rows={3} value={description} disabled={writing || !!result} onChange={event => { dirty.current.description = true; setDescription(event.target.value); }} /></div></>}</div>}
    {preview && <><p className="muted">{mode === 'cherry-pick' || mode === 'revert' ? '本次提交要应用的补丁' : '当前 HEAD 与所选提交的版本差异'}</p><RepositoryPreparedDiff files={preview.files} patch={preview.patch} />{mode === 'reset' && resetMode === 'hard' && !!preview.localChanges.length && <section aria-label="当前未提交更改"><p className="muted">当前未提交更改（执行前保存恢复点）</p>{preview.localChanges.map(file => <div className="submit-file-choice" key={file.path}><RepositoryFileChangeLabel file={file} /></div>)}</section>}</>}
    {result && <><Notice kind={result.warning ? 'info' : 'success'}>{result.warning || (isAI && result.unchanged ? '已经同步，无需创建提交。' : '操作已完成。')}{!result.unchanged && <> · <code>{result.head.slice(0, 8)}</code></>}</Notice>{result.worktreePath && <p className="muted">{result.worktreePath}</p>}{result.recoveryRef && <p className="muted" title={result.recoveryRef}>恢复点：<code>{result.recoveryRef}</code></p>}</>}
    <div className="dialog-actions"><Button disabled={writing} onClick={onClose}>{result || compare ? '关闭' : '取消'}</Button>{!!error && !writing && <Button onClick={() => void retry()}>重新准备</Button>}{!compare && !result && <Button variant="primary" disabled={!ready} onClick={() => void confirm()}>{writing ? '正在执行…' : isAI ? activePlan?.unchanged ? '完成' : '合并并提交' : '确认执行'}</Button>}</div>
  </div>;
}
