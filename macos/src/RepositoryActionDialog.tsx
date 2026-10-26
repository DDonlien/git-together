import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Button, Icon, Modal, Notice } from './ui';
import { OutlinedTextField } from './material-inputs';
import { RepositoryCommitFiles } from './RepositoryCommitFiles';
import { PushFeedbackProvider, PushProgress, usePushActivity } from './PushFeedback';
import type { CommitDraft, GenerateCommitMessage, LocalSubmitResult, PushLocalCommit, SubmitLocalCommit } from './local-submit-model';
import type { RepositoryActionMode, RepositoryActionTarget, RepositoryOperationControls } from './repository-action-model';
import { createCommitDraftStore, generationIdentity, type SavedDraft } from './commit-draft-store';
import { importAPI } from './import-api';
import type { LocalFile } from './import-model';
export type { RepositoryActionMode, RepositoryActionTarget } from './repository-action-model';

type Entry = RepositoryActionTarget & SavedDraft & { paths: string[]; commitOperation: string; pushOperation: string; committed?: LocalSubmitResult; pushed?: boolean };
const DraftsContext = createContext<ReturnType<typeof createCommitDraftStore> | null>(null);

export function RepositoryActionDraftsProvider({ sessionId, children }: { sessionId: string; children: ReactNode }) {
  const store = useMemo(createCommitDraftStore, [sessionId]);
  useEffect(() => () => store.stop(), [store]);
  return <DraftsContext.Provider value={store}><PushFeedbackProvider sessionId={sessionId}>{children}</PushFeedbackProvider></DraftsContext.Provider>;
}
function draftKey(target: RepositoryActionTarget): string {
  return JSON.stringify([target.repositoryId, target.task.branch, target.task.path]);
}

// Freeze the reviewed worktrees and file lists when opening. Later filtering or
// heartbeat reads must not silently widen the operation's scope.
export function RepositoryActionDialog({ mode, targets, onCommit, onGenerate, onPush, onCommitted, onDraftChange, onComplete, onClose, visible = true, onCollapse, onStateChange, onFinished, pauseRefresh }: {
  mode: Extract<RepositoryActionMode, 'commit' | 'submit' | 'push'>; targets: RepositoryActionTarget[]; onCommit: SubmitLocalCommit; onGenerate: GenerateCommitMessage; onPush: PushLocalCommit;
  onCommitted?: (target: RepositoryActionTarget, result: LocalSubmitResult) => void;
  onDraftChange?: (target: RepositoryActionTarget, draft: CommitDraft) => void;
  onComplete?: (message: string) => void; onClose: () => void;
} & RepositoryOperationControls) {
  const sharedStore = useContext(DraftsContext), fallbackStore = useMemo(createCommitDraftStore, []);
  const store = sharedStore || fallbackStore;
  const revision = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  const drafts = store.drafts;
  const pushActivity = usePushActivity();
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
      const suppliedDraft = target.draft && (target.draft.summary.trim() || target.draft.description) ? target.draft : undefined;
      return {
        ...structuredClone(target),
        draft: suppliedDraft || { summary: saved && (sameChanges || saved.edited.summary) ? saved.draft.summary : '', description: saved && (sameChanges || saved.edited.description) ? saved.draft.description : '' },
        edited: { summary: !!suppliedDraft?.summary.trim() || !!saved?.edited.summary, description: !!suppliedDraft || !!saved?.edited.description }, generated: !!sameChanges && !!saved?.generated,
        head: target.task.head, changeKey: target.task.changeKey,
        paths: sameChanges && saved?.paths ? [...saved.paths] : target.task.files.map(file => file.path),
        commitOperation: crypto.randomUUID(), pushOperation: crypto.randomUUID(),
      };
    });
  });
  const current = useRef(entries), running = useRef(false);
  const [busy, setBusy] = useState(false), [actionError, setError] = useState('');
  const [phase, setPhase] = useState<'commit' | 'push' | 'ignore' | null>(null);
  const [ignoreNotice, setIgnoreNotice] = useState('');
  const [activeTarget, setActiveTarget] = useState('');
  const [finished, setFinished] = useState(false);
  const generatingEntry = entries.find(entry => store.getJob(draftKey(entry), entry)?.status === 'running');
  const generating = !!generatingEntry;
  const failedEntry = entries.find(entry => store.getJob(draftKey(entry), entry)?.status === 'failed');
  const error = actionError || (failedEntry ? `${failedEntry.repositoryName} · ${failedEntry.task.branch}：${store.getJob(draftKey(failedEntry), failedEntry)!.error}` : '');
  useEffect(() => { onStateChange?.(finished ? 'completed' : busy ? 'working' : error ? 'failed' : generating ? 'preparing' : 'ready'); }, [finished, busy, error, generating, onStateChange]);
  const update = (index: number, change: Partial<Entry> | ((entry: Entry) => Partial<Entry>)) => {
    current.current = current.current.map((entry, item) => {
      if (item !== index) return entry;
      const next = { ...entry, ...(typeof change === 'function' ? change(entry) : change) };
      if (generationIdentity(next) !== generationIdentity(entry)) store.cancel(draftKey(entry));
      if (mode !== 'push') {
        if (next.committed) drafts.delete(draftKey(next));
        else {
          drafts.set(draftKey(next), { draft: next.draft, edited: next.edited, generated: next.generated, head: next.head, changeKey: next.changeKey, paths: next.paths });
          onDraftChange?.(next, next.draft);
        }
      }
      return next;
    });
    setEntries(current.current);
  };
  const edit = (index: number, field: keyof CommitDraft, value: string) => {
    setError('');
    update(index, entry => ({ draft: { ...entry.draft, [field]: value }, edited: { ...entry.edited, [field]: true }, commitOperation: crypto.randomUUID() }));
  };
  useEffect(() => {
    for (let index = 0; index < current.current.length; index++) {
      const entry = current.current[index], saved = drafts.get(draftKey(entry));
      if (!entry.committed && saved?.generated && generationIdentity(saved) === generationIdentity(entry) && JSON.stringify(saved.draft) !== JSON.stringify(entry.draft)) {
        update(index, { draft: saved.draft, generated: true });
      }
    }
  }, [revision]);
  async function generate() {
    setError('');
    const pending = current.current.filter(entry => !entry.committed && entry.paths.length);
    const resumeRefresh = pauseRefresh?.();
    try {
      for (const entry of pending) {
        await store.generate(draftKey(entry), { draft: entry.draft, edited: entry.edited, generated: entry.generated, head: entry.head, changeKey: entry.changeKey, paths: entry.paths },
          { repositoryId: entry.repositoryId, taskId: entry.task.id, expectedHead: entry.head, changeKey: entry.changeKey!, paths: entry.paths }, onGenerate);
      }
    } catch (problem) {
      const failed = pending.find(entry => store.getJob(draftKey(entry), entry)?.status === 'failed');
      if (failed) setError(`${failed.repositoryName} · ${failed.task.branch}：${problem instanceof Error ? problem.message : 'AI 说明生成未完成。'}`);
    }
    finally { resumeRefresh?.(); }
  }
  const close = () => { if (running.current) { onCollapse?.(); return; } onClose(); };
  const included = entries.filter(entry => mode === 'push' || entry.paths.length);
  const ready = included.length > 0 && !finished && !busy && included.every(entry => mode === 'push' || entry.committed || !!entry.draft.summary.trim());
  async function ignore(index: number, file: LocalFile) {
    const entry = current.current[index];
    if (running.current || entry.committed) return;
    running.current = true; setBusy(true); setPhase('ignore'); setError(''); setIgnoreNotice('');
    store.cancel(draftKey(entry));
    const resumeRefresh = pauseRefresh?.();
    try {
      const result = await importAPI('ignoreFile', { repositoryId: entry.repositoryId, taskId: entry.task.id, expectedHead: entry.task.head, changeKey: entry.task.changeKey!, path: file.path, operationId: crypto.randomUUID() });
      update(index, latest => ({ task: { ...latest.task, files: result.files, changeKey: result.changeKey }, changeKey: result.changeKey,
        paths: result.files.filter(item => latest.paths.includes(item.path) || item.path === '.gitignore' || item.path === file.path || item.path === file.previousPath).map(item => item.path), generated: false,
        draft: { summary: latest.edited.summary ? latest.draft.summary : '', description: latest.edited.description ? latest.draft.description : '' }, commitOperation: crypto.randomUUID(),
      }));
      setIgnoreNotice(result.stoppedTracking ? `已忽略 ${file.path}，本地文件已保留。请提交 .gitignore 和停止跟踪的更改；清单中的“删除”只表示从版本控制移除。` : `已忽略 ${file.path}，本地文件已保留。请提交 .gitignore 更改。`);
    } catch (problem) { setError(`${entry.repositoryName} · ${entry.task.branch}：${problem instanceof Error ? problem.message : '忽略未完成，请重新读取提交清单。'}`); }
    finally { resumeRefresh?.(); running.current = false; setBusy(false); setPhase(null); }
  }
  async function confirm() {
    if (!ready || running.current) return;
    running.current = true;
    for (const entry of current.current) store.cancel(draftKey(entry));
    setBusy(true); setError('');
    let activeTarget = '';
    let pushBatch: ReturnType<typeof pushActivity.begin> | undefined;
    const resumeRefresh = pauseRefresh?.();
    try {
      for (let index = 0; index < current.current.length; index++) {
        let entry = current.current[index];
        if (mode !== 'push' && !entry.paths.length) continue;
        activeTarget = `${entry.repositoryName} · ${entry.task.branch}`;
        setActiveTarget(activeTarget);
        if (mode !== 'push' && !entry.committed) {
          setPhase('commit');
          const committed = await onCommit({ repositoryId: entry.repositoryId, taskId: entry.task.id, expectedHead: entry.task.head, changeKey: entry.task.changeKey!, paths: entry.paths, operationId: entry.commitOperation, ...entry.draft });
          update(index, { committed }); entry = current.current[index];
          onCommitted?.(entry, committed);
          if (committed.warning) throw new Error(committed.warning);
        }
        if (mode !== 'commit' && !entry.pushed) {
          setPhase('push');
          pushBatch ||= pushActivity.begin(current.current.filter(target => !target.pushed && (mode === 'push' || target.paths.length > 0)));
          const commitId = entry.committed?.commitId || entry.commitId || entry.task.head;
          const result = await onPush({ repositoryId: entry.repositoryId, taskId: entry.task.id, expectedHead: entry.committed?.commitId || entry.task.head, commitId, operationId: entry.pushOperation });
          pushActivity.complete(pushBatch, entry);
          update(index, { pushed: true });
          if (result.warning) throw new Error(result.warning);
        }
      }
      if (mode === 'commit') onComplete?.(`已创建 ${included.length} 个本地提交。`);
      running.current = false; setFinished(true); (onFinished || onClose)();
    } catch (problem) { setError(`${activeTarget}：${problem instanceof Error ? problem.message : '操作未完成。'}`); }
    finally { resumeRefresh?.(); if (pushBatch) pushActivity.finish(pushBatch); running.current = false; setBusy(false); setPhase(null); setActiveTarget(''); }
  }
  const pushOnly = mode === 'push' || mode === 'submit' && included.length > 0 && included.every(entry => entry.committed);
  return <Modal title={mode === 'commit' ? 'Commit' : mode === 'push' ? 'Push' : 'Submit'} onClose={close} visible={visible} onCollapse={onCollapse}>
    <div className="repository-action-dialog">
      <p className="repository-submit-count">{included.length} 个工作目录{mode !== 'push' && ` · 已选 ${entries.reduce((count, entry) => count + entry.paths.length, 0)} / ${entries.reduce((count, entry) => count + entry.task.files.length, 0)} 个更改`}</p>
      {generating && <p className="repository-submit-generating" role="status"><Icon name="spinner" className="spin" size={16} />正在生成提交说明…</p>}
      <div className="repository-submit-content">
        {entries.map((entry, index) => <section key={`${entry.repositoryId}:${entry.task.id}`} aria-label={`${entry.repositoryName} · ${entry.task.branch}`}>
          <h3><Icon name="branch" size={15} /><span>{entry.repositoryName} · {entry.task.branch}</span></h3>
          {mode !== 'push' && <div className="repository-batch-draft">
            <OutlinedTextField label="Summary" aria-label={`Summary：${entry.repositoryName} / ${entry.task.branch}`} value={entry.draft.summary} onChange={event => edit(index, 'summary', event.target.value)} maxLength={500} required disabled={busy || !!entry.committed} />
            <OutlinedTextField type="textarea" label="Description（选填）" aria-label={`Description：${entry.repositoryName} / ${entry.task.branch}`} value={entry.draft.description} onChange={event => edit(index, 'description', event.target.value)} maxLength={20_000} rows={2} disabled={busy || !!entry.committed} />
          </div>}
          {mode === 'push' ? <code className="repository-submit-sha">{(entry.commitId || entry.task.head).slice(0, 12)}</code> : <RepositoryCommitFiles files={entry.task.files} paths={entry.paths} branch={entry.task.branch} disabled={busy || !!entry.committed} onChange={paths => {
            setError('');
            update(index, latest => ({ paths, generated: false, draft: {
              summary: latest.edited.summary ? latest.draft.summary : '',
              description: latest.edited.description ? latest.draft.description : '',
            }, commitOperation: crypto.randomUUID() }));
          }} onIgnore={file => { void ignore(index, file); }} />}
          {entry.committed && <p className="repository-submit-result" role="status">已 Commit · {entry.committed.commitId.slice(0, 8)}{entry.pushed ? ' · 已 Push' : mode === 'submit' ? ' · 待 Push' : ''}</p>}
          {mode === 'push' && entry.pushed && <p className="repository-submit-result" role="status">已 Push</p>}
        </section>)}
      </div>
      {!entries.length && <p>当前范围内没有可执行的更改。</p>}
      {error && <Notice kind="error">{error}</Notice>}
      {ignoreNotice && <Notice kind="info">{ignoreNotice}</Notice>}
      {busy && phase === 'push' && <PushProgress completed={entries.filter(entry => entry.pushed).length} total={included.length} />}
      <div className="modal-actions">{finished ? <Button type="button" variant="primary" onClick={close}>完成</Button> : <><Button type="button" disabled={busy} onClick={close}>关闭</Button>{mode !== 'push' && <Button type="button" disabled={busy || !included.some(entry => !entry.committed)} aria-busy={generating} onClick={() => { if (generating) { for (const entry of entries) store.cancel(draftKey(entry)); } else void generate(); }} leadingIcon={<Icon name={generating ? 'close' : 'sparkle'} size={14} />}>{generating ? '停止生成' : 'AI 生成说明'}</Button>}<Button type="button" variant="primary" disabled={!ready} aria-busy={busy} onClick={() => void confirm()}>{busy ? <><Icon name="spinner" className="spin" size={14} />正在{phase === 'push' ? '推送' : phase === 'ignore' ? '忽略' : '提交'}…</> : pushOnly ? 'Push' : mode === 'commit' ? 'Commit' : '提交'}</Button></>}</div>
    </div>
  </Modal>;
}
