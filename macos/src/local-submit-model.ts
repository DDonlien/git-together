import { isRecord, type ApiInputs } from './import-model';

export type CommitDraft = { summary: string; description: string };
export type LocalSubmitInput = CommitDraft & { repositoryId: string; taskId: string; expectedHead: string; changeKey: string; operationId: string };
export type LocalSubmitResult = { taskId: string; commitId: string; branch: string; warning?: string };
export type SubmitLocalCommit = (input: LocalSubmitInput) => Promise<LocalSubmitResult>;
export type LocalPushInput = { repositoryId: string; taskId: string; expectedHead: string; commitId: string; operationId: string };
export type LocalPushResult = LocalSubmitResult & { pushed: true };
export type PushLocalCommit = (input: LocalPushInput) => Promise<LocalPushResult>;
export type GenerateCommitMessage = (input: Omit<ApiInputs['generateCommitMessage'], 'generationId'>, signal: AbortSignal) => Promise<CommitDraft>;

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
    (value.warning === undefined || typeof value.warning === 'string');
}
export function isLocalPushResult(value: unknown): value is LocalPushResult {
  return isRecord(value) && value.pushed === true && isLocalSubmitResult(value);
}
