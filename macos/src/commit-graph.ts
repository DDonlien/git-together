import { reachableCommitIds, type RepositoryCommit, type RepositoryTask, type RepositoryWorkspace } from './repository-model';

export type GraphEdge = { from: number; to: number; node: boolean; color: number; boundary?: boolean; local?: boolean };
export type GraphCommit = RepositoryCommit & { workingTask?: RepositoryTask; localOnly?: boolean; unpublished?: boolean };
export type GraphBranch = { branch: string; localHeads: string[]; remoteHeads: string[]; tasks: RepositoryTask[] };
export type GraphRow = { commit: GraphCommit; lane: number; color: number; incoming: boolean; incomingLocal?: boolean; edges: GraphEdge[]; width: number };

export function repositoryGraphBranches(workspace: RepositoryWorkspace): GraphBranch[] {
  const branches = new Map<string, GraphBranch>();
  function add(branch: string, head: string, remote: boolean, task?: RepositoryTask) {
    let entry = branches.get(branch);
    if (!entry) { entry = { branch, localHeads: [], remoteHeads: [], tasks: [] }; branches.set(branch, entry); }
    const heads = remote ? entry.remoteHeads : entry.localHeads;
    if (head && !/^0+$/.test(head) && !heads.includes(head)) heads.push(head);
    if (task) entry.tasks.push(task);
  }
  for (const task of workspace.tasks) if (task.id !== 'remote:pending') add(task.branch, task.head, !!task.remote, task);
  for (const commit of workspace.commits) for (const ref of commit.refs) {
    const remote = /^(origin\/|refs\/remotes\/)/.test(ref);
    const branch = ref.replace(/^refs\/heads\//, '').replace(/^(origin\/|refs\/remotes\/[^/]+\/)/, '');
    if (branch !== 'HEAD') add(branch, commit.id, remote);
  }
  return [...branches.values()].sort((a, b) => a.branch.localeCompare(b.branch));
}

// Working changes are view-only nodes. Their stable task identity is never
// returned as a Git commit or used by the committed-content readers.
export function repositoryGraphCommits(workspace: RepositoryWorkspace, branches: GraphBranch[], selection: ReadonlySet<string> | null): GraphCommit[] {
  const visible = branches.filter(branch => selection === null || selection.has(branch.branch));
  const reachable = selection === null ? null : reachableCommitIds(workspace.commits, visible.flatMap(branch => [...branch.localHeads, ...branch.remoteHeads]));
  const local = reachableCommitIds(workspace.commits, branches.flatMap(branch => branch.localHeads));
  const remote = reachableCommitIds(workspace.commits, branches.flatMap(branch => branch.remoteHeads));
  const unpublished = new Set<string>();
  for (const branch of branches) {
    const history = reachableCommitIds(workspace.commits, branch.localHeads);
    // A loaded remote tip in local ancestry proves the commits ahead of it.
    // Missing or divergent tips retain a neutral local label instead.
    if (branch.remoteHeads.some(head => history.has(head))) for (const id of history) if (!remote.has(id)) unpublished.add(id);
  }
  const working = visible.flatMap(branch => branch.tasks.filter(task => task.path && task.files.length).map(task => ({
    id: `working:${task.id}`, summary: `未提交更改 · ${task.files.length} 个文件`, author: task.branch, time: '', refs: [],
    parents: task.head && !/^0+$/.test(task.head) ? [task.head] : [], workingTask: task,
  })));
  return [...working, ...workspace.commits.filter(commit => !reachable || reachable.has(commit.id)).map(commit => ({
    ...commit, localOnly: local.has(commit.id) && !remote.has(commit.id), unpublished: unpublished.has(commit.id),
  }))];
}

// Git supplies topological order. Only actual parent IDs create edges, never
// neighboring rows or descending timestamps. Colors belong to continuing
// tracks, not reusable lane positions; unloaded parents stop at a dashed stub.
// Cycle the six shared light/dark CSS colors so new tracks stay distinguishable.
export function layoutCommitGraph(commits: GraphCommit[]): GraphRow[] {
  const known = new Set(commits.map(commit => commit.id));
  const incoming = new Set(commits.flatMap(commit => commit.parents));
  const lanes: ({ id: string; color: number; local?: boolean } | null)[] = [];
  let nextColor = 0;
  return commits.map(commit => {
    let lane = lanes.findIndex(track => track?.id === commit.id);
    if (lane < 0) { lane = lanes.indexOf(null); if (lane < 0) lane = lanes.length; lanes[lane] = { id: commit.id, color: nextColor++ % 6 }; }
    const color = lanes[lane]!.color;
    const incomingLocal = lanes[lane]!.local;
    const local = !!commit.workingTask || !!commit.unpublished;
    const before = [...lanes];
    lanes[lane] = null;
    const parents = commit.parents.filter(parent => known.has(parent));
    parents.forEach((parent, index) => {
      const existing = lanes.find(track => track?.id === parent);
      if (existing) { existing.local = existing.local && local; return; }
      let slot = index === 0 && lanes[lane] === null ? lane : lanes.indexOf(null);
      if (slot < 0) slot = lanes.length;
      lanes[slot] = { id: parent, color: index === 0 ? color : nextColor++ % 6, local };
    });
    const edges: GraphEdge[] = [];
    before.forEach((track, from) => { if (track && track.id !== commit.id) edges.push({ from, to: lanes.findIndex(item => item?.id === track.id), color: track.color, node: false, ...(track.local ? { local: true } : {}) }); });
    parents.forEach(parent => { const to = lanes.findIndex(track => track?.id === parent); edges.push({ from: lane, to, color: lanes[to]!.color, node: true, ...(local ? { local: true } : {}) }); });
    if (parents.length < commit.parents.length) edges.push({ from: lane, to: lane, color, node: true, boundary: true, ...(local ? { local: true } : {}) });
    const width = Math.max(before.length, lanes.length, 1);
    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop();
    return { commit, lane, color, incoming: incoming.has(commit.id), ...(incomingLocal ? { incomingLocal: true } : {}), edges, width };
  });
}

export function parseCommitSearch(search: string): { term: string; field?: 'author' | 'message' | 'commit' | 'ref' } {
  const query = search.trim().toLowerCase();
  const match = /^(author|message|commit|ref):\s*(.*)$/.exec(query);
  return match ? { field: match[1] as 'author' | 'message' | 'commit' | 'ref', term: match[2] } : { term: query };
}

export function commitMatchesSearch(commit: RepositoryCommit, query: ReturnType<typeof parseCommitSearch>): boolean {
  const text = query.field === 'author' ? commit.author : query.field === 'message' ? commit.summary : query.field === 'commit' ? commit.id : query.field === 'ref' ? commit.refs.join(' ') : `${commit.summary} ${commit.author} ${commit.refs.join(' ')} ${commit.id}`;
  return text.toLowerCase().includes(query.term);
}

export function graphNavigationIndex(key: string, index: number, length: number, pageSize: number): number | null {
  if (!length) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  const step = key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : key === 'PageDown' ? pageSize : key === 'PageUp' ? -pageSize : null;
  return step === null ? null : Math.max(0, Math.min(length - 1, index + step));
}

export function nextGraphMatch(matches: number[], index: number, direction: 1 | -1): number | null {
  if (!matches.length) return null;
  return direction === 1 ? matches.find(match => match > index) ?? matches[0] : [...matches].reverse().find(match => match < index) ?? matches[matches.length - 1];
}
