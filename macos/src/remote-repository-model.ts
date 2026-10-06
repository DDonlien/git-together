import type { RepositoryCommit, RepositoryWorkspace } from './repository-model';
import { taskCommitHistory, topologicalCommits } from './repository-model';

export type RemoteCommitFile = { path: string; status: string; previousPath?: string; patch: string | null };
export type RemoteCommitDetails = { commit: RepositoryCommit; files: RemoteCommitFile[]; diff: string; tree: string[]; treeComplete: boolean; warnings: string[] };
export type RemoteFileContent = { text: string; binary: boolean; size: number };
export type RemoteRepositoryWorkspace = RepositoryWorkspace & { source: 'remote'; checkedAt: number; warnings: string[] };
export type RemoteRepositoryState = { workspace: RemoteRepositoryWorkspace | null; loading: boolean; error: string };
export type ReadRemoteCommit = (commitId: string, signal: AbortSignal) => Promise<RemoteCommitDetails>;

export function preserveRemoteWorkspace(previous: RemoteRepositoryWorkspace | null, next: RemoteRepositoryWorkspace): RemoteRepositoryWorkspace {
  if (!previous) return next;
  const stale = next.tasks.filter(task => task.error && previous.tasks.some(old => old.id === task.id && old.head));
  if (!stale.length) return next;
  const commits = new Map(next.commits.map(commit => [commit.id, commit]));
  const tasks = next.tasks.map(task => {
    if (!stale.includes(task)) return task;
    const old = previous.tasks.find(item => item.id === task.id)!;
    for (const commit of taskCommitHistory(previous, old.id)) if (!commits.has(commit.id)) {
      // Retained history must not put a moved branch's ref on its old HEAD.
      commits.set(commit.id, { ...commit, refs: commit.refs.filter(ref => next.tasks.some(current => current.head === commit.id && ref === `origin/${current.branch}`)) });
    }
    return { ...old, error: `${task.error} 显示上次读取的 ${old.head.slice(0, 8)}；本次远端 HEAD 为 ${task.head.slice(0, 8)}。` };
  });
  return { ...next, tasks, commits: topologicalCommits([...commits.values()]), complete: false };
}

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');
export function isRepositoryCommit(value: unknown): value is RepositoryCommit {
  return record(value) && ['id', 'summary', 'author', 'time'].every(key => typeof value[key] === 'string') && strings(value.parents) && strings(value.refs);
}
export function isRemoteWorkspace(value: unknown): value is RemoteRepositoryWorkspace {
  return record(value) && value.source === 'remote' && typeof value.checkedAt === 'number' && Number.isFinite(value.checkedAt) && typeof value.complete === 'boolean' && strings(value.warnings) &&
    Array.isArray(value.commits) && value.commits.every(isRepositoryCommit) && Array.isArray(value.tasks) && value.tasks.every(task => record(task) &&
      ['id', 'branch', 'head', 'error'].every(key => typeof task[key] === 'string') && task.path === null && task.remote === true && typeof task.treeComplete === 'boolean' && strings(task.tree) && Array.isArray(task.files) && task.files.length === 0);
}
export function isRemoteCommitDetails(value: unknown): value is RemoteCommitDetails {
  return record(value) && isRepositoryCommit(value.commit) && typeof value.diff === 'string' && strings(value.tree) && typeof value.treeComplete === 'boolean' && strings(value.warnings) && Array.isArray(value.files) && value.files.every(file => record(file) &&
    typeof file.path === 'string' && typeof file.status === 'string' && (file.previousPath === undefined || typeof file.previousPath === 'string') && (file.patch === null || typeof file.patch === 'string'));
}
export function isRemoteFileContent(value: unknown): value is RemoteFileContent {
  return record(value) && typeof value.text === 'string' && typeof value.binary === 'boolean' && typeof value.size === 'number' && Number.isSafeInteger(value.size) && value.size >= 0;
}
