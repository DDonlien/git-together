import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Icon, Modal, Notice } from './ui';
import { OutlinedTextField } from './material-inputs';
import { RepositoryCommitFiles } from './RepositoryCommitFiles';
import { canGenerateCommitDraft, generateCommitDrafts } from './generate-commit-drafts';
import { PushFeedbackProvider, PushProgress, usePushActivity } from './PushFeedback';
import type { LocalFile } from './import-model';
import type { CommitDraft, GenerateCommitMessage, LocalSubmitResult, PushLocalCommit, SubmitLocalCommit } from './local-submit-model';
import type { IgnoreRepositoryFile, RepositoryActionMode, RepositoryActionTarget, RepositoryOperationControls } from './repository-action-model';
import { commitPathsAfterIgnore } from './repository-action-model';
export type { RepositoryActionMode, RepositoryActionTarget } from './repository-action-model';

type Entry = RepositoryActionTarget & { draft: CommitDraft; paths: string[]; operationId: string; complete?: boolean; warning?: string };
const DraftsContext = createContext<Map<string, CommitDraft> | null>(null);
const draftKey = (target: RepositoryActionTarget) => JSON.stringify([target.repositoryId, target.task.branch, target.task.path]);
export function RepositoryActionDraftsProvider({ sessionId, children }: { sessionId: string; children: ReactNode }) {
  const drafts = useMemo(() => new Map<string, CommitDraft>(), [sessionId]);
  return <DraftsContext.Provider value={drafts}><PushFeedbackProvider sessionId={sessionId}>{children}</PushFeedbackProvider></DraftsContext.Provider>;
}

export function RepositoryActionDialog({ mode, targets, onCommit, onGenerate, onIgnore, onPush, onCommitted, onDraftChange, onComplete, onClose, visible = true, autoStart = false, onCollapse, onStateChange, onFinished, pauseRefresh }: {
  mode: Extract<RepositoryActionMode, 'commit' | 'push'>; targets: RepositoryActionTarget[]; onCommit: SubmitLocalCommit; onGenerate?: GenerateCommitMessage; onPush: PushLocalCommit;
  onCommitted?: (target: RepositoryActionTarget, result: LocalSubmitResult) => void;
  onDraftChange?: (target: RepositoryActionTarget, draft: CommitDraft) => void;
  onIgnore?: IgnoreRepositoryFile;
  onComplete?: (message: string, complete?: boolean) => void; onClose: () => void;
} & RepositoryOperationControls) {
  const saved = useContext(DraftsContext);
  const [entries, setEntries] = useState<Entry[]>(() => targets.filter(target => target.task.path && !target.task.error && (mode === 'push' ? !!target.task.head : !!target.task.files.length && !!target.task.changeKey)).map(target => ({ ...structuredClone(target), draft: target.draft || saved?.get(draftKey(target)) || { summary: '', description: '' }, paths: target.task.files.map(file => file.path), operationId: crypto.randomUUID() })));
  const [busy, setBusy] = useState(false), [generating, setGenerating] = useState<number | null>(null), [error, setError] = useState('');
  const [scopeNotice, setScopeNotice] = useState('');
  const running = useRef(false), autoStartAttempted = useRef(false), generation = useRef<AbortController | null>(null);
  const pushActivity = usePushActivity();
  useEffect(() => () => generation.current?.abort(), []);
  useEffect(() => { onStateChange?.(busy ? 'working' : generating !== null ? 'preparing' : error ? 'failed' : 'ready'); }, [busy, generating, error, onStateChange]);
  function update(index: number, change: Partial<Entry>) {
    setEntries(previous => previous.map((entry, item) => {
      if (item !== index) return entry;
      const next = { ...entry, ...change };
      if (change.draft) { saved?.set(draftKey(next), next.draft); onDraftChange?.(next, next.draft); }
      return next;
    }));
  }
  const generatable = entries.filter(canGenerateCommitDraft);
  async function generate() {
    if (generation.current) { generation.current.abort(); return; }
    if (busy || running.current || !onGenerate || !generatable.length) return;
    const controller = new AbortController(); generation.current = controller;
    setError('');
    const resume = pauseRefresh?.();
    try {
      await generateCommitDrafts(entries, onGenerate, controller.signal, setGenerating, (index, draft) => update(index, { draft }));
    } catch (problem) { if (!controller.signal.aborted) setError(problem instanceof Error ? problem.message : '提交说明生成失败。'); }
    finally { resume?.(); if (generation.current === controller) { generation.current = null; setGenerating(null); } }
  }
  async function ignore(index: number, file: LocalFile) {
    const entry = entries[index];
    if (mode !== 'commit' || !onIgnore || !entry || entry.complete || busy || running.current || generation.current) return;
    running.current = true; setBusy(true); setError(''); setScopeNotice('');
    const resume = pauseRefresh?.();
    try {
      const { task } = await onIgnore(entry, file);
      const paths = commitPathsAfterIgnore(entry.task.files, entry.paths, file, task.files);
      update(index, { task: structuredClone(task), paths, operationId: crypto.randomUUID() });
      setScopeNotice(file.tracked ? '已加入 .gitignore 并停止跟踪，本地文件保留；提交该删除后，仓库中将不再包含此文件。请检查提交说明。' : '已加入 .gitignore，本地文件保留。文件范围已变更，请检查提交说明。');
    } catch (problem) {
      setError(`${entry.repositoryName} · ${entry.task.branch} · ${file.path}：${problem instanceof Error ? problem.message : '忽略操作未完成，请重试。'}`);
    } finally { resume?.(); running.current = false; setBusy(false); }
  }
  const pending = entries.filter(entry => !entry.complete && (mode === 'push' || entry.paths.length));
  const ready = pending.length > 0 && !busy && generating === null && pending.every(entry => mode === 'push' || !!entry.draft.summary.trim());
  async function confirm() {
    if (!ready || running.current) return;
    running.current = true; setBusy(true); setError('');
    const resume = pauseRefresh?.(), batch = mode === 'push' ? pushActivity.begin(pending) : undefined;
    const pushWarnings = mode === 'push' ? entries.flatMap(entry => entry.complete && entry.warning ? [`${entry.repositoryName} · ${entry.task.branch}：${entry.warning}`] : []) : [];
    try {
      for (let index = 0; index < entries.length; index++) {
        const entry = entries[index]; if (entry.complete || mode === 'commit' && !entry.paths.length) continue;
        if (mode === 'commit') {
          const result = await onCommit({ repositoryId: entry.repositoryId, taskId: entry.task.id, expectedHead: entry.task.head, changeKey: entry.task.changeKey!, paths: entry.paths, operationId: entry.operationId, ...entry.draft });
          saved?.delete(draftKey(entry)); onCommitted?.(entry, result); update(index, { complete: true });
          if (result.warning) throw new Error(result.warning);
        } else {
          const result = await onPush({ repositoryId: entry.repositoryId, taskId: entry.task.id, expectedHead: entry.task.head, commitId: entry.commitId || entry.task.head, operationId: entry.operationId });
          if (batch) pushActivity.complete(batch, entry); update(index, { complete: true, warning: result.warning });
          if (result.warning) pushWarnings.push(`${entry.repositoryName} · ${entry.task.branch}：${result.warning}`);
        }
      }
      onComplete?.(mode === 'commit' ? `已完成 ${pending.length} 个工作目录的本地提交。` : `已完成 ${entries.length} 个工作目录的推送。${pushWarnings.length ? ` ${pushWarnings.join(' ')}` : ''}`, pushWarnings.length === 0);
      (onFinished || onClose)();
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Git 操作未完成，请检查当前仓库状态。'); }
    finally { resume?.(); if (batch) pushActivity.finish(batch); running.current = false; setBusy(false); }
  }
  useEffect(() => {
    if (!autoStart || mode !== 'push' || autoStartAttempted.current) return;
    autoStartAttempted.current = true;
    if (ready) void confirm();
  }, [autoStart, mode, ready]);
  return <Modal title={mode === 'commit' ? 'Commit' : 'Push'} visible={visible} onCollapse={onCollapse} onClose={busy ? onCollapse || (() => {}) : onClose}>
    <div className="repository-action-dialog"><p className="repository-submit-count">{entries.length} 个工作目录</p>{mode === 'push' && <p className="muted">远端有新提交时，将先尝试合并再推送；遇到冲突会停止并保留现场。选择历史提交时不会扩大推送范围。</p>}<div className="repository-submit-content">
      {entries.map((entry, index) => <section key={`${entry.repositoryId}:${entry.task.id}`}>
        <div className="repository-submit-heading"><h3><Icon name="branch" size={15} /><span title={`${entry.repositoryName} · ${entry.task.branch}`}>{entry.repositoryName} · {entry.task.branch}</span></h3></div>
        {mode === 'commit' ? <><div className="repository-batch-draft"><OutlinedTextField label="Summary" value={entry.draft.summary} required disabled={busy || generating !== null || !!entry.complete} onChange={event => update(index, { draft: { ...entry.draft, summary: event.target.value }, operationId: crypto.randomUUID() })} /><OutlinedTextField label="Description（选填）" type="textarea" value={entry.draft.description} rows={2} disabled={busy || generating !== null || !!entry.complete} onChange={event => update(index, { draft: { ...entry.draft, description: event.target.value }, operationId: crypto.randomUUID() })} /></div>
        <RepositoryCommitFiles files={entry.task.files} paths={entry.paths} branch={entry.task.branch} disabled={busy || generating !== null || !!entry.complete} onChange={paths => update(index, { paths, operationId: crypto.randomUUID() })} onIgnore={onIgnore ? file => { void ignore(index, file); } : undefined} />
        </> : <code>{(entry.commitId || entry.task.head).slice(0, 12)}</code>}
        {entry.complete && <Notice kind="success">{mode === 'commit' ? '已 Commit' : '已 Push'}</Notice>}
        {entry.complete && entry.warning && <Notice kind="warning">{entry.warning}</Notice>}
      </section>)}
    </div>{!entries.length && <Notice kind="info">当前范围没有可操作的工作目录。</Notice>}{error && <Notice kind="error">{error}</Notice>}{scopeNotice && <Notice kind="info" onClose={() => setScopeNotice('')}>{scopeNotice}</Notice>}{busy && mode === 'push' && <PushProgress completed={entries.filter(entry => entry.complete).length} total={entries.length} />}
    <div className="modal-actions">{mode === 'commit' && onGenerate && entries.some(entry => entry.aiAllowed) && <Button type="button" className="repository-batch-generate" title={generating !== null ? '取消 AI 生成' : `为 ${generatable.length} 个工作目录填写空白的提交说明`} disabled={busy || generating === null && !generatable.length} aria-busy={generating !== null} onClick={() => void generate()} leadingIcon={<Icon name={generating !== null ? 'close' : 'sparkle'} size={14} />}>{generating !== null ? '取消 AI 生成' : 'Codex 生成提交说明'}</Button>}<Button disabled={busy} onClick={onClose}>关闭</Button><Button variant="primary" disabled={!ready} aria-busy={busy} onClick={() => void confirm()}>{busy ? '正在执行…' : mode === 'commit' ? 'Commit' : 'Push'}</Button></div></div>
  </Modal>;
}
