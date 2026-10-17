import { isRecord, type Catalog, type LocalFile } from './import-model';
import type { CommitDraft } from './local-submit-model';
import type { RepositoryTask } from './repository-model';

export const graphActionLabels = { compare: '比较差异', branch: '从此提交创建分支', tag: '创建标签', merge: '合并到目标分支', rebase: '将目标分支变基到此提交', 'cherry-pick': 'Cherry-pick', revert: 'Revert', reset: 'Reset 到此提交', abort: '中止当前 Git 操作', worktree: '创建并关联工作目录', 'ai-sync': '同步到最新' } as const;
export type GraphAction = keyof typeof graphActionLabels;
export type GraphSourceChoice = { name: string; kind: 'local' | 'remote'; taskId: string };
export type GraphSource = GraphSourceChoice & { head: string; included?: boolean };
export type GraphSnapshot = { repositoryId: string; taskId: string; expectedHead: string; changeKey: string };
export type GraphPreviewInput = GraphSnapshot & { commitId: string; action: GraphAction; mainline?: number };
export type GraphPreview = { head: string; commitId: string; files: LocalFile[]; patch: string; localChanges: LocalFile[] };
export type GraphMergePlan = CommitDraft & { id: string; repositoryId: string; taskId: string; head: string; branch: string; path: string; sources: GraphSource[]; files: LocalFile[]; patch: string; localChanges: LocalFile[]; resolvedConflicts: string[]; unchanged: boolean };
export type GraphWriteInput = GraphPreviewInput & { operationId: string; name?: string; resetMode?: 'soft' | 'mixed' | 'hard'; parentPath?: string; folderName?: string };
export type GraphMergeInput = { repositoryId: string; taskId: string; planId: string; operationId: string } & CommitDraft;
export type GraphWriteResult = { taskId: string; head: string; branch: string; unchanged: boolean; warning?: string; recoveryRef?: string; worktreePath?: string; catalog?: Catalog };
export type GraphWrite = ((method: 'applyGraphMerge', input: GraphMergeInput) => Promise<GraphWriteResult>) & ((method: 'executeGraph' | 'createGraphWorktree', input: GraphWriteInput) => Promise<GraphWriteResult>);
export const graphSourceKey = (source: GraphSourceChoice) => JSON.stringify([source.kind, source.taskId, source.name]);
export const graphOperationScope = (repositoryId: string, action: GraphAction, taskId: string, commitId?: string) => JSON.stringify([repositoryId, 'graph', action, taskId, action === 'ai-sync' || action === 'abort' ? null : commitId || null]);
export const graphSnapshot = (repositoryId: string, task: RepositoryTask): GraphSnapshot => ({ repositoryId, taskId: task.id, expectedHead: task.head, changeKey: task.changeKey || '' });
const sha = (value: unknown) => typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
const files = (value: unknown): value is LocalFile[] => Array.isArray(value) && value.every(file => isRecord(file) && typeof file.path === 'string' && typeof file.status === 'string' && typeof file.tracked === 'boolean');
export function isGraphSource(value: unknown): value is GraphSource {
  return isRecord(value) && typeof value.name === 'string' && !!value.name && (value.kind === 'local' || value.kind === 'remote') && typeof value.taskId === 'string' && sha(value.head) && (value.included === undefined || typeof value.included === 'boolean');
}
export function isGraphPreview(value: unknown): value is GraphPreview {
  return isRecord(value) && sha(value.head) && sha(value.commitId) && files(value.files) && files(value.localChanges) && typeof value.patch === 'string';
}
export function isGraphMergePlan(value: unknown): value is GraphMergePlan {
  return isRecord(value) && ['id', 'repositoryId', 'taskId', 'branch', 'path', 'summary', 'description', 'patch'].every(key => typeof value[key] === 'string') && sha(value.head) && files(value.files) && files(value.localChanges) && Array.isArray(value.sources) && value.sources.every(isGraphSource) && Array.isArray(value.resolvedConflicts) && value.resolvedConflicts.every(path => typeof path === 'string') && typeof value.unchanged === 'boolean';
}
export function isGraphWriteResult(value: unknown): value is GraphWriteResult {
  return isRecord(value) && typeof value.taskId === 'string' && typeof value.branch === 'string' && sha(value.head) && typeof value.unchanged === 'boolean' && ['warning', 'recoveryRef', 'worktreePath'].every(key => value[key] === undefined || typeof value[key] === 'string');
}
export function rememberedSources(key: string): GraphSourceChoice[] | null {
  const saved = localStorage.getItem(key);
  if (saved === null) return null;
  const value: unknown = JSON.parse(saved);
  if (!Array.isArray(value) || value.length > 64 || !value.every(source => isRecord(source) && typeof source.name === 'string' && (source.kind === 'local' || source.kind === 'remote') && typeof source.taskId === 'string')) throw new Error('保存的来源分支无效，请重新选择。');
  return value as GraphSourceChoice[];
}
