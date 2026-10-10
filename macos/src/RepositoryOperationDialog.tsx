import { useEffect, useRef, useState } from 'react';
import { RepositoryActionDialog } from './RepositoryActionDialog';
import type { RepositoryActionMode, RepositoryActionTarget } from './repository-action-model';
import type { GenerateCommitMessage, PushLocalCommit, SubmitLocalCommit } from './local-submit-model';
import { importAPI } from './import-api';
import type { ApplyRepositorySync, RepositorySyncMode, RepositorySyncPlan, RepositorySyncResult } from './repository-sync-model';
import { Button, Icon, Modal, Notice } from './ui';

const isSync = (mode: RepositoryActionMode): mode is RepositorySyncMode => mode === 'pull' || mode === 'latest' || mode === 'clean';
const labels = { pull: 'Pull', latest: 'Get Latest', clean: 'Clean' };
const discard = (plan: RepositorySyncPlan) => importAPI('discardSync', { repositoryId: plan.repositoryId, taskId: plan.taskId, planId: plan.id }).catch(() => { console.warn('操作预览清理未完成，服务将在预览到期后再次清理。'); });
export function RepositoryOperationDialog({ mode, targets, onCommit, onPush, onGenerate, onSync, onComplete, onClose }: {
  mode: RepositoryActionMode; targets: RepositoryActionTarget[]; onCommit: SubmitLocalCommit; onPush: PushLocalCommit;
  onGenerate: GenerateCommitMessage; onSync?: ApplyRepositorySync; onComplete: (message: string) => void; onClose: () => void;
}) {
  return isSync(mode) ? <RepositorySyncDialog mode={mode} targets={targets} onApply={onSync} onComplete={onComplete} onClose={onClose} /> :
    <RepositoryActionDialog mode={mode} targets={targets} onCommit={onCommit} onPush={onPush} onGenerate={onGenerate} onComplete={onComplete} onClose={onClose} />;
}
export function RepositorySyncDialog({ mode, targets, onApply, onComplete, onClose }: {
  mode: RepositorySyncMode; targets: RepositoryActionTarget[]; onApply?: ApplyRepositorySync;
  onComplete: (message: string) => void; onClose: () => void;
}) {
  const [plans, setPlans] = useState<Record<string, RepositorySyncPlan>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, RepositorySyncResult>>({});
  const [reading, setReading] = useState(true), [writing, setWriting] = useState(false), [revision, setRevision] = useState(0);
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
      try {
        const result = await run({ repositoryId: target.repositoryId, taskId: target.task.id, planId: plan.id, operationId: crypto.randomUUID() });
        completed.current[id] = result;
        if (mounted.current) setResults(current => ({ ...current, [id]: result }));
      } catch (p) {
        if (mounted.current) setErrors(current => ({ ...current, [id]: p instanceof Error ? p.message : '操作未完成。' }));
        break; // Never continue a destructive batch after a failed target.
      }
    }
    if (!mounted.current) return;
    setWriting(false);
    const count = Object.keys(completed.current).length;
    if (count) onComplete(`${labels[mode]} 已完成 ${count} 个工作目录${count < targets.length ? `，剩余 ${targets.length - count} 个未完成` : ''}。`);
  }
  return <Modal title={`${labels[mode]} · ${targets.length} 个工作目录`} onClose={() => { if (!writing) onClose(); }}>
    <div className="commit-composer repository-sync-dialog">
      {!targets.length && <Notice kind="info">当前筛选范围没有可操作的已关联工作目录。</Notice>}
      {targets.map(target => {
        const id = key(target), plan = plans[id], result = results[id];
        return <section key={id} className="commit-message-preview">
          <h3>{target.repositoryName} · {target.task.branch}</h3><p className="muted" title={target.task.path || ''}>{target.task.path}</p>
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
        {!!pending.length && <Button variant="primary" disabled={!canApply} onClick={() => void apply()}>{writing ? <><Icon name="spinner" className="spin" /> 正在执行…</> : `确认 ${labels[mode]}`}</Button>}
      </div>
    </div>
  </Modal>;
}
