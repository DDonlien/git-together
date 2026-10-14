export type FileEntry = { name: string; path: string; directory: boolean; link: boolean; ignored: boolean; hidden: boolean; size: number; modified: number };
export type FileDirectory = { path: string; entries: FileEntry[] };
export type FileOperation = 'copy' | 'move' | 'delete';
export type FileOperationInput = { repositoryId: string; taskId: string; operation: FileOperation; paths?: string[]; sourceTaskId?: string; dropId?: string; destination: string; name?: string };
export type FileOperationPlan = { planId: string; operation: FileOperation; items: { source: string; target: string | null }[] };
export type FileOperationResult = { completed: number; total: number; error: string };
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function isFileDirectory(value: unknown): value is FileDirectory {
  return record(value) && typeof value.path === 'string' && Array.isArray(value.entries) && value.entries.every(entry => record(entry) && ['name', 'path'].every(key => typeof entry[key] === 'string') && ['directory', 'link', 'ignored', 'hidden'].every(key => typeof entry[key] === 'boolean') && ['size', 'modified'].every(key => typeof entry[key] === 'number' && Number.isFinite(entry[key]) && (entry[key] as number) >= 0));
}
export function isFileOperationPlan(value: unknown): value is FileOperationPlan {
  return record(value) && typeof value.planId === 'string' && ['copy', 'move', 'delete'].includes(String(value.operation)) && Array.isArray(value.items) && value.items.length > 0 && value.items.every(item => record(item) && typeof item.source === 'string' && (item.target === null || typeof item.target === 'string'));
}
export function isFileOperationResult(value: unknown): value is FileOperationResult {
  return record(value) && typeof value.error === 'string' && typeof value.completed === 'number' && Number.isSafeInteger(value.completed) && typeof value.total === 'number' && Number.isSafeInteger(value.total) && value.completed >= 0 && value.total > 0 && value.completed <= value.total;
}
