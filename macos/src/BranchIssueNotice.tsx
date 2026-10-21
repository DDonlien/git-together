import { useRef, useState } from 'react';
import type { BranchIssue } from './import-model';
import { IconButton, Notice } from './ui';

export type DismissBranchIssue = (issueId: string) => Promise<unknown>;

function useDismissIssue(issue: BranchIssue, onDismiss?: DismissBranchIssue) {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function dismiss() {
    if (!onDismiss || pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try { await onDismiss(issue.id); }
    catch (problem) { setError(problem instanceof Error ? problem.message : '清理未完成，请重试。'); }
    finally { pending.current = false; setBusy(false); }
  }
  return { busy, error, dismiss, disabled: busy || !onDismiss };
}

export function BranchIssueNotice({ issue, onDismiss }: { issue: BranchIssue; onDismiss?: DismissBranchIssue }) {
  const action = useDismissIssue(issue, onDismiss);
  return <Notice kind="error" onClose={() => void action.dismiss()} closeDisabled={action.disabled} closeLabel={`关闭并清理分支记录：${issue.branch}`}>
    {issue.kind === 'both-missing' && issue.paths.length ? `分支「${issue.branch}」的远端和本地目录均已不存在。` : `远端分支「${issue.branch}」已不存在。`}
    {' 关闭提示后清理关联记录，保留现有本地文件。'}
    {action.busy && ' 正在复核并清理…'}{action.error && <span className="branch-issue-error">{action.error} 已保留提示和关联。</span>}
  </Notice>;
}

export function LocalPathIssue({ issue, onDismiss }: { issue: BranchIssue; onDismiss?: DismissBranchIssue }) {
  const action = useDismissIssue(issue, onDismiss);
  return <span className="local-path-issue">
    <IconButton icon="warning" className="local-path-warning" label={`本地目录不存在，点击关闭并清理关联：${issue.branch}`} title={`${issue.paths.join('；')}：目录不存在。点击关闭提示并清理失效关联。`} disabled={action.disabled} aria-busy={action.busy} onClick={() => void action.dismiss()} />
    {action.error && <span className="branch-issue-error" role="alert">{action.error} 已保留关联。</span>}
  </span>;
}
