import { isRecord } from './import-model';

export type RepositorySyncMode = 'pull' | 'latest' | 'clean';
export type SyncFile = { path: string; action: 'add' | 'restore' | 'delete' };
export type RepositorySyncPlan = {
  id: string; repositoryId: string; taskId: string; mode: RepositorySyncMode;
  path: string; branch: string; head: string; remoteHead: string;
  files: SyncFile[]; historyCommits: number; protectedHistory: boolean; note: string;
};
export type RepositorySyncResult = {
  taskId: string; mode: RepositorySyncMode; head: string; files: number;
  reclaimedBytes: number; protectedHistory: boolean; warning?: string;
};
export type PrepareRepositorySync = (input: { repositoryId: string; taskId: string; mode: RepositorySyncMode }, signal?: AbortSignal) => Promise<RepositorySyncPlan>;
export type ApplyRepositorySync = (input: { repositoryId: string; taskId: string; planId: string; operationId: string }) => Promise<RepositorySyncResult>;
const sha = (v: unknown) => typeof v === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(v);
const nonnegative = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
export function isRepositorySyncPlan(v: unknown): v is RepositorySyncPlan {
  return isRecord(v) && ['id', 'repositoryId', 'taskId', 'path', 'branch', 'note'].every(k => typeof v[k] === 'string') &&
    ['pull', 'latest', 'clean'].includes(String(v.mode)) && sha(v.head) && sha(v.remoteHead) && nonnegative(v.historyCommits) &&
    typeof v.protectedHistory === 'boolean' && Array.isArray(v.files) && v.files.every(f => isRecord(f) && typeof f.path === 'string' && ['add', 'restore', 'delete'].includes(String(f.action)));
}
export function isRepositorySyncResult(v: unknown): v is RepositorySyncResult {
  return isRecord(v) && typeof v.taskId === 'string' && ['pull', 'latest', 'clean'].includes(String(v.mode)) && sha(v.head) && nonnegative(v.files) &&
    nonnegative(v.reclaimedBytes) && typeof v.protectedHistory === 'boolean' && (v.warning === undefined || typeof v.warning === 'string');
}
