import type { RepositoryCommit } from './repository-model';

export type GraphEdge = { from: number; to: number; node: boolean; color: number; boundary?: boolean };
export type GraphRow = { commit: RepositoryCommit; lane: number; color: number; incoming: boolean; edges: GraphEdge[]; width: number };
// Git supplies topological order. Only actual parent IDs create edges, never
// neighboring rows or descending timestamps. Colors belong to continuing
// tracks, not reusable lane positions; unloaded parents stop at a dashed stub.
// Cycle the six shared light/dark CSS colors so new tracks stay distinguishable.
export function layoutCommitGraph(commits: RepositoryCommit[]): GraphRow[] {
  const known = new Set(commits.map(commit => commit.id));
  const incoming = new Set(commits.flatMap(commit => commit.parents));
  const lanes: ({ id: string; color: number } | null)[] = [];
  let nextColor = 0;
  return commits.map(commit => {
    let lane = lanes.findIndex(track => track?.id === commit.id);
    if (lane < 0) { lane = lanes.indexOf(null); if (lane < 0) lane = lanes.length; lanes[lane] = { id: commit.id, color: nextColor++ % 6 }; }
    const color = lanes[lane]!.color;
    const before = [...lanes];
    lanes[lane] = null;
    const parents = commit.parents.filter(parent => known.has(parent));
    parents.forEach((parent, index) => {
      if (lanes.some(track => track?.id === parent)) return;
      let slot = index === 0 && lanes[lane] === null ? lane : lanes.indexOf(null);
      if (slot < 0) slot = lanes.length;
      lanes[slot] = { id: parent, color: index === 0 ? color : nextColor++ % 6 };
    });
    const edges: GraphEdge[] = [];
    before.forEach((track, from) => { if (track && track.id !== commit.id) edges.push({ from, to: lanes.findIndex(item => item?.id === track.id), color: track.color, node: false }); });
    parents.forEach(parent => { const to = lanes.findIndex(track => track?.id === parent); edges.push({ from: lane, to, color: lanes[to]!.color, node: true }); });
    if (parents.length < commit.parents.length) edges.push({ from: lane, to: lane, color, node: true, boundary: true });
    const width = Math.max(before.length, lanes.length, 1);
    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop();
    return { commit, lane, color, incoming: incoming.has(commit.id), edges, width };
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
