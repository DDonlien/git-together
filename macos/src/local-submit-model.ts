import { isRecord, type ApiInputs } from './import-model';

export type CommitDraft = { summary: string; description: string };
export type CommitGroup = CommitDraft & { paths: string[] };
export type CommitPlan = { groups: CommitGroup[] };
export type LocalSubmitInput = CommitDraft & { repositoryId: string; taskId: string; expectedHead: string; changeKey: string; operationId: string; paths?: string[]; groups?: CommitGroup[] };
export type LocalSubmitResult = { taskId: string; commitId: string; branch: string; warning?: string; commits?: LocalSubmitResult[]; incomplete?: boolean };
export type SubmitLocalCommit = (input: LocalSubmitInput) => Promise<LocalSubmitResult>;
export type LocalPushInput = { repositoryId: string; taskId: string; expectedHead: string; commitId: string; operationId: string };
export type LocalPushResult = LocalSubmitResult & { pushed: true };
export type PushLocalCommit = (input: LocalPushInput) => Promise<LocalPushResult>;
export type GenerateCommitMessage = (input: Omit<ApiInputs['generateCommitMessage'], 'generationId'>, signal: AbortSignal) => Promise<CommitDraft>;
export type GenerateCommitPlan = (input: Omit<ApiInputs['generateCommitPlan'], 'generationId'>, signal: AbortSignal) => Promise<CommitPlan>;

export function commitMessage(draft: CommitDraft): string {
  return `${draft.summary.trim()}${draft.description.trim() ? `\n\n${draft.description.trim()}` : ''}\n`;
}
export function isCommitDraft(value: unknown): value is CommitDraft & Record<string, unknown> {
  return isRecord(value) && typeof value.summary === 'string' && !!value.summary.trim() && value.summary.length <= 500 &&
    !/[\r\n\0]/.test(value.summary) && typeof value.description === 'string' && value.description.length <= 20_000 && !value.description.includes('\0') &&
    new TextEncoder().encode(JSON.stringify({ summary: value.summary, description: value.description })).length <= 24_000;
}
export function isLocalSubmitResult(value: unknown): value is LocalSubmitResult {
  return isRecord(value) && typeof value.taskId === 'string' && typeof value.branch === 'string' &&
    typeof value.commitId === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value.commitId) &&
    (value.warning === undefined || typeof value.warning === 'string') &&
    (value.incomplete === undefined || typeof value.incomplete === 'boolean') &&
    (value.commits === undefined || Array.isArray(value.commits) && value.commits.length > 0 && value.commits.every(isLocalSubmitResult));
}
export function isCommitPlan(value: unknown, paths?: string[]): value is CommitPlan {
  if (!isRecord(value) || !Array.isArray(value.groups) || !value.groups.length) return false;
  const found = new Set<string>();
  for (const group of value.groups) {
    if (!isCommitDraft(group) || !Array.isArray(group.paths) || !group.paths.length) return false;
    for (const path of group.paths) {
      if (typeof path !== 'string' || !path || found.has(path)) return false;
      found.add(path);
    }
  }
  return !paths || found.size === paths.length && paths.every(path => found.has(path));
}
export function isLocalPushResult(value: unknown): value is LocalPushResult {
  return isRecord(value) && value.pushed === true && isLocalSubmitResult(value);
}
