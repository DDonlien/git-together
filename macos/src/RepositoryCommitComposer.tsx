import { useEffect, useRef, useState } from 'react';
import { Button, Icon, IconButton, Notice } from './ui';
import { OutlinedTextField } from './material-inputs';
import { RepositoryActionDialog } from './RepositoryActionDialog';
import type { RepositoryTask } from './repository-model';
import type { GenerateCommitMessage, LocalSubmitInput, PushLocalCommit, SubmitLocalCommit } from './local-submit-model';

export function RepositoryCommitComposer({ repositoryId, repositoryName = '', task, onSubmit, onGenerate, onPush, onCommitted, hidden = false }: {
  repositoryId?: string; task: RepositoryTask; onSubmit?: SubmitLocalCommit; onGenerate?: GenerateCommitMessage;
  repositoryName?: string; onPush?: PushLocalCommit; onCommitted?: (taskId: string, commitId: string) => void;
  hidden?: boolean;
}) {
  const [summary, setSummary] = useState(''), [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false), [generating, setGenerating] = useState(false);
  const [error, setError] = useState(''), [feedback, setFeedback] = useState('');
  const [submitPopup, setSubmitPopup] = useState(false);
  const running = useRef(false), generation = useRef<AbortController | null>(null);
  const intent = useRef<LocalSubmitInput | null>(null);
  useEffect(() => () => generation.current?.abort(), []);
  const ready = !!repositoryId && !!task.path && !!task.changeKey && !!task.files.length && !task.error;
  const disabled = !task.path || submitting;
  const edit = () => { intent.current = null; generation.current?.abort(); setGenerating(false); setFeedback(''); setError(''); };
  // A failed, definitely outdated snapshot can be reviewed and submitted anew;
  // network retries of the same snapshot retain their idempotency identity.
  if (intent.current && (intent.current.expectedHead !== task.head || intent.current.changeKey !== task.changeKey)) intent.current = null;
  async function submit() {
    if (!ready || !onSubmit || !summary.trim() || running.current || generating || submitPopup) return;
    running.current = true; generation.current?.abort(); setGenerating(false); setSubmitting(true); setError(''); setFeedback('');
    const input = intent.current || { repositoryId: repositoryId!, taskId: task.id, expectedHead: task.head, changeKey: task.changeKey!, summary, description, operationId: crypto.randomUUID() };
    intent.current = input;
    try {
      const result = await onSubmit(input);
      setSummary(''); setDescription(''); intent.current = null;
      setFeedback(`已提交到 ${result.branch} · ${result.commitId.slice(0, 8)}`);
      if (result.warning) setError(result.warning);
      onCommitted?.(task.id, result.commitId);
    } catch (problem) { setError(problem instanceof Error ? problem.message : '提交未完成，请检查本地历史后重试。'); }
    finally { running.current = false; setSubmitting(false); }
  }
  async function generate() {
    if (generation.current && generating) { generation.current.abort(); setGenerating(false); return; }
    if (!ready || !onGenerate || running.current) return;
    const controller = new AbortController(); generation.current = controller;
    setGenerating(true); setError(''); setFeedback('');
    try {
      const draft = await onGenerate({ repositoryId: repositoryId!, taskId: task.id, expectedHead: task.head, changeKey: task.changeKey! }, controller.signal);
      if (controller.signal.aborted || generation.current !== controller) return;
      intent.current = null; setSummary(draft.summary); setDescription(draft.description); setFeedback('AI 说明已生成，可编辑后提交');
    } catch (problem) { if (!controller.signal.aborted) setError(problem instanceof Error ? problem.message : 'AI 生成未完成。'); }
    finally { if (generation.current === controller) { generation.current = null; setGenerating(false); } }
  }
  return <><form className="repository-commit-composer" hidden={hidden} aria-label={`提交说明：${task.branch}`} onSubmit={event => { event.preventDefault(); void submit(); }} onKeyDown={event => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); void submit(); }
  }}>
    <div className="repository-commit-fields">
      <p className="repository-commit-target">提交说明：{task.branch}</p>
      <OutlinedTextField label="Summary" aria-label={`Summary：${task.branch}`} placeholder="填写提交摘要…" value={summary} onChange={event => { edit(); setSummary(event.target.value); }} maxLength={500} required disabled={disabled} />
      <OutlinedTextField type="textarea" label="Description（选填）" aria-label={`Description：${task.branch}`} placeholder="填写提交说明…" value={description} onChange={event => { edit(); setDescription(event.target.value); }} maxLength={20_000} rows={2} disabled={disabled} />
      {error && <Notice kind="error">{error}</Notice>}
      {feedback && <p className="repository-commit-feedback" role="status">{feedback}</p>}
    </div>
    <div className="repository-commit-actions"><small>{task.path ? `全部 ${task.files.length} 个更改` : '关联本地目录后提交'}</small><div className="repository-commit-buttons">
      <IconButton type="button" icon={generating ? 'close' : 'sparkle'} label={generating ? '取消 AI 生成' : 'AI 生成提交说明'} title={generating ? '取消 AI 生成' : 'AI 生成提交说明'} className="repository-ai-commit" disabled={!ready || submitting || submitPopup || !onGenerate} aria-busy={generating} onClick={() => void generate()} />
      <Button type="submit" disabled={!ready || !onSubmit || !summary.trim() || submitting || generating || submitPopup} aria-busy={submitting}>{submitting && <Icon name="spinner" className="spin" size={14} />}{submitting ? '提交中…' : 'Commit'}</Button>
      <Button type="button" variant="primary" disabled={!ready || !onSubmit || !onGenerate || !onPush || submitting || generating || submitPopup} onClick={() => setSubmitPopup(true)}><Icon name="upload" size={14} />Submit</Button>
    </div></div>
  </form>
  {hidden && error && <Notice kind="error">{error}</Notice>}
  {hidden && feedback && <p className="repository-commit-feedback" role="status">{feedback}</p>}
  {submitPopup && repositoryId && onSubmit && onGenerate && onPush && <RepositoryActionDialog mode="submit" targets={[{ repositoryId, repositoryName, task }]} onCommit={onSubmit} onGenerate={onGenerate} onPush={onPush} onCommitted={(_target, result) => { setSummary(''); setDescription(''); setError(result.warning || ''); intent.current = null; onCommitted?.(task.id, result.commitId); }} onComplete={setFeedback} onClose={() => setSubmitPopup(false)} />}
  </>;
}
