import { useEffect, useRef, useState } from 'react';
import { RepositoryActionDialog } from './RepositoryActionDialog';
import type { RepositoryActionMode, RepositoryActionTarget, RepositoryOperationControls } from './repository-action-model';
import type { CommitDraft, GenerateCommitMessage, LocalSubmitResult, PushLocalCommit, SubmitLocalCommit } from './local-submit-model';
import { importAPI } from './import-api';
import { isRepositorySyncProgress, type ApplyRepositorySync, type RepositorySyncMode, type RepositorySyncPlan, type RepositorySyncResult, type RepositorySyncProgress } from './repository-sync-model';
import { Button, Icon, Modal, Notice } from './ui';
import { LinearProgress } from './material-inputs';

const isSync = (mode: RepositoryActionMode): mode is RepositorySyncMode => mode === 'pull' || mode === 'latest' || mode === 'clean';
const labels = { pull: 'Pull', latest: 'Get Latest', clean: 'Clear' };
const discard = (plan: RepositorySyncPlan) => importAPI('discardSync', { repositoryId: plan.repositoryId, taskId: plan.taskId, planId: plan.id }).catch(() => { console.warn('操作预览清理未完成，服务将在预览到期后再次清理。'); });
export function RepositoryOperationDialog({ mode, targets, onCommit, onPush, onGenerate, onSync, onComplete, onCommitted, onDraftChange, onClose, ...controls }: {
  mode: RepositoryActionMode; targets: RepositoryActionTarget[]; onCommit: SubmitLocalCommit; onPush: PushLocalCommit;
  onGenerate: GenerateCommitMessage; onSync?: ApplyRepositorySync; onComplete?: (message: string) => void; onClose: () => void;
  onCommitted?: (target: RepositoryActionTarget, result: LocalSubmitResult) => void; onDraftChange?: (target: RepositoryActionTarget, draft: CommitDraft) => void;
} & RepositoryOperationControls) {
  return isSync(mode) ? <RepositorySyncDialog mode={mode} targets={targets} onApply={onSync} onComplete={onComplete} onClose={onClose} {...controls} /> :
    <RepositoryActionDialog mode={mode} targets={targets} onCommit={onCommit} onPush={onPush} onGenerate={onGenerate} onCommitted={onCommitted} onDraftChange={onDraftChange} onComplete={onComplete} onClose={onClose} {...controls} />;
}
export function RepositorySyncDialog({ mode, targets, onApply, onComplete, onClose, visible = true, onCollapse, onStateChange, onFinished }: {
  mode: RepositorySyncMode; targets: RepositoryActionTarget[]; onApply?: ApplyRepositorySync;
  onComplete?: (message: string) => void; onClose: () => void;
} & RepositoryOperationControls) {
  const [plans, setPlans] = useState<Record<string, RepositorySyncPlan>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, RepositorySyncResult>>({});
  const [reading, setReading] = useState(true), [writing, setWriting] = useState(false), [revision, setRevision] = useState(0);
  const [finished, setFinished] = useState(false);
  const [progress, setProgress] = useState<Record<string, RepositorySyncProgress>>({});
  const [now, setNow] = useState(Date.now);
  const active = useRef<{ key: string; operationId: string; repositoryId: string; taskId: string } | null>(null);
  useEffect(() => {
    const receive = (event: Event) => {
      const value: unknown = (event as CustomEvent).detail, current = active.current;
      if (!current || !isRepositorySyncProgress(value) || value.operationId !== current.operationId || value.repositoryId !== current.repositoryId || value.taskId !== current.taskId) return;
      setProgress(previous => ({ ...previous, [current.key]: value }));
    };
    window.addEventListener('gittogether:sync-progress', receive);
    return () => window.removeEventListener('gittogether:sync-progress', receive);
  }, []);
  useEffect(() => {
    if (!writing) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [writing]);
  useEffect(() => { onStateChange?.(finished ? 'completed' : writing ? 'working' : Object.keys(errors).length ? 'failed' : reading ? 'preparing' : 'ready'); }, [finished, writing, errors, reading, onStateChange]);
  const saved = useRef<Record<string, RepositorySyncPlan>>({});
  const completed = useRef<Record<string, RepositorySyncResult>>({});
  const mounted = useRef(true);
  const key = (target: RepositoryActionTarget) => JSON.stringify([target.repositoryId, target.task.id]);
  useEffect(() => {
    mounted.current = true;
    const cancellation = new AbortController(); saved.current = {}; setPlans({}); setErrors({}); setReading(true);
    void (async () => {
      for (const target of targets) {
        const id = key(target); if (completed.current[id] || cancellation.signal.aborted) continue;
        try {
          const plan = await importAPI('prepareSync', { repositoryId: target.repositoryId, taskId: target.task.id, mode }, cancellation.signal);
          if (cancellation.signal.aborted) { await discard(plan); break; }
          saved.current[id] = plan; setPlans(current => ({ ...current, [id]: plan }));
        } catch (p) {
          if (!cancellation.signal.aborted) setErrors(current => ({ ...current, [id]: p instanceof Error ? p.message : '文件预览未完成。' }));
        }
      }
      if (!cancellation.signal.aborted) setReading(false);
    })();
    return () => { mounted.current = false; cancellation.abort(); for (const plan of Object.values(saved.current)) void discard(plan); };
  }, [mode, targets, revision]);
  const pending = targets.filter(target => !results[key(target)]);
  const canApply = pending.length > 0 && pending.every(target => plans[key(target)]) && !reading && !writing && !Object.keys(errors).length;
  async function apply() {
    if (!canApply) return;
    setWriting(true);
    const run = onApply || (input => importAPI('applySync', input));
    for (const target of pending) {
      const id = key(target), plan = saved.current[id];
      if (!plan) break;
      delete saved.current[id];
      const operationId = crypto.randomUUID(), startedAt = Date.now();
      active.current = { key: id, operationId, repositoryId: target.repositoryId, taskId: target.task.id };
      setNow(startedAt);
      setProgress(previous => ({ ...previous, [id]: { ...active.current!, state: 'running', title: '核验操作预览', description: '正在检查本地更改及跟踪分支。', value: null, startedAt, updatedAt: startedAt } }));
      try {
        const result = await run({ repositoryId: target.repositoryId, taskId: target.task.id, planId: plan.id, operationId });
        completed.current[id] = result;
        if (mounted.current) setResults(current => ({ ...current, [id]: result }));
      } catch (p) {
        if (mounted.current) setErrors(current => ({ ...current, [id]: p instanceof Error ? p.message : '操作未完成。' }));
        break; // Never continue a destructive batch after a failed target.
      } finally {
        active.current = null;
      }
    }
    if (!mounted.current) return;
    setWriting(false);
    const count = Object.keys(completed.current).length;
    if (count) onComplete?.(`${labels[mode]} 已完成 ${count} 个工作目录${count < targets.length ? `，剩余 ${targets.length - count} 个未完成` : ''}。`);
    if (count === targets.length) { setFinished(true); onFinished?.(); }
  }
  return <Modal title={`${labels[mode]} · ${targets.length} 个工作目录`} visible={visible} onCollapse={onCollapse} onClose={() => { if (writing) onCollapse?.(); else onClose(); }}>
    <div className="commit-composer repository-sync-dialog">
      {!targets.length && <Notice kind="info">当前筛选范围没有可操作的已关联工作目录。</Notice>}
      {targets.map(target => {
        const id = key(target), plan = plans[id], result = results[id], current = progress[id];
        const running = writing && active.current?.key === id;
        const elapsed = current ? Math.max(0, Math.floor((now - current.startedAt) / 1_000)) : 0;
        return <section key={id} className="commit-message-preview">
          <h3>{target.repositoryName} · {target.task.branch}</h3><p className="muted" title={target.task.path || ''}>{target.task.path}</p>
          {running && current && <div className="push-progress repository-sync-progress" aria-label={`${labels[mode]} 执行进度`}>
            <div className="repository-sync-progress-title" role="status"><span><Icon name="spinner" className="spin" /> {current.title}</span>{current.value !== null && <span>{Math.round(current.value * 100)}%</span>}</div>
            <LinearProgress indeterminate={current.value === null} value={current.value ?? 0} aria-label={current.title} />
            {current.description && <small className="repository-sync-progress-detail">{current.description}</small>}
            <small>工作目录 {targets.findIndex(item => key(item) === id) + 1} / {targets.length} · 已用 {elapsed < 60 ? `${elapsed} 秒` : `${Math.floor(elapsed / 60)} 分 ${elapsed % 60} 秒`}{now - current.updatedAt >= 15_000 ? ' · 等待 Git 返回下一条进度…' : ''}</small>
          </div>}
          {writing && !running && !result && !errors[id] && <p className="muted">等待前一个工作目录完成…</p>}
          {result ? <Notice kind={result.warning ? 'info' : 'success'}>{result.warning || `${labels[mode]} 已完成 · ${result.files} 个文件${mode === 'latest' ? ` · 回收 ${(result.reclaimedBytes / 1024 / 1024).toFixed(1)} MB${result.protectedHistory ? '，共享历史仍保留' : ''}` : ''}`}</Notice> : errors[id] ? <Notice kind="error">{errors[id]}</Notice> : plan ? <>
            <p>{plan.note}</p>
            {mode === 'latest' && <p>当前分支旧历史：{plan.historyCommits} 个提交；最新目录保留 1 个提交。</p>}
            <details open><summary>{plan.files.length} 个受影响文件</summary><ul>{plan.files.map(file => <li key={file.path}><span>{file.action === 'delete' ? '删除' : file.action === 'add' ? '补齐' : '恢复'} </span><code>{file.path}</code></li>)}</ul></details>
            {!plan.files.length && <p className="muted">文件已与远端一致{mode === 'latest' ? '，确认后仍会整理当前分支历史' : ''}。</p>}
          </> : <p><Icon name="spinner" className="spin" /> 正在下载并核验文件预览…</p>}
        </section>;
      })}
      <div className="commit-composer-actions">
        <Button variant="quiet" disabled={writing} onClick={onClose}>关闭</Button>
        {!!Object.keys(errors).length && <Button disabled={reading || writing} onClick={() => setRevision(value => value + 1)}>重新预览未完成目录</Button>}
        {!!pending.length && <Button variant="primary" disabled={!canApply} onClick={() => void apply()}>{writing ? <><Icon name="spinner" className="spin" /> 正在 {labels[mode]} · {Object.keys(results).length + 1} / {targets.length}</> : `确认 ${labels[mode]}`}</Button>}
      </div>
    </div>
  </Modal>;
}
