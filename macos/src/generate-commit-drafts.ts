import type { CommitDraft, GenerateCommitMessage } from './local-submit-model';
import type { RepositoryActionTarget } from './repository-action-model';

type CommitDraftEntry = RepositoryActionTarget & { paths: string[]; complete?: boolean };

export function canGenerateCommitDraft(entry: CommitDraftEntry): boolean {
  return !entry.complete && entry.paths.length > 0 &&
    (!entry.draft?.summary.trim() || !entry.draft.description.trim());
}

export async function generateCommitDrafts(
  entries: readonly CommitDraftEntry[],
  generate: GenerateCommitMessage,
  signal: AbortSignal,
  onStart: (index: number) => void,
  onDraft: (index: number, draft: CommitDraft) => void,
): Promise<void> {
  for (let index = 0; index < entries.length; index++) {
    if (signal.aborted) return;
    const entry = entries[index];
    if (!canGenerateCommitDraft(entry)) continue;
    onStart(index);
    if (signal.aborted) return;
    const draft = await generate({ repositoryId: entry.repositoryId, taskId: entry.task.id, expectedHead: entry.task.head, changeKey: entry.task.changeKey!, paths: entry.paths }, signal);
    if (signal.aborted) return;
    onDraft(index, {
      summary: entry.draft?.summary.trim() ? entry.draft.summary : draft.summary,
      description: entry.draft?.description.trim() ? entry.draft.description : draft.description,
    });
  }
}
