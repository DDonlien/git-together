import { buildFileTree, type FileTreeNode } from './repository-model';

export type FileTreeChange = { path: string; status: string; previousPath?: string };
export type FileChangeKind = 'added' | 'modified' | 'deleted';
export type DecoratedFileTreeNode = Omit<FileTreeNode, 'children'> & { children: DecoratedFileTreeNode[]; change?: FileChangeKind; missing: boolean };

export function fileChangeKind(status: string): FileChangeKind | undefined {
  const value = status.trim();
  if (['added', 'untracked', 'copied'].includes(value)) return 'added';
  if (['removed', 'deleted'].includes(value)) return 'deleted';
  if (['modified', 'changed', 'renamed'].includes(value) || /^R\d*$/.test(value)) return 'modified';
  if (/^C\d*$/.test(value)) return 'added';
  // Porcelain XY describes local working changes; deletion takes precedence.
  if (/^[MADRCU? ]+$/.test(value)) {
    if (value.includes('D')) return 'deleted';
    if (value.includes('U')) return 'modified';
    if (/[AC?]/.test(value)) return 'added';
    if (/[MR]/.test(value)) return 'modified';
  }
}

// Keep the current directory as the baseline. Historical paths not present in
// it remain explicit annotations, never a replacement checkout or snapshot.
export function decoratedFileTree(paths: string[], changes: FileTreeChange[]): DecoratedFileTreeNode[] {
  const existing = new Set(paths);
  const byPath = new Map<string, FileChangeKind>();
  for (const file of changes) {
    const kind = fileChangeKind(file.status);
    if (kind) byPath.set(file.path, kind);
    if (file.previousPath && file.previousPath !== file.path && (file.status === 'renamed' || /^R\d*$/.test(file.status.trim()))) byPath.set(file.previousPath, 'deleted');
  }
  const decorate = (node: FileTreeNode): DecoratedFileTreeNode => {
    const children = node.children.map(decorate);
    const childKinds = new Set(children.flatMap(child => child.change ? [child.change] : []));
    const change = node.directory ? childKinds.size > 1 ? 'modified' : childKinds.values().next().value : byPath.get(node.path);
    return { ...node, children, change, missing: !node.directory && !existing.has(node.path) };
  };
  return buildFileTree([...paths, ...byPath.keys()]).map(decorate);
}
