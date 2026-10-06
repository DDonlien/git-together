import { useMemo } from 'react';
import { Icon } from './ui';
import { buildFileTree, type FileTreeNode, type RepositoryTask } from './repository-model';

function TreeNode({ node, depth, task, selected, onSelect }: { node: FileTreeNode; depth: number; task: RepositoryTask; selected?: string; onSelect: (path: string) => void }) {
  if (node.directory) return <details className="repository-tree-directory" open={depth < 1}>
    <summary className="repository-tree-row" title={node.path}><span className="tree-disclosure"><Icon name="right" size={11} /></span><Icon name="folder" size={16} /><span>{node.name}</span></summary>
    <div className="repository-tree-children">{node.children.map(child => <TreeNode key={child.path} node={child} depth={depth + 1} task={task} selected={selected} onSelect={onSelect} />)}</div>
  </details>;
  const changed = task.files.find(file => file.path === node.path);
  return <button className={`repository-tree-row tree-file ${selected === node.path ? 'selected' : ''}`} title={node.path} onClick={() => onSelect(node.path)} aria-pressed={selected === node.path}><span className="tree-disclosure" /><Icon name="file" size={15} /><span>{node.name}</span>{changed && <code>{changed.status}</code>}</button>;
}

export function RepositoryFileTree({ task, selected, onSelect, complete }: { task: RepositoryTask; selected?: string; onSelect: (path: string) => void; complete: boolean }) {
  const nodes = useMemo(() => buildFileTree(task.tree), [task.tree]);
  return <section className="repository-tree-task" aria-label={`文件树：${task.branch}`}>
    <div className="repository-task-header"><span className="branch-label"><Icon name="branch" size={14} /><strong>{task.branch}</strong></span>{!task.remote && <small>{task.path ? 'worktree' : '分支'}</small>}</div>
    <p className="repository-task-path" title={task.path || undefined}>{task.remote ? task.head.slice(0, 8) || '未读取' : task.path || '未检出'}</p>
    <div className="repository-task-tree">{nodes.length ? nodes.map(node => <TreeNode key={node.path} node={node} depth={0} task={task} selected={selected} onSelect={onSelect} />) : <p className="repository-tree-empty">{task.error ? '文件树暂不可用。' : task.remote ? complete ? '所选远端分支没有文件。' : '正在读取远端文件树…' : task.path ? '没有可显示的文件。' : '分支文件树读取等待服务更新。'}</p>}</div>
    {!complete && task.path && <p className="repository-data-note">当前仅列出更改文件；完整目录等待服务更新。</p>}
    {task.remote && task.treeComplete === false && task.tree.length > 0 && <p className="repository-data-note">文件树不完整，显示已读取部分。</p>}
    {task.error && <p className="repository-task-error" role="alert">{task.error}</p>}
  </section>;
}
