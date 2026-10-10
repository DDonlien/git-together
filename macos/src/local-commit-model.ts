import type { RepositoryCommit, RepositoryTask } from './repository-model';
import { isRepositoryCommit } from './remote-repository-model';
import { isRecord } from './import-model';

export type LocalCommitFile = { path: string; status: string; previousPath?: string };
export type LocalCommitDetails = { commit: RepositoryCommit & { description: string }; files: LocalCommitFile[] };
export type LocalCommitState = { id: string; details: LocalCommitDetails | null; error: string };
export type ReadLocalCommit = (task: RepositoryTask, commitId: string, signal: AbortSignal) => Promise<LocalCommitDetails>;

export function isLocalCommitDetails(value: unknown): value is LocalCommitDetails {
  return isRecord(value) && isRecord(value.commit) && typeof value.commit.description === 'string' && isRepositoryCommit(value.commit) &&
    Array.isArray(value.files) && value.files.every(file => isRecord(file) && typeof file.path === 'string' && typeof file.status === 'string' &&
      (file.previousPath === undefined || typeof file.previousPath === 'string'));
}
