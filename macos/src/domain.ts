export type Operation = 'Get Latest' | 'Submit' | 'Fetch' | 'Pull';
export type FileKind = 'text' | 'binary' | 'image';
export type ChangeFile = {
  id: string; name: string; path: string; kind: FileKind; tracked: boolean;
  selected: boolean; added: number; removed: number; size: string;
  change: 'modified' | 'added' | 'deleted';
};
export type Commit = {
  id: string; summary: string; description: string; author: string;
  time: string; branch: string; parents: string[]; files: ChangeFile[];
};
export type Draft = { summary: string; description: string };
export type Worktree = {
  id: string; label: string; branch: string; path: string;
  ahead: number; behind: number; agents: number; owner: string;
  conflict: boolean; presence: boolean; activity: number;
  files: ChangeFile[]; commits: Commit[]; draft: Draft; fetched: string;
};
export type Repository = {
  id: string; name: string; description: string; color: string;
  source: 'local' | 'online'; branches: string[]; worktrees: Worktree[];
};
export type Outcome = { phase: 'running' | 'success' | 'error' | 'cancelled'; message: string; action: Operation };
export type Preferences = { theme: 'light' | 'dark' | 'system'; reducedGlass: boolean; rowActions: boolean; failCommit: boolean; failBatch: boolean };
export type Workspace = { version: 1; repositories: Repository[]; preferences: Preferences; lastScene?: string };
export const defaultPreferences: Preferences = { theme: 'light', reducedGlass: false, rowActions: false, failCommit: false, failBatch: true };

export function worktreesOf(repositories: Repository[]): Worktree[] {
  return repositories.flatMap(r => r.worktrees);
}

export function resolveSelection(repositories: Repository[], selection: string[]): Worktree[] {
  const chosen = new Set(selection);
  return worktreesOf(repositories).filter(w => chosen.has(w.id));
}

export function toggleRepository(selection: string[], repository: Repository): string[] {
  const ids = repository.worktrees.map(w => w.id);
  const all = ids.every(id => selection.includes(id));
  return all ? selection.filter(id => !ids.includes(id)) : [...new Set([...selection, ...ids])];
}

export function updateWorktree(repositories: Repository[], id: string, update: (worktree: Worktree) => Worktree): Repository[] {
  return repositories.map(r => ({ ...r, worktrees: r.worktrees.map(w => w.id === id ? update(w) : w) }));
}

export function commitWorktree(worktree: Worktree, id: string, time: string): Worktree {
  if (worktree.conflict) throw new Error('工作目录存在冲突。请先解决冲突，再提交。');
  const chosen = worktree.files.filter(f => f.selected);
  if (!worktree.draft.summary.trim()) throw new Error('请填写提交概要。');
  if (!chosen.length) throw new Error('请至少选择一个文件。');
  const commit: Commit = {
    id, summary: worktree.draft.summary.trim(), description: worktree.draft.description,
    author: '你', time, branch: worktree.branch,
    parents: worktree.commits[0] ? [worktree.commits[0].id] : [], files: chosen,
  };
  return { ...worktree, ahead: worktree.ahead + 1,
    files: worktree.files.filter(f => !f.selected), commits: [commit, ...worktree.commits],
    draft: { summary: '', description: '' }, activity: 0 };
}

export function operationProblem(worktree: Worktree, action: Operation, failBatch: boolean): string | null {
  if (action === 'Fetch') return null;
  if (worktree.conflict) return '工作目录存在冲突。请先解决冲突，再重试。';
  if (action === 'Get Latest' || action === 'Pull') {
    if (worktree.files.length) return '工作目录包含未提交修改，已阻止更新。';
    if (worktree.ahead > 0 && worktree.behind > 0) return '本地与远端分叉，无法快进更新。';
  }
  if (action === 'Submit' && failBatch && worktree.id === 'lebab-main') return '本地提交已保留；演示远端连接失败，未推送。';
  return null;
}

export function applyOperation(worktree: Worktree, action: Operation, commitId: string, time: string): Worktree {
  if (action === 'Fetch') return { ...worktree, fetched: time };
  if (action === 'Pull' || action === 'Get Latest') return { ...worktree, behind: 0, fetched: time, activity: 0 };
  if (worktree.files.some(f => f.selected)) {
    const draft = worktree.draft.summary.trim() ? worktree.draft : generateDraft(worktree);
    return { ...commitWorktree({ ...worktree, draft }, commitId, time), ahead: 0 };
  }
  if (worktree.files.length) throw new Error('有未提交文件，请在仓库内选择文件后再 Submit。');
  return { ...worktree, ahead: 0, activity: 0 };
}

export function generateDraft(worktree: Worktree): Draft {
  const files = worktree.files.filter(f => f.selected);
  if (!files.length) throw new Error('请先选择需要提交的文件。');
  const hasController = files.some(f => /Controller|InputMapping/i.test(f.name));
  return {
    summary: hasController ? 'Improve controller input handling' : `Update ${files.length === 1 ? files[0].name : `${files.length} project files`}`,
    description: files.map(f => `${f.change === 'added' ? 'Add' : f.change === 'deleted' ? 'Remove' : 'Update'} ${f.path}${f.name}`).join('\n') + '\n\nGenerated locally from the selected demo changes.',
  };
}

export function relativeTime(minutes: number): string {
  if (minutes === 0) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时前`;
  return '昨天';
}

export function readWorkspace(raw: string | null, seed: () => Workspace): Workspace {
  if (!raw) return seed();
  const value: unknown = JSON.parse(raw);
  if (!isWorkspace(value)) {
    throw new Error('本地演示数据格式无效，请重置演示数据。');
  }
  return value as Workspace;
}

function isWorkspace(value: unknown): value is Workspace {
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
  const strings = (v: unknown) => Array.isArray(v) && v.every(s => typeof s === 'string');
  const fields = (v: Record<string, unknown>, keys: string[], type: 'string' | 'boolean' | 'number') => keys.every(k => typeof v[k] === type);
  const file = (v: unknown) => object(v) && fields(v, ['id', 'name', 'path', 'size'], 'string') && fields(v, ['tracked', 'selected'], 'boolean') && fields(v, ['added', 'removed'], 'number') && ['text', 'binary', 'image'].includes(String(v.kind)) && ['modified', 'added', 'deleted'].includes(String(v.change));
  const commit = (v: unknown) => object(v) && fields(v, ['id', 'summary', 'description', 'author', 'time', 'branch'], 'string') && strings(v.parents) && Array.isArray(v.files) && v.files.every(file);
  const tree = (v: unknown) => object(v) && fields(v, ['id', 'label', 'branch', 'path', 'owner', 'fetched'], 'string') && fields(v, ['ahead', 'behind', 'agents', 'activity'], 'number') && fields(v, ['conflict', 'presence'], 'boolean') && Array.isArray(v.files) && v.files.every(file) && Array.isArray(v.commits) && v.commits.every(commit) && object(v.draft) && fields(v.draft, ['summary', 'description'], 'string');
  const repository = (v: unknown) => object(v) && fields(v, ['id', 'name', 'description', 'color'], 'string') && ['local', 'online'].includes(String(v.source)) && strings(v.branches) && Array.isArray(v.worktrees) && v.worktrees.length > 0 && v.worktrees.every(tree);
  if (!object(value) || value.version !== 1 || !Array.isArray(value.repositories) || !value.repositories.length || !value.repositories.every(repository) || !object(value.preferences)) return false;
  return ['light', 'dark', 'system'].includes(String(value.preferences.theme)) && fields(value.preferences, ['reducedGlass', 'rowActions', 'failCommit', 'failBatch'], 'boolean');
}
