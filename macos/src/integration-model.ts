import { isRecord, type LocalFile } from './import-model';
import type { GraphSnapshot } from './graph-operation-model';
import type { CommitDraft } from './local-submit-model';

export type IntegrationMode = 'rebase' | 'remote-merge';
export type RemoteBranch = { name: string; head: string };
export type Branches = { branches: RemoteBranch[]; limited: boolean; remote: string; pushRemote: string | null; pushError: string | null };
export type RemoteCommit = { id: string; summary: string };
export type CommitPage = { branch: string; head: string; localHead: string; page: number; commits: RemoteCommit[]; hasMore: boolean; bases: string[]; ahead: number; behind: number };
export type IntegrationInput = GraphSnapshot & { mode: IntegrationMode; remoteBranch: string; remoteHead: string; targetCommit: string; generationId: string };
export type IntegrationPlan = CommitDraft & { id: string; repositoryId: string; taskId: string; mode: IntegrationMode; path: string; branch: string; head: string; remote: string; pushRemote: string | null; remoteBranch: string; remoteHead: string; targetCommit: string; base: string; replay: RemoteCommit[]; resultHead: string; files: LocalFile[]; patch: string; resolvedConflicts: string[]; unchanged: boolean };
export type IntegrationResult = { status: 'unchanged' | 'restored' | 'rebased' | 'partial' | 'pushed' | 'created-not-pushed' | 'unknown'; taskId: string; head: string; branch: string; warning?: string; recoveryRef?: string; commitId?: string; remoteHead?: string; remoteBranch?: string; targetCommit?: string };
const sha = (v: unknown) => typeof v === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(v);
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const commit = (v: unknown): v is RemoteCommit => isRecord(v) && sha(v.id) && typeof v.summary === 'string';
export function isBranches(v: unknown): v is Branches {
  return isRecord(v) && typeof v.remote === 'string' && !!v.remote && (v.pushRemote === null || typeof v.pushRemote === 'string') && (v.pushError === null || typeof v.pushError === 'string') && typeof v.limited === 'boolean' && Array.isArray(v.branches) && v.branches.length <= 500 && v.branches.every(b => isRecord(b) && typeof b.name === 'string' && !!b.name && sha(b.head));
}
export function isCommitPage(v: unknown): v is CommitPage {
  return isRecord(v) && typeof v.branch === 'string' && sha(v.head) && sha(v.localHead) && count(v.page) && v.page < 10 && count(v.ahead) && count(v.behind) && Array.isArray(v.bases) && v.bases.every(sha) && Array.isArray(v.commits) && v.commits.length <= 100 && v.commits.every(commit) && typeof v.hasMore === 'boolean';
}
export function isIntegrationPlan(v: unknown): v is IntegrationPlan {
  return isRecord(v) && ['id','repositoryId','taskId','path','branch','remote','remoteBranch','summary','description','patch'].every(key => typeof v[key] === 'string') && (v.mode === 'rebase' || v.mode === 'remote-merge') && (v.pushRemote === null || typeof v.pushRemote === 'string') && ['head','remoteHead','targetCommit','base','resultHead'].every(key => sha(v[key])) && Array.isArray(v.replay) && v.replay.length <= 500 && v.replay.every(commit) && Array.isArray(v.files) && v.files.every(f => isRecord(f) && typeof f.path === 'string' && typeof f.status === 'string' && typeof f.tracked === 'boolean') && Array.isArray(v.resolvedConflicts) && v.resolvedConflicts.every(path => typeof path === 'string') && typeof v.unchanged === 'boolean';
}
export function isIntegrationResult(v: unknown): v is IntegrationResult {
  return isRecord(v) && ['unchanged','restored','rebased','partial','pushed','created-not-pushed','unknown'].includes(String(v.status)) && typeof v.taskId === 'string' && typeof v.branch === 'string' && sha(v.head) && ['warning','recoveryRef','remoteBranch'].every(key => v[key] === undefined || typeof v[key] === 'string') && ['commitId','remoteHead','targetCommit'].every(key => v[key] === undefined || sha(v[key]));
}
