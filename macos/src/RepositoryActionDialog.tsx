import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Icon, Modal, Notice } from './ui';
import { OutlinedTextField } from './material-inputs';
import type { CommitDraft, GenerateCommitMessage, LocalSubmitResult, PushLocalCommit, SubmitLocalCommit } from './local-submit-model';
import type { RepositoryActionMode, RepositoryActionTarget } from './repository-action-model';
export type { RepositoryActionMode, RepositoryActionTarget } from './repository-action-model';

type SavedDraft = { draft: CommitDraft; edited: Record<keyof CommitDraft, boolean>; generated: boolean; head: string; changeKey?: string };
type Entry = RepositoryActionTarget & SavedDraft & { commitOperation: string; pushOperation: string; committed?: LocalSubmitResult; pushed?: boolean; error?: string };
const DraftsContext = createContext<Map<string, SavedDraft> | null>(null);

export function RepositoryActionDraftsProvider({ sessionId, children }: { sessionId: string; children: ReactNode }) {
  const drafts = useMemo(() => new Map<string, SavedDraft>(), [sessionId]);
  return <DraftsContext.Provider value={drafts}>{children}</DraftsContext.Provider>;
}
function draftKey(target: RepositoryActionTarget): string {
  return JSON.stringify([target.repositoryId, target.task.branch, target.task.path]);
}

// Freeze the reviewed worktrees and file lists when opening. Later filtering or
// heartbeat reads must not silently widen the operation's scope.
export function RepositoryActionDialog({ mode, targets, onCommit, onGenerate, onPush, onCommitted, onComplete, onClose }: {
  mode: Extract<RepositoryActionMode, 'commit' | 'submit' | 'push'>; targets: RepositoryActionTarget[]; onCommit: SubmitLocalCommit; onGenerate: GenerateCommitMessage; onPush: PushLocalCommit;
  onCommitted?: (target: RepositoryActionTarget, result: LocalSubmitResult) => void;
  onComplete?: (message: string) => void; onClose: () => void;
}) {
  const sharedDrafts = useContext(DraftsContext), fallbackDrafts = useRef(new Map<string, SavedDraft>());
  const drafts = sharedDrafts || fallbackDrafts.current;
  const [entries, setEntries] = useState<Entry[]>(() => {
    const seen = new Set<string>();
    return targets.filter(target => {
      if (!target.task.path || target.task.error || seen.has(target.task.path)) return false;
      const eligible = mode === 'push' ? !!(target.commitId || target.task.head) && !/^0+$/.test(target.commitId || target.task.head) : !!target.task.files.length && !!target.task.changeKey;
      if (eligible) seen.add(target.task.path);
      return eligible;
    }).map(target => {
      const saved = mode !== 'push' ? drafts.get(draftKey(target)) : undefined;
      const sameChanges = saved?.head === target.task.head && saved.changeKey === target.task.changeKey;
      return {
        ...structuredClone(target),
        draft: { summary: saved && (sameChanges || saved.edited.summary) ? saved.draft.summary : '', description: saved && (sameChanges || saved.edited.description) ? saved.draft.description : '' },
        edited: { summary: saved?.edited.summary || false, description: saved?.edited.description || false }, generated: !!sameChanges && !!saved?.generated,
        head: target.task.head, changeKey: target.task.changeKey,
        commitOperation: crypto.randomUUID(), pushOperation: crypto.randomUUID(),
      };
    });
  });
  const current = useRef(entries), running = useRef(false);
  const [generating, setGenerating] = useState(mode === 'submit' && entries.some(entry => !entry.generated)), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const generation = useRef<AbortController | null>(null);
  const update = (index: number, change: Partial<Entry> | ((entry: Entry) => Partial<Entry>)) => {
    current.current = current.current.map((entry, item) => {
      if (item !== index) return entry;
      const next = { ...entry, ...(typeof change === 'function' ? change(entry) : change) };
      if (mode !== 'push') {
        if (next.committed) drafts.delete(draftKey(next));
        else drafts.set(draftKey(next), { draft: next.draft, edited: next.edited, generated: next.generated, head: next.head, changeKey: next.changeKey });
      }
      return next;
    });
    setEntries(current.current);
  };
  const edit = (index: number, field: keyof CommitDraft, value: string) => update(index, entry => ({
    draft: { ...entry.draft, [field]: value }, edited: { ...entry.edited, [field]: true }, commitOperation: crypto.randomUUID(),
  }));
  useEffect(() => {
    if (mode !== 'submit') return;
    const controller = new AbortController(); generation.current = controller;
    void (async () => {
      try {
        for (let index = 0; index < current.current.length; index++) {
          const entry = current.current[index];
          if (entry.generated) continue;
          const draft = await onGenerate({ repositoryId: entry.repositoryId, taskId: entry.task.id, expectedHead: entry.task.head, changeKey: entry.task.changeKey! }, controller.signal);
          controller.signal.throwIfAborted();
          // Fields can be edited while generation is pending. Fill only those
          // the user has left untouched, including an intentionally empty body.
          update(index, latest => ({ generated: true, draft: {
            summary: latest.edited.summary ? latest.draft.summary : draft.summary,
            description: latest.edited.description ? latest.draft.description : draft.description,
          } }));
        }
      } catch (problem) { if (!controller.signal.aborted) setError(problem instanceof Error ? problem.message : 'AI 说明生成未完成。'); }
      finally { if (!controller.signal.aborted) setGenerating(false); }
    })();
    return () => controller.abort();
  }, []);
  const close = () => { if (running.current) return; generation.current?.abort(); onClose(); };
  const ready = entries.length > 0 && !generating && !busy && entries.every(entry => mode === 'push' || entry.committed || (mode !== 'submit' || entry.generated) && !!entry.draft.summary.trim());
  async function confirm() {
    if (!ready || running.current) return;
    running.current = true; setBusy(true); setError('');
    try {
      for (let index = 0; index < current.current.length; index++) {
        let entry = current.current[index];
        update(index, { error: undefined });
        try {
          if (mode !== 'push' && !entry.committed) {
            const committed = await onCommit({ repositoryId: entry.repositoryId, taskId: entry.task.id, expectedHead: entry.task.head, changeKey: entry.task.changeKey!, operationId: entry.commitOperation, ...entry.draft });
            update(index, { committed }); entry = current.current[index];
            onCommitted?.(entry, committed);
            if (committed.warning) throw new Error(committed.warning);
          }
          if (mode !== 'commit' && !entry.pushed) {
            const commitId = entry.committed?.commitId || entry.commitId || entry.task.head;
            const result = await onPush({ repositoryId: entry.repositoryId, taskId: entry.task.id, expectedHead: entry.committed?.commitId || entry.task.head, commitId, operationId: entry.pushOperation });
            update(index, { pushed: true });
            if (result.warning) throw new Error(result.warning);
          }
        } catch (problem) {
          update(index, { error: problem instanceof Error ? problem.message : '操作未完成。' });
          throw problem;
        }
      }
      onComplete?.(mode === 'commit' ? `已创建 ${current.current.length} 个本地提交。` : `已推送 ${current.current.length} 个工作目录的所选提交。`);
      running.current = false; onClose();
    } catch (problem) { setError(problem instanceof Error ? problem.message : '操作未完成。'); }
    finally { running.current = false; setBusy(false); }
  }
  const pushOnly = mode === 'push' || mode === 'submit' && entries.length > 0 && entries.every(entry => entry.committed);
  return <Modal title={mode === 'commit' ? 'Commit' : mode === 'push' ? 'Push' : 'Submit'} onClose={close}>
    <div className="repository-action-dialog">
      <p className="repository-submit-count">{entries.length} 个工作目录{mode !== 'push' && ` · ${entries.reduce((count, entry) => count + entry.task.files.length, 0)} 个更改`}</p>
      {generating && <p className="repository-submit-generating" role="status"><Icon name="spinner" className="spin" size={16} />正在准备提交内容…</p>}
      <div className="repository-submit-content">
        {entries.map((entry, index) => <section key={`${entry.repositoryId}:${entry.task.id}`} aria-label={`${entry.repositoryName} · ${entry.task.branch}`}>
          <h3><Icon name="branch" size={15} /><span>{entry.repositoryName} · {entry.task.branch}</span></h3>
          {mode !== 'push' && <div className="repository-batch-draft">
            <OutlinedTextField label="Summary" aria-label={`Summary：${entry.repositoryName} / ${entry.task.branch}`} value={entry.draft.summary} onChange={event => edit(index, 'summary', event.target.value)} maxLength={500} required disabled={busy || !!entry.committed} />
            <OutlinedTextField type="textarea" label="Description" aria-label={`Description：${entry.repositoryName} / ${entry.task.branch}`} value={entry.draft.description} onChange={event => edit(index, 'description', event.target.value)} maxLength={20_000} rows={2} disabled={busy || !!entry.committed} />
          </div>}
          {mode === 'push' ? <code className="repository-submit-sha">{(entry.commitId || entry.task.head).slice(0, 12)}</code> : <ul className="repository-submit-files" aria-label={`提交清单：${entry.task.branch}`}>
            {entry.task.files.map(file => <li key={file.path}><span className="repository-submit-file-status">{file.status}</span><span>{file.path}</span></li>)}
          </ul>}
          {entry.committed && <p className="repository-submit-result" role="status">已 Commit · {entry.committed.commitId.slice(0, 8)}{entry.pushed ? ' · 已 Push' : mode === 'submit' ? ' · 待 Push' : ''}</p>}
          {mode === 'push' && entry.pushed && <p className="repository-submit-result" role="status">已 Push</p>}
          {entry.error && <p className="repository-submit-result">{entry.error}</p>}
        </section>)}
      </div>
      {!entries.length && <p>当前范围内没有可执行的更改。</p>}
      {error && <Notice kind="error">{error}</Notice>}
      <div className="modal-actions"><Button type="button" disabled={busy} onClick={close}>取消</Button><Button type="button" variant="primary" disabled={!ready} aria-busy={busy} onClick={() => void confirm()}>{busy ? <><Icon name="spinner" className="spin" size={14} />正在{pushOnly ? '推送' : '提交'}…</> : pushOnly ? 'Push' : mode === 'commit' ? 'Commit' : '提交'}</Button></div>
    </div>
  </Modal>;
}
