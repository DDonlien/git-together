import type { LocalFile, LocalSnapshot } from './import-model';

export type RepositoryCommit = LocalSnapshot['commits'][number] & { parents: string[]; refs: string[] };
export type RepositoryTask = { id: string; branch: string; head: string; path: string | null; files: LocalFile[]; tree: string[]; error: string; remote?: boolean; treeComplete?: boolean };
export type RepositoryWorkspace = { tasks: RepositoryTask[]; commits: RepositoryCommit[]; complete: boolean; source?: 'local' | 'remote' | 'mixed' };

export function isLocalWorkspace(value: unknown): value is RepositoryWorkspace {
  if (!value || typeof value !== 'object') return false;
  const w = value as Record<string, unknown>;
  const strings = (v: unknown) => Array.isArray(v) && v.every(item => typeof item === 'string');
  const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  return w.source === 'local' && typeof w.complete === 'boolean' && Array.isArray(w.tasks) && w.tasks.length <= 64 && w.tasks.every(task => record(task) &&
    ['id', 'branch', 'head', 'error', 'path'].every(key => typeof task[key] === 'string') && task.remote !== true && strings(task.tree) && Array.isArray(task.files) && task.files.every(file => record(file) && typeof file.path === 'string' && typeof file.status === 'string' && typeof file.tracked === 'boolean')) &&
    Array.isArray(w.commits) && w.commits.every(commit => record(commit) && ['id', 'summary', 'author', 'time'].every(key => typeof commit[key] === 'string') && strings(commit.parents) && strings(commit.refs));
}

export function topologicalCommits(commits: RepositoryCommit[]): RepositoryCommit[] {
  const byId = new Map(commits.map(commit => [commit.id, commit]));
  const children = new Map(commits.map(commit => [commit.id, 0]));
  for (const commit of commits) for (const parent of commit.parents) if (children.has(parent)) children.set(parent, children.get(parent)! + 1);
  const ready = commits.filter(commit => children.get(commit.id) === 0);
  const result: RepositoryCommit[] = [];
  while (ready.length) {
    ready.sort((a, b) => Date.parse(b.time) - Date.parse(a.time) || a.id.localeCompare(b.id));
    const next = ready.shift()!; result.push(next);
    for (const parent of next.parents) if (children.has(parent)) { const count = children.get(parent)! - 1; children.set(parent, count); if (!count) ready.push(byId.get(parent)!); }
  }
  if (result.length !== commits.length) throw new Error('提交关系不合法。');
  return result;
}

export function reachableCommitIds(history: RepositoryCommit[], heads: string[]): Set<string> {
  const commits = new Map(history.map(commit => [commit.id, commit]));
  const reachable = new Set<string>();
  const pending = [...heads];
  while (pending.length) {
    const id = pending.pop()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    const commit = commits.get(id);
    if (commit) pending.push(...commit.parents);
  }
  return reachable;
}

export function taskCommitHistory(workspace: RepositoryWorkspace, taskId: string | null): RepositoryCommit[] {
  const task = workspace.tasks.find(task => task.id === taskId);
  if (!task || (!workspace.complete && !workspace.source && !task.remote)) return workspace.commits;
  const reachable = reachableCommitIds(workspace.commits, [task.head]);
  return workspace.commits.filter(commit => reachable.has(commit.id));
}

export function repositoryCommitTask(workspace: RepositoryWorkspace, commitId: string, focusedTask: string | null): RepositoryTask | undefined {
  const candidates = workspace.tasks.filter(task => taskCommitHistory(workspace, task.id).some(commit => commit.id === commitId));
  return candidates.find(task => task.id === focusedTask) || candidates.find(task => task.remote && task.head === commitId) || candidates.find(task => task.remote) || candidates.find(task => task.head === commitId) || candidates[0];
}

export function combineRepositoryWorkspaces(remote: RepositoryWorkspace, local?: RepositoryWorkspace): RepositoryWorkspace {
  if (!local) return remote;
  const commits = new Map(remote.commits.map(commit => [commit.id, commit]));
  for (const commit of local.commits) {
    const previous = commits.get(commit.id);
    commits.set(commit.id, previous ? { ...previous, refs: [...new Set([...previous.refs, ...commit.refs])] } : commit);
  }
  return { source: 'mixed', tasks: [...remote.tasks, ...local.tasks], commits: topologicalCommits([...commits.values()]), complete: remote.complete && local.complete };
}

// Keep the existing preview session until its service can be updated. Missing
// branch/tree/ancestry data must not be fabricated from the old snapshot.
export function snapshotWorkspace(snapshot: LocalSnapshot): RepositoryWorkspace {
  return {
    complete: false,
    tasks: [{ id: `worktree:${snapshot.branch}:${snapshot.path}`, branch: snapshot.branch, head: snapshot.commits[0]?.id || '', path: snapshot.path, files: snapshot.files, tree: snapshot.files.map(file => file.path), error: '' }],
    commits: snapshot.commits.map(commit => ({ ...commit, parents: [], refs: [] })),
  };
}

export type FileTreeNode = { name: string; path: string; children: FileTreeNode[]; directory: boolean };
export function buildFileTree(paths: string[]): FileTreeNode[] {
  const root: FileTreeNode = { name: '', path: '', children: [], directory: true };
  for (const path of new Set(paths)) {
    const parts = path.split('/');
    let parent = root;
    parts.forEach((name, index) => {
      const fullPath = parts.slice(0, index + 1).join('/');
      let node = parent.children.find(child => child.path === fullPath);
      if (!node) { node = { name, path: fullPath, children: [], directory: index < parts.length - 1 }; parent.children.push(node); }
      parent = node;
    });
  }
  const sort = (nodes: FileTreeNode[]) => {
    nodes.sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name));
    nodes.forEach(node => sort(node.children));
  };
  sort(root.children);
  return root.children;
}
